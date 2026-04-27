import { useEffect, useState } from "react";
import type { Server, User } from "../types";
import { AnimatePresence, motion } from "framer-motion";
import { formatStatusLabel } from "../lib/formatStatus";
import { resolveMediaUrl, resolveUserAvatarUrl } from "../lib/media";
import { useBackdropClose } from "../lib/useBackdropClose";
import StatusDot from "./StatusDot";

type Props = {
  user: User | null;
  open: boolean;
  serverName?: string | null;
  serverMemberSince?: string | null;
  me: User | null;
  friends: User[];
  outgoingPendingFriends: User[];
  servers?: Server[];
  onClose: () => void;
  onAddFriend: (username: string) => Promise<void>;
  onStartDM: (userId: string) => Promise<void>;
};

const joinDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric"
});

const formatJoinDate = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return joinDateFormatter.format(date);
};

const UserProfileModal = ({ user, open, serverName, serverMemberSince, me, friends, outgoingPendingFriends, servers = [], onClose, onAddFriend, onStartDM }: Props): JSX.Element | null => {
  const [displayedUser, setDisplayedUser] = useState<User | null>(user);
  const [serversExpanded, setServersExpanded] = useState(false);
  const { onBackdropPointerDown, onBackdropClick } = useBackdropClose(onClose);

  useEffect(() => {
    if (open && user) {
      setDisplayedUser(user);
    }
  }, [open, user]);

  const profileUser = displayedUser ?? user;
  if (!profileUser) {
    return null;
  }

  const displayName = profileUser.nickname?.trim() || profileUser.username;
  const isSelf = me?.id === profileUser.id;
  const isDeletedUser = Boolean(profileUser.isDeleted);
  const isSystemUser = profileUser.username === "Windcord";
  const isFriend = friends.some((f) => f.id === profileUser.id);
  const isPendingOutgoing = outgoingPendingFriends.some((f) => f.id === profileUser.id);
  const diskchatMemberSince = formatJoinDate(profileUser.createdAt);
  const serverJoinDate = formatJoinDate(serverMemberSince);
  const friendsSince = formatJoinDate(isFriend ? profileUser.friendsSince : null);
  const trimmedServerName = serverName?.trim();
  const serverMembershipLabel = trimmedServerName ? `Member of ${trimmedServerName} Since` : "Member Since";
  const accentBg = profileUser.accentColor || undefined;
  const mutualServers = !isSelf && !isDeletedUser && !isSystemUser
    ? servers.filter((s) => s.members.some((m) => m.userId === profileUser.id))
    : [];

  return (
    <AnimatePresence onExitComplete={() => setDisplayedUser(user ?? null)}>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="fixed inset-0 z-50 grid place-items-center bg-[rgba(6,8,12,0.74)] p-4 backdrop-blur-sm"
          onPointerDown={onBackdropPointerDown}
          onClick={onBackdropClick}
        >
          <motion.section
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.97 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="wc-modal-card w-full max-w-sm overflow-hidden rounded-[24px]"
            onClick={(e) => e.stopPropagation()}
          >
        {profileUser.bannerImageUrl
          ? <img src={resolveMediaUrl(profileUser.bannerImageUrl) ?? ""} alt="" className="h-24 w-full object-cover" />
          : <div className="h-24" style={{ background: profileUser.bannerColor ?? "linear-gradient(135deg, var(--wc-active-top), var(--wc-active-bottom))" }} />
        }
        <div className="relative p-4" style={accentBg ? { backgroundColor: accentBg } : { background: "linear-gradient(180deg, rgba(18,22,31,0.72), rgba(12,15,23,0.88))" }}>
          <div className="absolute -top-10 h-20 w-20">
            <img
              src={resolveUserAvatarUrl(profileUser)}
              alt={displayName}
              className="h-20 w-20 rounded-full border-4"
              style={{ borderColor: accentBg ?? "var(--wc-profile-cutout)" }}
            />
            <span className="absolute bottom-1 right-1">
              <StatusDot
                status={profileUser.status}
                sizeClassName="h-4 w-4"
                cutoutColor={accentBg ?? "var(--wc-profile-cutout)"}
                ringColor={accentBg ?? "var(--wc-profile-cutout)"}
              />
            </span>
          </div>
          <div className="pt-12">
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-xl font-bold text-white">{displayName}</h3>
            </div>
            <p className="text-xs text-discord-muted">@{profileUser.username}</p>
            <p className="text-xs text-discord-muted">{profileUser.customStatus?.trim() || formatStatusLabel(profileUser.status)}</p>

            <div className={`mt-4 rounded-2xl border border-white/[0.05] p-3 ${accentBg ? "bg-black/20" : "bg-black/20 backdrop-blur-sm"}`}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-discord-muted">About Me</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-discord-text">{profileUser.aboutMe || "No bio set."}</p>

              {diskchatMemberSince || serverJoinDate || friendsSince ? (
                <div className="mt-4 border-t border-white/[0.06] pt-4">
                  {diskchatMemberSince ? (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-discord-muted">Windcord Member Since</p>
                      <p className="mt-1 text-sm text-discord-text">{diskchatMemberSince}</p>
                    </div>
                  ) : null}
                  {serverJoinDate ? (
                    <div className={diskchatMemberSince ? "mt-3" : undefined}>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-discord-muted">{serverMembershipLabel}</p>
                      <p className="mt-1 text-sm text-discord-text">{serverJoinDate}</p>
                    </div>
                  ) : null}
                  {friendsSince ? (
                    <div className={diskchatMemberSince || serverJoinDate ? "mt-3" : undefined}>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-discord-muted">Friends Since</p>
                      <p className="mt-1 text-sm text-discord-text">{friendsSince}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {mutualServers.length > 0 ? (
              <div className={`mt-3 rounded-2xl border border-white/[0.05] ${accentBg ? "bg-black/20" : "bg-black/20 backdrop-blur-sm"}`}>
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
                          : <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[linear-gradient(180deg,var(--wc-active-top),var(--wc-active-bottom))] text-xs font-bold text-white">{server.name.charAt(0).toUpperCase()}</div>
                        }
                        <span className="truncate text-sm text-discord-text">{server.name}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {!isSelf && !isDeletedUser && !isSystemUser ? (
              <div className="mt-3 flex gap-2">
                {!isFriend ? (
                  isPendingOutgoing ? (
                    <span className="flex-1 rounded bg-[#3a3d45] px-3 py-1.5 text-center text-sm text-discord-muted">Friend request sent</span>
                  ) : (
                    <button
                      className="wc-accent-button flex-1 rounded-xl px-3 py-1.5 text-sm font-semibold text-white"
                      onClick={() => void onAddFriend(profileUser.username)}
                    >
                      Add Friend
                    </button>
                  )
                ) : (
                  <span className="wc-secondary-button flex-1 rounded-xl px-3 py-1.5 text-center text-sm text-discord-muted">Friends</span>
                )}
                <button
                  className="wc-secondary-button flex-1 rounded-xl px-3 py-1.5 text-sm font-semibold text-white"
                  onClick={async () => {
                    await onStartDM(profileUser.id);
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
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};

export default UserProfileModal;
