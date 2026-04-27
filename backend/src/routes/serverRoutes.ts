import { Router } from "express";
import { body } from "express-validator";
import {
  banMember,
  createServer,
  deleteServer,
  getBans,
  getServer,
  getInviteInfo,
  joinByInvite,
  kickMember,
  leaveServer,
  listServers,
  regenerateInvite,
  searchServerMessages,
  unbanMember,
  updateMyMembership,
  updateMemberPermissions,
  updateServer
} from "../controllers/serverController";
import { authMiddleware } from "../middleware/auth";
import { uploadServerAssets, uploadServerIcon } from "../middleware/upload";
import { validateRequest } from "../middleware/validate";

const router = Router();

router.get("/invite/:inviteCode", getInviteInfo);

router.use(authMiddleware);
router.get("/", listServers);
router.get("/:serverId", getServer);
router.get("/:serverId/messages/search", searchServerMessages);
router.post("/invite/:inviteCode", joinByInvite);
router.delete("/:serverId/leave", leaveServer);
router.post("/:serverId/regenerate-invite", regenerateInvite);
router.post("/:serverId/members/:memberId/kick", kickMember);
router.post("/:serverId/members/:memberId/ban", banMember);
router.get("/:serverId/bans", getBans);
router.delete("/:serverId/bans/:memberId", unbanMember);
router.patch("/:serverId/members/me", updateMyMembership);
router.patch("/:serverId/members/:memberId/permissions", updateMemberPermissions);
router.delete("/:serverId", deleteServer);
router.post("/", uploadServerIcon.single("icon"), body("name").isLength({ min: 2, max: 64 }), validateRequest, createServer);
router.patch("/:serverId", uploadServerAssets, updateServer);

export default router;
