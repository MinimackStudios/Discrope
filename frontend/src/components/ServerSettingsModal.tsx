import { FormEvent, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "../lib/api";
import { resolveMediaUrl } from "../lib/media";
import { useBackdropClose } from "../lib/useBackdropClose";
import type { Server, ServerMember } from "../types";
import AvatarCropModal from "./AvatarCropModal";
import StatusDot from "./StatusDot";

const SYSTEM_USERNAME = "Discrope";
const DEFAULT_AVATAR_URL = `${import.meta.env.BASE_URL}default-avatar.svg`;

type BannedUser = {
  userId: string;
  user: { id: string; username: string; nickname?: string; avatarUrl?: string | null; status?: "ONLINE" | "IDLE" | "DND" | "INVISIBLE" | "OFFLINE" };
};

type Props = {
  open: boolean;
  server: Server | null;
  isOwner: boolean;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onRegenerateInvite: (customCode?: string) => Promise<string | null>;
  onDelete: () => Promise<void>;
  onLeave: () => Promise<void>;
  onKick: (memberId: string) => void;
  onBan: (memberId: string) => void;
};

type Tab = "general" | "members" | "bans";

const ServerSettingsModal = ({ open, server, isOwner, onClose, onRefresh, onRegenerateInvite, onDelete, onLeave, onKick, onBan }: Props): JSX.Element | null => {
  const [name, setName] = useState(server?.name ?? "");
  const [inviteCode, setInviteCode] = useState(server?.inviteCode ?? "");
  const [icon, setIcon] = useState<File | null>(null);
  const [removeIcon, setRemoveIcon] = useState(false);
  const [iconEditorOpen, setIconEditorOpen] = useState(false);
  const [iconEditorSrc, setIconEditorSrc] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("general");
  const [bans, setBans] = useState<BannedUser[]>([]);
  const { onBackdropPointerDown, onBackdropClick } = useBackdropClose(onClose);

  useEffect(() => {
    setName(server?.name ?? "");
    setInviteCode(server?.inviteCode ?? "");
    setIcon(null);
    setRemoveIcon(false);
  }, [server?.id, server?.name, server?.inviteCode]);

  useEffect(() => {
    if (open && tab === "bans" && server?.id) {
      void api.get(`/servers/${server.id}/bans`).then(({ data }) => {
        setBans((data.bans as BannedUser[]) ?? []);
      });
    }
  }, [open, tab, server?.id]);

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!server) {
      return;
    }
    const formData = new FormData();
    formData.append("name", name || server.name);
    formData.append("removeIcon", removeIcon ? "true" : "false");
    if (icon) {
      formData.append("icon", icon);
    }
    await api.patch(`/servers/${server.id}`, formData, {
      headers: { "Content-Type": "multipart/form-data" }
    });
    await onRefresh();
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
    setRemoveIcon(false);
  };

  const unban = async (userId: string): Promise<void> => {
    if (!server) {
      return;
    }
    await api.delete(`/servers/${server.id}/bans/${userId}`);
    setBans((prev) => prev.filter((b) => b.userId !== userId));
  };

  const members = (server?.members ?? []) as ServerMember[];

  return (
    <AnimatePresence>
      {open && server && isOwner ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onPointerDown={onBackdropPointerDown}
          onClick={onBackdropClick}
        >
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.97 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="w-full max-w-lg rounded-lg bg-[#2b2d31]"
            onClick={(e) => e.stopPropagation()}
          >
        <div className="flex border-b border-black/20">
          {(["general", "members", "bans"] as Tab[]).map((t) => (
            <button
              key={t}
              className={`px-4 py-3 text-sm font-semibold capitalize ${tab === t ? "border-b-2 border-discord-blurple text-white" : "text-discord-muted hover:text-white"}`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
          <button className="ml-auto px-4 py-3 text-sm text-discord-muted hover:text-white" onClick={onClose}>✕</button>
        </div>

        <div className="p-4">
          {tab === "general" ? (
            <form onSubmit={save}>
              <h2 className="mb-3 text-lg font-semibold">Server Settings</h2>
              <label className="block text-xs text-discord-muted">
                Server Name
                <input className="mt-1 w-full rounded bg-[#1e1f22] px-2 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="mt-3 block text-xs text-discord-muted">
                Icon
                <input className="mt-1 w-full text-sm" type="file" accept="image/*" onChange={(e) => onIconPicked(e.target.files?.[0] ?? null)} />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded bg-[#3a3d45] px-2 py-1 text-xs text-white hover:bg-[#4a4e59]"
                    onClick={() => {
                      setIcon(null);
                      setRemoveIcon(true);
                    }}
                  >
                    Remove Icon
                  </button>
                  {icon ? <span className="text-[11px]">Edited icon ready.</span> : null}
                  {removeIcon ? <span className="text-[11px]">Icon will be removed on save.</span> : null}
                </div>
              </label>
              <label className="mt-3 block text-xs text-discord-muted">
                Invite Code
                <input
                  className="mt-1 w-full rounded bg-[#1e1f22] px-2 py-2 text-sm"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toLowerCase().replace(/\s+/g, ""))}
                  placeholder="my-server"
                  pattern="[a-z0-9-]{3,32}"
                  title="Use 3-32 lowercase letters, numbers, or hyphens."
                />
              </label>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded bg-[#3a3d45] px-3 py-1 text-xs text-white"
                  onClick={async () => {
                    const code = await onRegenerateInvite(inviteCode);
                    if (code) {
                      const link = `${window.location.origin}/invite/${code}`;
                      await navigator.clipboard.writeText(link);
                    }
                  }}
                >
                  Save + Copy Invite
                </button>
                <button type="button" className="rounded bg-[#ed4245] px-3 py-1 text-xs text-white" onClick={() => void onDelete()}>
                  Delete Server
                </button>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={onClose} className="text-sm text-discord-muted hover:text-white">Cancel</button>
                <button type="submit" className="rounded bg-discord-blurple px-3 py-1 text-sm font-semibold text-white">Save</button>
              </div>
            </form>
          ) : tab === "members" ? (
            <div>
              <h2 className="mb-3 text-lg font-semibold">Members</h2>
              <div className="space-y-2">
                {members.map((member) => (
                  <div key={member.userId} className="flex items-center gap-3 rounded bg-[#1e1f22] px-3 py-2">
                    <div className="relative h-8 w-8 shrink-0">
                      <img src={resolveMediaUrl(member.user.avatarUrl) || DEFAULT_AVATAR_URL} alt={member.user.username} className="h-8 w-8 rounded-full" />
                      <span className="absolute -bottom-0.5 -right-0.5">
                        <StatusDot status={member.user.status} sizeClassName="h-2.5 w-2.5" cutoutClassName="ring-2 ring-[#1e1f22]" />
                      </span>
                    </div>
                    <span className="flex-1 truncate text-sm text-white">{member.user.nickname || member.user.username}</span>
                    {member.userId !== server.ownerId && member.user.username !== SYSTEM_USERNAME ? (
                      <>
                        <button
                          className="rounded bg-[#3a3d45] px-2 py-1 text-xs text-white hover:bg-[#4a4e59]"
                          onClick={() => { onClose(); onKick(member.userId); }}
                        >
                          Kick
                        </button>
                        <button
                          className="rounded bg-[#ed4245] px-2 py-1 text-xs text-white hover:bg-[#c0383b]"
                          onClick={() => { onClose(); onBan(member.userId); }}
                        >
                          Ban
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-discord-muted">Owner</span>
                    )}
                  </div>
                ))}
                {!members.length ? <p className="text-sm text-discord-muted">No members</p> : null}
              </div>
            </div>
          ) : (
            <div>
              <h2 className="mb-3 text-lg font-semibold">Banned Members</h2>
              <div className="space-y-2">
                {bans.map((ban) => (
                  <div key={ban.userId} className="flex items-center gap-3 rounded bg-[#1e1f22] px-3 py-2">
                    <div className="relative h-8 w-8 shrink-0">
                      <img src={resolveMediaUrl(ban.user.avatarUrl) || DEFAULT_AVATAR_URL} alt={ban.user.username} className="h-8 w-8 rounded-full" />
                      <span className="absolute -bottom-0.5 -right-0.5">
                        <StatusDot status={ban.user.status ?? "OFFLINE"} sizeClassName="h-2.5 w-2.5" cutoutClassName="ring-2 ring-[#1e1f22]" />
                      </span>
                    </div>
                    <span className="flex-1 truncate text-sm text-white">{ban.user.nickname || ban.user.username}</span>
                    <button
                      className="rounded bg-[#23a55a] px-2 py-1 text-xs text-white hover:bg-[#1a8546]"
                      onClick={() => void unban(ban.userId)}
                    >
                      Unban
                    </button>
                  </div>
                ))}
                {!bans.length ? <p className="text-sm text-discord-muted">No banned members</p> : null}
              </div>
            </div>
          )}
        </div>

        <AvatarCropModal
          open={iconEditorOpen}
          imageSrc={iconEditorSrc}
          title="Edit Server Icon"
          cropShape="rect"
          outputFileName="server-icon.png"
          onClose={() => setIconEditorOpen(false)}
          onApply={(file) => {
            setIcon(file);
            setRemoveIcon(false);
          }}
        />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};

export default ServerSettingsModal;
