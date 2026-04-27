import type { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../lib/prisma";
import { logAdminEvent } from "../lib/adminAudit";
import { hasPermission as hasMemberPermission } from "../lib/permissions";

const prismaAny = prisma as any;

const normalizeChannelName = (value: string): string => {
  return value.trim().replace(/\s+/g, "-").toLowerCase();
};

const deleteAttachmentIfLocal = (attachmentUrl?: string | null): void => {
  if (!attachmentUrl || !attachmentUrl.startsWith("/uploads/")) {
    return;
  }

  const filePath = path.resolve(process.cwd(), attachmentUrl.slice(1));
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

const canManageChannels = async (serverId: string, userId: string): Promise<boolean> => {
  const server = await prisma.server.findUnique({ where: { id: serverId }, select: { ownerId: true } });
  if (!server) return false;

  const member = await prismaAny.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId } }
  });

  return hasMemberPermission(member, server.ownerId, userId, "manageChannels");
};

const canManageMessages = async (channelId: string, userId: string): Promise<boolean> => {
  const channel = await prisma.channel.findUnique({ where: { id: channelId }, select: { serverId: true } });
  if (!channel) return false;

  const server = await prisma.server.findUnique({ where: { id: channel.serverId }, select: { ownerId: true } });
  if (!server) return false;

  const member = await prismaAny.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId: channel.serverId } }
  });

  return hasMemberPermission(member, server.ownerId, userId, "manageMessages");
};

const messageDetailsInclude = {
  author: { select: { id: true, username: true, nickname: true, isDeleted: true, avatarUrl: true, status: true, aboutMe: true, customStatus: true, createdAt: true } },
  reactions: {
    orderBy: { createdAt: "asc" },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          nickname: true,
          avatarUrl: true
        }
      }
    }
  },
  replyTo: {
    select: {
      id: true,
      content: true,
      attachmentUrl: true,
      attachmentName: true,
      author: { select: { id: true, username: true, nickname: true, isDeleted: true, avatarUrl: true } }
    }
  }
} as const;

export const createCategory = async (req: Request, res: Response): Promise<void> => {
  const { serverId } = req.params;
  const { name, order } = req.body as { name: string; order?: number };

  const canManage = await canManageChannels(serverId, req.user!.id);
  if (!canManage) {
    res.status(403).json({ message: "You don't have permission to manage channels" });
    return;
  }

  const category = await prisma.channelCategory.create({
    data: { serverId, name, order: order ?? 0 }
  });

  res.status(201).json({ category });
};

export const createChannel = async (req: Request, res: Response): Promise<void> => {
  const { serverId } = req.params;
  const { name, type, categoryId } = req.body as {
    name: string;
    type: "TEXT";
    categoryId?: string;
  };
  const normalizedName = normalizeChannelName(name);

  if (normalizedName.length === 0) {
    res.status(400).json({ message: "Channel name cannot be empty" });
    return;
  }

  const canManage = await canManageChannels(serverId, req.user!.id);
  if (!canManage) {
    res.status(403).json({ message: "You don't have permission to manage channels" });
    return;
  }

  const duplicate = await prisma.channel.findFirst({
    where: {
      serverId,
      name: normalizedName
    },
    select: { id: true }
  });
  if (duplicate) {
    res.status(409).json({ message: "A channel with that name already exists in this server" });
    return;
  }

  const channel = await prisma.channel.create({
    data: {
      serverId,
      name: normalizedName,
      type,
      categoryId: categoryId ?? null
    }
  });

  await logAdminEvent({
    type: "CHANNEL_COUNT_UPDATED",
    summary: `Channel count changed for server ${serverId}`,
    targetServerId: serverId,
    persist: false
  });

  const io = req.app.get("io");
  io.emit("channel:created", { serverId, channel });

  res.status(201).json({ channel });
};

const MESSAGE_PAGE_SIZE = 50;
const MESSAGE_CONTEXT_BEFORE_COUNT = 20;
const MESSAGE_CONTEXT_AFTER_COUNT = MESSAGE_PAGE_SIZE - MESSAGE_CONTEXT_BEFORE_COUNT - 1;

export const listMessages = async (req: Request, res: Response): Promise<void> => {
  const { channelId } = req.params;
  const before = typeof req.query.before === "string" ? req.query.before : undefined;
  const after = typeof req.query.after === "string" ? req.query.after : undefined;

  const beforeCreatedAt = before
    ? (await prisma.message.findUnique({ where: { id: before }, select: { createdAt: true } }))?.createdAt
    : undefined;
  const afterCreatedAt = after
    ? (await prisma.message.findUnique({ where: { id: after }, select: { createdAt: true } }))?.createdAt
    : undefined;

  const messages = await prisma.message.findMany({
    where: {
      channelId,
      ...(beforeCreatedAt ? { createdAt: { lt: beforeCreatedAt } } : {}),
      ...(afterCreatedAt ? { createdAt: { gt: afterCreatedAt } } : {})
    },
    include: messageDetailsInclude,
    orderBy: { createdAt: afterCreatedAt ? "asc" : "desc" },
    take: MESSAGE_PAGE_SIZE
  });

  const ordered = afterCreatedAt ? messages : messages.reverse();

  const hasOlder = ordered.length > 0
    ? (await prisma.message.count({ where: { channelId, createdAt: { lt: ordered[0].createdAt } } })) > 0
    : false;
  const hasNewer = ordered.length > 0
    ? (await prisma.message.count({ where: { channelId, createdAt: { gt: ordered[ordered.length - 1].createdAt } } })) > 0
    : false;

  res.json({ messages: ordered, hasOlder, hasNewer });
};

export const getMessageContext = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const { channelId, messageId } = req.params;

  const targetMessage = await prismaAny.message.findUnique({
    where: { id: messageId },
    include: {
      ...messageDetailsInclude,
      channel: { select: { serverId: true } }
    }
  });

  if (!targetMessage || targetMessage.channelId !== channelId) {
    res.status(404).json({ message: "Message not found" });
    return;
  }

  const server = await prisma.server.findUnique({ where: { id: targetMessage.channel.serverId }, select: { ownerId: true } });
  const membership = await prisma.serverMember.findUnique({
    where: {
      userId_serverId: {
        userId,
        serverId: targetMessage.channel.serverId
      }
    },
    select: { userId: true }
  });

  if (!server || (server.ownerId !== userId && !membership)) {
    res.status(403).json({ message: "You do not have access to this channel" });
    return;
  }

  const beforeMessages = await prisma.message.findMany({
    where: {
      channelId,
      createdAt: { lt: targetMessage.createdAt }
    },
    include: messageDetailsInclude,
    orderBy: { createdAt: "desc" },
    take: MESSAGE_CONTEXT_BEFORE_COUNT
  });

  const afterMessages = await prisma.message.findMany({
    where: {
      channelId,
      createdAt: { gt: targetMessage.createdAt }
    },
    include: messageDetailsInclude,
    orderBy: { createdAt: "asc" },
    take: MESSAGE_CONTEXT_AFTER_COUNT
  });

  const messages = [...beforeMessages.reverse(), targetMessage, ...afterMessages];
  const hasOlder = messages.length > 0
    ? (await prisma.message.count({ where: { channelId, createdAt: { lt: messages[0].createdAt } } })) > 0
    : false;
  const hasNewer = messages.length > 0
    ? (await prisma.message.count({ where: { channelId, createdAt: { gt: messages[messages.length - 1].createdAt } } })) > 0
    : false;

  res.json({ messages, hasOlder, hasNewer, focusMessageId: targetMessage.id });
};

export const createMessage = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const { channelId } = req.params;
  const { content, replyToId } = req.body as { content: string; replyToId?: string };
  const attachmentUrl = req.file ? `/uploads/attachments/${req.file.filename}` : null;
  const attachmentName = req.file?.originalname ?? null;

  const finalContent = content ?? "";

  if (!finalContent?.trim() && !attachmentUrl) {
    res.status(400).json({ message: "Message cannot be empty" });
    return;
  }

  // Check readOnly restriction
  const channelForCheck = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { readOnly: true, serverId: true }
  });
  if (channelForCheck?.readOnly) {
    const member = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId: channelForCheck.serverId } }
    });
    const server = await prisma.server.findUnique({ where: { id: channelForCheck.serverId }, select: { ownerId: true } });
    const canPost = server?.ownerId === userId || member?.role === "ADMIN";
    if (!canPost) {
      res.status(403).json({ message: "This channel is read-only" });
      return;
    }
  }

  const message = await prismaAny.message.create({
    data: {
      content: finalContent,
      channelId,
      authorId: userId,
      replyToId: replyToId ?? null,
      attachmentUrl,
      attachmentName
    },
    include: messageDetailsInclude
  });

  const io = req.app.get("io");
  io.to(`channel:${channelId}`).emit("message:new", message);
  const channel = await prisma.channel.findUnique({ where: { id: channelId }, select: { serverId: true } });
  await logAdminEvent({
    type: "MESSAGE_ACTIVITY",
    summary: `Message count changed in channel ${channelId}`,
    targetServerId: channel?.serverId ?? null,
    persist: false
  });
  res.status(201).json({ message });
};

export const editMessage = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const { messageId } = req.params;
  const { content } = req.body as { content: string };

  const existing = await prisma.message.findUnique({ where: { id: messageId } });
  if (!existing) {
    res.status(404).json({ message: "Message not found" });
    return;
  }

  const canModerate = await canManageMessages(existing.channelId, userId);
  if (existing.authorId !== userId && !canModerate) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  const message = await prisma.message.update({
    where: { id: messageId },
    data: { content, editedAt: new Date() },
    include: messageDetailsInclude
  });

  const io = req.app.get("io");
  io.to(`channel:${message.channelId}`).emit("message:updated", message);
  res.json({ message });
};

export const deleteMessage = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const { messageId } = req.params;

  const existing = await prisma.message.findUnique({ where: { id: messageId } });
  if (!existing) {
    res.status(404).json({ message: "Message not found" });
    return;
  }

  // Fetch server to check if message author is the owner
  const channel = await prisma.channel.findUnique({ where: { id: existing.channelId }, select: { serverId: true } });
  if (!channel) {
    res.status(404).json({ message: "Channel not found" });
    return;
  }
  const server = await prisma.server.findUnique({ where: { id: channel.serverId }, select: { ownerId: true } });

  // Non-owners cannot delete messages sent by the server owner
  if (server && existing.authorId === server.ownerId && userId !== server.ownerId) {
    res.status(403).json({ message: "You cannot delete the owner's messages" });
    return;
  }

  const canModerate = await canManageMessages(existing.channelId, userId);
  if (existing.authorId !== userId && !canModerate) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  const attachmentUrl = existing.attachmentUrl;
  await prisma.message.delete({ where: { id: messageId } });
  deleteAttachmentIfLocal(attachmentUrl);
  const io = req.app.get("io");
  io.to(`channel:${existing.channelId}`).emit("message:deleted", { id: messageId });
  await logAdminEvent({
    type: "MESSAGE_ACTIVITY",
    summary: `Message count changed in channel ${existing.channelId}`,
    targetServerId: channel?.serverId ?? null,
    persist: false
  });
  res.json({ deleted: true });
};

export const toggleReaction = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const { messageId } = req.params;
  const { emoji } = req.body as { emoji: string };

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, channelId: true }
  });

  if (!message) {
    res.status(404).json({ message: "Message not found" });
    return;
  }

  const existing = await prisma.messageReaction.findUnique({
    where: { messageId_userId_emoji: { messageId, userId, emoji } }
  });

  if (existing) {
    await prisma.messageReaction.delete({ where: { messageId_userId_emoji: { messageId, userId, emoji } } });
  } else {
    // Enforce 20-unique-emoji limit
    const uniqueEmojis = await prisma.messageReaction.findMany({
      where: { messageId },
      select: { emoji: true },
      distinct: ["emoji"]
    });
    if (uniqueEmojis.length >= 20 && !uniqueEmojis.some((r) => r.emoji === emoji)) {
      res.status(400).json({ message: "Reactions are limited to 20 unique emojis per message" });
      return;
    }
    await prisma.messageReaction.create({ data: { messageId, userId, emoji } });
  }

  const updatedMessage = await prisma.message.findUnique({
    where: { id: messageId },
    include: messageDetailsInclude
  });

  const io = req.app.get("io");
  io.to(`channel:${message.channelId}`).emit("message:updated", updatedMessage);
  res.json({ message: updatedMessage });
};

export const togglePin = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const { messageId } = req.params;

  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message) {
    res.status(404).json({ message: "Message not found" });
    return;
  }

  const canModerate = await canManageMessages(message.channelId, userId);
  if (!canModerate) {
    res.status(403).json({ message: "Only server admins/owner can pin or unpin" });
    return;
  }

  const updated = await prisma.message.update({
    where: { id: messageId },
    data: { isPinned: !message.isPinned }
  });

  res.json({ message: updated });
};

export const pinnedMessages = async (req: Request, res: Response): Promise<void> => {
  const { channelId } = req.params;
  const messages = await prisma.message.findMany({
    where: { channelId, isPinned: true },
    include: { author: { select: { id: true, username: true, nickname: true, isDeleted: true, avatarUrl: true, status: true, aboutMe: true, customStatus: true } } },
    orderBy: { createdAt: "desc" }
  });

  res.json({ messages });
};

export const deleteChannel = async (req: Request, res: Response): Promise<void> => {
  const { channelId } = req.params;
  const channel = await prisma.channel.findUnique({ where: { id: channelId }, select: { serverId: true } });
  if (!channel) {
    res.status(404).json({ message: "Channel not found" });
    return;
  }

  const canManage = await canManageChannels(channel.serverId, req.user!.id);
  if (!canManage) {
    res.status(403).json({ message: "You don't have permission to manage channels" });
    return;
  }

  await prisma.channel.delete({ where: { id: channelId } });
  await logAdminEvent({
    type: "CHANNEL_COUNT_UPDATED",
    summary: `Channel count changed for server ${channel.serverId}`,
    targetServerId: channel.serverId,
    persist: false
  });

  const io = req.app.get("io");
  io.emit("channel:deleted", { serverId: channel.serverId, channelId });

  res.json({ deleted: true });
};

export const deleteCategory = async (req: Request, res: Response): Promise<void> => {
  const { categoryId } = req.params;
  const category = await prisma.channelCategory.findUnique({ where: { id: categoryId }, select: { serverId: true } });
  if (!category) {
    res.status(404).json({ message: "Category not found" });
    return;
  }

  const canManage = await canManageChannels(category.serverId, req.user!.id);
  if (!canManage) {
    res.status(403).json({ message: "You don't have permission to manage channels" });
    return;
  }

  await prisma.channel.updateMany({ where: { categoryId }, data: { categoryId: null } });
  await prisma.channelCategory.delete({ where: { id: categoryId } });
  res.json({ deleted: true });
};

export const updateCategory = async (req: Request, res: Response): Promise<void> => {
  const { categoryId } = req.params;
  const { name } = req.body as { name: string };

  const trimmed = name?.trim();
  if (!trimmed) {
    res.status(400).json({ message: "Category name cannot be empty" });
    return;
  }

  const category = await prisma.channelCategory.findUnique({ where: { id: categoryId }, select: { serverId: true } });
  if (!category) {
    res.status(404).json({ message: "Category not found" });
    return;
  }

  const canManage = await canManageChannels(category.serverId, req.user!.id);
  if (!canManage) {
    res.status(403).json({ message: "You don't have permission to manage channels" });
    return;
  }

  const updated = await prisma.channelCategory.update({
    where: { id: categoryId },
    data: { name: trimmed }
  });

  const io = req.app.get("io");
  io.emit("category:updated", { category: updated });

  res.json({ category: updated });
};

export const reorderCategories = async (req: Request, res: Response): Promise<void> => {
  const { serverId } = req.params;
  const { items } = req.body as { items: { id: string; order: number }[] };

  if (!Array.isArray(items)) {
    res.status(400).json({ message: "items must be an array" });
    return;
  }

  const canManage = await canManageChannels(serverId, req.user!.id);
  if (!canManage) {
    res.status(403).json({ message: "You don't have permission to manage channels" });
    return;
  }

  await prisma.$transaction(
    items.map(({ id, order }) =>
      prisma.channelCategory.update({ where: { id }, data: { order } })
    )
  );

  const io = req.app.get("io");
  io.emit("categories:reordered", { serverId, items });

  res.json({ ok: true });
};

export const reorderChannels = async (req: Request, res: Response): Promise<void> => {
  const { serverId } = req.params;
  const { items } = req.body as { items: { id: string; order: number; categoryId?: string | null }[] };

  if (!Array.isArray(items)) {
    res.status(400).json({ message: "items must be an array" });
    return;
  }

  const canManage = await canManageChannels(serverId, req.user!.id);
  if (!canManage) {
    res.status(403).json({ message: "You don't have permission to manage channels" });
    return;
  }

  await prisma.$transaction(
    items.map(({ id, order, categoryId }) => {
      const hasCat = Object.prototype.hasOwnProperty.call(
        items.find((i) => i.id === id)!,
        "categoryId"
      );
      return prisma.channel.update({
        where: { id },
        data: {
          order,
          ...(hasCat ? { categoryId: categoryId ?? null } : {})
        }
      });
    })
  );

  const io = req.app.get("io");
  io.emit("channels:reordered", { serverId, items });

  res.json({ ok: true });
};

export const updateChannel = async (req: Request, res: Response): Promise<void> => {
  const { channelId } = req.params;
  const { categoryId, name, readOnly, isAnnouncement } = req.body as { categoryId?: string | null; name?: string; readOnly?: boolean; isAnnouncement?: boolean };

  const channel = await prisma.channel.findUnique({ where: { id: channelId }, select: { serverId: true } });
  if (!channel) {
    res.status(404).json({ message: "Channel not found" });
    return;
  }

  const canManage = await canManageChannels(channel.serverId, req.user!.id);
  if (!canManage) {
    res.status(403).json({ message: "You don't have permission to manage channels" });
    return;
  }

  const normalizedName = typeof name === "string" ? normalizeChannelName(name) : undefined;
  if (normalizedName !== undefined && normalizedName.length === 0) {
    res.status(400).json({ message: "Channel name cannot be empty" });
    return;
  }

  if (normalizedName !== undefined) {
    const duplicate = await prisma.channel.findFirst({
      where: {
        serverId: channel.serverId,
        name: normalizedName,
        id: { not: channelId }
      },
      select: { id: true }
    });

    if (duplicate) {
      res.status(409).json({ message: "A channel with that name already exists in this server" });
      return;
    }
  }

  const hasCategoryId = Object.prototype.hasOwnProperty.call(req.body, "categoryId");
  const hasReadOnly = Object.prototype.hasOwnProperty.call(req.body, "readOnly");
  const hasAnnouncement = Object.prototype.hasOwnProperty.call(req.body, "isAnnouncement");

  const updated = await prisma.channel.update({
    where: { id: channelId },
    data: {
      ...(hasCategoryId ? { categoryId: categoryId ?? null } : {}),
      ...(normalizedName !== undefined ? { name: normalizedName } : {}),
      ...(hasReadOnly ? { readOnly } : {}),
      ...(hasAnnouncement ? { isAnnouncement } : {})
    }
  });

  const io = req.app.get("io");
  io.emit("channel:updated", { channel: updated });

  res.json({ channel: updated });
};

export const searchMessages = async (req: Request, res: Response): Promise<void> => {
  const { channelId } = req.params;
  const { q, limit: limitStr } = req.query as { q: string; limit?: string };

  if (!q || q.trim().length === 0) {
    res.status(400).json({ message: "Search query is required" });
    return;
  }

  const searchLimit = Math.min(parseInt(limitStr || '20', 10) || 20, 50);
  const searchTerm = q.trim();

  try {
    // SQLite doesn't support mode: "insensitive", so we fetch all messages and filter client-side
    const messages = await prismaAny.message.findMany({
      where: {
        channelId
      },
      include: messageDetailsInclude,
      orderBy: { createdAt: "desc" },
      take: searchLimit * 3 // Fetch more to account for filtering
    });

    // Filter client-side for case-insensitive match
    const filtered = messages.filter((msg: any) =>
      msg.content && msg.content.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, searchLimit);

    const results = filtered.map((msg: any) => ({
      message: msg,
      highlightedText: msg.content || ""
    }));

    res.json({ results, total: results.length });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ message: "Search failed" });
  }
};
