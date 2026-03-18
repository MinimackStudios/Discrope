"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminAuthMiddleware = void 0;
const adminAuthMiddleware = (req, res, next) => {
    const configuredSecret = process.env.ADMIN_SECRET?.trim();
    if (!configuredSecret) {
        res.status(503).json({ message: "Admin secret is not configured" });
        return;
    }
    const querySecret = typeof req.query.secret === "string" ? req.query.secret : undefined;
    const providedSecret = typeof req.headers["x-admin-secret"] === "string"
        ? req.headers["x-admin-secret"]
        : querySecret;
    if (typeof providedSecret !== "string" || providedSecret !== configuredSecret) {
        res.status(401).json({ message: "Invalid admin secret" });
        return;
    }
    next();
};
exports.adminAuthMiddleware = adminAuthMiddleware;
