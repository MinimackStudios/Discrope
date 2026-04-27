"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteServerAsAdmin = exports.deleteUserAccountAsAdmin = exports.streamAdminEvents = exports.getServerDetail = exports.getOverview = exports.broadcastNotice = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const prisma_1 = require("../lib/prisma");
const adminAudit_1 = require("../lib/adminAudit");
const adminEvents_1 = require("../lib/adminEvents");
const sockets_1 = require("../sockets");
const prismaAny = prisma_1.prisma;
const DELETED_USERNAME = "deleteduser";
const SYSTEM_USERNAME = "Windcord";
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
const broadcastNotice = async (req, res) => {
    const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
    const body = typeof req.body.body === "string" ? req.body.body.trim() : "";
    if (!title || !body) {
        res.status(400).json({ message: "title and body are required" });
        return;
    }
    const io = req.app.get("io");
    io.emit("notice:broadcast", { title, body });
    await (0, adminAudit_1.logAdminEvent)({
        type: "NOTICE_BROADCAST",
        summary: `Admin broadcast notice: "${title}"`,
        actorUsername: "admin-tool"
    });
    res.json({ ok: true });
};
exports.broadcastNotice = broadcastNotice;
const getOverview = async (_req, res) => {
    const [userCount, serverCount, messageCount, recentEvents, users, servers] = await Promise.all([
        prisma_1.prisma.user.count({ where: { isDeleted: false } }),
        prisma_1.prisma.server.count(),
        prisma_1.prisma.message.count(),
        prismaAny.adminEvent.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
        prismaAny.user.findMany({
            where: { isDeleted: false },
            select: { id: true, username: true, nickname: true, avatarUrl: true, status: true, createdAt: true },
            orderBy: { createdAt: "desc" },
            take: 100
        }),
        prisma_1.prisma.server.findMany({
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
exports.getOverview = getOverview;
const getServerDetail = async (req, res) => {
    const { serverId } = req.params;
    const server = await prisma_1.prisma.server.findUnique({
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
        prisma_1.prisma.message.findMany({
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
    const onlineIds = (0, sockets_1.getOnlineUserIds)();
    const serverWithPresence = {
        ...server,
        members: server.members.map((m) => ({
            ...m,
            user: {
                ...m.user,
                status: onlineIds.has(m.user.id)
                    ? (m.user.status === "OFFLINE" ? "ONLINE" : m.user.status)
                    : "OFFLINE"
            }
        }))
    };
    res.json({
        server: serverWithPresence,
        recentMessages,
        recentEvents
    });
};
exports.getServerDetail = getServerDetail;
const streamAdminEvents = async (req, res) => {
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
    });
    res.write(": connected\n\n");
    const unsubscribe = adminEvents_1.adminEventsBus.subscribe((event) => {
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
exports.streamAdminEvents = streamAdminEvents;
const deleteUserAccountAsAdmin = async (req, res) => {
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
        res.status(400).json({ message: "The Windcord system user cannot be deleted" });
        return;
    }
    const deletedUserId = await getOrCreateDeletedUserId();
    const ownedServers = await prismaAny.server.findMany({ where: { ownerId: userId }, select: { id: true, iconUrl: true, name: true } });
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
    await (0, adminAudit_1.logAdminEvent)({
        type: "USER_DELETED_BY_ADMIN",
        summary: `Admin deleted user ${user.username}`,
        targetUserId: user.id,
        actorUsername: "admin-tool"
    });
    res.json({ deleted: true });
};
exports.deleteUserAccountAsAdmin = deleteUserAccountAsAdmin;
const deleteServerAsAdmin = async (req, res) => {
    const { serverId } = req.params;
    const server = await prisma_1.prisma.server.findUnique({
        where: { id: serverId },
        select: { id: true, name: true, iconUrl: true }
    });
    if (!server) {
        res.status(404).json({ message: "Server not found" });
        return;
    }
    await prisma_1.prisma.server.delete({ where: { id: serverId } });
    deleteLocalFileIfExists(server.iconUrl);
    await (0, adminAudit_1.logAdminEvent)({
        type: "SERVER_DELETED_BY_ADMIN",
        summary: `Admin deleted server ${server.name}`,
        targetServerId: server.id,
        actorUsername: "admin-tool"
    });
    res.json({ deleted: true });
};
exports.deleteServerAsAdmin = deleteServerAsAdmin;
