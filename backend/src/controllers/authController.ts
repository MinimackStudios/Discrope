import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";

const prismaAny = prisma as any;
const USERNAME_REGEX = /^[a-zA-Z0-9]{2,32}$/;
const RESERVED_USERNAME = "deleteduser";

const signToken = (id: string, username: string): string => {
  return jwt.sign({ id, username }, process.env.JWT_SECRET as string, {
    expiresIn: (process.env.JWT_EXPIRES_IN ?? "7d") as jwt.SignOptions["expiresIn"]
  });
};

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: false,
  maxAge: 7 * 24 * 60 * 60 * 1000
};

export const register = async (req: Request, res: Response): Promise<void> => {
  const { username, nickname, password } = req.body as { username: string; nickname?: string; password: string };
  const normalizedUsername = username.trim();
  const normalizedNickname = (nickname ?? "").trim();

  if (!USERNAME_REGEX.test(normalizedUsername)) {
    res.status(400).json({ message: "Username must be 2-32 letters and numbers only" });
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

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prismaAny.user.create({
    data: { username: normalizedUsername, nickname: normalizedNickname || normalizedUsername, passwordHash },
    select: { id: true, username: true, nickname: true, isDeleted: true, avatarUrl: true, status: true, aboutMe: true, customStatus: true, createdAt: true }
  });

  const token = signToken(user.id, user.username);
  res.cookie("token", token, cookieOptions);
  res.status(201).json({ user, token });
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body as { username: string; password: string };
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

  const valid = await bcrypt.compare(password, user.passwordHash);
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

export const me = async (req: Request, res: Response): Promise<void> => {
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

export const logout = async (_req: Request, res: Response): Promise<void> => {
  res.clearCookie("token");
  res.json({ ok: true });
};
