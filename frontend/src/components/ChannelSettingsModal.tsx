import { FormEvent, useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Hash, Lock, Trash2, X } from "lucide-react";
import { useBackdropClose } from "../lib/useBackdropClose";
import type { Channel } from "../types";

type Props = {
  open: boolean;
  channel: Channel | null;
  onClose: () => void;
  onRename: (channelId: string, name: string) => Promise<void>;
  onToggleReadOnly: (channelId: string) => Promise<void>;
  onDelete: (channelId: string) => void;
};

const ChannelSettingsModal = ({ open, channel, onClose, onRename, onToggleReadOnly, onDelete }: Props): JSX.Element | null => {
  const [name, setName] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const { onBackdropPointerDown, onBackdropClick } = useBackdropClose(onClose);

  useEffect(() => {
    if (channel) {
      setName(channel.name);
      setReadOnly(Boolean(channel.readOnly));
    }
  }, [channel]);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!channel) return;
    setSaving(true);
    try {
      const nameChanged = name.trim() !== "" && name.trim() !== channel.name;
      const readOnlyChanged = readOnly !== Boolean(channel.readOnly);
      if (nameChanged) {
        await onRename(channel.id, name.trim());
      }
      if (readOnlyChanged) {
        await onToggleReadOnly(channel.id);
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
            className="w-full max-w-md rounded-lg bg-[#2b2d31] shadow-[0_28px_90px_rgba(0,0,0,0.44)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-black/20 px-5 py-4">
              <div className="flex items-center gap-2">
                <Hash size={18} className="text-discord-muted" />
                <h2 className="text-base font-semibold">{channel.name}</h2>
              </div>
              <button
                type="button"
                className="rounded p-1 text-discord-muted hover:bg-[#35373c] hover:text-white"
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
                className="w-full rounded bg-[#1e1f22] px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-discord-blurple"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="channel-name"
                required
              />

              {/* Permissions section */}
              <p className="mb-3 mt-5 text-[11px] font-semibold uppercase tracking-wide text-discord-muted">Permissions</p>
              <label className="flex cursor-pointer items-center justify-between rounded bg-[#1e1f22] px-3 py-3">
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
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${readOnly ? "bg-discord-blurple" : "bg-[#4e5058]"}`}
                >
                  <span
                    className="absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all duration-200"
                    style={{ left: readOnly ? "1.5rem" : "0.25rem" }}
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
                    className="rounded bg-discord-blurple px-3 py-1.5 text-sm font-semibold text-white hover:-translate-y-[1px] disabled:opacity-60"
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
