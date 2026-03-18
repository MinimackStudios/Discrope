import type { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../lib/prisma";

const prismaAny = prisma as any;
const SYSTEM_USERNAME = "Discrope";

const deleteAttachmentIfLocal = (attachmentUrl?: string | null): void => {
  if (!attachmentUrl || !attachmentUrl.startsWith("/uploads/")) {
    return;
  }

  const filePath = path.resolve(process.cwd(), attachmentUrl.slice(1));
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

export const listDMs = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const channels = await prismaAny.dMChannel.findMany({
    where: { participants: { some: { id: userId } } },
    include: {
      participants: { select: { id: true, username: true, nickname: true, isDeleted: true, avatarUrl: true, status: true, aboutMe: true, customStatus: true, createdAt: true } }
    }
  });

  res.json({ channels });
};

export const createOrGetDM = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const { participantIds } = req.body as { participantIds: string[] };
  const ids = Array.from(new Set([userId, ...participantIds]));

  const participants = await prismaAny.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, isDeleted: true, username: true }
  });
  if (participants.length !== ids.length || participants.some((u: { isDeleted?: boolean }) => u.isDeleted)) {
    res.status(400).json({ message: "Cannot message deleted users" });
    return;
  }
  if (participants.some((u: { username?: string }) => u.username === SYSTEM_USERNAME)) {
    res.status(400).json({ message: "Cannot message the system user" });
    return;
  }

  const existing = await prismaAny.dMChannel.findFirst({
    where: {
      AND: ids.map((id) => ({ participants: { some: { id } } }))
    },
    include: { participants: { select: { id: true, username: true, nickname: true, isDeleted: true, avatarUrl: true, status: true, aboutMe: true, customStatus: true, createdAt: true } } }
  });

  if (existing && existing.participants.length === ids.length) {
    res.json({ channel: existing });
    return;
  }

  const channel = await prismaAny.dMChannel.create({
    data: {
      participants: { connect: ids.map((id) => ({ id })) }
    },
    include: { participants: { select: { id: true, username: true, nickname: true, isDeleted: true, avatarUrl: true, status: true, aboutMe: true, customStatus: true, createdAt: true } } }
  });

  res.status(201).json({ channel });
};

export const listDMMessages = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const { dmChannelId } = req.params;

  const channel = await prismaAny.dMChannel.findFirst({
    where: { id: dmChannelId, participants: { some: { id: userId } } },
    select: { id: true, participants: { select: { id: true } } }
  });
  if (!channel) {
    res.status(404).json({ message: "DM channel not found" });
    return;
  }

  const messages = await prismaAny.dMMessage.findMany({
    where: { dmChannelId },
    include: {
      author: { select: { id: true, username: true, nickname: true, isDeleted: true, avatarUrl: true, status: true, aboutMe: true, customStatus: true, createdAt: true } },
      replyTo: {
        select: {
          id: true,
          content: true,
          author: { select: { id: true, username: true, nickname: true, isDeleted: true, avatarUrl: true } }
        }
      }
    },
    orderBy: { createdAt: "asc" }
  });

  res.json({ messages });
};

export const createDMMessage = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const { dmChannelId } = req.params;
  const { content, replyToId } = req.body as { content: string; replyToId?: string };
  const attachmentUrl = req.file ? `/uploads/attachments/${req.file.filename}` : null;
  const attachmentName = req.file?.originalname ?? null;

  if (!content?.trim() && !attachmentUrl) {
    res.status(400).json({ message: "Message cannot be empty" });
    return;
  }

  const channel = await prismaAny.dMChannel.findFirst({
    where: { id: dmChannelId, participants: { some: { id: userId } } },
    select: { id: true, participants: { select: { id: true } } }
  });
  if (!channel) {
    res.status(404).json({ message: "DM channel not found" });
    return;
  }

  if (replyToId) {
    const replyTarget = await prismaAny.dMMessage.findFirst({
      where: { id: replyToId, dmChannelId },
      select: { id: true }
    });
    if (!replyTarget) {
      res.status(400).json({ message: "Reply target not found" });
      return;
    }
  }

  const message = await prismaAny.dMMessage.create({
    data: { dmChannelId, authorId: userId, content: content ?? "", attachmentUrl, attachmentName, replyToId: replyToId ?? null },
    include: {
      author: { select: { id: true, username: true, nickname: true, isDeleted: true, avatarUrl: true, status: true, aboutMe: true, customStatus: true, createdAt: true } },
      replyTo: {
        select: {
          id: true,
          content: true,
          author: { select: { id: true, username: true, nickname: true, isDeleted: true, avatarUrl: true } }
        }
      }
    }
  });

  const io = req.app.get("io");
  for (const participant of channel.participants) {
    io.to(`user:${participant.id}`).emit("dm:message:new", message);
  }
  res.status(201).json({ message });
};

export const editDMMessage = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const { dmChannelId, messageId } = req.params;
  const { content } = req.body as { content: string };

  const existing = await prismaAny.dMMessage.findUnique({
    where: { id: messageId },
    select: { id: true, authorId: true, dmChannelId: true }
  });

  if (!existing || existing.dmChannelId !== dmChannelId || existing.authorId !== userId) {
    res.status(403).json({ message: "Cannot edit this message" });
    return;
  }

  const message = await prismaAny.dMMessage.update({
    where: { id: messageId },
    data: { content, editedAt: new Date() },
    include: {
      author: { select: { id: true, username: true, nickname: true, isDeleted: true, avatarUrl: true, status: true, aboutMe: true, customStatus: true, createdAt: true } },
      replyTo: {
        select: {
          id: true,
          content: true,
          author: { select: { id: true, username: true, nickname: true, isDeleted: true, avatarUrl: true } }
        }
      }
    }
  });

  const io = req.app.get("io");
  io.to(`dm:${dmChannelId}`).emit("dm:message:updated", message);
  res.json({ message });
};

export const deleteDMMessage = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const { dmChannelId, messageId } = req.params;

  const message = await prismaAny.dMMessage.findUnique({
    where: { id: messageId },
    select: { authorId: true, dmChannelId: true, attachmentUrl: true }
  });

  if (!message || message.dmChannelId !== dmChannelId || message.authorId !== userId) {
    res.status(403).json({ message: "Cannot delete this message" });
    return;
  }

  await prismaAny.dMMessage.delete({ where: { id: messageId } });
  deleteAttachmentIfLocal(message.attachmentUrl);

  const io = req.app.get("io");
  io.to(`dm:${dmChannelId}`).emit("dm:message:deleted", { id: messageId, dmChannelId });
  res.json({ deleted: true });
};
