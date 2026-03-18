"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocket = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const socket_io_1 = require("socket.io");
const prisma_1 = require("../lib/prisma");
const normalizeOrigin = (value) => {
    try {
        return new URL(value).origin;
    }
    catch {
        return value.replace(/\/$/, "");
    }
};
const initSocket = (server) => {
    const allowedOrigins = (process.env.FRONTEND_ORIGIN ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .map(normalizeOrigin);
    const io = new socket_io_1.Server(server, {
        cors: {
            origin: (origin, callback) => {
                if (!origin) {
                    callback(null, true);
                    return;
                }
                const requestOrigin = normalizeOrigin(origin);
                callback(null, allowedOrigins.includes(requestOrigin));
            },
            credentials: true
        }
    });
    const onlineUsers = new Map();
    const resolveTypingTarget = (payload) => {
        if (typeof payload === "string") {
            return payload ? { id: payload, room: `channel:${payload}` } : null;
        }
        const id = payload?.id?.trim();
        if (!id) {
            return null;
        }
        const scope = payload.scope === "DM" ? "DM" : "CHANNEL";
        return {
            id,
            room: scope === "DM" ? `dm:${id}` : `channel:${id}`
        };
    };
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token ?? "";
        if (!token) {
            next(new Error("Unauthorized"));
            return;
        }
        try {
            const payload = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
            prisma_1.prisma.user
                .findUnique({
                where: { id: payload.id },
                select: { id: true, username: true, nickname: true }
            })
                .then((user) => {
                if (!user) {
                    next(new Error("Unauthorized"));
                    return;
                }
                socket.data.user = {
                    id: user.id,
                    username: user.username,
                    nickname: user.nickname?.trim() || user.username
                };
                next();
            })
                .catch(() => next(new Error("Unauthorized")));
            return;
        }
        catch {
            next(new Error("Unauthorized"));
        }
    });
    io.on("connection", (socket) => {
        const user = socket.data.user;
        const userSockets = onlineUsers.get(user.id) ?? new Set();
        const wasOffline = userSockets.size === 0;
        userSockets.add(socket.id);
        onlineUsers.set(user.id, userSockets);
        socket.join(`user:${user.id}`);
        if (wasOffline) {
            io.emit("presence:update", { userId: user.id, status: "ONLINE" });
            void prisma_1.prisma.user.update({ where: { id: user.id }, data: { status: "ONLINE" } }).catch(() => undefined);
        }
        socket.emit("presence:sync", { onlineUserIds: Array.from(onlineUsers.keys()) });
        socket.on("channel:join", (channelId) => {
            socket.join(`channel:${channelId}`);
        });
        socket.on("channel:leave", (channelId) => {
            socket.leave(`channel:${channelId}`);
        });
        socket.on("dm:join", (dmChannelId) => {
            socket.join(`dm:${dmChannelId}`);
        });
        socket.on("dm:leave", (dmChannelId) => {
            socket.leave(`dm:${dmChannelId}`);
        });
        socket.on("typing:start", (payload) => {
            const target = resolveTypingTarget(payload);
            if (!target) {
                return;
            }
            socket.to(target.room).emit("typing:start", {
                channelId: target.id,
                userId: user.id,
                username: user.username,
                nickname: user.nickname
            });
        });
        socket.on("typing:stop", (payload) => {
            const target = resolveTypingTarget(payload);
            if (!target) {
                return;
            }
            socket.to(target.room).emit("typing:stop", {
                channelId: target.id,
                userId: user.id,
                username: user.username,
                nickname: user.nickname
            });
        });
        socket.on("disconnect", () => {
            const userSocketsOnDisconnect = onlineUsers.get(user.id);
            if (userSocketsOnDisconnect) {
                userSocketsOnDisconnect.delete(socket.id);
                if (userSocketsOnDisconnect.size === 0) {
                    onlineUsers.delete(user.id);
                    io.emit("presence:update", { userId: user.id, status: "OFFLINE" });
                    void prisma_1.prisma.user.update({ where: { id: user.id }, data: { status: "OFFLINE" } }).catch(() => undefined);
                }
            }
        });
    });
    return io;
};
exports.initSocket = initSocket;
