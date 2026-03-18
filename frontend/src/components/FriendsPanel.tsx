import { FormEvent, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { User } from "../types";
import { useBackdropClose } from "../lib/useBackdropClose";
import StatusDot from "./StatusDot";

type PendingRequest = { id: string; from: User };

type Props = {
  open: boolean;
  friends: User[];
  pending: PendingRequest[];
  onClose: () => void;
  onAdd: (username: string) => Promise<void>;
  onAccept: (requestId: string) => Promise<void>;
  onReject: (requestId: string) => Promise<void>;
  onStartDM: (userId: string) => Promise<void>;
  onRemoveFriend: (userId: string) => Promise<void>;
  onOpenProfile: (user: User) => void;
};

const FriendsPanel = ({
  open,
  friends,
  pending,
  onClose,
  onAdd,
  onAccept,
  onReject,
  onStartDM,
  onRemoveFriend,
  onOpenProfile
}: Props): JSX.Element | null => {
  const [username, setUsername] = useState("");
  const { onBackdropPointerDown, onBackdropClick } = useBackdropClose(onClose);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!username.trim()) {
      return;
    }
    await onAdd(username.trim());
    setUsername("");
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onPointerDown={onBackdropPointerDown}
          onClick={onBackdropClick}
        >
          <motion.section
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            className="w-full max-w-2xl rounded-lg bg-[#2b2d31] p-4 shadow-[0_28px_90px_rgba(0,0,0,0.44)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Friends</h2>
              <button className="text-sm text-discord-muted hover:-translate-y-[1px] hover:text-white" onClick={onClose}>Close</button>
            </div>

            <form onSubmit={submit} className="mb-4 flex gap-2">
              <input
                className="flex-1 rounded bg-[#1e1f22] px-3 py-2 text-sm"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Add friend by username"
              />
              <button className="rounded bg-discord-blurple px-3 py-2 text-sm font-semibold text-white hover:-translate-y-[1px]">Send</button>
            </form>

            <div className="grid gap-4 md:grid-cols-2">
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-discord-muted">Pending</h3>
                <div className="space-y-1">
                  {pending.map((request) => (
                    <div key={request.id} className="flex items-center gap-2 rounded bg-[#1e1f22] px-2 py-2 text-sm">
                      <StatusDot status={request.from.status} />
                      <button className="flex-1 truncate text-left hover:underline" onClick={() => onOpenProfile(request.from)}>
                        {request.from.nickname?.trim() || request.from.username}
                      </button>
                      <button className="text-xs text-[#23a55a] hover:-translate-y-[1px]" onClick={() => void onAccept(request.id)}>Accept</button>
                      <button className="text-xs text-[#ed4245] hover:-translate-y-[1px]" onClick={() => void onReject(request.id)}>Decline</button>
                    </div>
                  ))}
                  {!pending.length ? <p className="text-xs text-discord-muted">No pending requests</p> : null}
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-discord-muted">All Friends</h3>
                <div className="space-y-1">
                  {friends.map((friend) => (
                    <div key={friend.id} className="flex items-center gap-2 rounded bg-[#1e1f22] px-2 py-2 text-sm">
                      <StatusDot status={friend.status} />
                      <button className="flex-1 truncate text-left hover:underline" onClick={() => onOpenProfile(friend)}>
                        {friend.nickname?.trim() || friend.username}
                      </button>
                      <button className="text-xs text-[#00a8fc] hover:-translate-y-[1px]" onClick={() => void onStartDM(friend.id)}>Message</button>
                      <button className="text-xs text-[#ed4245] hover:-translate-y-[1px]" onClick={() => void onRemoveFriend(friend.id)}>Remove</button>
                    </div>
                  ))}
                  {!friends.length ? <p className="text-xs text-discord-muted">No friends yet</p> : null}
                </div>
              </section>
            </div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};

export default FriendsPanel;
