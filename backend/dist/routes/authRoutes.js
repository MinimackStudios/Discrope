"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const authController_1 = require("../controllers/authController");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const router = (0, express_1.Router)();
router.post("/register", (0, express_validator_1.body)("username")
    .trim()
    .matches(/^[a-zA-Z0-9]{2,32}$/)
    .custom((value) => value.toLowerCase() !== "deleteduser"), (0, express_validator_1.body)("nickname").optional().trim().isLength({ min: 1, max: 32 }), (0, express_validator_1.body)("password").isLength({ min: 6, max: 128 }), validate_1.validateRequest, authController_1.register);
router.post("/login", (0, express_validator_1.body)("username").trim().matches(/^[a-zA-Z0-9]{2,32}$/), (0, express_validator_1.body)("password").isLength({ min: 6, max: 128 }), validate_1.validateRequest, authController_1.login);
router.get("/me", auth_1.authMiddleware, authController_1.me);
router.post("/logout", auth_1.authMiddleware, authController_1.logout);
exports.default = router;
