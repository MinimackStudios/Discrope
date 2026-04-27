import type { DMChannel, User } from "../types";
import { resolveUserAvatarUrl } from "../lib/media";
import StatusDot from "./StatusDot";
import { X } from "lucide-react";

const formatPresenceLabel = (status: User["status"] | undefined): string => {
  switch (status) {
    case "ONLINE":
      return "Online";
    case "IDLE":
      return "Idle";
    case "DND":
      return "Do Not Disturb";
    case "INVISIBLE":
      return "Invisible";
    case "OFFLINE":
    default:
      return "Offline";
  }
};

type Props = {
  dms: DMChannel[];
  me: User | null;
  activeDMId: string | null;
  onOpenDM: (id: string) => void;
  onRemoveDM: (id: string) => void;
  unreadDMs: Record<string, number>;
  fullHeight?: boolean;
};

const DMList = ({ dms, me, activeDMId, onOpenDM, onRemoveDM, unreadDMs, fullHeight = false }: Props): JSX.Element => {
  return (
    <section className={`${fullHeight ? "flex min-h-0 flex-1 flex-col bg-transparent" : "border-t border-black/20 p-2"}`}>
      <div className={`${fullHeight ? "wc-sidebar-header p-2" : ""}`}>
        <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-discord-muted">Direct Messages</p>
      </div>
      <div className={`${fullHeight ? "discord-scrollbar min-h-0 flex-1 overflow-y-auto bg-transparent p-2.5" : "mt-2"}`}>
        <div className="space-y-1">
          {dms.map((dm) => {
            const other = dm.participants.find((p) => p.id !== me?.id) ?? null;
            const display = dm.participants
              .filter((p) => p.id !== me?.id)
              .map((p) => p.nickname?.trim() || p.username)
              .join(", ");
            const statusText = other?.customStatus?.trim() || formatPresenceLabel(other?.status);
            const unread = unreadDMs[dm.id] ?? 0;
            return (
              <button
                key={dm.id}
                onClick={() => onOpenDM(dm.id)}
                className={`flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-sm transition ${
                  activeDMId === dm.id
                    ? "border-white/[0.06] text-white"
                    : "border-transparent text-discord-muted hover:border-white/[0.03] hover:bg-white/[0.04] hover:text-discord-text"
                }`} style={activeDMId === dm.id ? { background: "var(--wc-dm-active-bg)" } : undefined}
              >
                <div className="relative h-8 w-8 shrink-0">
                  <img
                    src={resolveUserAvatarUrl(other)}
                    alt={display || "DM"}
                    className="h-8 w-8 rounded-full object-cover"
                  />
                  {other ? (
                    <span className="absolute -bottom-1 -right-0.5">
                      <StatusDot status={other.status} sizeClassName="h-2.5 w-2.5" cutoutColor="var(--wc-sidebar-bottom)" ringColor="var(--wc-sidebar-bottom)" ringWidth={2} />
                    </span>
                  ) : null}
                </div>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate">{display || "Unnamed DM"}</span>
                  <span className="block truncate text-xs text-discord-muted">{statusText}</span>
                </span>
                {unread > 0 ? (
                  <span className="shrink-0 rounded-full bg-[#ed4245] px-1.5 text-[10px] font-semibold text-white">
                    {unread}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveDM(dm.id);
                  }}
                  className="shrink-0 rounded-lg p-1 text-discord-muted transition hover:bg-white/6 hover:text-white"
                  title="Remove from list"
                  aria-label="Remove from list"
                >
                  <X size={14} />
                </button>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default DMList;
