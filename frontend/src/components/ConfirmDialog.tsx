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
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/60 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-lg bg-[#313338] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {title ? <h3 className="mb-2 text-base font-bold text-white">{title}</h3> : null}
        <p className="text-sm text-discord-muted">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            className="rounded px-4 py-1.5 text-sm text-discord-muted hover:text-white"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className={`rounded px-4 py-1.5 text-sm font-semibold text-white ${danger ? "bg-[#ed4245] hover:bg-[#c0383b]" : "bg-discord-blurple hover:bg-[#4752c4]"}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
