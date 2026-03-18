"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRateLimit = void 0;
const buckets = new Map();
const getClientIp = (req) => {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim()) {
        return forwarded.split(",")[0]?.trim() || req.ip || "unknown";
    }
    return req.ip || "unknown";
};
const pruneBuckets = (now) => {
    for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) {
            buckets.delete(key);
        }
    }
};
const createRateLimit = ({ keyPrefix, windowMs, max, message }) => {
    return (req, res, next) => {
        const now = Date.now();
        if (buckets.size > 5000) {
            pruneBuckets(now);
        }
        const key = `${keyPrefix}:${getClientIp(req)}`;
        const existing = buckets.get(key);
        if (!existing || existing.resetAt <= now) {
            buckets.set(key, { count: 1, resetAt: now + windowMs });
            next();
            return;
        }
        if (existing.count >= max) {
            res.status(429).json({ message });
            return;
        }
        existing.count += 1;
        buckets.set(key, existing);
        next();
    };
};
exports.createRateLimit = createRateLimit;
