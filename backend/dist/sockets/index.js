"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocket = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const socket_io_1 = require("socket.io");
const prisma_1 = require("../lib/prisma");
const initSocket = (server) => {
    const io = new socket_io_1.Server(server, {
        cors: {
            origin: process.env.FRONTEND_ORIGIN,
            credentials: true
        }
    });
    const onlineUsers = new Map();
    const voiceRooms = new Map();
    const voiceState = new Map();
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
        onlineUsers.set(user.id, socket.id);
        io.emit("presence:update", { userId: user.id, status: "ONLINE" });
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
        socket.on("typing:start", (channelId) => {
            socket.to(`channel:${channelId}`).emit("typing:start", {
                channelId,
                userId: user.id,
                username: user.username,
                nickname: user.nickname
            });
        });
        socket.on("typing:stop", (channelId) => {
            socket.to(`channel:${channelId}`).emit("typing:stop", {
                channelId,
                userId: user.id,
                username: user.username,
                nickname: user.nickname
            });
        });
        socket.on("voice:join", ({ channelId }) => {
            socket.join(`voice:${channelId}`);
            const users = voiceRooms.get(channelId) ?? new Set();
            users.add(user.id);
            voiceRooms.set(channelId, users);
            io.to(`voice:${channelId}`).emit("voice:participants", {
                channelId,
                userIds: Array.from(users)
            });
        });
        socket.on("voice:leave", ({ channelId }) => {
            socket.leave(`voice:${channelId}`);
            const users = voiceRooms.get(channelId);
            if (!users) {
                return;
            }
            users.delete(user.id);
            io.to(`voice:${channelId}`).emit("voice:participants", {
                channelId,
                userIds: Array.from(users)
            });
        });
        socket.on("voice:signal", ({ channelId, targetUserId, signal }) => {
            const targetSocketId = onlineUsers.get(targetUserId);
            if (!targetSocketId) {
                return;
            }
            io.to(targetSocketId).emit("voice:signal", {
                channelId,
                fromUserId: user.id,
                signal
            });
        });
        socket.on("voice:state", ({ muted, deafened }) => {
            voiceState.set(user.id, { muted, deafened });
            io.emit("voice:state", { userId: user.id, muted, deafened });
        });
        socket.on("disconnect", () => {
            onlineUsers.delete(user.id);
            for (const [channelId, users] of voiceRooms.entries()) {
                if (users.delete(user.id)) {
                    io.to(`voice:${channelId}`).emit("voice:participants", {
                        channelId,
                        userIds: Array.from(users)
                    });
                }
            }
            io.emit("presence:update", { userId: user.id, status: "OFFLINE" });
        });
    });
    return io;
};
exports.initSocket = initSocket;
