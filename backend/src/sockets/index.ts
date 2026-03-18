import jwt from "jsonwebtoken";
import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { prisma } from "../lib/prisma";

const normalizeOrigin = (value: string): string => {
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/$/, "");
  }
};

export const initSocket = (server: HttpServer): Server => {
  const allowedOrigins = (process.env.FRONTEND_ORIGIN ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map(normalizeOrigin);

  const io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }

        const requestOrigin = normalizeOrigin(origin);
        callback(null, allowedOrigins.includes(requestOrigin));
      },
      credentials: true
    }
  });

  const onlineUsers = new Map<string, Set<string>>();
  const resolveTypingTarget = (
    payload: string | { scope?: "CHANNEL" | "DM"; id?: string }
  ): { id: string; room: string } | null => {
    if (typeof payload === "string") {
      return payload ? { id: payload, room: `channel:${payload}` } : null;
    }

    const id = payload?.id?.trim();
    if (!id) {
      return null;
    }

    const scope = payload.scope === "DM" ? "DM" : "CHANNEL";
    return {
      id,
      room: scope === "DM" ? `dm:${id}` : `channel:${id}`
    };
  };

  io.use((socket, next) => {
    const token = (socket.handshake.auth?.token as string | undefined) ?? "";
    if (!token) {
      next(new Error("Unauthorized"));
      return;
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET as string) as {
        id: string;
        username: string;
      };
      prisma.user
        .findUnique({
          where: { id: payload.id },
          select: { id: true, username: true, nickname: true }
        })
        .then((user) => {
          if (!user) {
            next(new Error("Unauthorized"));
            return;
          }
          socket.data.user = {
            id: user.id,
            username: user.username,
            nickname: user.nickname?.trim() || user.username
          };
          next();
        })
        .catch(() => next(new Error("Unauthorized")));
      return;
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as { id: string; username: string; nickname: string };
    const userSockets = onlineUsers.get(user.id) ?? new Set<string>();
    const wasOffline = userSockets.size === 0;
    userSockets.add(socket.id);
    onlineUsers.set(user.id, userSockets);

    socket.join(`user:${user.id}`);

    if (wasOffline) {
      io.emit("presence:update", { userId: user.id, status: "ONLINE" });
      void prisma.user.update({ where: { id: user.id }, data: { status: "ONLINE" } }).catch(() => undefined);
    }

    socket.emit("presence:sync", { onlineUserIds: Array.from(onlineUsers.keys()) });

    socket.on("channel:join", (channelId: string) => {
      socket.join(`channel:${channelId}`);
    });

    socket.on("channel:leave", (channelId: string) => {
      socket.leave(`channel:${channelId}`);
    });

    socket.on("dm:join", (dmChannelId: string) => {
      socket.join(`dm:${dmChannelId}`);
    });

    socket.on("dm:leave", (dmChannelId: string) => {
      socket.leave(`dm:${dmChannelId}`);
    });

    socket.on("typing:start", (payload: string | { scope?: "CHANNEL" | "DM"; id?: string }) => {
      const target = resolveTypingTarget(payload);
      if (!target) {
        return;
      }

      socket.to(target.room).emit("typing:start", {
        channelId: target.id,
        userId: user.id,
        username: user.username,
        nickname: user.nickname
      });
    });

    socket.on("typing:stop", (payload: string | { scope?: "CHANNEL" | "DM"; id?: string }) => {
      const target = resolveTypingTarget(payload);
      if (!target) {
        return;
      }

      socket.to(target.room).emit("typing:stop", {
        channelId: target.id,
        userId: user.id,
        username: user.username,
        nickname: user.nickname
      });
    });

    socket.on("disconnect", () => {
      const userSocketsOnDisconnect = onlineUsers.get(user.id);
      if (userSocketsOnDisconnect) {
        userSocketsOnDisconnect.delete(socket.id);
        if (userSocketsOnDisconnect.size === 0) {
          onlineUsers.delete(user.id);
          io.emit("presence:update", { userId: user.id, status: "OFFLINE" });
          void prisma.user.update({ where: { id: user.id }, data: { status: "OFFLINE" } }).catch(() => undefined);
        }
      }

    });
  });

  return io;
};
