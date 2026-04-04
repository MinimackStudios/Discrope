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

const buildUpload = (subdir: "avatars" | "server-icons" | "attachments" | "banners"): multer.Multer => {
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
    limits: { fileSize: 50 * 1024 * 1024 }
  });
};

export const uploadAvatar = buildUpload("avatars");
export const uploadServerIcon = buildUpload("server-icons");
export const uploadAttachment = buildUpload("attachments");
export const uploadBannerImage = buildUpload("banners");

// Combined handler for PATCH /users/me — handles both avatar and bannerImage fields
const bannersDir = path.join(uploadDir, "banners");
const avatarsDir = path.join(uploadDir, "avatars");
ensureDir(bannersDir);
ensureDir(avatarsDir);

const userProfileStorage = multer.diskStorage({
  destination: (_req, file, cb) => {
    cb(null, file.fieldname === "bannerImage" ? bannersDir : avatarsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuid()}${ext}`);
  }
});

export const uploadUserProfile = multer({
  storage: userProfileStorage,
  limits: { fileSize: 50 * 1024 * 1024 }
}).fields([{ name: "avatar", maxCount: 1 }, { name: "bannerImage", maxCount: 1 }]);
