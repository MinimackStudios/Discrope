import { useState } from "react";
import { X, Megaphone } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { SystemNotice } from "../lib/stores/chatStore";

type Props = {
  notices: SystemNotice[];
  onDismiss: (id: string) => void;
};

const SystemNoticeBanner = ({ notices, onDismiss }: Props): JSX.Element | null => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (notices.length === 0) return null;

  const expanded = expandedId ? notices.find((n) => n.id === expandedId) ?? null : null;

  return (
    <>
      {/* Toast stack — bottom-left, above UserBar */}
      <div className="fixed bottom-[60px] left-[72px] z-50 flex flex-col-reverse gap-2 max-w-sm">
        <AnimatePresence initial={false}>
          {notices.map((notice) => (
            <motion.div
              key={notice.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="flex items-start gap-3 rounded-lg bg-[#1e1f22] p-3 shadow-2xl ring-1 ring-white/10 w-80"
            >
              <div className="mt-0.5 shrink-0 rounded-full bg-discord-blurple/20 p-1.5">
                <Megaphone size={14} className="text-discord-blurple" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white leading-tight">{notice.title}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-discord-muted">{notice.body}</p>
                <button
                  className="mt-1.5 text-[11px] text-discord-blurple hover:underline"
                  onClick={() => setExpandedId(notice.id)}
                >
                  View full notice
                </button>
              </div>
              <button
                className="shrink-0 rounded p-0.5 text-discord-muted hover:text-white"
                onClick={() => onDismiss(notice.id)}
                title="Dismiss"
              >
                <X size={13} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Full-view modal */}
      <AnimatePresence>
        {expanded ? (
          <motion.div
            key="notice-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-6"
            onClick={() => setExpandedId(null)}
          >
            <motion.div
              key="notice-modal-card"
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="w-full max-w-md overflow-hidden rounded-xl bg-[#2b2d31] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header bar */}
              <div className="flex items-center gap-3 bg-discord-blurple px-5 py-4">
                <Megaphone size={18} className="text-white shrink-0" />
                <p className="text-base font-bold text-white flex-1">{expanded.title}</p>
                <button
                  className="shrink-0 rounded p-0.5 text-white/70 hover:text-white"
                  onClick={() => setExpandedId(null)}
                >
                  <X size={16} />
                </button>
              </div>
              {/* Body */}
              <div className="px-5 py-4">
                <p className="whitespace-pre-wrap text-sm text-discord-text leading-relaxed">{expanded.body}</p>
              </div>
              {/* Footer */}
              <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-3">
                <button
                  className="rounded bg-[#1e1f22] px-4 py-1.5 text-sm text-discord-muted hover:text-white"
                  onClick={() => setExpandedId(null)}
                >
                  Close
                </button>
                <button
                  className="rounded bg-[#ed4245]/20 px-4 py-1.5 text-sm text-[#ed4245] hover:bg-[#ed4245]/30"
                  onClick={() => { onDismiss(expanded.id); setExpandedId(null); }}
                >
                  Dismiss
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
};

export default SystemNoticeBanner;
