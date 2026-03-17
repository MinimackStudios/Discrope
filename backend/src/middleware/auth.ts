import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

interface TokenPayload {
  id: string;
  username: string;
}

export const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const bearer = req.headers.authorization?.replace("Bearer ", "");
  const token = req.cookies?.token ?? bearer;

  if (!token) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as TokenPayload;
    req.user = { id: payload.id, username: payload.username, status: "ONLINE" };
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};
