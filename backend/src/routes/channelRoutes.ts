import { Router } from "express";
import { body } from "express-validator";
import {
  deleteCategory,
  deleteChannel,
  createCategory,
  createChannel,
  createMessage,
  deleteMessage,
  editMessage,
  listMessages,
  pinnedMessages,
  togglePin,
  toggleReaction,
  updateChannel
} from "../controllers/channelController";
import { authMiddleware } from "../middleware/auth";
import { uploadAttachment } from "../middleware/upload";
import { validateRequest } from "../middleware/validate";

const router = Router();

router.use(authMiddleware);

router.post("/servers/:serverId/categories", body("name").isLength({ min: 1, max: 64 }), validateRequest, createCategory);
router.delete("/categories/:categoryId", deleteCategory);
router.post(
  "/servers/:serverId/channels",
  body("name").isLength({ min: 1, max: 64 }),
  body("type").isIn(["TEXT", "VOICE"]),
  validateRequest,
  createChannel
);
router.delete("/channels/:channelId", deleteChannel);
router.patch("/channels/:channelId", updateChannel);

router.get("/channels/:channelId/messages", listMessages);
router.get("/channels/:channelId/pinned", pinnedMessages);
router.post(
  "/channels/:channelId/messages",
  uploadAttachment.single("attachment"),
  body("content").optional().isLength({ min: 0, max: 4000 }),
  validateRequest,
  createMessage
);
router.patch("/messages/:messageId", body("content").isLength({ min: 1, max: 4000 }), validateRequest, editMessage);
router.delete("/messages/:messageId", deleteMessage);
router.post("/messages/:messageId/reactions", body("emoji").isLength({ min: 1, max: 16 }), validateRequest, toggleReaction);
router.post("/messages/:messageId/pin", togglePin);

export default router;
