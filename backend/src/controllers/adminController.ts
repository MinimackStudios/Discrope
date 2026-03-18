import type { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../lib/prisma";
import { logAdminEvent } from "../lib/adminAudit";
import { adminEventsBus } from "../lib/adminEvents";

const prismaAny = prisma as any;
const DELETED_USERNAME = "deleteduser";
const SYSTEM_USERNAME = "Discrope";

const toLocalUploadPath = (url?: string | null): string | null => {
  if (!url || !url.startsWith("/uploads/")) {
    return null;
  }
  return path.resolve(process.cwd(), url.slice(1));
};

const deleteLocalFileIfExists = (url?: string | null): void => {
  const filePath = toLocalUploadPath(url);
  if (!filePath) {
    return;
  }
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

const getOrCreateDeletedUserId = async (): Promise<string> => {
  const existing = await prismaAny.user.findUnique({ where: { username: DELETED_USERNAME }, select: { id: true } });
  if (existing) {
    return existing.id;
  }

  const created = await prismaAny.user.create({
    data: {
      username: DELETED_USERNAME,
      nickname: "Deleted User",
      isDeleted: true,
      passwordHash: `deleted-${Date.now()}`,
      status: "OFFLINE",
      customStatus: "Deleted Account"
    },
    select: { id: true }
  });

  return created.id;
};

export const getOverview = async (_req: Request, res: Response): Promise<void> => {
  const [userCount, serverCount, messageCount, recentEvents, users, servers] = await Promise.all([
    prisma.user.count({ where: { isDeleted: false } }),
    prisma.server.count(),
    prisma.message.count(),
    prismaAny.adminEvent.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prismaAny.user.findMany({
      where: { isDeleted: false },
      select: { id: true, username: true, nickname: true, avatarUrl: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 100
    }),
    prisma.server.findMany({
      select: { id: true, name: true, inviteCode: true, iconUrl: true, ownerId: true, createdAt: true, _count: { select: { members: true, channels: true } } },
      orderBy: { createdAt: "desc" },
      take: 100
    })
  ]);

  res.json({
    stats: {
      userCount,
      serverCount,
      messageCount
    },
    events: recentEvents,
    users,
    servers
  });
};

export const getServerDetail = async (req: Request, res: Response): Promise<void> => {
  const { serverId } = req.params;

  const server = await prisma.server.findUnique({
    where: { id: serverId },
    include: {
      owner: { select: { id: true, username: true, nickname: true, avatarUrl: true } },
      categories: { orderBy: { order: "asc" } },
      channels: { orderBy: { createdAt: "asc" } },
      members: {
        include: {
          user: { select: { id: true, username: true, nickname: true, avatarUrl: true, status: true } }
        },
        orderBy: { createdAt: "desc" }
      }
    }
  });

  if (!server) {
    res.status(404).json({ message: "Server not found" });
    return;
  }

  const [recentMessages, recentEvents] = await Promise.all([
    prisma.message.findMany({
      where: { channel: { serverId } },
      select: {
        id: true,
        content: true,
        createdAt: true,
        channelId: true,
        author: { select: { id: true, username: true, nickname: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prismaAny.adminEvent.findMany({
      where: { targetServerId: serverId },
      orderBy: { createdAt: "desc" },
      take: 20
    })
  ]);

  res.json({
    server,
    recentMessages,
    recentEvents
  });
};

export const streamAdminEvents = async (req: Request, res: Response): Promise<void> => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive"
  });

  res.write(": connected\n\n");

  const unsubscribe = adminEventsBus.subscribe((event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
};

export const deleteUserAccountAsAdmin = async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.params;

  const user = await prismaAny.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, nickname: true, avatarUrl: true, isDeleted: true }
  });

  if (!user || user.isDeleted) {
    res.status(404).json({ message: "User not found" });
    return;
  }

  if (user.username === SYSTEM_USERNAME) {
    res.status(400).json({ message: "The Discrope system user cannot be deleted" });
    return;
  }

  const deletedUserId = await getOrCreateDeletedUserId();
  const ownedServers = await prismaAny.server.findMany({ where: { ownerId: userId }, select: { id: true, iconUrl: true, name: true } });

  await prisma.$transaction(async (tx) => {
    await tx.message.updateMany({ where: { authorId: userId }, data: { authorId: deletedUserId } });
    await tx.dMMessage.updateMany({ where: { authorId: userId }, data: { authorId: deletedUserId } });
    await tx.friendRequest.deleteMany({ where: { OR: [{ fromId: userId }, { toId: userId }] } });
    await tx.user.delete({ where: { id: userId } });
  });

  deleteLocalFileIfExists(user.avatarUrl);
  for (const server of ownedServers as Array<{ iconUrl?: string | null }>) {
    deleteLocalFileIfExists(server.iconUrl ?? null);
  }

  await logAdminEvent({
    type: "USER_DELETED_BY_ADMIN",
    summary: `Admin deleted user ${user.username}`,
    targetUserId: user.id,
    actorUsername: "admin-tool"
  });

  res.json({ deleted: true });
};

export const deleteServerAsAdmin = async (req: Request, res: Response): Promise<void> => {
  const { serverId } = req.params;

  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { id: true, name: true, iconUrl: true }
  });

  if (!server) {
    res.status(404).json({ message: "Server not found" });
    return;
  }

  await prisma.server.delete({ where: { id: serverId } });
  deleteLocalFileIfExists(server.iconUrl);

  await logAdminEvent({
    type: "SERVER_DELETED_BY_ADMIN",
    summary: `Admin deleted server ${server.name}`,
    targetServerId: server.id,
    actorUsername: "admin-tool"
  });

  res.json({ deleted: true });
};
