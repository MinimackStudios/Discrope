"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toggleDMReaction = exports.deleteDMMessage = exports.editDMMessage = exports.createDMMessage = exports.searchDMMessages = exports.getDMMessageContext = exports.listDMMessages = exports.createOrGetDM = exports.listDMs = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const prisma_1 = require("../lib/prisma");
const prismaAny = prisma_1.prisma;
const SYSTEM_USERNAME = "Windcord";
const dmMessageDetailsInclude = {
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
};
const deleteAttachmentIfLocal = (attachmentUrl) => {
    if (!attachmentUrl || !attachmentUrl.startsWith("/uploads/")) {
        return;
    }
    const filePath = node_path_1.default.resolve(process.cwd(), attachmentUrl.slice(1));
    if (node_fs_1.default.existsSync(filePath)) {
        node_fs_1.default.unlinkSync(filePath);
    }
};
const listDMs = async (req, res) => {
    const userId = req.user.id;
    const channels = await prismaAny.dMChannel.findMany({
        where: { participants: { some: { id: userId } } },
        include: {
            participants: { select: { id: true, username: true, nickname: true, isDeleted: true, avatarUrl: true, bannerColor: true, bannerImageUrl: true, accentColor: true, status: true, aboutMe: true, customStatus: true, createdAt: true } }
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
        include: { participants: { select: { id: true, username: true, nickname: true, isDeleted: true, avatarUrl: true, bannerColor: true, bannerImageUrl: true, accentColor: true, status: true, aboutMe: true, customStatus: true, createdAt: true } } }
    });
    if (existing && existing.participants.length === ids.length) {
        res.json({ channel: existing });
        return;
    }
    const channel = await prismaAny.dMChannel.create({
        data: {
            participants: { connect: ids.map((id) => ({ id })) }
        },
        include: { participants: { select: { id: true, username: true, nickname: true, isDeleted: true, avatarUrl: true, bannerColor: true, bannerImageUrl: true, accentColor: true, status: true, aboutMe: true, customStatus: true, createdAt: true } } }
    });
    res.status(201).json({ channel });
};
exports.createOrGetDM = createOrGetDM;
const DM_MESSAGE_PAGE_SIZE = 50;
const DM_MESSAGE_CONTEXT_BEFORE_COUNT = 20;
const DM_MESSAGE_CONTEXT_AFTER_COUNT = DM_MESSAGE_PAGE_SIZE - DM_MESSAGE_CONTEXT_BEFORE_COUNT - 1;
const listDMMessages = async (req, res) => {
    const userId = req.user.id;
    const { dmChannelId } = req.params;
    const before = typeof req.query.before === "string" ? req.query.before : undefined;
    const after = typeof req.query.after === "string" ? req.query.after : undefined;
    const channel = await prismaAny.dMChannel.findFirst({
        where: { id: dmChannelId, participants: { some: { id: userId } } },
        select: { id: true, participants: { select: { id: true } } }
    });
    if (!channel) {
        res.status(404).json({ message: "DM channel not found" });
        return;
    }
    const beforeDate = before
        ? (await prismaAny.dMMessage.findUnique({ where: { id: before }, select: { createdAt: true } }))?.createdAt
        : undefined;
    const afterDate = after
        ? (await prismaAny.dMMessage.findUnique({ where: { id: after }, select: { createdAt: true } }))?.createdAt
        : undefined;
    const messages = await prismaAny.dMMessage.findMany({
        where: {
            dmChannelId,
            ...(beforeDate ? { createdAt: { lt: beforeDate } } : {}),
            ...(afterDate ? { createdAt: { gt: afterDate } } : {})
        },
        include: dmMessageDetailsInclude,
        orderBy: { createdAt: afterDate ? "asc" : "desc" },
        take: DM_MESSAGE_PAGE_SIZE
    });
    const ordered = afterDate ? messages : messages.reverse();
    const hasOlder = ordered.length > 0
        ? (await prismaAny.dMMessage.count({ where: { dmChannelId, createdAt: { lt: ordered[0].createdAt } } })) > 0
        : false;
    const hasNewer = ordered.length > 0
        ? (await prismaAny.dMMessage.count({ where: { dmChannelId, createdAt: { gt: ordered[ordered.length - 1].createdAt } } })) > 0
        : false;
    res.json({ messages: ordered, hasOlder, hasNewer });
};
exports.listDMMessages = listDMMessages;
const getDMMessageContext = async (req, res) => {
    const userId = req.user.id;
    const { dmChannelId, messageId } = req.params;
    const channel = await prismaAny.dMChannel.findFirst({
        where: { id: dmChannelId, participants: { some: { id: userId } } },
        select: { id: true }
    });
    if (!channel) {
        res.status(404).json({ message: "DM channel not found" });
        return;
    }
    const targetMessage = await prismaAny.dMMessage.findFirst({
        where: {
            id: messageId,
            dmChannelId,
            dmChannel: {
                participants: {
                    some: { id: userId }
                }
            }
        },
        include: dmMessageDetailsInclude
    });
    if (!targetMessage) {
        res.status(404).json({ message: "Message not found" });
        return;
    }
    const beforeMessages = await prismaAny.dMMessage.findMany({
        where: {
            dmChannelId,
            createdAt: { lt: targetMessage.createdAt }
        },
        include: dmMessageDetailsInclude,
        orderBy: { createdAt: "desc" },
        take: DM_MESSAGE_CONTEXT_BEFORE_COUNT
    });
    const afterMessages = await prismaAny.dMMessage.findMany({
        where: {
            dmChannelId,
            createdAt: { gt: targetMessage.createdAt }
        },
        include: dmMessageDetailsInclude,
        orderBy: { createdAt: "asc" },
        take: DM_MESSAGE_CONTEXT_AFTER_COUNT
    });
    const messages = [...beforeMessages.reverse(), targetMessage, ...afterMessages];
    const hasOlder = messages.length > 0
        ? (await prismaAny.dMMessage.count({ where: { dmChannelId, createdAt: { lt: messages[0].createdAt } } })) > 0
        : false;
    const hasNewer = messages.length > 0
        ? (await prismaAny.dMMessage.count({ where: { dmChannelId, createdAt: { gt: messages[messages.length - 1].createdAt } } })) > 0
        : false;
    res.json({ messages, hasOlder, hasNewer, focusMessageId: targetMessage.id });
};
exports.getDMMessageContext = getDMMessageContext;
const searchDMMessages = async (req, res) => {
    const userId = req.user.id;
    const { dmChannelId } = req.params;
    const { q, page: pageStr, pageSize: pageSizeStr } = req.query;
    if (!q || q.trim().length === 0) {
        res.status(400).json({ message: "Search query is required" });
        return;
    }
    const channel = await prismaAny.dMChannel.findFirst({
        where: { id: dmChannelId, participants: { some: { id: userId } } },
        select: { id: true }
    });
    if (!channel) {
        res.status(404).json({ message: "DM channel not found" });
        return;
    }
    const requestedPage = Math.max(1, parseInt(pageStr || "1", 10) || 1);
    const pageSize = Math.min(Math.max(1, parseInt(pageSizeStr || "25", 10) || 25), 50);
    const searchTerm = q.trim().toLowerCase();
    try {
        const messages = await prismaAny.dMMessage.findMany({
            where: { dmChannelId },
            include: dmMessageDetailsInclude,
            orderBy: { createdAt: "desc" }
        });
        const filtered = messages
            .filter((message) => message.content && message.content.toLowerCase().includes(searchTerm));
        const total = filtered.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const page = Math.min(requestedPage, totalPages);
        const offset = (page - 1) * pageSize;
        const results = filtered
            .slice(offset, offset + pageSize)
            .map((message) => ({
            message,
            highlightedText: message.content || ""
        }));
        res.json({ results, total, page, pageSize, totalPages });
    }
    catch (error) {
        console.error("DM search error:", error);
        res.status(500).json({ message: "Search failed" });
    }
};
exports.searchDMMessages = searchDMMessages;
const createDMMessage = async (req, res) => {
    const userId = req.user.id;
    const { dmChannelId } = req.params;
    const { content, replyToId } = req.body;
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
        include: dmMessageDetailsInclude
    });
    const io = req.app.get("io");
    for (const participant of channel.participants) {
        io.to(`user:${participant.id}`).emit("dm:message:new", message);
    }
    res.status(201).json({ message });
};
exports.createDMMessage = createDMMessage;
const editDMMessage = async (req, res) => {
    const userId = req.user.id;
    const { dmChannelId, messageId } = req.params;
    const { content } = req.body;
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
        include: dmMessageDetailsInclude
    });
    const io = req.app.get("io");
    io.to(`dm:${dmChannelId}`).emit("dm:message:updated", message);
    res.json({ message });
};
exports.editDMMessage = editDMMessage;
const deleteDMMessage = async (req, res) => {
    const userId = req.user.id;
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
exports.deleteDMMessage = deleteDMMessage;
const toggleDMReaction = async (req, res) => {
    const userId = req.user.id;
    const { dmChannelId, messageId } = req.params;
    const { emoji } = req.body;
    const message = await prismaAny.dMMessage.findFirst({
        where: {
            id: messageId,
            dmChannelId,
            dmChannel: {
                participants: {
                    some: { id: userId }
                }
            }
        },
        select: { id: true, dmChannelId: true }
    });
    if (!message) {
        res.status(404).json({ message: "Message not found" });
        return;
    }
    const existing = await prismaAny.dMMessageReaction.findUnique({
        where: { dmMessageId_userId_emoji: { dmMessageId: messageId, userId, emoji } }
    });
    if (existing) {
        await prismaAny.dMMessageReaction.delete({ where: { dmMessageId_userId_emoji: { dmMessageId: messageId, userId, emoji } } });
    }
    else {
        // Enforce 20-unique-emoji limit
        const uniqueEmojis = await prismaAny.dMMessageReaction.findMany({
            where: { dmMessageId: messageId },
            select: { emoji: true },
            distinct: ["emoji"]
        });
        if (uniqueEmojis.length >= 20 && !uniqueEmojis.some((r) => r.emoji === emoji)) {
            res.status(400).json({ message: "Reactions are limited to 20 unique emojis per message" });
            return;
        }
        await prismaAny.dMMessageReaction.create({ data: { dmMessageId: messageId, userId, emoji } });
    }
    const updatedMessage = await prismaAny.dMMessage.findUnique({
        where: { id: messageId },
        include: dmMessageDetailsInclude
    });
    const io = req.app.get("io");
    io.to(`dm:${dmChannelId}`).emit("dm:message:updated", updatedMessage);
    res.json({ message: updatedMessage });
};
exports.toggleDMReaction = toggleDMReaction;
