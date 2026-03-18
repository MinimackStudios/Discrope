import { Plus, Compass, LogOut } from "lucide-react";
import type { DMChannel, Server, User } from "../types";

const DEFAULT_AVATAR_URL = `${import.meta.env.BASE_URL}default-avatar.svg`;
const HOME_ICON_URL = `${import.meta.env.BASE_URL}disc.png`;

type Props = {
  servers: Server[];
  homeActive: boolean;
  activeServerId: string | null;
  unreadServerIds: Set<string>;
  mentionServerIds: Set<string>;
  dms: DMChannel[];
  me: User | null;
  unreadDMs: Record<string, number>;
  onSelectHome: () => void;
  onSelectDM: (dmId: string) => void;
  onSelect: (id: string) => void;
  onCreateServer: () => void;
  onJoinByInvite: () => void;
  onLogout: () => void;
};

const ServerBar = ({
  servers,
  homeActive,
  activeServerId,
  unreadServerIds,
  mentionServerIds,
  dms,
  me,
  unreadDMs,
  onSelectHome,
  onSelectDM,
  onSelect,
  onCreateServer,
  onJoinByInvite,
  onLogout
}: Props): JSX.Element => {
  const unreadDMCount = Object.values(unreadDMs).reduce((acc, count) => acc + count, 0);

  return (
    <aside className="flex h-full w-[72px] flex-col items-center gap-2 bg-discord-dark0 py-3">
      <button
        onClick={onSelectHome}
        className={`relative grid h-12 w-12 place-items-center text-white transition hover:rounded-xl ${
          homeActive ? "rounded-2xl bg-discord-blurple" : "rounded-3xl bg-[#2f3136]"
        }`}
        title="Home"
      >
        <img src={HOME_ICON_URL} alt="Home" className="h-7 w-7 object-contain" />
        {unreadDMCount > 0 ? (
          <span className="absolute -right-1 -top-1 rounded-full bg-[#ed4245] px-1.5 text-[10px] font-semibold text-white">
            {Math.min(unreadDMCount, 99)}
          </span>
        ) : null}
      </button>

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
              <button
                onClick={() => onSelect(server.id)}
                title={server.name}
                className={`relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-3xl bg-[#2f3136] text-sm font-semibold text-white transition ${
                  active ? "rounded-2xl shadow-glow" : "hover:rounded-2xl"
                }`}
              >
                {server.iconUrl ? (
                  <div className="h-12 w-12">
                    <img src={server.iconUrl} alt={server.name} className="h-full w-full object-contain" />
                  </div>
                ) : (
                  <span>{server.name.slice(0, 2).toUpperCase()}</span>
                )}
              </button>
              {hasMention ? (
                <span className="pointer-events-none absolute -right-1 -top-1 z-20 rounded-full bg-[#ed4245] px-1.5 text-[10px] font-semibold text-white">1</span>
              ) : null}
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
