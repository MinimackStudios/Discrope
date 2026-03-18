import type { User } from "../types";
import StatusDot from "./StatusDot";

const DEFAULT_AVATAR_URL = `${import.meta.env.BASE_URL}default-avatar.svg`;

type Props = {
  user: User | null;
  open: boolean;
  me: User | null;
  friends: User[];
  onClose: () => void;
  onAddFriend: (username: string) => Promise<void>;
  onStartDM: (userId: string) => Promise<void>;
};

const UserProfileModal = ({ user, open, me, friends, onClose, onAddFriend, onStartDM }: Props): JSX.Element | null => {
  if (!open || !user) {
    return null;
  }

  const displayName = user.nickname?.trim() || user.username;
  const isSelf = me?.id === user.id;
  const isDeletedUser = Boolean(user.isDeleted);
  const isSystemUser = user.username === "Discrope";
  const isFriend = friends.some((f) => f.id === user.id);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <section className="w-full max-w-sm overflow-hidden rounded-xl bg-[#2b2d31]" onClick={(e) => e.stopPropagation()}>
        <div className="h-24 bg-gradient-to-r from-[#5865f2] to-[#3d4ddc]" />
        <div className="relative p-4">
          <div className="absolute -top-10 h-20 w-20">
            <img
              src={user.avatarUrl || DEFAULT_AVATAR_URL}
              alt={displayName}
              className="h-20 w-20 rounded-full border-4 border-[#2b2d31]"
            />
            <span className="absolute bottom-1 right-1">
              <StatusDot status={user.status} sizeClassName="h-4 w-4" cutoutClassName="ring-4 ring-[#2b2d31]" />
            </span>
          </div>
          <div className="pt-12">
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-xl font-bold text-white">{displayName}</h3>
            </div>
            <p className="text-xs text-discord-muted">@{user.username}</p>
            <p className="text-xs text-discord-muted">{user.customStatus || user.status}</p>

            <div className="mt-4 rounded-md bg-[#1e1f22] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-discord-muted">About Me</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-discord-text">{user.aboutMe || "No bio set."}</p>
            </div>

            {!isSelf && !isDeletedUser && !isSystemUser ? (
              <div className="mt-3 flex gap-2">
                {!isFriend ? (
                  <button
                    className="flex-1 rounded bg-discord-blurple px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#4752c4]"
                    onClick={() => void onAddFriend(user.username)}
                  >
                    Add Friend
                  </button>
                ) : (
                  <span className="flex-1 rounded bg-[#3a3d45] px-3 py-1.5 text-center text-sm text-discord-muted">Friends</span>
                )}
                <button
                  className="flex-1 rounded bg-[#3a3d45] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#4a4e59]"
                  onClick={async () => {
                    await onStartDM(user.id);
                    onClose();
                  }}
                >
                  Message
                </button>
              </div>
            ) : null}
            {isDeletedUser ? <p className="mt-3 text-xs text-discord-muted">This account has been deleted.</p> : null}
            {isSystemUser ? <p className="mt-3 text-xs text-discord-muted">System account cannot be friended or messaged.</p> : null}
          </div>
        </div>
      </section>
    </div>
  );
};

export default UserProfileModal;
