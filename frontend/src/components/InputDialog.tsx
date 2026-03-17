import { FormEvent, useEffect, useState } from "react";

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

  useEffect(() => {
    if (open) {
      setValue(initialValue);
    }
  }, [open, initialValue]);

  if (!open) {
    return null;
  }

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    void onConfirm(value.trim());
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onCancel}>
      <form className="w-full max-w-sm rounded-lg bg-[#2b2d31] p-4" onClick={(event) => event.stopPropagation()} onSubmit={submit}>
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
          <button type="button" onClick={onCancel} className="rounded px-3 py-1 text-sm text-discord-muted hover:text-white">
            Cancel
          </button>
          <button
            type="submit"
            className={`rounded px-3 py-1 text-sm font-semibold text-white ${danger ? "bg-[#ed4245] hover:bg-[#c0383b]" : "bg-discord-blurple hover:bg-[#4752c4]"}`}
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
};

export default InputDialog;
