import "dotenv/config";
import path from "node:path";
import http from "node:http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/authRoutes";
import serverRoutes from "./routes/serverRoutes";
import channelRoutes from "./routes/channelRoutes";
import userRoutes from "./routes/userRoutes";
import dmRoutes from "./routes/dmRoutes";
import embedRoutes from "./routes/embedRoutes";
import { initSocket } from "./sockets";

const app = express();
const server = http.createServer(app);
const io = initSocket(server);

const normalizeOrigin = (value: string): string => {
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/$/, "");
  }
};

const allowedOrigins = (process.env.FRONTEND_ORIGIN ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean)
  .map(normalizeOrigin);

app.set("io", io);

app.use(
  cors({
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
  })
);
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "discrope-backend" });
});

app.use("/api/auth", authRoutes);
app.use("/api/servers", serverRoutes);
app.use("/api/chat", channelRoutes);
app.use("/api/users", userRoutes);
app.use("/api/dms", dmRoutes);
app.use("/api/embeds", embedRoutes);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ message: err.message || "Internal server error" });
});

const port = Number(process.env.PORT ?? 4000);
server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Discrope backend listening on http://localhost:${port}`);
});



