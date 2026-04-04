import type { Request, Response } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { logAdminEvent } from "../lib/adminAudit";

const prismaAny = prisma as any;
const USERNAME_REGEX = /^[a-z0-9]{2,32}$/;
const RESERVED_USERNAME = "deleteduser";
const PASSWORD_MIN_LENGTH = 8;
const RECOVERY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const signToken = (id: string, username: string): string => {
  return jwt.sign({ id, username }, process.env.JWT_SECRET as string, {
    expiresIn: (process.env.JWT_EXPIRES_IN ?? "7d") as jwt.SignOptions["expiresIn"]
  });
};

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 7 * 24 * 60 * 60 * 1000
};

const generateRecoveryCode = (): string => {
  const raw = Array.from({ length: 16 }, () => {
    const index = crypto.randomInt(0, RECOVERY_CODE_ALPHABET.length);
    return RECOVERY_CODE_ALPHABET[index];
  }).join("");

  return raw.match(/.{1,4}/g)?.join("-") ?? raw;
};

const normalizeRecoveryCode = (value: string): string => value.replace(/[^a-z0-9]/gi, "").toUpperCase();

const issueRecoveryCode = async (userId: string): Promise<string> => {
  const recoveryCode = generateRecoveryCode();
  const recoveryCodeHash = await bcrypt.hash(normalizeRecoveryCode(recoveryCode), 10);

  await prismaAny.user.update({
    where: { id: userId },
    data: { recoveryCodeHash }
  });

  return recoveryCode;
};

export const register = async (req: Request, res: Response): Promise<void> => {
  const { username, nickname, password } = req.body as { username: string; nickname?: string; password: string };
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
  if (password.length < PASSWORD_MIN_LENGTH) {
    res.status(400).json({ message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long` });
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
    select: { id: true, username: true, nickname: true, isDeleted: true, avatarUrl: true, bannerImageUrl: true, status: true, aboutMe: true, customStatus: true, bannerColor: true, accentColor: true, createdAt: true }
  });
  const recoveryCode = await issueRecoveryCode(user.id);

  const token = signToken(user.id, user.username);
  res.cookie("token", token, cookieOptions);
  await logAdminEvent({
    type: "USER_REGISTERED",
    summary: `New user registered: ${user.username}`,
    actorUserId: user.id,
    actorUsername: user.username,
    targetUserId: user.id
  });
  res.status(201).json({ user, token, recoveryCode });
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body as { username: string; password: string };
  const normalizedUsername = username.trim();

  const user = await prismaAny.user.findUnique({ where: { username: normalizedUsername } });
  if (!user || user.isDeleted) {
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
      bannerImageUrl: user.bannerImageUrl,
      status: user.status,
      aboutMe: user.aboutMe,
      customStatus: user.customStatus,
      bannerColor: user.bannerColor,
      accentColor: user.accentColor,
      createdAt: user.createdAt
    }
  });
};

export const resetPasswordWithRecoveryCode = async (req: Request, res: Response): Promise<void> => {
  const { username, recoveryCode, newPassword } = req.body as {
    username: string;
    recoveryCode: string;
    newPassword: string;
  };

  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    res.status(400).json({ message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long` });
    return;
  }

  const normalizedUsername = username.trim();
  const normalizedRecoveryCode = normalizeRecoveryCode(recoveryCode);
  const user = await prismaAny.user.findUnique({ where: { username: normalizedUsername } });

  if (!user || user.isDeleted || !user.recoveryCodeHash) {
    res.status(401).json({ message: "Invalid username or recovery key" });
    return;
  }

  const validRecoveryCode = await bcrypt.compare(normalizedRecoveryCode, user.recoveryCodeHash);
  if (!validRecoveryCode) {
    res.status(401).json({ message: "Invalid username or recovery key" });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const nextRecoveryCode = await generateRecoveryCode();
  const nextRecoveryCodeHash = await bcrypt.hash(normalizeRecoveryCode(nextRecoveryCode), 10);

  await prismaAny.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      recoveryCodeHash: nextRecoveryCodeHash
    }
  });

  res.json({ message: "Password reset successful", recoveryCode: nextRecoveryCode });
};

export const regenerateRecoveryCode = async (req: Request, res: Response): Promise<void> => {
  const recoveryCode = await issueRecoveryCode(req.user!.id);
  res.json({ recoveryCode });
};

export const me = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const user = await prismaAny.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, nickname: true, isDeleted: true, avatarUrl: true, bannerImageUrl: true, status: true, aboutMe: true, customStatus: true, bannerColor: true, accentColor: true, createdAt: true }
  });

  if (!user) {
    res.status(404).json({ message: "User not found" });
    return;
  }

  res.json({ user });
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (userId) {
    await prismaAny.user.update({ where: { id: userId }, data: { status: "OFFLINE" } }).catch(() => undefined);
    const io = req.app.get("io");
    io?.emit("presence:update", { userId, status: "OFFLINE" });
  }

  res.clearCookie("token");
  res.json({ ok: true });
};
