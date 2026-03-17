import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { v4 as uuid } from "uuid";

const uploadDir = path.resolve(process.cwd(), "uploads");
const ensureDir = (dirPath: string): void => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const buildUpload = (subdir: "avatars" | "server-icons" | "attachments"): multer.Multer => {
  const destinationDir = path.join(uploadDir, subdir);
  ensureDir(destinationDir);

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, destinationDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${uuid()}${ext}`);
    }
  });

  return multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }
  });
};

export const uploadAvatar = buildUpload("avatars");
export const uploadServerIcon = buildUpload("server-icons");
export const uploadAttachment = buildUpload("attachments");
