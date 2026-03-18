import type { UserStatus } from "../types";

const STATUS_LABELS: Record<UserStatus, string> = {
  ONLINE: "Online",
  OFFLINE: "Offline",
  IDLE: "Idle",
  DND: "Do Not Disturb",
  INVISIBLE: "Invisible"
};

export const formatStatusLabel = (status: UserStatus): string => STATUS_LABELS[status];