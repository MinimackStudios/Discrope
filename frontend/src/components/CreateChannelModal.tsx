import { FormEvent, useState } from "react";
import { api } from "../lib/api";
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
  const [type, setType] = useState<"TEXT" | "VOICE">("TEXT");
  const [categoryId, setCategoryId] = useState<string>("");

  if (!open || !serverId) {
    return null;
  }

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    await api.post(`/chat/servers/${serverId}/channels`, {
      name,
      type,
      categoryId: categoryId || undefined
    });
    await onCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg bg-[#2b2d31] p-4" onClick={(e) => e.stopPropagation()}>
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
          value={type}
          onChange={(e) => setType(e.target.value as "TEXT" | "VOICE")}
        >
          <option value="TEXT">Text</option>
          <option value="VOICE">Voice</option>
        </select>
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
          <button type="button" onClick={onClose} className="text-sm text-discord-muted hover:text-white">
            Cancel
          </button>
          <button type="submit" className="rounded bg-discord-blurple px-3 py-1 text-sm font-semibold text-white">
            Create
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateChannelModal;
