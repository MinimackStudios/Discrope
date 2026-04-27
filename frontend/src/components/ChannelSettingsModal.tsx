import { FormEvent, useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Hash, Lock, Trash2, X } from "lucide-react";
import { useBackdropClose } from "../lib/useBackdropClose";
import type { Channel } from "../types";

// Discord-style filled megaphone/speaker icon for announcement channels
const AnnouncementIcon = ({ size = 18, className = "" }: { size?: number; className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 14 14" fill="currentColor" className={className}>
    <path fillRule="evenodd" clipRule="evenodd" d="M7.933.767a.75.75 0 0 0-1.5 0v.754a.75.75 0 0 0 1.5 0zM6.595 2.928a.75.75 0 0 1 1.024.275l3.858 6.681a.75.75 0 0 1-1.299.75l-.055-.096l-3.092.718a2.171 2.171 0 0 1-3.97 1.664l-.002-.003l-.376-.651l-1.454.337a.5.5 0 0 1-.546-.237l-.609-1.055a.5.5 0 0 1 .068-.591l6.235-6.67l-.057-.097a.75.75 0 0 1 .275-1.025M4.21 11.911l1.357-.315a.671.671 0 0 1-1.21.57zm9.78-5.088a.75.75 0 0 1-.75.75h-.754a.75.75 0 0 1 0-1.5h.753a.75.75 0 0 1 .75.75Zm-12.108.75a.75.75 0 1 0 0-1.5h-.754a.75.75 0 1 0 0 1.5zm2.182-3.868a.75.75 0 0 1-1.06 0l-.634-.634a.75.75 0 1 1 1.06-1.06l.635.633a.75.75 0 0 1 0 1.061Zm7.932-.634a.75.75 0 0 0-1.06-1.06l-.642.64a.75.75 0 1 0 1.061 1.061z" />
  </svg>
);

type Props = {
  open: boolean;
  channel: Channel | null;
  onClose: () => void;
  onRename: (channelId: string, name: string) => Promise<void>;
  onToggleReadOnly: (channelId: string) => Promise<void>;
  onToggleAnnouncement: (channelId: string) => Promise<void>;
  onDelete: (channelId: string) => void;
};

const ChannelSettingsModal = ({ open, channel, onClose, onRename, onToggleReadOnly, onToggleAnnouncement, onDelete }: Props): JSX.Element | null => {
  const [name, setName] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [isAnnouncement, setIsAnnouncement] = useState(false);
  const [saving, setSaving] = useState(false);
  const { onBackdropPointerDown, onBackdropClick } = useBackdropClose(onClose);

  useEffect(() => {
    if (channel) {
      setName(channel.name);
      setReadOnly(Boolean(channel.readOnly));
      setIsAnnouncement(Boolean(channel.isAnnouncement));
    }
  }, [channel]);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!channel) return;
    setSaving(true);
    try {
      const nameChanged = name.trim() !== "" && name.trim() !== channel.name;
      const readOnlyChanged = readOnly !== Boolean(channel.readOnly);
      const announcementChanged = isAnnouncement !== Boolean(channel.isAnnouncement);
      if (nameChanged) {
        await onRename(channel.id, name.trim());
      }
      if (readOnlyChanged) {
        await onToggleReadOnly(channel.id);
      }
      if (announcementChanged) {
        await onToggleAnnouncement(channel.id);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && channel ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onPointerDown={onBackdropPointerDown}
          onClick={onBackdropClick}
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="wc-modal-card w-full max-w-md overflow-hidden rounded-[22px]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/[0.03] px-5 py-4">
              <div className="flex items-center gap-2">
                {channel.isAnnouncement ? (
                  <AnnouncementIcon size={18} className="text-discord-muted" />
                ) : (
                  <Hash size={18} className="text-discord-muted" />
                )}
                <h2 className="text-base font-semibold">{channel.name}</h2>
              </div>
              <button
                type="button"
                className="rounded p-1 text-discord-muted transition hover:bg-white/[0.06] hover:text-white"
                onClick={onClose}
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleSubmit} className="p-5">
              {/* Overview section */}
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-discord-muted">Channel Name</p>
              <input
                className="wc-input-surface w-full rounded-xl px-3 py-2 text-sm text-white"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="channel-name"
                required
              />

              {/* Permissions section */}
              <p className="mb-3 mt-5 text-[11px] font-semibold uppercase tracking-wide text-discord-muted">Permissions</p>

              {/* Read-only toggle */}
              <label className="wc-input-surface mb-2 flex cursor-pointer items-center justify-between rounded-xl px-3 py-3">
                <div className="flex items-center gap-2">
                  <Lock size={15} className="text-discord-muted" />
                  <div>
                    <p className="text-sm font-medium text-white">Read-only</p>
                    <p className="text-[11px] text-discord-muted">Only admins and the owner can send messages</p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={readOnly}
                  onClick={() => setReadOnly((v) => !v)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${readOnly ? "bg-[linear-gradient(180deg,var(--wc-active-top),var(--wc-active-bottom))]" : "bg-[#4e5058]"}`}
                >
                  <span
                    className="absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all duration-200"
                    style={{ left: readOnly ? "1.5rem" : "0.25rem" }}
                  />
                </button>
              </label>

              {/* Announcement toggle */}
              <label className="wc-input-surface flex cursor-pointer items-center justify-between rounded-xl px-3 py-3">
                <div className="flex items-center gap-2">
                  <AnnouncementIcon size={15} className="text-discord-muted" />
                  <div>
                    <p className="text-sm font-medium text-white">Announcement Channel</p>
                    <p className="text-[11px] text-discord-muted">Shows a megaphone icon instead of #</p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isAnnouncement}
                  onClick={() => setIsAnnouncement((v) => !v)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${isAnnouncement ? "bg-[linear-gradient(180deg,var(--wc-active-top),var(--wc-active-bottom))]" : "bg-[#4e5058]"}`}
                >
                  <span
                    className="absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all duration-200"
                    style={{ left: isAnnouncement ? "1.5rem" : "0.25rem" }}
                  />
                </button>
              </label>

              {/* Actions */}
              <div className="mt-6 flex items-center justify-between">
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-sm text-[#ed4245] hover:underline"
                  onClick={() => {
                    onDelete(channel.id);
                    onClose();
                  }}
                >
                  <Trash2 size={14} />
                  Delete Channel
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="text-sm text-discord-muted hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="wc-accent-button rounded-xl px-3 py-1.5 text-sm font-semibold text-white hover:-translate-y-[1px] disabled:opacity-60"
                  >
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};

export default ChannelSettingsModal;
