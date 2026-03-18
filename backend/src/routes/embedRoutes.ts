import { Router } from "express";
import { query } from "express-validator";
import { previewEmbed } from "../controllers/embedController";
import { authMiddleware } from "../middleware/auth";
import { validateRequest } from "../middleware/validate";

const router = Router();

router.use(authMiddleware);

router.get("/", query("url").isURL({ protocols: ["http", "https"], require_protocol: true }), validateRequest, previewEmbed);

export default router;