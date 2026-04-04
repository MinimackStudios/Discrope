import { Plus, Compass, LogOut } from "lucide-react";
import { useState } from "react";
import { resolveMediaUrl } from "../lib/media";
import type { DMChannel, Server, User } from "../types";

const DEFAULT_AVATAR_URL = `${import.meta.env.BASE_URL}default-avatar.svg`;
const HOME_ICON_URL = `${import.meta.env.BASE_URL}disc.png`;

const isOnlineStatus = (status: User["status"]): boolean => {
  return status === "ONLINE" || status === "IDLE" || status === "DND";
};

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

type HoverTooltip = {
  name: string;
  onlineCount: number;
  offlineCount: number;
  top: number;
  left: number;
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
  const [hoverTooltip, setHoverTooltip] = useState<HoverTooltip | null>(null);

  const setTooltipFromElement = (
    element: HTMLButtonElement,
    name: string,
    onlineCount: number,
    offlineCount: number
  ): void => {
    const rect = element.getBoundingClientRect();
    setHoverTooltip({
      name,
      onlineCount,
      offlineCount,
      top: rect.top + rect.height / 2,
      left: rect.right + 12
    });
  };

  return (
    <aside className="flex h-full w-[72px] flex-col items-center gap-2 bg-discord-dark0 py-3">
      <button
        onClick={onSelectHome}
        className={`relative grid h-12 w-12 place-items-center text-white transition hover:rounded-xl ${
          homeActive ? "rounded-2xl bg-discord-blurple" : "rounded-3xl bg-[#2f3136]"
        }`}
        aria-label="Home"
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
          const activeInServerView = active && !homeActive;
          const hasUnread = unreadServerIds.has(server.id);
          const hasMention = mentionServerIds.has(server.id);
          const showPill = activeInServerView || hasUnread || hasMention;
          const onlineCount = server.members.filter((member) => isOnlineStatus(member.user.status)).length;
          const offlineCount = Math.max(0, server.members.length - onlineCount);
          return (
            <div key={server.id} className="relative mt-1 flex w-full justify-center">
              {showPill ? (
                <span
                  className={`absolute left-0 top-1/2 z-10 -translate-y-1/2 bg-white transition-all duration-200 ease-out ${
                    activeInServerView
                      ? "h-10 w-1 rounded-r opacity-100"
                      : "h-4 w-1 rounded-r opacity-100"
                  }`}
                />
              ) : null}
              <button
                onClick={() => onSelect(server.id)}
                onMouseEnter={(event) => setTooltipFromElement(event.currentTarget, server.name, onlineCount, offlineCount)}
                onFocus={(event) => setTooltipFromElement(event.currentTarget, server.name, onlineCount, offlineCount)}
                onMouseLeave={() => setHoverTooltip((current) => (current?.name === server.name ? null : current))}
                onBlur={() => setHoverTooltip((current) => (current?.name === server.name ? null : current))}
                aria-label={server.name}
                className={`relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-3xl bg-[#2f3136] text-sm font-semibold text-white transition ${
                  activeInServerView ? "rounded-2xl" : "hover:rounded-2xl"
                }`}
              >
                {server.iconUrl ? (
                  <div className="h-12 w-12">
                    <img src={resolveMediaUrl(server.iconUrl) || DEFAULT_AVATAR_URL} alt={server.name} className="h-full w-full object-contain" />
                  </div>
                ) : (
                  <span>{server.name.slice(0, 2).toUpperCase()}</span>
                )}
              </button>
              {hasMention ? (
                <span className="pointer-events-none absolute bottom-0.5 right-1.5 z-20 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full border-2 border-[#1e1f22] bg-[#ed4245] px-1 text-[10px] font-bold leading-none text-white">
                  1
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      {hoverTooltip ? (
        <div
          className="pointer-events-none fixed z-[120] -translate-y-1/2"
          style={{ top: hoverTooltip.top, left: hoverTooltip.left }}
        >
          <div className="relative w-[198px] rounded-xl border border-white/10 bg-[#1e1f22] px-3 py-2.5 shadow-[0_20px_45px_rgba(0,0,0,0.45)]">
            <span className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 border-b border-l border-white/10 bg-[#1e1f22]" />
            <p className="break-words text-[13px] font-semibold leading-5 text-[#f2f3f5]">{hoverTooltip.name}</p>
            <div className="mt-2 flex items-center gap-4 text-sm font-semibold">
              <span className="inline-flex items-center gap-1.5 text-[#23a55a]">
                <span className="h-3 w-3 rounded-full bg-[#23a55a]" />
                {hoverTooltip.onlineCount.toLocaleString()}
              </span>
              <span className="inline-flex items-center gap-1.5 text-[#9ca0aa]">
                <span className="h-3 w-3 rounded-full border-2 border-[#9ca0aa]" />
                {hoverTooltip.offlineCount.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      <button
        className="grid h-12 w-12 place-items-center rounded-3xl bg-[#2f3136] text-[#23a55a] transition hover:rounded-2xl"
        aria-label="Add a Server"
        onClick={onCreateServer}
      >
        <Plus size={20} />
      </button>
      <button
        className="grid h-12 w-12 place-items-center rounded-3xl bg-[#2f3136] text-discord-muted transition hover:rounded-2xl hover:text-white"
        aria-label="Join a Server"
        onClick={onJoinByInvite}
      >
        <Compass size={20} />
      </button>
      <button
        className="grid h-12 w-12 place-items-center rounded-3xl bg-[#2f3136] text-discord-muted transition hover:rounded-2xl hover:text-red-300"
        aria-label="Logout"
        onClick={onLogout}
      >
        <LogOut size={20} />
      </button>
    </aside>
  );
};

export default ServerBar;
