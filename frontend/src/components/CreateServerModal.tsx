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
            className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
            onPointerDown={onBackdropPointerDown}
            onClick={onBackdropClick}
          >
            <motion.form
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.97 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              onSubmit={submit}
              className="w-full max-w-sm rounded-lg bg-[#2b2d31] p-4 shadow-[0_28px_90px_rgba(0,0,0,0.44)]"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold">Create Your Server</h2>
              <input
                className="mt-3 w-full rounded bg-[#1e1f22] px-3 py-2 text-sm"
                placeholder="Server Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <input
                className="mt-2 w-full rounded bg-[#1e1f22] px-3 py-2 text-sm"
                placeholder="Custom Invite Code (optional)"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toLowerCase().replace(/\s+/g, ""))}
                pattern="[a-z0-9-]{3,32}"
                title="Use 3-32 lowercase letters, numbers, or hyphens."
              />
              <input className="mt-2 w-full text-sm" type="file" accept="image/*" onChange={(e) => onIconPicked(e.target.files?.[0] ?? null)} />
              {icon ? <p className="mt-1 text-[11px] text-discord-muted">Edited icon ready.</p> : null}
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={onClose} className="text-sm text-discord-muted hover:-translate-y-[1px] hover:text-white">
                  Cancel
                </button>
                <button type="submit" className="rounded bg-discord-blurple px-3 py-1 text-sm font-semibold text-white hover:-translate-y-[1px]">
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
