"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.unbanMember = exports.getBans = exports.banMember = exports.kickMember = exports.deleteServer = exports.regenerateInvite = exports.updateServer = exports.getServer = exports.leaveServer = exports.getInviteInfo = exports.joinByInvite = exports.createServer = exports.listServers = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const uuid_1 = require("uuid");
const prisma_1 = require("../lib/prisma");
const adminAudit_1 = require("../lib/adminAudit");
const prismaAny = prisma_1.prisma;
const makeInviteCode = () => (0, uuid_1.v4)().replace(/-/g, "").slice(0, 8);
const SYSTEM_USERNAME = "DiskChat";
const SYSTEM_AVATAR_URL = "/disc.png";
const getOrCreateSystemUserId = async () => {
    const existing = await prismaAny.user.findUnique({
        where: { username: SYSTEM_USERNAME },
        select: { id: true, nickname: true, avatarUrl: true, customStatus: true }
    });
    if (existing) {
        if (existing.avatarUrl !== SYSTEM_AVATAR_URL || existing.nickname !== SYSTEM_USERNAME || existing.customStatus !== "System Bot") {
            await prismaAny.user.update({
                where: { id: existing.id },
                data: {
                    avatarUrl: SYSTEM_AVATAR_URL,
                    nickname: SYSTEM_USERNAME,
                    customStatus: "System Bot"
                }
            });
        }
        return existing.id;
    }
    const created = await prismaAny.user.create({
        data: {
            username: SYSTEM_USERNAME,
            nickname: SYSTEM_USERNAME,
            passwordHash: "system",
            avatarUrl: SYSTEM_AVATAR_URL,
            status: "ONLINE",
            customStatus: "System Bot"
        },
        select: { id: true }
    });
    return created.id;
};
const postSystemMessage = async (serverId, content, app) => {
    const generalChannel = await prisma_1.prisma.channel.findFirst({
        where: { serverId, type: "TEXT" },
        orderBy: { createdAt: "asc" }
    });
    if (!generalChannel) {
        return;
    }
    const systemUserId = await getOrCreateSystemUserId();
    const message = await prismaAny.message.create({
        data: {
            content,
            channelId: generalChannel.id,
            authorId: systemUserId
        },
        include: {
            author: { select: { id: true, username: true, nickname: true, avatarUrl: true, status: true, aboutMe: true, customStatus: true } },
            reactions: true
        }
    });
    const io = app.get("io");
    io.to(`channel:${generalChannel.id}`).emit("message:new", message);
    await (0, adminAudit_1.logAdminEvent)({
        type: "MESSAGE_ACTIVITY",
        summary: `Message count changed in server ${serverId}`,
        targetServerId: serverId,
        persist: false
    });
};
const normalizeInviteCode = (value) => {
    if (!value) {
        return null;
    }
    const code = value.trim();
    if (!/^[a-z0-9-]{3,32}$/.test(code)) {
        return null;
    }
    return code;
};
const toLocalUploadPath = (url) => {
    if (!url || !url.startsWith("/uploads/")) {
        return null;
    }
    return node_path_1.default.resolve(process.cwd(), url.slice(1));
};
const deleteLocalFileIfExists = (url) => {
    const filePath = toLocalUploadPath(url);
    if (!filePath) {
        return;
    }
    if (node_fs_1.default.existsSync(filePath)) {
        node_fs_1.default.unlinkSync(filePath);
    }
};
const listServers = async (req, res) => {
    const userId = req.user.id;
    const memberships = await prisma_1.prisma.serverMember.findMany({
        where: { userId },
        include: {
            server: {
                include: {
                    channels: true,
                    categories: { orderBy: { order: "asc" } },
                    members: { include: { user: true } }
                }
            }
        }
    });
    res.json({ servers: memberships.map((m) => m.server) });
};
exports.listServers = listServers;
const createServer = async (req, res) => {
    const userId = req.user.id;
    const { name, inviteCode } = req.body;
    const iconUrl = req.file ? `/uploads/server-icons/${req.file.filename}` : null;
    const normalizedInviteCode = normalizeInviteCode(inviteCode);
    if (inviteCode && !normalizedInviteCode) {
        res.status(400).json({ message: "Invite code must be 3-32 chars: a-z, 0-9, -" });
        return;
    }
    if (normalizedInviteCode) {
        const taken = await prisma_1.prisma.server.findUnique({ where: { inviteCode: normalizedInviteCode }, select: { id: true } });
        if (taken) {
            res.status(409).json({ message: "Invite code already in use" });
            return;
        }
    }
    const server = await prisma_1.prisma.$transaction(async (tx) => {
        const createdServer = await tx.server.create({
            data: {
                name,
                iconUrl,
                ownerId: userId,
                inviteCode: normalizedInviteCode ?? makeInviteCode(),
                members: {
                    create: {
                        userId,
                        role: "ADMIN"
                    }
                }
            },
            include: { members: true }
        });
        const textCategory = await tx.channelCategory.create({
            data: { serverId: createdServer.id, name: "TEXT CHANNELS", order: 0 }
        });
        await tx.channel.create({
            data: {
                name: "general",
                type: "TEXT",
                serverId: createdServer.id,
                categoryId: textCategory.id
            }
        });
        return tx.server.findUniqueOrThrow({
            where: { id: createdServer.id },
            include: { categories: true, channels: true, members: true }
        });
    });
    await (0, adminAudit_1.logAdminEvent)({
        type: "SERVER_CREATED",
        summary: `Server created: ${server.name}`,
        actorUserId: userId,
        actorUsername: req.user.username,
        targetServerId: server.id
    });
    res.status(201).json({ server });
};
exports.createServer = createServer;
const joinByInvite = async (req, res) => {
    const userId = req.user.id;
    const { inviteCode } = req.params;
    const server = await prisma_1.prisma.server.findUnique({ where: { inviteCode } });
    if (!server) {
        res.status(404).json({ message: "Invite not found" });
        return;
    }
    const banned = await prismaAny.serverBan.findUnique({ where: { userId_serverId: { userId, serverId: server.id } } });
    if (banned) {
        res.status(403).json({ message: "You are banned from this server" });
        return;
    }
    const existingMembership = await prisma_1.prisma.serverMember.findUnique({
        where: { userId_serverId: { userId, serverId: server.id } }
    });
    if (!existingMembership) {
        const createdMembership = await prisma_1.prisma.serverMember.create({
            data: { userId, serverId: server.id },
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        nickname: true,
                        avatarUrl: true,
                        status: true,
                        aboutMe: true,
                        customStatus: true
                    }
                }
            }
        });
        const io = req.app.get("io");
        io.emit("server:member:joined", {
            serverId: server.id,
            member: createdMembership
        });
        await (0, adminAudit_1.logAdminEvent)({
            type: "MEMBER_COUNT_UPDATED",
            summary: `Member count changed for server ${server.name}`,
            targetServerId: server.id,
            persist: false
        });
        const joinedUser = createdMembership.user;
        await postSystemMessage(server.id, `${joinedUser.nickname || joinedUser.username || "A user"} joined the server.`, req.app);
    }
    res.json({ joined: true, serverId: server.id });
};
exports.joinByInvite = joinByInvite;
const getInviteInfo = async (req, res) => {
    const { inviteCode } = req.params;
    const server = await prisma_1.prisma.server.findUnique({
        where: { inviteCode },
        include: {
            members: true
        }
    });
    if (!server) {
        res.status(404).json({ message: "Invite not found" });
        return;
    }
    res.json({
        invite: {
            code: server.inviteCode,
            server: {
                id: server.id,
                name: server.name,
                iconUrl: server.iconUrl,
                memberCount: server.members.length
            }
        }
    });
};
exports.getInviteInfo = getInviteInfo;
const leaveServer = async (req, res) => {
    const userId = req.user.id;
    const { serverId } = req.params;
    const server = await prisma_1.prisma.server.findUnique({ where: { id: serverId } });
    if (server?.ownerId === userId) {
        res.status(400).json({ message: "Owner cannot leave. Delete the server instead." });
        return;
    }
    await prisma_1.prisma.serverMember.delete({ where: { userId_serverId: { userId, serverId } } });
    const io = req.app.get("io");
    io.emit("server:member:left", { serverId, userId });
    await (0, adminAudit_1.logAdminEvent)({
        type: "MEMBER_COUNT_UPDATED",
        summary: `Member count changed for server ${serverId}`,
        targetServerId: serverId,
        persist: false
    });
    const leftUser = await prismaAny.user.findUnique({ where: { id: userId }, select: { username: true, nickname: true } });
    await postSystemMessage(serverId, `${leftUser?.nickname || leftUser?.username || "A user"} left the server.`, req.app);
    res.json({ left: true });
};
exports.leaveServer = leaveServer;
const getServer = async (req, res) => {
    const { serverId } = req.params;
    const server = await prisma_1.prisma.server.findUnique({
        where: { id: serverId },
        include: {
            categories: { orderBy: { order: "asc" } },
            channels: true,
            members: { include: { user: true } }
        }
    });
    if (!server) {
        res.status(404).json({ message: "Server not found" });
        return;
    }
    res.json({ server });
};
exports.getServer = getServer;
const updateServer = async (req, res) => {
    const userId = req.user.id;
    const { serverId } = req.params;
    const { name, removeIcon } = req.body;
    const iconUrl = req.file ? `/uploads/server-icons/${req.file.filename}` : undefined;
    const serverAccess = await prisma_1.prisma.server.findUnique({ where: { id: serverId }, select: { ownerId: true } });
    if (!serverAccess || serverAccess.ownerId !== userId) {
        res.status(403).json({ message: "Only server owner can update settings" });
        return;
    }
    const server = await prisma_1.prisma.server.update({
        where: { id: serverId },
        data: {
            ...(name ? { name } : {}),
            ...(iconUrl ? { iconUrl } : {}),
            ...(!iconUrl && (removeIcon === true || removeIcon === "true") ? { iconUrl: null } : {})
        }
    });
    res.json({ server });
};
exports.updateServer = updateServer;
const regenerateInvite = async (req, res) => {
    const userId = req.user.id;
    const { serverId } = req.params;
    const { inviteCode } = req.body;
    const existing = await prisma_1.prisma.server.findUnique({ where: { id: serverId }, select: { ownerId: true } });
    if (!existing || existing.ownerId !== userId) {
        res.status(403).json({ message: "Only server owner can regenerate invite" });
        return;
    }
    const normalizedInviteCode = normalizeInviteCode(inviteCode);
    if (inviteCode && !normalizedInviteCode) {
        res.status(400).json({ message: "Invite code must be 3-32 chars: a-z, 0-9, -" });
        return;
    }
    if (normalizedInviteCode) {
        const taken = await prisma_1.prisma.server.findFirst({
            where: { inviteCode: normalizedInviteCode, id: { not: serverId } },
            select: { id: true }
        });
        if (taken) {
            res.status(409).json({ message: "Invite code already in use" });
            return;
        }
    }
    const server = await prisma_1.prisma.server.update({
        where: { id: serverId },
        data: { inviteCode: normalizedInviteCode ?? makeInviteCode() },
        select: { id: true, inviteCode: true }
    });
    res.json({ server });
};
exports.regenerateInvite = regenerateInvite;
const deleteServer = async (req, res) => {
    const userId = req.user.id;
    const { serverId } = req.params;
    const existing = await prisma_1.prisma.server.findUnique({ where: { id: serverId }, select: { ownerId: true, iconUrl: true, name: true } });
    if (!existing || existing.ownerId !== userId) {
        res.status(403).json({ message: "Only server owner can delete server" });
        return;
    }
    await prisma_1.prisma.server.delete({ where: { id: serverId } });
    const io = req.app.get("io");
    io.emit("server:deleted", { serverId });
    await (0, adminAudit_1.logAdminEvent)({
        type: "SERVER_DELETED",
        summary: `Server deleted: ${existing.name || serverId}`,
        actorUserId: userId,
        actorUsername: req.user.username,
        targetServerId: serverId
    });
    deleteLocalFileIfExists(existing.iconUrl);
    res.json({ deleted: true });
};
exports.deleteServer = deleteServer;
const kickMember = async (req, res) => {
    const userId = req.user.id;
    const { serverId, memberId } = req.params;
    const server = await prisma_1.prisma.server.findUnique({ where: { id: serverId }, select: { ownerId: true } });
    if (!server || server.ownerId !== userId) {
        res.status(403).json({ message: "Only owner can kick members" });
        return;
    }
    if (memberId === userId) {
        res.status(400).json({ message: "Owner cannot kick themselves" });
        return;
    }
    const targetUser = await prismaAny.user.findUnique({ where: { id: memberId }, select: { username: true } });
    if (targetUser?.username === SYSTEM_USERNAME) {
        res.status(400).json({ message: "Cannot kick the system user" });
        return;
    }
    await prisma_1.prisma.serverMember.deleteMany({ where: { serverId, userId: memberId } });
    const io = req.app.get("io");
    io.emit("server:member:left", { serverId, userId: memberId });
    await (0, adminAudit_1.logAdminEvent)({
        type: "MEMBER_COUNT_UPDATED",
        summary: `Member count changed for server ${serverId}`,
        targetServerId: serverId,
        persist: false
    });
    const kickedUser = await prismaAny.user.findUnique({ where: { id: memberId }, select: { username: true, nickname: true } });
    await postSystemMessage(serverId, `${kickedUser?.nickname || kickedUser?.username || "A user"} was kicked from the server.`, req.app);
    res.json({ kicked: true });
};
exports.kickMember = kickMember;
const banMember = async (req, res) => {
    const userId = req.user.id;
    const { serverId, memberId } = req.params;
    const { reason } = req.body;
    const server = await prisma_1.prisma.server.findUnique({ where: { id: serverId }, select: { ownerId: true } });
    if (!server || server.ownerId !== userId) {
        res.status(403).json({ message: "Only owner can ban members" });
        return;
    }
    if (memberId === userId) {
        res.status(400).json({ message: "Owner cannot ban themselves" });
        return;
    }
    const targetUser = await prismaAny.user.findUnique({ where: { id: memberId }, select: { username: true } });
    if (targetUser?.username === SYSTEM_USERNAME) {
        res.status(400).json({ message: "Cannot ban the system user" });
        return;
    }
    await prisma_1.prisma.serverMember.deleteMany({ where: { serverId, userId: memberId } });
    const io = req.app.get("io");
    io.emit("server:member:left", { serverId, userId: memberId });
    await (0, adminAudit_1.logAdminEvent)({
        type: "MEMBER_COUNT_UPDATED",
        summary: `Member count changed for server ${serverId}`,
        targetServerId: serverId,
        persist: false
    });
    await prismaAny.serverBan.upsert({
        where: { userId_serverId: { userId: memberId, serverId } },
        update: { reason: reason ?? null },
        create: { userId: memberId, serverId, reason: reason ?? null }
    });
    const bannedUser = await prismaAny.user.findUnique({ where: { id: memberId }, select: { username: true, nickname: true } });
    await postSystemMessage(serverId, `${bannedUser?.nickname || bannedUser?.username || "A user"} was banned from the server.`, req.app);
    res.json({ banned: true });
};
exports.banMember = banMember;
const getBans = async (req, res) => {
    const userId = req.user.id;
    const { serverId } = req.params;
    const server = await prisma_1.prisma.server.findUnique({ where: { id: serverId }, select: { ownerId: true } });
    if (!server || server.ownerId !== userId) {
        res.status(403).json({ message: "Only owner can view bans" });
        return;
    }
    const bans = await prismaAny.serverBan.findMany({
        where: { serverId },
        include: { user: { select: { id: true, username: true, nickname: true, avatarUrl: true } } }
    });
    res.json({ bans });
};
exports.getBans = getBans;
const unbanMember = async (req, res) => {
    const userId = req.user.id;
    const { serverId, memberId } = req.params;
    const server = await prisma_1.prisma.server.findUnique({ where: { id: serverId }, select: { ownerId: true } });
    if (!server || server.ownerId !== userId) {
        res.status(403).json({ message: "Only owner can unban members" });
        return;
    }
    await prismaAny.serverBan.deleteMany({ where: { userId: memberId, serverId } });
    res.json({ unbanned: true });
};
exports.unbanMember = unbanMember;
