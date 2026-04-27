"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteSelf = exports.getUnreadCounts = exports.removeFriend = exports.rejectFriendRequest = exports.acceptFriendRequest = exports.sendFriendRequest = exports.listFriends = exports.updateSelf = exports.dismissSystemNotice = exports.listSystemNotices = exports.findUsers = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const prisma_1 = require("../lib/prisma");
const adminAudit_1 = require("../lib/adminAudit");
const prismaAny = prisma_1.prisma;
const USERNAME_REGEX = /^[a-z0-9]{2,32}$/;
const DELETED_USERNAME = "deleteduser";
const SYSTEM_USERNAME = "Windcord";
const SYSTEM_NOTICE_SELECT = {
    id: true,
    title: true,
    body: true,
    createdAt: true
};
const isHereMentionEligibleStatus = (status) => {
    return status === "ONLINE" || status === "IDLE" || status === "DND";
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
const listSystemNotices = async (req, res) => {
    const userId = req.user.id;
    const user = await prismaAny.user.findUnique({
        where: { id: userId },
        select: { createdAt: true }
    });
    if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
    }
    const notices = await prismaAny.broadcastNotice.findMany({
        where: {
            createdAt: { gte: user.createdAt },
            dismissals: {
                none: { userId }
            }
        },
        orderBy: { createdAt: "asc" },
        select: SYSTEM_NOTICE_SELECT
    });
    res.json({ notices });
};
exports.listSystemNotices = listSystemNotices;
const dismissSystemNotice = async (req, res) => {
    const userId = req.user.id;
    const { noticeId } = req.params;
    const notice = await prismaAny.broadcastNotice.findUnique({
        where: { id: noticeId },
        select: { id: true }
    });
    if (!notice) {
        res.json({ ok: true });
        return;
    }
    await prismaAny.noticeDismissal.upsert({
        where: {
            userId_noticeId: {
                userId,
                noticeId
            }
        },
        update: {},
        create: {
            userId,
            noticeId
        }
    });
    res.json({ ok: true });
};
exports.dismissSystemNotice = dismissSystemNotice;
const updateSelf = async (req, res) => {
    const userId = req.user.id;
    const { username, status, removeAvatar } = req.body;
    const files = req.files;
    const avatarFile = files?.["avatar"]?.[0];
    const bannerImageFile = files?.["bannerImage"]?.[0];
    const avatarUrl = avatarFile ? `/uploads/avatars/${avatarFile.filename}` : undefined;
    const bannerImageUrl = bannerImageFile ? `/uploads/banners/${bannerImageFile.filename}` : undefined;
    const shouldRemoveAvatar = removeAvatar === "true";
    const shouldRemoveBannerImage = req.body.removeBannerImage === "true";
    const normalizedUsername = typeof username === "string" ? username.trim() : undefined;
    if (normalizedUsername && !USERNAME_REGEX.test(normalizedUsername)) {
        res.status(400).json({ message: "Username must be 2-32 lowercase letters and numbers only" });
        return;
    }
    if (normalizedUsername && normalizedUsername.toLowerCase() === DELETED_USERNAME) {
        res.status(400).json({ message: "This username is reserved" });
        return;
    }
    const existingUser = await prismaAny.user.findUnique({
        where: { id: userId },
        select: { avatarUrl: true, bannerImageUrl: true }
    });
    const nextAvatarUrl = avatarUrl ?? (shouldRemoveAvatar ? null : undefined);
    const nextBannerImageUrl = bannerImageUrl ?? (shouldRemoveBannerImage ? null : undefined);
    const user = await prismaAny.user.update({
        where: { id: userId },
        data: {
            ...(normalizedUsername ? { username: normalizedUsername } : {}),
            ...(typeof req.body.nickname === "string" ? { nickname: req.body.nickname.trim() } : {}),
            ...(status ? { status } : {}),
            ...(typeof req.body.aboutMe === "string" ? { aboutMe: req.body.aboutMe } : {}),
            ...(typeof req.body.customStatus === "string" ? { customStatus: req.body.customStatus } : {}),
            ...(typeof req.body.bannerColor === "string" ? { bannerColor: req.body.bannerColor || null } : {}),
            ...(typeof req.body.accentColor === "string" ? { accentColor: req.body.accentColor || null } : {}),
            ...(nextAvatarUrl !== undefined ? { avatarUrl: nextAvatarUrl } : {}),
            ...(nextBannerImageUrl !== undefined ? { bannerImageUrl: nextBannerImageUrl } : {})
        },
        select: { id: true, username: true, nickname: true, avatarUrl: true, bannerImageUrl: true, status: true, aboutMe: true, customStatus: true, bannerColor: true, accentColor: true, createdAt: true }
    });
    if (existingUser?.avatarUrl && existingUser.avatarUrl !== user.avatarUrl) {
        deleteLocalFileIfExists(existingUser.avatarUrl);
    }
    if (existingUser?.bannerImageUrl && existingUser.bannerImageUrl !== user.bannerImageUrl) {
        deleteLocalFileIfExists(existingUser.bannerImageUrl);
    }
    const io = req.app.get("io");
    io.emit("user:updated", {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
        bannerImageUrl: user.bannerImageUrl,
        status: user.status,
        aboutMe: user.aboutMe,
        customStatus: user.customStatus,
        bannerColor: user.bannerColor,
        accentColor: user.accentColor
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
            from: { select: { id: true, username: true, nickname: true, avatarUrl: true, bannerColor: true, bannerImageUrl: true, accentColor: true, status: true, aboutMe: true, customStatus: true, createdAt: true } },
            to: { select: { id: true, username: true, nickname: true, avatarUrl: true, bannerColor: true, bannerImageUrl: true, accentColor: true, status: true, aboutMe: true, customStatus: true, createdAt: true } }
        }
    });
    const friends = accepted.map((f) => ({ ...(f.fromId === userId ? f.to : f.from), friendsSince: f.createdAt }));
    const pending = await prismaAny.friendRequest.findMany({
        where: { toId: userId, status: "PENDING" },
        include: { from: { select: { id: true, username: true, nickname: true, avatarUrl: true, bannerColor: true, bannerImageUrl: true, accentColor: true, status: true, aboutMe: true, customStatus: true, createdAt: true } } }
    });
    const pendingOutgoing = await prismaAny.friendRequest.findMany({
        where: { fromId: userId, status: "PENDING" },
        include: { to: { select: { id: true, username: true, nickname: true, avatarUrl: true, bannerColor: true, bannerImageUrl: true, accentColor: true, status: true, aboutMe: true, customStatus: true, createdAt: true } } }
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
const getUnreadCounts = async (req, res) => {
    const userId = req.user.id;
    const { channels = {}, dms = {} } = req.body;
    // Return both total unread counts and mention counts
    const channelUnread = {};
    const channelMentions = {};
    const dmUnread = {};
    const dmMentions = {};
    // Fetch current user's username and presence for mention counting.
    const currentUser = await prisma_1.prisma.user.findUnique({ where: { id: userId }, select: { username: true, status: true } });
    const currentUsername = currentUser?.username?.toLowerCase() ?? "";
    const escapedUsername = currentUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const mentionRegex = new RegExp(`@${escapedUsername}(?![a-z0-9_])`, 'gi');
    const everyoneRegex = /@everyone/g;
    const hereRegex = /@here/g;
    const channelIds = Object.keys(channels);
    if (channelIds.length > 0) {
        // Verify user membership for all requested channels at once
        const accessible = await prisma_1.prisma.channel.findMany({
            where: { id: { in: channelIds }, server: { members: { some: { userId } } } },
            select: { id: true }
        });
        const accessibleIds = new Set(accessible.map((c) => c.id));
        // Batch-fetch lastSeen message timestamps
        const lastSeenIds = channelIds.filter(id => accessibleIds.has(id) && channels[id]).map(id => channels[id]);
        const lastSeenMessages = lastSeenIds.length > 0
            ? await prisma_1.prisma.message.findMany({ where: { id: { in: lastSeenIds } }, select: { id: true, createdAt: true } })
            : [];
        const createdAtById = new Map(lastSeenMessages.map((m) => [m.id, m.createdAt]));
        for (const channelId of accessibleIds) {
            const lastSeenId = channels[channelId];
            if (!lastSeenId) {
                channelUnread[channelId] = 0;
                channelMentions[channelId] = 0;
                continue;
            }
            const lastSeenAt = createdAtById.get(lastSeenId);
            if (!lastSeenAt) {
                channelUnread[channelId] = 0;
                channelMentions[channelId] = 0;
                continue;
            }
            // Fetch all unread messages
            const messages = await prisma_1.prisma.message.findMany({
                where: { channelId, createdAt: { gt: lastSeenAt } },
                select: { content: true, authorId: true }
            });
            let totalUnread = 0;
            let mentionCount = 0;
            for (const msg of messages) {
                // Count total unread (excluding own messages)
                if (msg.authorId !== userId) {
                    totalUnread++;
                    // Count mentions in other users' messages
                    const content = msg.content ?? "";
                    const usernameMentions = (content.match(mentionRegex) || []).length;
                    const everyoneMentions = (content.match(everyoneRegex) || []).length;
                    const hereMentions = isHereMentionEligibleStatus(currentUser?.status)
                        ? (content.match(hereRegex) || []).length
                        : 0;
                    mentionCount += usernameMentions + everyoneMentions + hereMentions;
                }
            }
            channelUnread[channelId] = totalUnread;
            channelMentions[channelId] = mentionCount;
        }
    }
    const dmIds = Object.keys(dms);
    if (dmIds.length > 0) {
        const accessibleDMs = await prismaAny.dMChannel.findMany({
            where: { id: { in: dmIds }, participants: { some: { id: userId } } },
            select: { id: true }
        });
        const accessibleDMIds = new Set(accessibleDMs.map(d => d.id));
        const dmLastSeenIds = dmIds.filter(id => accessibleDMIds.has(id) && dms[id]).map(id => dms[id]);
        const dmLastSeenMessages = dmLastSeenIds.length > 0
            ? await prismaAny.dMMessage.findMany({ where: { id: { in: dmLastSeenIds } }, select: { id: true, createdAt: true } })
            : [];
        const dmCreatedAtById = new Map(dmLastSeenMessages.map(m => [m.id, m.createdAt]));
        for (const dmId of accessibleDMIds) {
            const lastSeenId = dms[dmId];
            if (!lastSeenId) {
                dmUnread[dmId] = 0;
                dmMentions[dmId] = 0;
                continue;
            }
            const lastSeenAt = dmCreatedAtById.get(lastSeenId);
            if (!lastSeenAt) {
                dmUnread[dmId] = 0;
                dmMentions[dmId] = 0;
                continue;
            }
            // Fetch all unread DM messages
            const messages = await prismaAny.dMMessage.findMany({
                where: { dmChannelId: dmId, createdAt: { gt: lastSeenAt } },
                select: { content: true, authorId: true }
            });
            let totalUnread = 0;
            let mentionCount = 0;
            for (const msg of messages) {
                if (msg.authorId !== userId) {
                    totalUnread++;
                    const content = msg.content ?? "";
                    const usernameMentions = (content.match(mentionRegex) || []).length;
                    mentionCount += usernameMentions;
                }
            }
            dmUnread[dmId] = totalUnread;
            dmMentions[dmId] = mentionCount;
        }
    }
    res.json({
        channels: channelUnread,
        dms: dmUnread,
        channelMentions,
        dmMentions
    });
};
exports.getUnreadCounts = getUnreadCounts;
const deleteSelf = async (req, res) => {
    const userId = req.user.id;
    const user = await prismaAny.user.findUnique({ where: { id: userId }, select: { id: true, username: true, avatarUrl: true, isDeleted: true } });
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
    await (0, adminAudit_1.logAdminEvent)({
        type: "USER_DELETED_SELF",
        summary: `User deleted account: ${user.username}`,
        actorUserId: user.id,
        actorUsername: user.username,
        targetUserId: user.id
    });
    res.clearCookie("token");
    res.json({ deleted: true });
};
exports.deleteSelf = deleteSelf;
