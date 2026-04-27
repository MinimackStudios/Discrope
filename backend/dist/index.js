"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const node_path_1 = __importDefault(require("node:path"));
const node_http_1 = __importDefault(require("node:http"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const adminRoutes_1 = __importDefault(require("./routes/adminRoutes"));
const serverRoutes_1 = __importDefault(require("./routes/serverRoutes"));
const channelRoutes_1 = __importDefault(require("./routes/channelRoutes"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const dmRoutes_1 = __importDefault(require("./routes/dmRoutes"));
const embedRoutes_1 = __importDefault(require("./routes/embedRoutes"));
const sockets_1 = require("./sockets");
const app = (0, express_1.default)();
const server = node_http_1.default.createServer(app);
const io = (0, sockets_1.initSocket)(server);
const normalizeOrigin = (value) => {
    try {
        return new URL(value).origin;
    }
    catch {
        return value.replace(/\/$/, "");
    }
};
const allowedOrigins = `${process.env.FRONTEND_ORIGIN ?? ""},${process.env.ADMIN_TOOL_ORIGIN ?? ""}`
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map(normalizeOrigin);
app.set("io", io);
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin) {
            callback(null, true);
            return;
        }
        const requestOrigin = normalizeOrigin(origin);
        if (allowedOrigins.includes(requestOrigin)) {
            callback(null, true);
            return;
        }
        callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    credentials: true
}));
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(express_1.default.json({ limit: "2mb" }));
app.use((0, cookie_parser_1.default)());
app.get("/uploads/attachments/:fileName", (req, res, next) => {
    const requestedName = typeof req.query.name === "string" && req.query.name.trim().length > 0
        ? req.query.name
        : req.params.fileName;
    const safeName = node_path_1.default.basename(requestedName).replace(/[\r\n"]/g, "_");
    const dispositionType = req.query.download === "1" ? "attachment" : "inline";
    const encodedName = encodeURIComponent(safeName);
    res.setHeader("Content-Disposition", `${dispositionType}; filename="${safeName}"; filename*=UTF-8''${encodedName}`);
    next();
});
app.use("/uploads", express_1.default.static(node_path_1.default.resolve(process.cwd(), "uploads"), { maxAge: "7d" }));
app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "windcord-backend" });
});
app.use("/api/auth", authRoutes_1.default);
app.use("/api/admin", adminRoutes_1.default);
app.use("/api/servers", serverRoutes_1.default);
app.use("/api/chat", channelRoutes_1.default);
app.use("/api/users", userRoutes_1.default);
app.use("/api/dms", dmRoutes_1.default);
app.use("/api/embeds", embedRoutes_1.default);
app.use((err, _req, res, _next) => {
    res.status(500).json({ message: err.message || "Internal server error" });
});
const port = Number(process.env.PORT ?? 4000);
server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Windcord backend listening on http://localhost:${port}`);
});
