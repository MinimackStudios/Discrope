import { Headphones, Mic, Settings } from "lucide-react";
import type { User } from "../types";
import StatusDot from "./StatusDot";

type Props = {
  user: User;
  muted: boolean;
  deafened: boolean;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onOpenSettings: () => void;
  onOpenOwnProfile: () => void;
};

const UserBar = ({ user, muted, deafened, onToggleMute, onToggleDeafen, onOpenSettings, onOpenOwnProfile }: Props): JSX.Element => {
  const displayName = user.nickname?.trim() || user.username;

  return (
    <div className="flex h-[52px] items-center gap-2 bg-[#232428] px-2">
      <button
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded p-1 hover:bg-[#35373c]"
        onClick={onOpenOwnProfile}
        title="View profile"
      >
        <div className="relative h-8 w-8 shrink-0">
          <img src={user.avatarUrl || "/default-avatar.svg"} alt={displayName} className="h-8 w-8 rounded-full" />
          <span className="absolute -bottom-1 -right-0.5">
            <StatusDot status={user.status} sizeClassName="h-2.5 w-2.5" cutoutClassName="ring-2 ring-[#232428]" />
          </span>
        </div>
        <div className="min-w-0 flex-1 text-left">
          <p className="truncate text-xs font-semibold text-white">{displayName}</p>
          <div className="min-w-0 text-[11px] leading-4 text-discord-muted">
            <p className="truncate">{user.customStatus?.trim() || user.status}</p>
          </div>
        </div>
      </button>

      <button
        className={`shrink-0 rounded p-1.5 ${muted ? "bg-[#ed4245] text-white" : "text-discord-muted hover:bg-[#3a3d45] hover:text-white"}`}
        onClick={onToggleMute}
      >
        <Mic size={16} />
      </button>
      <button
        className={`shrink-0 rounded p-1.5 ${deafened ? "bg-[#ed4245] text-white" : "text-discord-muted hover:bg-[#3a3d45] hover:text-white"}`}
        onClick={onToggleDeafen}
      >
        <Headphones size={16} />
      </button>
      <button className="shrink-0 rounded p-1.5 text-discord-muted hover:bg-[#3a3d45] hover:text-white" onClick={onOpenSettings}>
        <Settings size={16} />
      </button>
    </div>
  );
};

export default UserBar;
