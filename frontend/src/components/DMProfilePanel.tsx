import type { User } from "../types";
import { formatStatusLabel } from "../lib/formatStatus";
import StatusDot from "./StatusDot";

const DEFAULT_AVATAR_URL = `${import.meta.env.BASE_URL}default-avatar.svg`;

type Props = {
  user: User | null;
};

const DMProfilePanel = ({ user }: Props): JSX.Element => {
  return (
    <aside className="hidden h-full w-60 bg-discord-dark2 xl:block">
      <div className="h-28 bg-gradient-to-r from-[#5865f2] to-[#3d4ddc]" />
      <div className="p-3">
        {user ? (
          <>
            <div className="relative -mt-10 mb-3 h-20 w-20">
              <img
                src={user.avatarUrl || DEFAULT_AVATAR_URL}
                alt={user.nickname?.trim() || user.username}
                className="h-20 w-20 rounded-full border-4 border-[#2b2d31] object-cover"
              />
              <span className="absolute bottom-1 right-1">
                <StatusDot status={user.status} sizeClassName="h-4 w-4" cutoutClassName="ring-4 ring-[#2b2d31]" />
              </span>
            </div>
            <p className="truncate text-lg font-bold text-white">{user.nickname?.trim() || user.username}</p>
            <p className="truncate text-xs text-discord-muted">@{user.username}</p>
            <p className="mt-1 text-xs text-discord-muted">{user.customStatus?.trim() || formatStatusLabel(user.status)}</p>

            <div className="mt-4 rounded-md bg-[#1e1f22] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-discord-muted">About Me</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-discord-text">{user.aboutMe || "No bio set."}</p>
            </div>
          </>
        ) : (
          <div className="rounded-md bg-[#1e1f22] p-3 text-sm text-discord-muted">Select a DM to view profile details.</div>
        )}
      </div>
    </aside>
  );
};

export default DMProfilePanel;
