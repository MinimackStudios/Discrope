import { FormEvent, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useBackdropClose } from "../lib/useBackdropClose";

type Props = {
  open: boolean;
  title: string;
  message?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: (value: string) => void | Promise<void>;
};

const InputDialog = ({
  open,
  title,
  message,
  placeholder,
  initialValue = "",
  confirmLabel = "Confirm",
  danger = false,
  onCancel,
  onConfirm
}: Props): JSX.Element | null => {
  const [value, setValue] = useState(initialValue);
  const { onBackdropPointerDown, onBackdropClick } = useBackdropClose(onCancel);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
    }
  }, [open, initialValue]);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    void onConfirm(value.trim());
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
          <motion.form
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="w-full max-w-sm rounded-lg bg-[#2b2d31] p-4"
            onClick={(event) => event.stopPropagation()}
            onSubmit={submit}
          >
            <h2 className="text-lg font-semibold">{title}</h2>
            {message ? <p className="mt-1 text-sm text-discord-muted">{message}</p> : null}

            <input
              className="mt-3 w-full rounded bg-[#1e1f22] px-3 py-2 text-sm text-white outline-none ring-1 ring-transparent focus:ring-discord-blurple"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={placeholder}
              autoFocus
            />

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={onCancel} className="rounded px-3 py-1 text-sm text-discord-muted hover:-translate-y-[1px] hover:text-white">
                Cancel
              </button>
              <button
                type="submit"
                className={`rounded px-3 py-1 text-sm font-semibold text-white hover:-translate-y-[1px] ${danger ? "bg-[#ed4245] hover:bg-[#c0383b]" : "bg-discord-blurple hover:bg-[#4752c4]"}`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.form>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};

export default InputDialog;
