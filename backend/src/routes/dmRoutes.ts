import { Router } from "express";
import { createDMMessage, createOrGetDM, deleteDMMessage, editDMMessage, listDMMessages, listDMs } from "../controllers/dmController";
import { toggleDMReaction } from "../controllers/dmController";
import { authMiddleware } from "../middleware/auth";
import { uploadAttachment } from "../middleware/upload";
import { body } from "express-validator";
import { validateRequest } from "../middleware/validate";

const router = Router();

router.use(authMiddleware);

router.get("/", listDMs);
router.post("/", createOrGetDM);
router.get("/:dmChannelId/messages", listDMMessages);
router.post(
	"/:dmChannelId/messages",
	uploadAttachment.single("attachment"),
	body("content").optional().isLength({ min: 0, max: 4000 }),
	validateRequest,
	createDMMessage
);
router.patch("/:dmChannelId/messages/:messageId", body("content").isLength({ min: 1, max: 4000 }), validateRequest, editDMMessage);
router.post("/:dmChannelId/messages/:messageId/reactions", body("emoji").isLength({ min: 1, max: 64 }), validateRequest, toggleDMReaction);
router.delete("/:dmChannelId/messages/:messageId", deleteDMMessage);

export default router;
