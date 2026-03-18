import { FormEvent, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "../lib/api";
import { useBackdropClose } from "../lib/useBackdropClose";
import type { ChannelCategory } from "../types";

type Props = {
  open: boolean;
  serverId: string | null;
  categories: ChannelCategory[];
  onClose: () => void;
  onCreated: () => Promise<void>;
};

const CreateChannelModal = ({ open, serverId, categories, onClose, onCreated }: Props): JSX.Element | null => {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const { onBackdropPointerDown, onBackdropClick } = useBackdropClose(onClose);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    await api.post(`/chat/servers/${serverId}/channels`, {
      name,
      type: "TEXT",
      categoryId: categoryId || undefined
    });
    await onCreated();
    onClose();
  };

  return (
    <AnimatePresence>
      {open && serverId ? (
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
            <h2 className="text-lg font-semibold">Create Channel</h2>
            <input
              className="mt-3 w-full rounded bg-[#1e1f22] px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="new-channel"
              required
            />
            <select
              className="mt-2 w-full rounded bg-[#1e1f22] px-3 py-2 text-sm"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">No Category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>

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
  );
};

export default CreateChannelModal;
