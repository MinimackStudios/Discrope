"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteDMMessage = exports.createDMMessage = exports.listDMMessages = exports.createOrGetDM = exports.listDMs = void 0;
const prisma_1 = require("../lib/prisma");
const prismaAny = prisma_1.prisma;
const SYSTEM_USERNAME = "Discrope";
const listDMs = async (req, res) => {
    const userId = req.user.id;
    const channels = await prismaAny.dMChannel.findMany({
        where: { participants: { some: { id: userId } } },
        include: {
            participants: { select: { id: true, username: true, nickname: true, isDeleted: true, avatarUrl: true, status: true } }
        }
    });
    res.json({ channels });
};
exports.listDMs = listDMs;
const createOrGetDM = async (req, res) => {
    const userId = req.user.id;
    const { participantIds } = req.body;
    const ids = Array.from(new Set([userId, ...participantIds]));
    const participants = await prismaAny.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, isDeleted: true, username: true }
    });
    if (participants.length !== ids.length || participants.some((u) => u.isDeleted)) {
        res.status(400).json({ message: "Cannot message deleted users" });
        return;
    }
    if (participants.some((u) => u.username === SYSTEM_USERNAME)) {
        res.status(400).json({ message: "Cannot message the system user" });
        return;
    }
    const existing = await prismaAny.dMChannel.findFirst({
        where: {
            AND: ids.map((id) => ({ participants: { some: { id } } }))
        },
        include: { participants: { select: { id: true, username: true, nickname: true, isDeleted: true, avatarUrl: true, status: true } } }
    });
    if (existing && existing.participants.length === ids.length) {
        res.json({ channel: existing });
        return;
    }
    const channel = await prismaAny.dMChannel.create({
        data: {
            participants: { connect: ids.map((id) => ({ id })) }
        },
        include: { participants: { select: { id: true, username: true, nickname: true, isDeleted: true, avatarUrl: true, status: true } } }
    });
    res.status(201).json({ channel });
};
exports.createOrGetDM = createOrGetDM;
const listDMMessages = async (req, res) => {
    const userId = req.user.id;
    const { dmChannelId } = req.params;
    const channel = await prisma_1.prisma.dMChannel.findFirst({
        where: { id: dmChannelId, participants: { some: { id: userId } } },
        select: { id: true }
    });
    if (!channel) {
        res.status(404).json({ message: "DM channel not found" });
        return;
    }
    const messages = await prismaAny.dMMessage.findMany({
        where: { dmChannelId },
        include: { author: { select: { id: true, username: true, nickname: true, isDeleted: true, avatarUrl: true, status: true, aboutMe: true, customStatus: true } } },
        orderBy: { createdAt: "asc" }
    });
    res.json({ messages });
};
exports.listDMMessages = listDMMessages;
const createDMMessage = async (req, res) => {
    const userId = req.user.id;
    const { dmChannelId } = req.params;
    const { content } = req.body;
    const attachmentUrl = req.file ? `/uploads/attachments/${req.file.filename}` : null;
    const attachmentName = req.file?.originalname ?? null;
    if (!content?.trim() && !attachmentUrl) {
        res.status(400).json({ message: "Message cannot be empty" });
        return;
    }
    const channel = await prisma_1.prisma.dMChannel.findFirst({
        where: { id: dmChannelId, participants: { some: { id: userId } } },
        select: { id: true }
    });
    if (!channel) {
        res.status(404).json({ message: "DM channel not found" });
        return;
    }
    const message = await prismaAny.dMMessage.create({
        data: { dmChannelId, authorId: userId, content: content ?? "", attachmentUrl, attachmentName },
        include: { author: { select: { id: true, username: true, nickname: true, isDeleted: true, avatarUrl: true, status: true, aboutMe: true, customStatus: true } } }
    });
    const io = req.app.get("io");
    io.to(`dm:${dmChannelId}`).emit("dm:message:new", message);
    res.status(201).json({ message });
};
exports.createDMMessage = createDMMessage;
const deleteDMMessage = async (req, res) => {
    const userId = req.user.id;
    const { dmChannelId, messageId } = req.params;
    const message = await prismaAny.dMMessage.findUnique({
        where: { id: messageId },
        select: { authorId: true, dmChannelId: true }
    });
    if (!message || message.dmChannelId !== dmChannelId || message.authorId !== userId) {
        res.status(403).json({ message: "Cannot delete this message" });
        return;
    }
    await prismaAny.dMMessage.delete({ where: { id: messageId } });
    const io = req.app.get("io");
    io.to(`dm:${dmChannelId}`).emit("dm:message:deleted", { id: messageId, dmChannelId });
    res.json({ deleted: true });
};
exports.deleteDMMessage = deleteDMMessage;
