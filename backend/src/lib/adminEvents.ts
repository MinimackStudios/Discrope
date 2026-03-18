import { EventEmitter } from "node:events";

type AdminEventPayload = {
  id: string;
  type: string;
  summary: string;
  actorUserId?: string | null;
  actorUsername?: string | null;
  targetUserId?: string | null;
  targetServerId?: string | null;
  createdAt: Date | string;
};

const adminEvents = new EventEmitter();
adminEvents.setMaxListeners(100);

export const adminEventsBus = {
  emit(event: AdminEventPayload): void {
    adminEvents.emit("event", event);
  },
  subscribe(listener: (event: AdminEventPayload) => void): () => void {
    adminEvents.on("event", listener);
    return () => adminEvents.off("event", listener);
  }
};
