"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadServerAssets = exports.uploadUserProfile = exports.uploadBannerImage = exports.uploadAttachment = exports.uploadServerIcon = exports.uploadAvatar = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const multer_1 = __importDefault(require("multer"));
const uuid_1 = require("uuid");
const uploadDir = node_path_1.default.resolve(process.cwd(), "uploads");
const ensureDir = (dirPath) => {
    if (!node_fs_1.default.existsSync(dirPath)) {
        node_fs_1.default.mkdirSync(dirPath, { recursive: true });
    }
};
const buildUpload = (subdir) => {
    const destinationDir = node_path_1.default.join(uploadDir, subdir);
    ensureDir(destinationDir);
    const storage = multer_1.default.diskStorage({
        destination: (_req, _file, cb) => cb(null, destinationDir),
        filename: (_req, file, cb) => {
            const ext = node_path_1.default.extname(file.originalname);
            cb(null, `${(0, uuid_1.v4)()}${ext}`);
        }
    });
    return (0, multer_1.default)({
        storage,
        limits: { fileSize: 50 * 1024 * 1024 }
    });
};
exports.uploadAvatar = buildUpload("avatars");
exports.uploadServerIcon = buildUpload("server-icons");
exports.uploadAttachment = buildUpload("attachments");
exports.uploadBannerImage = buildUpload("banners");
// Combined handler for PATCH /users/me — handles both avatar and bannerImage fields
const bannersDir = node_path_1.default.join(uploadDir, "banners");
const avatarsDir = node_path_1.default.join(uploadDir, "avatars");
const serverIconsDir = node_path_1.default.join(uploadDir, "server-icons");
ensureDir(bannersDir);
ensureDir(avatarsDir);
ensureDir(serverIconsDir);
const userProfileStorage = multer_1.default.diskStorage({
    destination: (_req, file, cb) => {
        cb(null, file.fieldname === "bannerImage" ? bannersDir : avatarsDir);
    },
    filename: (_req, file, cb) => {
        const ext = node_path_1.default.extname(file.originalname);
        cb(null, `${(0, uuid_1.v4)()}${ext}`);
    }
});
exports.uploadUserProfile = (0, multer_1.default)({
    storage: userProfileStorage,
    limits: { fileSize: 50 * 1024 * 1024 }
}).fields([{ name: "avatar", maxCount: 1 }, { name: "bannerImage", maxCount: 1 }]);
const serverAssetStorage = multer_1.default.diskStorage({
    destination: (_req, file, cb) => {
        cb(null, file.fieldname === "bannerImage" ? bannersDir : serverIconsDir);
    },
    filename: (_req, file, cb) => {
        const ext = node_path_1.default.extname(file.originalname);
        cb(null, `${(0, uuid_1.v4)()}${ext}`);
    }
});
exports.uploadServerAssets = (0, multer_1.default)({
    storage: serverAssetStorage,
    limits: { fileSize: 50 * 1024 * 1024 }
}).fields([{ name: "icon", maxCount: 1 }, { name: "bannerImage", maxCount: 1 }]);
