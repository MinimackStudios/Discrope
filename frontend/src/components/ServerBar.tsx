import { Plus, Compass, LogOut } from "lucide-react";
import { motion } from "framer-motion";
import type { DMChannel, Server, User } from "../types";
import StatusDot from "./StatusDot";

type Props = {
  servers: Server[];
  activeServerId: string | null;
  unreadServerIds: Set<string>;
  mentionServerIds: Set<string>;
  dms: DMChannel[];
  me: User | null;
  unreadDMs: Record<string, number>;
  onSelectDM: (dmId: string) => void;
  onSelect: (id: string) => void;
  onCreateServer: () => void;
  onJoinByInvite: () => void;
  onLogout: () => void;
};

const ServerBar = ({
  servers,
  activeServerId,
  unreadServerIds,
  mentionServerIds,
  dms,
  me,
  unreadDMs,
  onSelectDM,
  onSelect,
  onCreateServer,
  onJoinByInvite,
  onLogout
}: Props): JSX.Element => {
  const dmNotifs = dms.filter((dm) => (unreadDMs[dm.id] ?? 0) > 0);

  return (
    <aside className="flex h-full w-[72px] flex-col items-center gap-2 bg-discord-dark0 py-3">
      <button
        className="grid h-12 w-12 place-items-center rounded-2xl bg-discord-blurple text-white transition hover:rounded-xl"
        title="Home"
      >
        A
      </button>

      {dmNotifs.length > 0 ? (
        <div className="flex w-full flex-col items-center gap-1 px-2">
          {dmNotifs.map((dm) => {
            const other = dm.participants.find((p) => p.id !== me?.id);
            const otherName = other?.nickname?.trim() || other?.username || "someone";
            return (
              <button
                key={dm.id}
                className="relative h-8 w-8 overflow-hidden rounded-full transition hover:rounded-xl"
                title={`New message from ${otherName}`}
                onClick={() => onSelectDM(dm.id)}
              >
                <img src={other?.avatarUrl || "/default-avatar.svg"} alt={otherName} className="h-full w-full object-cover" />
                {other ? (
                  <span className="absolute -bottom-0.5 -right-0.5">
                    <StatusDot status={other.status} sizeClassName="h-2.5 w-2.5" cutoutClassName="ring-2 ring-discord-dark0" />
                  </span>
                ) : null}
                <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-discord-dark0 bg-[#ed4245]" />
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="h-px w-8 bg-[#3f4248]" />

      <div className="discord-scrollbar flex w-full flex-1 flex-col items-center gap-2 overflow-y-auto">
        {servers.map((server) => {
          const active = server.id === activeServerId;
          const hasUnread = unreadServerIds.has(server.id);
          const hasMention = mentionServerIds.has(server.id);
          return (
            <div key={server.id} className="relative mt-1 flex w-full justify-center">
              {hasUnread ? (
                <span className={`absolute left-0 top-1/2 z-10 -translate-y-1/2 bg-white ${hasMention || active ? "h-4 w-1 rounded-r" : "h-2.5 w-2.5 rounded-full"}`} />
              ) : null}
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onSelect(server.id)}
                title={server.name}
                className={`relative flex h-12 w-12 items-center justify-center rounded-3xl bg-[#2f3136] text-sm font-semibold text-white transition ${
                  active ? "rounded-2xl shadow-glow" : "hover:rounded-2xl"
                }`}
              >
                {hasMention ? (
                  <span className="absolute -right-1 -top-1 rounded-full bg-[#ed4245] px-1.5 text-[10px] font-semibold text-white">1</span>
                ) : null}
                {server.iconUrl ? (
                  <div className="h-12 w-12">
                    <img src={server.iconUrl} alt={server.name} className="h-full w-full object-contain" />
                  </div>
                ) : (
                  <span>{server.name.slice(0, 2).toUpperCase()}</span>
                )}
              </motion.button>
            </div>
          );
        })}
      </div>

      <button
        className="grid h-12 w-12 place-items-center rounded-3xl bg-[#2f3136] text-[#23a55a] transition hover:rounded-2xl"
        title="Add a Server"
        onClick={onCreateServer}
      >
        <Plus size={20} />
      </button>
      <button
        className="grid h-12 w-12 place-items-center rounded-3xl bg-[#2f3136] text-discord-muted transition hover:rounded-2xl hover:text-white"
        title="Join a Server"
        onClick={onJoinByInvite}
      >
        <Compass size={20} />
      </button>
      <button
        className="grid h-12 w-12 place-items-center rounded-3xl bg-[#2f3136] text-discord-muted transition hover:rounded-2xl hover:text-red-300"
        title="Logout"
        onClick={onLogout}
      >
        <LogOut size={20} />
      </button>
    </aside>
  );
};

export default ServerBar;
