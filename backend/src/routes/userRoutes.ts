import { Router } from "express";
import { body } from "express-validator";
import {
  acceptFriendRequest,
  deleteSelf,
  dismissSystemNotice,
  findUsers,
  getUnreadCounts,
  listSystemNotices,
  listFriends,
  rejectFriendRequest,
  removeFriend,
  sendFriendRequest,
  updateSelf
} from "../controllers/userController";
import { authMiddleware } from "../middleware/auth";
import { uploadUserProfile } from "../middleware/upload";
import { validateRequest } from "../middleware/validate";

const router = Router();

router.use(authMiddleware);

router.get("/search", findUsers);
router.get("/friends", listFriends);
router.get("/me/notices", listSystemNotices);
router.post("/me/notices/:noticeId/dismiss", dismissSystemNotice);
router.post("/friends/request", body("username").trim().matches(/^[a-z0-9]{2,32}$/), validateRequest, sendFriendRequest);
router.post("/friends/accept/:requestId", acceptFriendRequest);
router.post("/friends/reject/:requestId", rejectFriendRequest);
router.delete("/friends/:friendId", removeFriend);
router.delete("/me", deleteSelf);
router.patch("/me", uploadUserProfile, updateSelf);
router.post("/me/unread-counts", getUnreadCounts);

export default router;
