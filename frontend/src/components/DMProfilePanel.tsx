import type { User } from "../types";
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
};

const DMProfilePanel = ({ user }: Props): JSX.Element => {
  const memberSince = formatDate(user?.createdAt);
  const friendsSince = formatDate(user?.friendsSince);
  const accentBg = user?.accentColor || undefined;

  return (
    <aside className="hidden h-full w-80 flex-shrink-0 overflow-y-auto bg-discord-dark2 xl:block discord-scrollbar">
      {user?.bannerImageUrl
        ? <img src={resolveMediaUrl(user.bannerImageUrl) ?? ""} alt="" className="h-24 w-full object-cover" />
        : <div className="h-24" style={{ background: user?.bannerColor ?? "linear-gradient(to right, #5865f2, #3d4ddc)" }} />
      }
      <div className="relative p-4" style={accentBg ? { backgroundColor: accentBg } : undefined}>
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
                <StatusDot status={user.status} sizeClassName="h-4 w-4" cutoutClassName="ring-4 ring-[#2b2d31]" />
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
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-discord-muted">DiskChat Member Since</p>
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
