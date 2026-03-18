"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAdminEvent = void 0;
const prisma_1 = require("./prisma");
const adminEvents_1 = require("./adminEvents");
const prismaAny = prisma_1.prisma;
const logAdminEvent = async ({ type, summary, actorUserId, actorUsername, targetUserId, targetServerId, persist = true }) => {
    if (!persist) {
        adminEvents_1.adminEventsBus.emit({
            id: `live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type,
            summary,
            actorUserId: actorUserId ?? null,
            actorUsername: actorUsername ?? null,
            targetUserId: targetUserId ?? null,
            targetServerId: targetServerId ?? null,
            createdAt: new Date().toISOString()
        });
        return;
    }
    const event = await prismaAny.adminEvent.create({
        data: {
            type,
            summary,
            actorUserId: actorUserId ?? null,
            actorUsername: actorUsername ?? null,
            targetUserId: targetUserId ?? null,
            targetServerId: targetServerId ?? null
        }
    }).catch(() => undefined);
    if (event) {
        adminEvents_1.adminEventsBus.emit(event);
    }
};
exports.logAdminEvent = logAdminEvent;
