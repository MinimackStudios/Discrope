import { Router } from "express";
import { deleteServerAsAdmin, deleteUserAccountAsAdmin, getOverview, getServerDetail, streamAdminEvents } from "../controllers/adminController";
import { adminAuthMiddleware } from "../middleware/adminAuth";

const router = Router();

router.use(adminAuthMiddleware);
router.get("/overview", getOverview);
router.get("/servers/:serverId", getServerDetail);
router.get("/stream", streamAdminEvents);
router.delete("/users/:userId", deleteUserAccountAsAdmin);
router.delete("/servers/:serverId", deleteServerAsAdmin);

export default router;
