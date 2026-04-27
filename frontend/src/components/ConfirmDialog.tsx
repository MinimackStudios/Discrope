import { AnimatePresence, motion } from "framer-motion";
import { useBackdropClose } from "../lib/useBackdropClose";

type Props = {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

const ConfirmDialog = ({ open, title, message, confirmLabel = "Confirm", danger = false, onConfirm, onCancel }: Props): JSX.Element | null => {
  const { onBackdropPointerDown, onBackdropClick } = useBackdropClose(onCancel);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="fixed inset-0 z-[70] grid place-items-center bg-[rgba(6,8,12,0.74)] p-4 backdrop-blur-sm"
          onPointerDown={onBackdropPointerDown}
          onClick={onBackdropClick}
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="wc-modal-card w-full max-w-sm rounded-[24px] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            {title ? <h3 className="mb-2 text-base font-bold text-white">{title}</h3> : null}
            <p className="text-sm text-discord-muted">{message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded-xl px-4 py-1.5 text-sm text-discord-muted transition hover:bg-white/[0.05] hover:text-white"
                onClick={onCancel}
              >
                Cancel
              </button>
              <button
                className={`rounded-xl px-4 py-1.5 text-sm font-semibold text-white transition hover:-translate-y-[1px] ${danger ? "bg-[#ed4245] hover:bg-[#c0383b]" : "bg-[linear-gradient(180deg,var(--wc-active-top),var(--wc-active-bottom))] hover:brightness-110"}`}
                onClick={onConfirm}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};

export default ConfirmDialog;
