import { MessageCircle } from "lucide-react";
import type { DMChannel, User } from "../types";
import StatusDot from "./StatusDot";

type Props = {
  dms: DMChannel[];
  me: User | null;
  activeDMId: string | null;
  onOpenDM: (id: string) => void;
  unreadDMs: Record<string, number>;
};

const DMList = ({ dms, me, activeDMId, onOpenDM, unreadDMs }: Props): JSX.Element => {
  return (
    <section className="border-t border-black/20 p-2">
      <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-discord-muted">Direct Messages</p>
      <div className="mt-2 space-y-1">
        {dms.slice(0, 5).map((dm) => {
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
              <MessageCircle size={14} className="shrink-0" />
              <span className="flex-1 truncate text-left">{display || "Unnamed DM"}</span>
              {other ? <StatusDot status={other.status} /> : null}
              {unread > 0 ? (
                <span className="shrink-0 rounded-full bg-[#ed4245] px-1.5 text-[10px] font-semibold text-white">
                  {unread}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default DMList;
