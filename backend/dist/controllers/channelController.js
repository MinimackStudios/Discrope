"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateChannel = exports.deleteCategory = exports.deleteChannel = exports.pinnedMessages = exports.togglePin = exports.toggleReaction = exports.deleteMessage = exports.editMessage = exports.createMessage = exports.listMessages = exports.createChannel = exports.createCategory = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const prisma_1 = require("../lib/prisma");
const adminAudit_1 = require("../lib/adminAudit");
const prismaAny = prisma_1.prisma;
const normalizeChannelName = (value) => {
    return value.trim().replace(/\s+/g, "-").toLowerCase();
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
const getServerRoleForChannel = async (channelId, userId) => {
    const channel = await prisma_1.prisma.channel.findUnique({
        where: { id: channelId },
        include: {
            server: {
                include: {
                    members: {
                        where: { userId },
                        select: { role: true }
                    }
                }
            }
        }
    });
    if (!channel) {
        return null;
    }
    return {
        ownerId: channel.server.ownerId,
        role: channel.server.members[0]?.role ?? null
    };
};
const canModerateChannel = async (channelId, userId) => {
    const roleInfo = await getServerRoleForChannel(channelId, userId);
    if (!roleInfo) {
        return false;
    }
    return roleInfo.ownerId === userId || roleInfo.role === "ADMIN";
};
const messageDetailsInclude = {
    author: { select: { id: true, username: true, nickname: true, isDeleted: true, avatarUrl: true, status: true, aboutMe: true, customStatus: true, createdAt: true } },
    reactions: {
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
            author: { select: { id: true, username: true, nickname: true, isDeleted: true, avatarUrl: true } }
        }
    }
};
const createCategory = async (req, res) => {
    const { serverId } = req.params;
    const { name, order } = req.body;
    const member = await prisma_1.prisma.serverMember.findUnique({ where: { userId_serverId: { userId: req.user.id, serverId } } });
    const server = await prisma_1.prisma.server.findUnique({ where: { id: serverId }, select: { ownerId: true } });
    if (!server || (server.ownerId !== req.user.id && member?.role !== "ADMIN")) {
        res.status(403).json({ message: "Forbidden" });
        return;
    }
    const category = await prisma_1.prisma.channelCategory.create({
        data: { serverId, name, order: order ?? 0 }
    });
    res.status(201).json({ category });
};
exports.createCategory = createCategory;
const createChannel = async (req, res) => {
    const { serverId } = req.params;
    const { name, type, categoryId } = req.body;
    const normalizedName = normalizeChannelName(name);
    if (normalizedName.length === 0) {
        res.status(400).json({ message: "Channel name cannot be empty" });
        return;
    }
    const member = await prisma_1.prisma.serverMember.findUnique({ where: { userId_serverId: { userId: req.user.id, serverId } } });
    const server = await prisma_1.prisma.server.findUnique({ where: { id: serverId }, select: { ownerId: true } });
    if (!server || (server.ownerId !== req.user.id && member?.role !== "ADMIN")) {
        res.status(403).json({ message: "Forbidden" });
        return;
    }
    const duplicate = await prisma_1.prisma.channel.findFirst({
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
    const channel = await prisma_1.prisma.channel.create({
        data: {
            serverId,
            name: normalizedName,
            type,
            categoryId: categoryId ?? null
        }
    });
    await (0, adminAudit_1.logAdminEvent)({
        type: "CHANNEL_COUNT_UPDATED",
        summary: `Channel count changed for server ${serverId}`,
        targetServerId: serverId,
        persist: false
    });
    res.status(201).json({ channel });
};
exports.createChannel = createChannel;
const listMessages = async (req, res) => {
    const { channelId } = req.params;
    const messages = await prisma_1.prisma.message.findMany({
        where: { channelId },
        include: messageDetailsInclude,
        orderBy: { createdAt: "asc" }
    });
    res.json({ messages });
};
exports.listMessages = listMessages;
const createMessage = async (req, res) => {
    const userId = req.user.id;
    const { channelId } = req.params;
    const { content, replyToId } = req.body;
    const attachmentUrl = req.file ? `/uploads/attachments/${req.file.filename}` : null;
    const attachmentName = req.file?.originalname ?? null;
    const finalContent = content ?? "";
    if (!finalContent?.trim() && !attachmentUrl) {
        res.status(400).json({ message: "Message cannot be empty" });
        return;
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
    const channel = await prisma_1.prisma.channel.findUnique({ where: { id: channelId }, select: { serverId: true } });
    await (0, adminAudit_1.logAdminEvent)({
        type: "MESSAGE_ACTIVITY",
        summary: `Message count changed in channel ${channelId}`,
        targetServerId: channel?.serverId ?? null,
        persist: false
    });
    res.status(201).json({ message });
};
exports.createMessage = createMessage;
const editMessage = async (req, res) => {
    const userId = req.user.id;
    const { messageId } = req.params;
    const { content } = req.body;
    const existing = await prisma_1.prisma.message.findUnique({ where: { id: messageId } });
    if (!existing) {
        res.status(404).json({ message: "Message not found" });
        return;
    }
    const canModerate = await canModerateChannel(existing.channelId, userId);
    if (existing.authorId !== userId && !canModerate) {
        res.status(403).json({ message: "Forbidden" });
        return;
    }
    const message = await prisma_1.prisma.message.update({
        where: { id: messageId },
        data: { content, editedAt: new Date() },
        include: messageDetailsInclude
    });
    const io = req.app.get("io");
    io.to(`channel:${message.channelId}`).emit("message:updated", message);
    res.json({ message });
};
exports.editMessage = editMessage;
const deleteMessage = async (req, res) => {
    const userId = req.user.id;
    const { messageId } = req.params;
    const existing = await prisma_1.prisma.message.findUnique({ where: { id: messageId } });
    if (!existing) {
        res.status(404).json({ message: "Message not found" });
        return;
    }
    const canModerate = await canModerateChannel(existing.channelId, userId);
    if (existing.authorId !== userId && !canModerate) {
        res.status(403).json({ message: "Forbidden" });
        return;
    }
    const attachmentUrl = existing.attachmentUrl;
    await prisma_1.prisma.message.delete({ where: { id: messageId } });
    deleteAttachmentIfLocal(attachmentUrl);
    const io = req.app.get("io");
    io.to(`channel:${existing.channelId}`).emit("message:deleted", { id: messageId });
    const channel = await prisma_1.prisma.channel.findUnique({ where: { id: existing.channelId }, select: { serverId: true } });
    await (0, adminAudit_1.logAdminEvent)({
        type: "MESSAGE_ACTIVITY",
        summary: `Message count changed in channel ${existing.channelId}`,
        targetServerId: channel?.serverId ?? null,
        persist: false
    });
    res.json({ deleted: true });
};
exports.deleteMessage = deleteMessage;
const toggleReaction = async (req, res) => {
    const userId = req.user.id;
    const { messageId } = req.params;
    const { emoji } = req.body;
    const message = await prisma_1.prisma.message.findUnique({
        where: { id: messageId },
        select: { id: true, channelId: true }
    });
    if (!message) {
        res.status(404).json({ message: "Message not found" });
        return;
    }
    const existing = await prisma_1.prisma.messageReaction.findUnique({
        where: { messageId_userId_emoji: { messageId, userId, emoji } }
    });
    if (existing) {
        await prisma_1.prisma.messageReaction.delete({ where: { messageId_userId_emoji: { messageId, userId, emoji } } });
    }
    else {
        await prisma_1.prisma.messageReaction.create({ data: { messageId, userId, emoji } });
    }
    const updatedMessage = await prisma_1.prisma.message.findUnique({
        where: { id: messageId },
        include: messageDetailsInclude
    });
    const io = req.app.get("io");
    io.to(`channel:${message.channelId}`).emit("message:updated", updatedMessage);
    res.json({ message: updatedMessage });
};
exports.toggleReaction = toggleReaction;
const togglePin = async (req, res) => {
    const userId = req.user.id;
    const { messageId } = req.params;
    const message = await prisma_1.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) {
        res.status(404).json({ message: "Message not found" });
        return;
    }
    const canModerate = await canModerateChannel(message.channelId, userId);
    if (!canModerate) {
        res.status(403).json({ message: "Only server admins/owner can pin or unpin" });
        return;
    }
    const updated = await prisma_1.prisma.message.update({
        where: { id: messageId },
        data: { isPinned: !message.isPinned }
    });
    res.json({ message: updated });
};
exports.togglePin = togglePin;
const pinnedMessages = async (req, res) => {
    const { channelId } = req.params;
    const messages = await prisma_1.prisma.message.findMany({
        where: { channelId, isPinned: true },
        include: { author: { select: { id: true, username: true, nickname: true, isDeleted: true, avatarUrl: true, status: true, aboutMe: true, customStatus: true } } },
        orderBy: { createdAt: "desc" }
    });
    res.json({ messages });
};
exports.pinnedMessages = pinnedMessages;
const deleteChannel = async (req, res) => {
    const { channelId } = req.params;
    const channel = await prisma_1.prisma.channel.findUnique({ where: { id: channelId }, select: { serverId: true } });
    if (!channel) {
        res.status(404).json({ message: "Channel not found" });
        return;
    }
    const member = await prisma_1.prisma.serverMember.findUnique({
        where: { userId_serverId: { userId: req.user.id, serverId: channel.serverId } }
    });
    const server = await prisma_1.prisma.server.findUnique({ where: { id: channel.serverId }, select: { ownerId: true } });
    if (!server || (server.ownerId !== req.user.id && member?.role !== "ADMIN")) {
        res.status(403).json({ message: "Forbidden" });
        return;
    }
    await prisma_1.prisma.channel.delete({ where: { id: channelId } });
    await (0, adminAudit_1.logAdminEvent)({
        type: "CHANNEL_COUNT_UPDATED",
        summary: `Channel count changed for server ${channel.serverId}`,
        targetServerId: channel.serverId,
        persist: false
    });
    res.json({ deleted: true });
};
exports.deleteChannel = deleteChannel;
const deleteCategory = async (req, res) => {
    const { categoryId } = req.params;
    const category = await prisma_1.prisma.channelCategory.findUnique({ where: { id: categoryId }, select: { serverId: true } });
    if (!category) {
        res.status(404).json({ message: "Category not found" });
        return;
    }
    const member = await prisma_1.prisma.serverMember.findUnique({
        where: { userId_serverId: { userId: req.user.id, serverId: category.serverId } }
    });
    const server = await prisma_1.prisma.server.findUnique({ where: { id: category.serverId }, select: { ownerId: true } });
    if (!server || (server.ownerId !== req.user.id && member?.role !== "ADMIN")) {
        res.status(403).json({ message: "Forbidden" });
        return;
    }
    await prisma_1.prisma.channel.updateMany({ where: { categoryId }, data: { categoryId: null } });
    await prisma_1.prisma.channelCategory.delete({ where: { id: categoryId } });
    res.json({ deleted: true });
};
exports.deleteCategory = deleteCategory;
const updateChannel = async (req, res) => {
    const { channelId } = req.params;
    const { categoryId, name } = req.body;
    const channel = await prisma_1.prisma.channel.findUnique({ where: { id: channelId }, select: { serverId: true } });
    if (!channel) {
        res.status(404).json({ message: "Channel not found" });
        return;
    }
    const server = await prisma_1.prisma.server.findUnique({ where: { id: channel.serverId }, select: { ownerId: true } });
    const member = await prisma_1.prisma.serverMember.findUnique({
        where: { userId_serverId: { userId: req.user.id, serverId: channel.serverId } }
    });
    if (!server || (server.ownerId !== req.user.id && member?.role !== "ADMIN")) {
        res.status(403).json({ message: "Forbidden" });
        return;
    }
    const normalizedName = typeof name === "string" ? normalizeChannelName(name) : undefined;
    if (normalizedName !== undefined && normalizedName.length === 0) {
        res.status(400).json({ message: "Channel name cannot be empty" });
        return;
    }
    if (normalizedName !== undefined) {
        const duplicate = await prisma_1.prisma.channel.findFirst({
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
    const updated = await prisma_1.prisma.channel.update({
        where: { id: channelId },
        data: {
            ...(hasCategoryId ? { categoryId: categoryId ?? null } : {}),
            ...(normalizedName !== undefined ? { name: normalizedName } : {})
        }
    });
    const io = req.app.get("io");
    io.emit("channel:updated", { channel: updated });
    res.json({ channel: updated });
};
exports.updateChannel = updateChannel;
