import { type MouseEvent, useEffect, useState } from "react";
import { resolveUserAvatarUrl } from "../lib/media";
import type { ServerMember, User } from "../types";
import { formatStatusLabel } from "../lib/formatStatus";
import StatusDot from "./StatusDot";

const SYSTEM_USERNAME = "Windcord";
type Props = {
  members: ServerMember[];
  onSelectUser: (user: User) => void;
  canModerate?: boolean;
  currentUserId?: string;
  ownerId?: string;
  onKick?: (memberId: string) => void;
  onBan?: (memberId: string) => void;
  onSetNickColor?: () => void;
};

type ContextMenuState = {
  x: number;
  y: number;
  memberId: string;
  isSelf: boolean;
};

const MemberList = ({ members, onSelectUser, canModerate = false, currentUserId, ownerId, onKick, onBan, onSetNickColor }: Props): JSX.Element => {
  const activeStatuses = new Set(["ONLINE", "IDLE", "DND"]);
  const online = members.filter((m) => activeStatuses.has(m.user.status));
  const offline = members.filter((m) => !activeStatuses.has(m.user.status));
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  useEffect(() => {
    const closeMenu = (): void => setContextMenu(null);
    window.addEventListener("click", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, []);

  const handleMemberContextMenu = (event: MouseEvent<HTMLDivElement>, member: ServerMember): void => {
    if (member.user.username === SYSTEM_USERNAME) {
      return;
    }
    const memberId = member.userId;
    const isSelf = Boolean(currentUserId && memberId === currentUserId);
    if (isSelf && onSetNickColor) {
      event.preventDefault();
      setContextMenu({ x: event.clientX, y: event.clientY, memberId, isSelf: true });
      return;
    }
    if (!canModerate || !onKick || !onBan) {
      return;
    }
    if (!currentUserId || (ownerId && memberId === ownerId)) {
      return;
    }
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, memberId, isSelf: false });
  };

  return (
    <aside className="hidden h-full w-60 bg-discord-dark2 xl:block">
      <div className="discord-scrollbar h-full overflow-y-auto p-3 text-sm">
        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-discord-muted">Online — {online.length}</h3>
          <div className="space-y-1">
            {online.map((member) => {
              const displayName = member.nickname || member.user.nickname || member.user.username;
              const secondary = member.user.customStatus?.trim() || formatStatusLabel(member.user.status);
              return (
                <div
                  key={member.userId}
                  className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-[#35373c]"
                  onClick={() => onSelectUser(member.user)}
                  onContextMenu={(event) => handleMemberContextMenu(event, member)}
                >
                  <div className="relative h-8 w-8 shrink-0">
                    <img
                      src={resolveUserAvatarUrl(member.user)}
                      alt={member.user.username}
                      className="h-8 w-8 rounded-full"
                    />
                    <span className="absolute -bottom-1 -right-0.5">
                      <StatusDot status={member.user.status} sizeClassName="h-2.5 w-2.5" cutoutColor="#2f3136" ringColor="#2f3136" ringWidth={2} />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" style={{ color: member.nickColor ?? "white" }}>{displayName}</p>
                    <p className="truncate text-[11px] text-discord-muted">{secondary}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-5">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-discord-muted">Offline — {offline.length}</h3>
          <div className="space-y-1">
            {offline.map((member) => {
              const displayName = member.nickname || member.user.nickname || member.user.username;
              const secondary = member.user.customStatus?.trim() || formatStatusLabel(member.user.status);
              return (
                <div
                  key={member.userId}
                  className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-discord-muted hover:bg-[#35373c]"
                  onClick={() => onSelectUser(member.user)}
                  onContextMenu={(event) => handleMemberContextMenu(event, member)}
                >
                  <div className="relative h-8 w-8 shrink-0">
                    <img
                      src={resolveUserAvatarUrl(member.user)}
                      alt={member.user.username}
                      className="h-8 w-8 rounded-full opacity-70"
                    />
                    <span className="absolute -bottom-1 -right-0.5">
                      <StatusDot status={member.user.status} sizeClassName="h-2.5 w-2.5" cutoutColor="#2f3136" ringColor="#2f3136" ringWidth={2} />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" style={{ color: member.nickColor ? `${member.nickColor}99` : undefined }}>{displayName}</p>
                    <p className="truncate text-[11px]">{secondary}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {contextMenu ? (
        <div
          className="fixed z-50 w-44 overflow-hidden rounded-md border border-white/10 bg-[#111214] shadow-lg"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(event) => event.stopPropagation()}
        >
          {contextMenu.isSelf ? (
            <button
              className="w-full px-3 py-2 text-left text-sm text-discord-text hover:bg-[#2b2d31]"
              onClick={() => {
                onSetNickColor?.();
                setContextMenu(null);
              }}
            >
              Set Nickname Color
            </button>
          ) : (
            <>
              <button
                className="w-full px-3 py-2 text-left text-sm text-[#f0b232] hover:bg-[#2b2d31]"
                onClick={() => {
                  onKick?.(contextMenu.memberId);
                  setContextMenu(null);
                }}
              >
                Kick Member
              </button>
              <button
                className="w-full px-3 py-2 text-left text-sm text-[#ed4245] hover:bg-[#2b2d31]"
                onClick={() => {
                  onBan?.(contextMenu.memberId);
                  setContextMenu(null);
                }}
              >
                Ban Member
              </button>
            </>
          )}
        </div>
      ) : null}
    </aside>
  );
};

export default MemberList;
