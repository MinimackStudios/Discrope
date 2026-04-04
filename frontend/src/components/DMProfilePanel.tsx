import { useState } from "react";
import type { Server, User } from "../types";
import { resolveMediaUrl, resolveUserAvatarUrl } from "../lib/media";
import { formatStatusLabel } from "../lib/formatStatus";
import StatusDot from "./StatusDot";

const joinDateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

const formatDate = (value?: string | null): string | null => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : joinDateFormatter.format(d);
};

type Props = {
  user: User | null;
  me?: User | null;
  servers?: Server[];
};

const DMProfilePanel = ({ user, me, servers = [] }: Props): JSX.Element => {
  const [serversExpanded, setServersExpanded] = useState(false);
  const memberSince = formatDate(user?.createdAt);
  const friendsSince = formatDate(user?.friendsSince);
  const accentBg = user?.accentColor || undefined;

  const mutualServers = user && me
    ? servers.filter((s) => s.members.some((m) => m.userId === user.id))
    : [];

  return (
    <aside className="hidden h-full w-80 flex-shrink-0 bg-discord-dark2 xl:flex xl:flex-col discord-scrollbar overflow-y-auto">
      {user?.bannerImageUrl
        ? <img src={resolveMediaUrl(user.bannerImageUrl) ?? ""} alt="" className="h-24 w-full object-cover flex-shrink-0" />
        : <div className="h-24 flex-shrink-0" style={{ background: user?.bannerColor ?? "linear-gradient(to right, #5865f2, #3d4ddc)" }} />
      }
      <div className="relative flex-1 p-4" style={accentBg ? { backgroundColor: accentBg } : undefined}>
        {user ? (
          <>
            <div className="absolute -top-10 h-20 w-20">
              <img
                src={resolveUserAvatarUrl(user)}
                alt={user.nickname?.trim() || user.username}
                className="h-20 w-20 rounded-full border-4 object-cover"
                style={{ borderColor: accentBg ?? "#2b2d31" }}
              />
              <span className="absolute bottom-1 right-1">
                <StatusDot
                  status={user.status}
                  sizeClassName="h-4 w-4"
                  cutoutColor={accentBg ?? "#2b2d31"}
                  ringColor={accentBg ?? "#2b2d31"}
                />
              </span>
            </div>
            <div className="pt-12">
              <p className="truncate text-xl font-bold text-white">{user.nickname?.trim() || user.username}</p>
              <p className="truncate text-xs text-discord-muted">@{user.username}</p>
              <p className="mt-0.5 text-xs text-discord-muted">{user.customStatus?.trim() || formatStatusLabel(user.status)}</p>

              <div className={`mt-4 rounded-md p-3 ${accentBg ? "bg-black/20" : "bg-[#1e1f22]"}`}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-discord-muted">About Me</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-discord-text">{user.aboutMe || "No bio set."}</p>

                {memberSince || friendsSince ? (
                  <div className="mt-4 border-t border-white/10 pt-4 space-y-3">
                    {memberSince ? (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-discord-muted">Windcord Member Since</p>
                        <p className="mt-1 text-sm text-discord-text">{memberSince}</p>
                      </div>
                    ) : null}
                    {friendsSince ? (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-discord-muted">Friends Since</p>
                        <p className="mt-1 text-sm text-discord-text">{friendsSince}</p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {mutualServers.length > 0 ? (
                <div className={`mt-3 rounded-md ${accentBg ? "bg-black/20" : "bg-[#1e1f22]"}`}>
                  <button
                    className="flex w-full items-center justify-between p-3 text-left"
                    onClick={() => setServersExpanded((v) => !v)}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-discord-muted">Mutual Servers — {mutualServers.length}</p>
                    <svg
                      className={`h-3 w-3 flex-shrink-0 text-discord-muted transition-transform duration-150 ${serversExpanded ? "rotate-180" : ""}`}
                      viewBox="0 0 12 12"
                      fill="currentColor"
                    >
                      <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {serversExpanded ? (
                    <div className="px-3 pb-3 space-y-2">
                      {mutualServers.map((server) => (
                        <div key={server.id} className="flex items-center gap-2">
                          {server.iconUrl
                            ? <img src={resolveMediaUrl(server.iconUrl) ?? ""} alt={server.name} className="h-8 w-8 rounded-full object-cover flex-shrink-0" />
                            : <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-discord-blurple text-xs font-bold text-white">{server.name.charAt(0).toUpperCase()}</div>
                          }
                          <span className="truncate text-sm text-discord-text">{server.name}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-md bg-[#1e1f22] p-3 text-sm text-discord-muted">Select a DM to view profile details.</div>
        )}
      </div>
    </aside>
  );
};

export default DMProfilePanel;
