import jwt from "jsonwebtoken";
import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { prisma } from "../lib/prisma";

type VoiceState = {
  muted: boolean;
  deafened: boolean;
};

export const initSocket = (server: HttpServer): Server => {
  const io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_ORIGIN,
      credentials: true
    }
  });

  const onlineUsers = new Map<string, string>();
  const voiceRooms = new Map<string, Set<string>>();
  const voiceState = new Map<string, VoiceState>();

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
    onlineUsers.set(user.id, socket.id);
    io.emit("presence:update", { userId: user.id, status: "ONLINE" });

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

    socket.on("typing:start", (channelId: string) => {
      socket.to(`channel:${channelId}`).emit("typing:start", {
        channelId,
        userId: user.id,
        username: user.username,
        nickname: user.nickname
      });
    });

    socket.on("typing:stop", (channelId: string) => {
      socket.to(`channel:${channelId}`).emit("typing:stop", {
        channelId,
        userId: user.id,
        username: user.username,
        nickname: user.nickname
      });
    });

    socket.on("voice:join", ({ channelId }: { channelId: string }) => {
      socket.join(`voice:${channelId}`);
      const users = voiceRooms.get(channelId) ?? new Set<string>();
      users.add(user.id);
      voiceRooms.set(channelId, users);

      io.to(`voice:${channelId}`).emit("voice:participants", {
        channelId,
        userIds: Array.from(users)
      });
    });

    socket.on("voice:leave", ({ channelId }: { channelId: string }) => {
      socket.leave(`voice:${channelId}`);
      const users = voiceRooms.get(channelId);
      if (!users) {
        return;
      }

      users.delete(user.id);
      io.to(`voice:${channelId}`).emit("voice:participants", {
        channelId,
        userIds: Array.from(users)
      });
    });

    socket.on(
      "voice:signal",
      ({ channelId, targetUserId, signal }: { channelId: string; targetUserId: string; signal: unknown }) => {
        const targetSocketId = onlineUsers.get(targetUserId);
        if (!targetSocketId) {
          return;
        }

        io.to(targetSocketId).emit("voice:signal", {
          channelId,
          fromUserId: user.id,
          signal
        });
      }
    );

    socket.on("voice:state", ({ muted, deafened }: VoiceState) => {
      voiceState.set(user.id, { muted, deafened });
      io.emit("voice:state", { userId: user.id, muted, deafened });
    });

    socket.on("disconnect", () => {
      onlineUsers.delete(user.id);
      for (const [channelId, users] of voiceRooms.entries()) {
        if (users.delete(user.id)) {
          io.to(`voice:${channelId}`).emit("voice:participants", {
            channelId,
            userIds: Array.from(users)
          });
        }
      }

      io.emit("presence:update", { userId: user.id, status: "OFFLINE" });
    });
  });

  return io;
};
