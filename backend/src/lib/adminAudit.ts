import { prisma } from "./prisma";
import { adminEventsBus } from "./adminEvents";

const prismaAny = prisma as any;

type AdminAuditInput = {
  type: string;
  summary: string;
  actorUserId?: string | null;
  actorUsername?: string | null;
  targetUserId?: string | null;
  targetServerId?: string | null;
  persist?: boolean;
};

export const logAdminEvent = async ({
  type,
  summary,
  actorUserId,
  actorUsername,
  targetUserId,
  targetServerId,
  persist = true
}: AdminAuditInput): Promise<void> => {
  if (!persist) {
    adminEventsBus.emit({
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
    adminEventsBus.emit(event);
  }
};
