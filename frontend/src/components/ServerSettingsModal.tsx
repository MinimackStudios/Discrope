import { FormEvent, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "../lib/api";
import { resolveMediaUrl, resolveUserAvatarUrl } from "../lib/media";
import { useBackdropClose } from "../lib/useBackdropClose";
import type { Server, ServerMember, MemberPermissions } from "../types";
import AvatarCropModal from "./AvatarCropModal";
import StatusDot from "./StatusDot";

const SYSTEM_USERNAME = "Windcord";
type BannedUser = {
  userId: string;
  user: { id: string; username: string; nickname?: string; avatarUrl?: string | null; isDeleted?: boolean; status?: "ONLINE" | "IDLE" | "DND" | "INVISIBLE" | "OFFLINE" };
};

type Props = {
  open: boolean;
  server: Server | null;
  isOwner: boolean;
  canViewBans?: boolean;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onRegenerateInvite: (customCode?: string) => Promise<string | null>;
  onDelete: () => Promise<void>;
  onLeave: () => Promise<void>;
  onKick: (memberId: string) => void;
  onBan: (memberId: string) => void;
};

type Tab = "general" | "members" | "bans";

const DEFAULT_PERMISSIONS: MemberPermissions = {
  kickMembers: false,
  banMembers: false,
  manageChannels: false,
  manageMessages: false
};

const PERMISSION_OPTIONS: { key: keyof MemberPermissions; label: string; description: string }[] = [
  { key: "kickMembers", label: "Kick Members", description: "Can kick members from the server" },
  { key: "banMembers", label: "Ban Members", description: "Can ban/unban members and view ban list" },
  { key: "manageChannels", label: "Manage Channels", description: "Can create, edit, and delete channels" },
  { key: "manageMessages", label: "Manage Messages", description: "Can delete others' messages" }
];

const ServerSettingsModal = ({ open, server, isOwner, canViewBans = false, onClose, onRefresh, onRegenerateInvite, onDelete, onLeave, onKick, onBan }: Props): JSX.Element | null => {
  const [name, setName] = useState(server?.name ?? "");
  const [description, setDescription] = useState(server?.description ?? "");
  const [inviteCode, setInviteCode] = useState(server?.inviteCode ?? "");
  const [icon, setIcon] = useState<File | null>(null);
  const [removeIcon, setRemoveIcon] = useState(false);
  const [iconEditorOpen, setIconEditorOpen] = useState(false);
  const [iconEditorSrc, setIconEditorSrc] = useState<string | null>(null);
  const [bannerImage, setBannerImage] = useState<File | null>(null);
  const [removeBannerImage, setRemoveBannerImage] = useState(false);
  const [bannerEditorOpen, setBannerEditorOpen] = useState(false);
  const [bannerEditorSrc, setBannerEditorSrc] = useState<string | null>(null);
  const [bannerEditorFile, setBannerEditorFile] = useState<File | null>(null);
  const [bannerPreviewUrl, setBannerPreviewUrl] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("general");
  const [bans, setBans] = useState<BannedUser[]>([]);
  const [permissionsModalOpen, setPermissionsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<ServerMember | null>(null);
  const [memberPermissions, setMemberPermissions] = useState<MemberPermissions>(DEFAULT_PERMISSIONS);
  const { onBackdropPointerDown, onBackdropClick } = useBackdropClose(onClose);
  const settingsInputClass = "wc-input-surface mt-1 w-full rounded-xl px-3 py-2 text-sm text-white";

  const canAccess = isOwner || canViewBans;
  const visibleTabs = isOwner ? (["general", "members", "bans"] as Tab[]) : (["bans"] as Tab[]);
  const bannerDisplayUrl = removeBannerImage ? null : (bannerPreviewUrl ?? resolveMediaUrl(server?.bannerImageUrl) ?? null);
  const bannerStyle = bannerDisplayUrl
    ? {
        backgroundImage: `linear-gradient(180deg, rgba(10,12,16,0.14), rgba(10,12,16,0.38)), url(${bannerDisplayUrl})`,
        backgroundPosition: "center",
        backgroundSize: "cover"
      }
    : {
        background: "linear-gradient(135deg, color-mix(in srgb, var(--wc-active-top) 68%, white 24%), var(--wc-active-bottom))"
      };

  useEffect(() => {
    if (!bannerImage) {
      setBannerPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(bannerImage);
    setBannerPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [bannerImage]);

  useEffect(() => {
    setName(server?.name ?? "");
    setDescription(server?.description ?? "");
    setInviteCode(server?.inviteCode ?? "");
    setIcon(null);
    setRemoveIcon(false);
    setBannerImage(null);
    setRemoveBannerImage(false);
    if (isOwner) {
      setTab("general");
    } else if (canViewBans) {
      setTab("bans");
    }
  }, [server?.id, server?.name, server?.description, server?.inviteCode, server?.bannerImageUrl, isOwner, canViewBans]);

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
    formData.append("description", description.trim());
    formData.append("removeIcon", removeIcon ? "true" : "false");
    formData.append("removeBannerImage", removeBannerImage ? "true" : "false");
    if (icon) {
      formData.append("icon", icon);
    }
    if (bannerImage) {
      formData.append("bannerImage", bannerImage);
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

  const onBannerPicked = (file: File | null): void => {
    if (!file) {
      return;
    }
    if (bannerEditorSrc) {
      URL.revokeObjectURL(bannerEditorSrc);
    }
    const src = URL.createObjectURL(file);
    setBannerEditorSrc(src);
    setBannerEditorFile(file);
    setBannerEditorOpen(true);
    setRemoveBannerImage(false);
  };

  const clearBannerImage = (): void => {
    if (bannerEditorSrc) {
      URL.revokeObjectURL(bannerEditorSrc);
      setBannerEditorSrc(null);
    }
    setBannerEditorFile(null);
    setBannerImage(null);
    setRemoveBannerImage(true);
  };

  const unban = async (userId: string): Promise<void> => {
    if (!server) {
      return;
    }
    await api.delete(`/servers/${server.id}/bans/${userId}`);
    setBans((prev) => prev.filter((b) => b.userId !== userId));
  };

  const openPermissionsEditor = (member: ServerMember): void => {
    setEditingMember(member);
    try {
      const perms = JSON.parse(member.permissions || "{}");
      setMemberPermissions({ ...DEFAULT_PERMISSIONS, ...perms });
    } catch {
      setMemberPermissions({ ...DEFAULT_PERMISSIONS });
    }
    setPermissionsModalOpen(true);
  };

  const savePermissions = async (): Promise<void> => {
    if (!editingMember || !server) return;
    try {
      await api.patch(`/servers/${server.id}/members/${editingMember.userId}/permissions`, memberPermissions);
      await onRefresh();
      setPermissionsModalOpen(false);
      setEditingMember(null);
    } catch (error: any) {
      console.error("Failed to update permissions:", error);
      alert(error.response?.data?.message || "Failed to update permissions");
    }
  };

  const members = (server?.members ?? []) as ServerMember[];

  return (
    <AnimatePresence>
      {open && server && canAccess ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="fixed inset-0 z-50 grid place-items-center bg-[rgba(6,8,12,0.74)] p-4 backdrop-blur-sm"
          onPointerDown={onBackdropPointerDown}
          onClick={onBackdropClick}
        >
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.97 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="wc-modal-card flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[26px]"
            onClick={(e) => e.stopPropagation()}
          >
        <div className="flex border-b border-white/[0.04] bg-black/10">
          {visibleTabs.map((t) => (
            <button
              key={t}
              className={`px-4 py-3 text-sm font-semibold capitalize transition ${tab === t ? "border-b-2 border-[rgba(255,255,255,0.5)] text-white" : "text-discord-muted hover:text-white"}`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
          <button className="ml-auto px-4 py-3 text-sm text-discord-muted hover:text-white" onClick={onClose}>✕</button>
        </div>

        <div className="discord-scrollbar min-h-0 flex-1 overflow-y-auto p-5">
          {tab === "general" ? (
            <form onSubmit={save}>
              <h2 className="mb-3 text-lg font-semibold">Server Settings</h2>
              <label className="block text-xs text-discord-muted">
                Server Name
                <input className={settingsInputClass} value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="mt-3 block text-xs text-discord-muted">
                Server Description
                <textarea
                  className={`${settingsInputClass} min-h-[88px] resize-y`}
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 240))}
                  placeholder="Give your server a quick description for invites and previews."
                  maxLength={240}
                />
                <div className="mt-1 text-[11px] text-discord-muted">{description.length}/240</div>
              </label>
              <label className="mt-3 block text-xs text-discord-muted">
                Server Banner
                <div className="mt-2 overflow-hidden rounded-[22px] border border-white/[0.06]">
                  <div className="h-28 w-full" style={bannerStyle} />
                </div>
                <input className="mt-2 w-full text-sm text-discord-muted file:mr-3 file:rounded-xl file:border-0 file:bg-white/[0.08] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-white/[0.12]" type="file" accept="image/*" onChange={(e) => onBannerPicked(e.target.files?.[0] ?? null)} />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-xl bg-white/[0.08] px-2.5 py-1.5 text-xs text-white hover:bg-white/[0.12]"
                    onClick={clearBannerImage}
                  >
                    Remove Banner
                  </button>
                  {bannerImage ? <span className="text-[11px]">Edited banner ready.</span> : null}
                  {removeBannerImage ? <span className="text-[11px]">Banner will be removed on save.</span> : null}
                </div>
              </label>
              <label className="mt-3 block text-xs text-discord-muted">
                Icon
                <input className="mt-2 w-full text-sm text-discord-muted file:mr-3 file:rounded-xl file:border-0 file:bg-white/[0.08] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-white/[0.12]" type="file" accept="image/*" onChange={(e) => onIconPicked(e.target.files?.[0] ?? null)} />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-xl bg-white/[0.08] px-2.5 py-1.5 text-xs text-white hover:bg-white/[0.12]"
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
                  className={settingsInputClass}
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toLowerCase().replace(/\s+/g, ""))}
                  placeholder="my-server"
                  pattern="[a-z0-9-]{3,12}"
                  title="Use 3-12 lowercase letters, numbers, or hyphens."
                  maxLength={12}
                />
              </label>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-xl bg-white/[0.08] px-3 py-1.5 text-xs text-white"
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
                <button type="button" className="rounded-xl bg-[#ed4245] px-3 py-1.5 text-xs text-white" onClick={() => void onDelete()}>
                  Delete Server
                </button>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={onClose} className="rounded-xl px-3 py-1.5 text-sm text-discord-muted hover:bg-white/[0.05] hover:text-white">Cancel</button>
                <button type="submit" className="rounded-xl bg-[linear-gradient(180deg,var(--wc-active-top),var(--wc-active-bottom))] px-3 py-1.5 text-sm font-semibold text-white">Save</button>
              </div>
            </form>
          ) : tab === "members" ? (
            <div>
              <h2 className="mb-3 text-lg font-semibold">Members</h2>
              <div className="space-y-2">
                {members.map((member) => (
                  <div key={member.userId} className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-black/20 px-3 py-2.5">
                    <div className="relative h-8 w-8 shrink-0">
                      <img src={resolveUserAvatarUrl(member.user)} alt={member.user.username} className="h-8 w-8 rounded-full" />
                      <span className="absolute -bottom-0.5 -right-0.5">
                        <StatusDot status={member.user.status} sizeClassName="h-2.5 w-2.5" cutoutColor="var(--wc-profile-cutout)" ringColor="var(--wc-profile-cutout)" ringWidth={2} />
                      </span>
                    </div>
                    <span className="flex-1 truncate text-sm text-white">{member.user.nickname || member.user.username}</span>
                    {member.userId !== server.ownerId && member.user.username !== SYSTEM_USERNAME ? (
                      <>
                        <button
                          className="rounded-xl bg-[linear-gradient(180deg,var(--wc-active-top),var(--wc-active-bottom))] px-2.5 py-1.5 text-xs text-white hover:brightness-110"
                          onClick={() => openPermissionsEditor(member)}
                        >
                          Permissions
                        </button>
                        <button
                          className="rounded-xl bg-white/[0.08] px-2.5 py-1.5 text-xs text-white hover:bg-white/[0.12]"
                          onClick={() => { onClose(); onKick(member.userId); }}
                        >
                          Kick
                        </button>
                        <button
                          className="rounded-xl bg-[#ed4245] px-2.5 py-1.5 text-xs text-white hover:bg-[#c0383b]"
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
                  <div key={ban.userId} className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-black/20 px-3 py-2.5">
                    <div className="relative h-8 w-8 shrink-0">
                      <img src={resolveUserAvatarUrl(ban.user)} alt={ban.user.username} className="h-8 w-8 rounded-full" />
                      <span className="absolute -bottom-0.5 -right-0.5">
                        <StatusDot status={ban.user.status ?? "OFFLINE"} sizeClassName="h-2.5 w-2.5" cutoutColor="var(--wc-profile-cutout)" ringColor="var(--wc-profile-cutout)" ringWidth={2} />
                      </span>
                    </div>
                    <span className="flex-1 truncate text-sm text-white">{ban.user.nickname || ban.user.username}</span>
                    <button
                      className="rounded-xl bg-[#23a55a] px-2.5 py-1.5 text-xs text-white hover:bg-[#1a8546]"
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

        <AvatarCropModal
          open={bannerEditorOpen}
          imageSrc={bannerEditorSrc}
          sourceFile={bannerEditorFile}
          title="Edit Server Banner"
          cropShape="rect"
          aspect={4}
          outputWidth={1200}
          outputHeight={300}
          outputFileName={bannerEditorFile?.type === "image/gif" ? "server-banner.gif" : "server-banner.png"}
          onClose={() => setBannerEditorOpen(false)}
          onApply={(file) => {
            setBannerImage(file);
            setRemoveBannerImage(false);
          }}
        />

        {/* Permissions Editor Modal */}
        <AnimatePresence>
          {permissionsModalOpen && editingMember && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] grid place-items-center bg-[rgba(6,8,12,0.74)] p-4 backdrop-blur-sm"
              onClick={() => setPermissionsModalOpen(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="wc-modal-card w-full max-w-md rounded-[24px] p-6"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="mb-4 flex items-center gap-3">
                  <div className="relative h-10 w-10">
                    <img src={resolveUserAvatarUrl(editingMember.user)} alt={editingMember.user.username} className="h-10 w-10 rounded-full" />
                    <span className="absolute -bottom-0.5 -right-0.5">
                      <StatusDot status={editingMember.user.status} sizeClassName="h-3 w-3" cutoutColor="var(--wc-profile-cutout)" ringColor="var(--wc-profile-cutout)" ringWidth={2} />
                    </span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">{editingMember.user.nickname || editingMember.user.username}</h3>
                    <p className="text-xs text-discord-muted">Edit permissions</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {PERMISSION_OPTIONS.map((option) => (
                    <label key={option.key} className="flex cursor-pointer items-center justify-between rounded-2xl border border-white/[0.06] bg-black/20 px-3 py-2.5 hover:bg-white/[0.04]">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-white">{option.label}</div>
                        <div className="text-[11px] text-discord-muted">{option.description}</div>
                      </div>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-discord-blurple"
                        checked={memberPermissions[option.key] || false}
                        onChange={(e) => setMemberPermissions((prev) => ({ ...prev, [option.key]: e.target.checked }))}
                      />
                    </label>
                  ))}
                </div>

                <div className="mt-6 flex justify-end gap-2">
                  <button
                    className="rounded-xl px-4 py-1.5 text-sm text-discord-muted hover:bg-white/[0.05] hover:text-white"
                    onClick={() => setPermissionsModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="rounded-xl bg-[linear-gradient(180deg,var(--wc-active-top),var(--wc-active-bottom))] px-4 py-1.5 text-sm font-semibold text-white hover:brightness-110"
                    onClick={savePermissions}
                  >
                    Save
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};

export default ServerSettingsModal;
