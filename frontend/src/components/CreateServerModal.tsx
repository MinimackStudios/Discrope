import { FormEvent, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "../lib/api";
import { useBackdropClose } from "../lib/useBackdropClose";
import AvatarCropModal from "./AvatarCropModal";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
};

const CreateServerModal = ({ open, onClose, onCreated }: Props): JSX.Element | null => {
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [icon, setIcon] = useState<File | null>(null);
  const [iconEditorOpen, setIconEditorOpen] = useState(false);
  const [iconEditorSrc, setIconEditorSrc] = useState<string | null>(null);
  const { onBackdropPointerDown, onBackdropClick } = useBackdropClose(onClose);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const formData = new FormData();
    formData.append("name", name);
    if (inviteCode.trim()) {
      formData.append("inviteCode", inviteCode.trim().toLowerCase());
    }
    if (icon) {
      formData.append("icon", icon);
    }
    await api.post("/servers", formData, { headers: { "Content-Type": "multipart/form-data" } });
    if (iconEditorSrc) {
      URL.revokeObjectURL(iconEditorSrc);
      setIconEditorSrc(null);
    }
    await onCreated();
    onClose();
  };

  const onIconPicked = (file: File | null): void => {
    if (!file) {
      return;
    }
    if (iconEditorSrc) {
      URL.revokeObjectURL(iconEditorSrc);
    }
    const src = URL.createObjectURL(file);
    setIconEditorSrc(src);
    setIconEditorOpen(true);
  };

  return (
    <>
      <AnimatePresence>
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
            <motion.form
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.97 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              onSubmit={submit}
              className="wc-modal-card w-full max-w-sm rounded-[24px] p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold">Create Your Server</h2>
              <input
                className="mt-3 w-full rounded-2xl border border-white/[0.06] bg-black/20 px-3 py-2 text-sm"
                placeholder="Server Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <input
                className="mt-2 w-full rounded-2xl border border-white/[0.06] bg-black/20 px-3 py-2 text-sm"
                placeholder="Custom Invite Code (optional)"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toLowerCase().replace(/\s+/g, ""))}
                pattern="[a-z0-9-]{3,12}"
                title="Use 3-12 lowercase letters, numbers, or hyphens."
                maxLength={12}
              />
              <input className="mt-3 w-full text-sm text-discord-muted file:mr-3 file:rounded-xl file:border-0 file:bg-white/[0.08] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-white/[0.12]" type="file" accept="image/*" onChange={(e) => onIconPicked(e.target.files?.[0] ?? null)} />
              {icon ? <p className="mt-1 text-[11px] text-discord-muted">Edited icon ready.</p> : null}
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={onClose} className="rounded-xl px-3 py-1.5 text-sm text-discord-muted transition hover:bg-white/[0.05] hover:text-white">
                  Cancel
                </button>
                <button type="submit" className="rounded-xl bg-[linear-gradient(180deg,var(--wc-active-top),var(--wc-active-bottom))] px-3 py-1.5 text-sm font-semibold text-white transition hover:-translate-y-[1px] hover:brightness-110">
                  Create
                </button>
              </div>
            </motion.form>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <AvatarCropModal
        open={iconEditorOpen}
        imageSrc={iconEditorSrc}
        title="Edit Server Icon"
        cropShape="rect"
        outputFileName="server-icon.png"
        onClose={() => setIconEditorOpen(false)}
        onApply={(file) => setIcon(file)}
      />
    </>
  );
};

export default CreateServerModal;
