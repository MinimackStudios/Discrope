import type { DMChannel, User } from "../types";
import StatusDot from "./StatusDot";
import { X } from "lucide-react";

const DEFAULT_AVATAR_URL = `${import.meta.env.BASE_URL}default-avatar.svg`;

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
    <section className={`${fullHeight ? "flex min-h-0 flex-1 flex-col bg-[#2b2d31]" : "border-t border-black/20 p-2"}`}>
      <div className={`${fullHeight ? "border-b border-black/20 bg-[#313338] p-2" : ""}`}>
        <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-discord-muted">Direct Messages</p>
      </div>
      <div className={`${fullHeight ? "discord-scrollbar min-h-0 flex-1 overflow-y-auto bg-[#2b2d31] p-2" : "mt-2"}`}>
        <div className="space-y-1">
          {dms.map((dm) => {
            const other = dm.participants.find((p) => p.id !== me?.id) ?? null;
            const display = dm.participants
              .filter((p) => p.id !== me?.id)
              .map((p) => p.nickname?.trim() || p.username)
              .join(", ");
            const unread = unreadDMs[dm.id] ?? 0;
            return (
              <button
                key={dm.id}
                onClick={() => onOpenDM(dm.id)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm ${
                  activeDMId === dm.id
                    ? "bg-[#404249] text-white"
                    : "text-discord-muted hover:bg-[#35373c] hover:text-discord-text"
                }`}
              >
                <div className="relative h-8 w-8 shrink-0">
                  <img
                    src={other?.avatarUrl || DEFAULT_AVATAR_URL}
                    alt={display || "DM"}
                    className="h-8 w-8 rounded-full object-cover"
                  />
                  {other ? (
                    <span className="absolute -bottom-1 -right-0.5">
                      <StatusDot status={other.status} sizeClassName="h-2.5 w-2.5" cutoutClassName="ring-2 ring-[#232428]" />
                    </span>
                  ) : null}
                </div>
                <span className="flex-1 truncate text-left">{display || "Unnamed DM"}</span>
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
                  className="shrink-0 rounded p-1 text-discord-muted hover:bg-[#3a3d45] hover:text-white"
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
