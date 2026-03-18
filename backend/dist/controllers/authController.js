"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logout = exports.me = exports.login = exports.register = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = require("../lib/prisma");
const prismaAny = prisma_1.prisma;
const USERNAME_REGEX = /^[a-z0-9]{2,32}$/;
const RESERVED_USERNAME = "deleteduser";
const signToken = (id, username) => {
    return jsonwebtoken_1.default.sign({ id, username }, process.env.JWT_SECRET, {
        expiresIn: (process.env.JWT_EXPIRES_IN ?? "7d")
    });
};
const cookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 7 * 24 * 60 * 60 * 1000
};
const register = async (req, res) => {
    const { username, nickname, password } = req.body;
    const normalizedUsername = username.trim();
    const normalizedNickname = (nickname ?? "").trim();
    if (!USERNAME_REGEX.test(normalizedUsername)) {
        res.status(400).json({ message: "Username must be 2-32 lowercase letters and numbers only" });
        return;
    }
    if (normalizedUsername.toLowerCase() === RESERVED_USERNAME) {
        res.status(400).json({ message: "This username is reserved" });
        return;
    }
    const existing = await prismaAny.user.findUnique({ where: { username: normalizedUsername } });
    if (existing) {
        res.status(409).json({ message: "Username already taken" });
        return;
    }
    const passwordHash = await bcryptjs_1.default.hash(password, 10);
    const user = await prismaAny.user.create({
        data: { username: normalizedUsername, nickname: normalizedNickname || normalizedUsername, passwordHash },
        select: { id: true, username: true, nickname: true, isDeleted: true, avatarUrl: true, status: true, aboutMe: true, customStatus: true, createdAt: true }
    });
    const token = signToken(user.id, user.username);
    res.cookie("token", token, cookieOptions);
    res.status(201).json({ user, token });
};
exports.register = register;
const login = async (req, res) => {
    const { username, password } = req.body;
    const normalizedUsername = username.trim();
    const user = await prismaAny.user.findUnique({ where: { username: normalizedUsername } });
    if (!user) {
        res.status(401).json({ message: "Invalid username or password" });
        return;
    }
    if (user.isDeleted) {
        res.status(401).json({ message: "Invalid username or password" });
        return;
    }
    const valid = await bcryptjs_1.default.compare(password, user.passwordHash);
    if (!valid) {
        res.status(401).json({ message: "Invalid username or password" });
        return;
    }
    const token = signToken(user.id, user.username);
    res.cookie("token", token, cookieOptions);
    res.json({
        token,
        user: {
            id: user.id,
            username: user.username,
            nickname: user.nickname,
            isDeleted: user.isDeleted,
            avatarUrl: user.avatarUrl,
            status: user.status,
            aboutMe: user.aboutMe,
            customStatus: user.customStatus,
            createdAt: user.createdAt
        }
    });
};
exports.login = login;
const me = async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }
    const user = await prismaAny.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, nickname: true, isDeleted: true, avatarUrl: true, status: true, aboutMe: true, customStatus: true, createdAt: true }
    });
    if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
    }
    res.json({ user });
};
exports.me = me;
const logout = async (req, res) => {
    const userId = req.user?.id;
    if (userId) {
        await prismaAny.user.update({ where: { id: userId }, data: { status: "OFFLINE" } }).catch(() => undefined);
        const io = req.app.get("io");
        io?.emit("presence:update", { userId, status: "OFFLINE" });
    }
    res.clearCookie("token");
    res.json({ ok: true });
};
exports.logout = logout;
