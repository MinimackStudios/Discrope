"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteSelf = exports.removeFriend = exports.rejectFriendRequest = exports.acceptFriendRequest = exports.sendFriendRequest = exports.listFriends = exports.updateSelf = exports.findUsers = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const prisma_1 = require("../lib/prisma");
const prismaAny = prisma_1.prisma;
const USERNAME_REGEX = /^[a-z0-9]{2,32}$/;
const DELETED_USERNAME = "deleteduser";
const SYSTEM_USERNAME = "Discrope";
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
const getOrCreateDeletedUserId = async () => {
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
const findUsers = async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    if (!q) {
        res.json({ users: [] });
        return;
    }
    const users = await prismaAny.user.findMany({
        where: { username: { contains: q }, isDeleted: false },
        select: { id: true, username: true, nickname: true, avatarUrl: true, status: true, aboutMe: true, customStatus: true, createdAt: true },
        take: 10
    });
    res.json({ users });
};
exports.findUsers = findUsers;
const updateSelf = async (req, res) => {
    const userId = req.user.id;
    const { username, status } = req.body;
    const avatarUrl = req.file ? `/uploads/avatars/${req.file.filename}` : undefined;
    const normalizedUsername = typeof username === "string" ? username.trim() : undefined;
    if (normalizedUsername && !USERNAME_REGEX.test(normalizedUsername)) {
        res.status(400).json({ message: "Username must be 2-32 lowercase letters and numbers only" });
        return;
    }
    if (normalizedUsername && normalizedUsername.toLowerCase() === DELETED_USERNAME) {
        res.status(400).json({ message: "This username is reserved" });
        return;
    }
    const user = await prismaAny.user.update({
        where: { id: userId },
        data: {
            ...(normalizedUsername ? { username: normalizedUsername } : {}),
            ...(typeof req.body.nickname === "string" ? { nickname: req.body.nickname.trim() } : {}),
            ...(status ? { status } : {}),
            ...(typeof req.body.aboutMe === "string" ? { aboutMe: req.body.aboutMe } : {}),
            ...(typeof req.body.customStatus === "string" ? { customStatus: req.body.customStatus } : {}),
            ...(avatarUrl ? { avatarUrl } : {})
        },
        select: { id: true, username: true, nickname: true, avatarUrl: true, status: true, aboutMe: true, customStatus: true, createdAt: true }
    });
    const io = req.app.get("io");
    io.emit("user:updated", {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
        status: user.status,
        aboutMe: user.aboutMe,
        customStatus: user.customStatus
    });
    res.json({ user });
};
exports.updateSelf = updateSelf;
const listFriends = async (req, res) => {
    const userId = req.user.id;
    const accepted = await prismaAny.friendRequest.findMany({
        where: {
            status: "ACCEPTED",
            OR: [{ fromId: userId }, { toId: userId }]
        },
        include: {
            from: { select: { id: true, username: true, nickname: true, avatarUrl: true, status: true, aboutMe: true, customStatus: true, createdAt: true } },
            to: { select: { id: true, username: true, nickname: true, avatarUrl: true, status: true, aboutMe: true, customStatus: true, createdAt: true } }
        }
    });
    const friends = accepted.map((f) => (f.fromId === userId ? f.to : f.from));
    const pending = await prismaAny.friendRequest.findMany({
        where: { toId: userId, status: "PENDING" },
        include: { from: { select: { id: true, username: true, nickname: true, avatarUrl: true, status: true, aboutMe: true, customStatus: true, createdAt: true } } }
    });
    const pendingOutgoing = await prismaAny.friendRequest.findMany({
        where: { fromId: userId, status: "PENDING" },
        include: { to: { select: { id: true, username: true, nickname: true, avatarUrl: true, status: true, aboutMe: true, customStatus: true, createdAt: true } } }
    });
    res.json({
        friends,
        pending,
        pendingOutgoing: pendingOutgoing.map((request) => request.to)
    });
};
exports.listFriends = listFriends;
const sendFriendRequest = async (req, res) => {
    const fromId = req.user.id;
    const { username } = req.body;
    const target = await prismaAny.user.findUnique({ where: { username } });
    if (!target || target.id === fromId) {
        res.status(404).json({ message: "User not found" });
        return;
    }
    if (target.username === SYSTEM_USERNAME) {
        res.status(400).json({ message: "Cannot friend the system user" });
        return;
    }
    if (target.isDeleted) {
        res.status(400).json({ message: "Cannot friend a deleted user" });
        return;
    }
    const request = await prismaAny.friendRequest.upsert({
        where: { fromId_toId: { fromId, toId: target.id } },
        update: { status: "PENDING" },
        create: { fromId, toId: target.id, status: "PENDING" }
    });
    const io = req.app.get("io");
    io.emit("friends:changed", { userIds: [fromId, target.id] });
    res.status(201).json({ request });
};
exports.sendFriendRequest = sendFriendRequest;
const acceptFriendRequest = async (req, res) => {
    const userId = req.user.id;
    const { requestId } = req.params;
    const request = await prismaAny.friendRequest.findUnique({ where: { id: requestId } });
    if (!request || request.toId !== userId) {
        res.status(404).json({ message: "Request not found" });
        return;
    }
    const updated = await prismaAny.friendRequest.update({
        where: { id: requestId },
        data: { status: "ACCEPTED" }
    });
    const io = req.app.get("io");
    io.emit("friends:changed", { userIds: [request.fromId, request.toId] });
    res.json({ request: updated });
};
exports.acceptFriendRequest = acceptFriendRequest;
const rejectFriendRequest = async (req, res) => {
    const userId = req.user.id;
    const { requestId } = req.params;
    const request = await prismaAny.friendRequest.findUnique({ where: { id: requestId } });
    if (!request || request.toId !== userId) {
        res.status(404).json({ message: "Request not found" });
        return;
    }
    await prismaAny.friendRequest.delete({ where: { id: requestId } });
    const io = req.app.get("io");
    io.emit("friends:changed", { userIds: [request.fromId, request.toId] });
    res.json({ rejected: true });
};
exports.rejectFriendRequest = rejectFriendRequest;
const removeFriend = async (req, res) => {
    const userId = req.user.id;
    const { friendId } = req.params;
    await prismaAny.friendRequest.deleteMany({
        where: {
            status: "ACCEPTED",
            OR: [
                { fromId: userId, toId: friendId },
                { fromId: friendId, toId: userId }
            ]
        }
    });
    const io = req.app.get("io");
    io.emit("friends:changed", { userIds: [userId, friendId] });
    res.json({ removed: true });
};
exports.removeFriend = removeFriend;
const deleteSelf = async (req, res) => {
    const userId = req.user.id;
    const user = await prismaAny.user.findUnique({ where: { id: userId }, select: { id: true, avatarUrl: true, isDeleted: true } });
    if (!user || user.isDeleted) {
        res.status(404).json({ message: "User not found" });
        return;
    }
    const deletedUserId = await getOrCreateDeletedUserId();
    const ownedServers = await prismaAny.server.findMany({ where: { ownerId: userId }, select: { id: true, iconUrl: true } });
    await prisma_1.prisma.$transaction(async (tx) => {
        await tx.message.updateMany({ where: { authorId: userId }, data: { authorId: deletedUserId } });
        await tx.dMMessage.updateMany({ where: { authorId: userId }, data: { authorId: deletedUserId } });
        await tx.friendRequest.deleteMany({ where: { OR: [{ fromId: userId }, { toId: userId }] } });
        await tx.user.delete({ where: { id: userId } });
    });
    deleteLocalFileIfExists(user.avatarUrl);
    for (const server of ownedServers) {
        deleteLocalFileIfExists(server.iconUrl ?? null);
    }
    res.clearCookie("token");
    res.json({ deleted: true });
};
exports.deleteSelf = deleteSelf;
