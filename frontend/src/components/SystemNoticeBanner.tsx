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
      <div className="fixed bottom-[60px] left-4 right-4 z-50 flex max-w-[22rem] flex-col-reverse gap-2 sm:left-[72px] sm:right-auto">
        <AnimatePresence initial={false}>
          {notices.map((notice) => (
            <motion.div
              key={notice.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="wc-notice-toast relative w-full overflow-hidden rounded-[20px] px-4 py-3"
            >
              <div className="relative flex items-start gap-3">
                <div className="wc-notice-icon mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl">
                  <Megaphone size={16} className="text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-discord-muted">Platform Notice</p>
                      <p className="mt-1 text-[15px] font-semibold leading-tight text-white">{notice.title}</p>
                    </div>
                    <button
                      className="shrink-0 rounded-lg p-1 text-discord-muted transition hover:bg-white/[0.06] hover:text-white"
                      onClick={() => onDismiss(notice.id)}
                      title="Dismiss"
                    >
                      <X size={13} />
                    </button>
                  </div>
                  <p className="mt-2 line-clamp-2 text-[13px] leading-5 text-discord-muted">{notice.body}</p>
                  <div className="mt-3 flex items-center justify-start gap-2">
                    <button
                      className="wc-secondary-button rounded-xl px-3 py-1.5 text-[11px] font-semibold text-white transition hover:text-white"
                      onClick={() => setExpandedId(notice.id)}
                    >
                      View full notice
                    </button>
                  </div>
                </div>
              </div>
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
              className="wc-modal-card w-full max-w-lg overflow-hidden rounded-[28px]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="wc-notice-modal-hero relative overflow-hidden px-6 py-5">
                <div className="relative flex items-start gap-4">
                  <div className="wc-notice-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px]">
                    <Megaphone size={18} className="shrink-0 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-discord-muted">Admin Announcement</p>
                    <p className="mt-2 text-[22px] font-bold leading-7 text-white">{expanded.title}</p>
                  </div>
                  <button
                    className="shrink-0 rounded-xl p-2 text-discord-muted transition hover:bg-white/[0.06] hover:text-white"
                    onClick={() => setExpandedId(null)}
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
              <div className="px-6 py-5">
                <div className="wc-notice-body-panel rounded-[22px] px-4 py-3">
                  <p className="whitespace-pre-wrap text-sm leading-7 text-discord-text">{expanded.body}</p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] px-6 py-4">
                <button
                  className="wc-secondary-button rounded-xl px-4 py-2 text-sm font-medium text-discord-text transition hover:text-white"
                  onClick={() => setExpandedId(null)}
                >
                  Close
                </button>
                <button
                  className="wc-notice-danger-button rounded-xl px-4 py-2 text-sm font-medium transition"
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
