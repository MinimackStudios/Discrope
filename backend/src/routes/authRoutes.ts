import { Router } from "express";
import { body } from "express-validator";
import { login, logout, me, register } from "../controllers/authController";
import { authMiddleware } from "../middleware/auth";
import { validateRequest } from "../middleware/validate";

const router = Router();

router.post(
  "/register",
  body("username")
    .trim()
    .matches(/^[a-zA-Z0-9]{2,32}$/)
    .custom((value) => value.toLowerCase() !== "deleteduser"),
  body("nickname").optional().trim().isLength({ min: 1, max: 32 }),
  body("password").isLength({ min: 6, max: 128 }),
  validateRequest,
  register
);

router.post(
  "/login",
  body("username").trim().matches(/^[a-zA-Z0-9]{2,32}$/),
  body("password").isLength({ min: 6, max: 128 }),
  validateRequest,
  login
);

router.get("/me", authMiddleware, me);
router.post("/logout", authMiddleware, logout);

export default router;
