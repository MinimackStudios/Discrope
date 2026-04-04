import { FormEvent, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Pencil, Pipette } from "lucide-react";
import { api } from "../lib/api";
import { useBackdropClose } from "../lib/useBackdropClose";
import { useAuthStore } from "../lib/stores/authStore";
import { getNotifSoundPref, setNotifSoundPref } from "../lib/stores/chatStore";
import { resolveMediaUrl, resolveUserAvatarUrl } from "../lib/media";
import type { UserStatus } from "../types";
import AvatarCropModal from "./AvatarCropModal";

type Tab = "profile" | "account" | "security";

type Props = {
  open: boolean;
  onClose: () => void;
};

const SettingsModal = ({ open, onClose }: Props): JSX.Element | null => {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const regenerateRecoveryCode = useAuthStore((s) => s.regenerateRecoveryCode);

  const [tab, setTab] = useState<Tab>("profile");
  const [username, setUsername] = useState(user?.username ?? "");
  const [nickname, setNickname] = useState(user?.nickname ?? "");
  const [status, setStatus] = useState<UserStatus>((user?.status as UserStatus) ?? "ONLINE");
  const [aboutMe, setAboutMe] = useState(user?.aboutMe ?? "");
  const [customStatus, setCustomStatus] = useState(user?.customStatus ?? "");
  const [bannerColor, setBannerColor] = useState(user?.bannerColor ?? "#5865f2");
  const [accentColor, setAccentColor] = useState(user?.accentColor ?? "");
  const [avatar, setAvatar] = useState<File | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);
  const [avatarEditorSrc, setAvatarEditorSrc] = useState<string | null>(null);
  const [avatarEditorFile, setAvatarEditorFile] = useState<File | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [notifSound, setNotifSound] = useState<"default" | "alt">(() => getNotifSoundPref());
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [bannerImage, setBannerImage] = useState<File | null>(null);
  const [removeBannerImage, setRemoveBannerImage] = useState(false);
  const [bannerEditorOpen, setBannerEditorOpen] = useState(false);
  const [bannerEditorSrc, setBannerEditorSrc] = useState<string | null>(null);
  const [bannerEditorFile, setBannerEditorFile] = useState<File | null>(null);
  const [bannerPreviewUrl, setBannerPreviewUrl] = useState<string | null>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const bannerFileInputRef = useRef<HTMLInputElement>(null);
  const { onBackdropPointerDown, onBackdropClick } = useBackdropClose(onClose);

  const hasEyeDropper = typeof window !== "undefined" && "EyeDropper" in window;

  useEffect(() => {
    if (!avatar) { setAvatarPreviewUrl(null); return; }
    const url = URL.createObjectURL(avatar);
    setAvatarPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [avatar]);

  useEffect(() => {
    if (!bannerImage) { setBannerPreviewUrl(null); return; }
    const url = URL.createObjectURL(bannerImage);
    setBannerPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [bannerImage]);

  useEffect(() => {
    setUsername(user?.username ?? "");
    setNickname(user?.nickname ?? "");
    setStatus((user?.status as UserStatus) ?? "ONLINE");
    setAboutMe(user?.aboutMe ?? "");
    setCustomStatus(user?.customStatus ?? "");
    setBannerColor(user?.bannerColor ?? "#5865f2");
    setAccentColor(user?.accentColor ?? "");
    setAvatar(null);
    setRemoveAvatar(false);
    setBannerImage(null);
    setRemoveBannerImage(false);
    setRecoveryCode(null);
    setRecoveryError(null);
  }, [user?.id, user?.username, user?.nickname, user?.status, user?.aboutMe, user?.customStatus, user?.bannerColor, user?.accentColor, user?.bannerImageUrl]);

  useEffect(() => {
    if (open) setSaved(false);
  }, [open]);

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setSaved(false);
    const formData = new FormData();
    formData.append("username", username);
    formData.append("nickname", nickname);
    formData.append("status", status);
    formData.append("aboutMe", aboutMe);
    formData.append("customStatus", customStatus);
    formData.append("bannerColor", bannerColor);
    formData.append("accentColor", accentColor);
    formData.append("removeAvatar", removeAvatar ? "true" : "false");
    formData.append("removeBannerImage", removeBannerImage ? "true" : "false");
    if (avatar) formData.append("avatar", avatar);
    if (bannerImage) formData.append("bannerImage", bannerImage);

    const { data } = await api.patch("/users/me", formData, {
      headers: { "Content-Type": "multipart/form-data" }
    });
    setUser(data.user);
    setNotifSoundPref(notifSound);
    if (avatarEditorSrc) { URL.revokeObjectURL(avatarEditorSrc); setAvatarEditorSrc(null); }
    setAvatarEditorFile(null);
    setAvatar(null);
    setRemoveAvatar(false);
    if (bannerEditorSrc) { URL.revokeObjectURL(bannerEditorSrc); setBannerEditorSrc(null); }
    setBannerEditorFile(null);
    setBannerImage(null);
    setRemoveBannerImage(false);
    setSaved(true);
  };

  const onAvatarPicked = (file: File | null): void => {
    if (!file) return;
    if (avatarEditorSrc) URL.revokeObjectURL(avatarEditorSrc);
    const src = URL.createObjectURL(file);
    setAvatarEditorSrc(src);
    setAvatarEditorFile(file);
    setRemoveAvatar(false);
    setAvatarEditorOpen(true);
  };

  const clearAvatarSelection = (): void => {
    if (avatarEditorSrc) { URL.revokeObjectURL(avatarEditorSrc); setAvatarEditorSrc(null); }
    setAvatarEditorFile(null);
    setAvatar(null);
    setRemoveAvatar(true);
  };

  const onBannerImagePicked = (file: File | null): void => {
    if (!file) return;
    if (bannerEditorSrc) URL.revokeObjectURL(bannerEditorSrc);
    const src = URL.createObjectURL(file);
    setBannerEditorSrc(src);
    setBannerEditorFile(file);
    setRemoveBannerImage(false);
    setBannerEditorOpen(true);
  };

  const clearBannerImage = (): void => {
    if (bannerEditorSrc) { URL.revokeObjectURL(bannerEditorSrc); setBannerEditorSrc(null); }
    setBannerEditorFile(null);
    setBannerImage(null);
    setRemoveBannerImage(true);
  };

  const onDeleteAccount = async (): Promise<void> => {
    try { setDeleting(true); await api.delete("/users/me"); await logout(); }
    finally { setDeleting(false); }
  };

  const onGenerateRecoveryCode = async (): Promise<void> => {
    try {
      setRecoveryBusy(true); setRecoveryError(null);
      const code = await regenerateRecoveryCode();
      setRecoveryCode(code);
    } catch (error) {
      setRecoveryError(error instanceof Error ? error.message : "Could not generate a new recovery key.");
    } finally { setRecoveryBusy(false); }
  };

  const pickColorWithEyeDropper = async (target: "banner" | "accent" = "banner"): Promise<void> => {
    try {
      // @ts-expect-error EyeDropper is not in TS lib yet
      const dropper = new window.EyeDropper() as { open: () => Promise<{ sRGBHex: string }> };
      const result = await dropper.open();
      if (target === "accent") setAccentColor(result.sRGBHex);
      else setBannerColor(result.sRGBHex);
    } catch { /* cancelled */ }
  };

  const NAV: { id: Tab; label: string }[] = [
    { id: "profile", label: "My Profile" },
    { id: "account", label: "Account" },
    { id: "security", label: "Security" },
  ];

  return (
    <>
      <AnimatePresence>
        {open && user ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onPointerDown={onBackdropPointerDown}
            onClick={onBackdropClick}
          >
            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 14, scale: 0.97 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="flex w-full max-w-2xl overflow-hidden rounded-xl bg-[#2b2d31] shadow-[0_28px_90px_rgba(0,0,0,0.44)]"
              style={{ maxHeight: "calc(100vh - 2rem)" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Sidebar */}
              <div className="w-44 shrink-0 bg-[#232428] p-3">
                <p className="mb-1 px-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-discord-muted">User Settings</p>
                {NAV.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => setTab(n.id)}
                    className={`mt-0.5 w-full rounded px-2 py-1.5 text-left text-sm font-medium transition-colors ${tab === n.id ? "bg-[#3a3d45] text-white" : "text-discord-muted hover:bg-[#2f3136] hover:text-white"}`}
                  >
                    {n.label}
                  </button>
                ))}
              </div>

              {/* Content */}
              <form onSubmit={onSubmit} className="discord-scrollbar flex min-w-0 flex-1 flex-col overflow-y-auto p-6">

                {/* MY PROFILE */}
                {tab === "profile" && (
                  <>
                    <h2 className="mb-4 text-lg font-semibold">My Profile</h2>

                    {/* Banner preview */}
                    <div className="mb-4 overflow-hidden rounded-lg">
                      <div className="group relative h-20 w-full cursor-pointer" onClick={() => bannerFileInputRef.current?.click()}>
                        {bannerPreviewUrl
                          ? <img src={bannerPreviewUrl} alt="" className="h-full w-full object-cover" />
                          : user.bannerImageUrl && !removeBannerImage
                          ? <img src={resolveMediaUrl(user.bannerImageUrl) ?? ""} alt="" className="h-full w-full object-cover" />
                          : <div className="h-full w-full" style={{ backgroundColor: bannerColor }} />
                        }
                        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/50">
                          <Pencil size={18} className="text-white opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>
                        <input
                          ref={bannerFileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => { onBannerImagePicked(e.target.files?.[0] ?? null); e.target.value = ""; }}
                        />
                      </div>
                      <div className="flex items-center gap-3 bg-[#232428] px-4 pb-3 pt-2">
                        <div className="-mt-8 flex shrink-0 flex-col items-center gap-1">
                          <button
                            type="button"
                            onClick={() => avatarFileInputRef.current?.click()}
                            className="group relative rounded-full"
                            title="Change avatar"
                          >
                            <img
                              src={avatarPreviewUrl ?? resolveUserAvatarUrl(user)}
                              alt={user.nickname || user.username}
                              className="h-16 w-16 rounded-full border-4 border-[#232428]"
                            />
                            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 transition-colors group-hover:bg-black/50">
                              <Pencil size={15} className="text-white opacity-0 transition-opacity group-hover:opacity-100" />
                            </div>
                          </button>
                          <input
                            ref={avatarFileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => { onAvatarPicked(e.target.files?.[0] ?? null); e.target.value = ""; }}
                          />
                          {(avatar !== null || (user.avatarUrl && !removeAvatar)) ? (
                            <button
                              type="button"
                              onClick={clearAvatarSelection}
                              className="text-[10px] text-discord-muted hover:text-[#ed4245] transition-colors"
                            >
                              Remove
                            </button>
                          ) : null}
                          {removeAvatar ? (
                            <button
                              type="button"
                              onClick={() => setRemoveAvatar(false)}
                              className="text-[10px] text-discord-muted hover:text-white transition-colors"
                            >
                              Undo
                            </button>
                          ) : null}
                        </div>
                        <div>
                          <p className="font-semibold text-white">{user.nickname || user.username}</p>
                          <p className="text-xs text-discord-muted">@{user.username}</p>
                        </div>
                        {(bannerImage !== null || (user.bannerImageUrl && !removeBannerImage)) ? (
                          <button type="button" onClick={clearBannerImage} className="ml-auto self-start pt-1 text-[10px] text-discord-muted transition-colors hover:text-[#ed4245]">Remove banner</button>
                        ) : removeBannerImage ? (
                          <button type="button" onClick={() => setRemoveBannerImage(false)} className="ml-auto self-start pt-1 text-[10px] text-discord-muted transition-colors hover:text-white">Undo</button>
                        ) : null}
                      </div>
                    </div>

                    {/* Banner color */}
                    <label className="mb-3 block text-xs text-discord-muted">
                      Banner Color
                      <div className="mt-1 flex items-center gap-2">
                        <div className="relative flex items-center">
                          <input
                            ref={colorInputRef}
                            type="color"
                            value={bannerColor}
                            onChange={(e) => setBannerColor(e.target.value)}
                            className="h-9 w-9 cursor-pointer rounded border border-white/10 bg-transparent p-0.5"
                          />
                        </div>
                        <input
                          type="text"
                          value={bannerColor}
                          onChange={(e) => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) setBannerColor(e.target.value); }}
                          className="w-28 rounded bg-[#1e1f22] px-2 py-1.5 font-mono text-sm text-white"
                          maxLength={7}
                        />
                        {hasEyeDropper ? (
                          <button
                            type="button"
                            onClick={() => void pickColorWithEyeDropper("banner")}
                            className="flex items-center gap-1.5 rounded bg-[#1e1f22] px-2.5 py-1.5 text-xs text-discord-muted hover:text-white"
                            title="Pick color from screen"
                          >
                            <Pipette size={13} /> Eyedropper
                          </button>
                        ) : null}
                      </div>
                    </label>

                    {/* Profile accent color */}
                    <label className="mb-3 block text-xs text-discord-muted">
                      Profile Accent Color
                      <span className="ml-1.5 text-[10px] text-discord-muted/60">— colors the profile card background</span>
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          type="color"
                          value={accentColor || "#2b2d31"}
                          onChange={(e) => setAccentColor(e.target.value)}
                          className="h-9 w-9 cursor-pointer rounded border border-white/10 bg-transparent p-0.5"
                        />
                        <input
                          type="text"
                          value={accentColor}
                          onChange={(e) => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) setAccentColor(e.target.value); }}
                          className="w-28 rounded bg-[#1e1f22] px-2 py-1.5 font-mono text-sm text-white"
                          placeholder="#2b2d31"
                          maxLength={7}
                        />
                        {hasEyeDropper ? (
                          <button
                            type="button"
                            onClick={() => void pickColorWithEyeDropper("accent")}
                            className="flex items-center gap-1.5 rounded bg-[#1e1f22] px-2.5 py-1.5 text-xs text-discord-muted hover:text-white"
                            title="Pick color from screen"
                          >
                            <Pipette size={13} /> Eyedropper
                          </button>
                        ) : null}
                        {accentColor ? (
                          <button
                            type="button"
                            onClick={() => setAccentColor("")}
                            className="text-xs text-discord-muted hover:text-[#ed4245]"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </label>

                    <label className="mb-3 block text-xs text-discord-muted">
                      Nickname
                      <input
                        className="mt-1 w-full rounded bg-[#1e1f22] px-2 py-2 text-sm text-white"
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        maxLength={32}
                      />
                    </label>

                    <label className="mb-3 block text-xs text-discord-muted">
                      Custom Status
                      <input
                        className="mt-1 w-full rounded bg-[#1e1f22] px-2 py-2 text-sm text-white"
                        value={customStatus}
                        onChange={(e) => setCustomStatus(e.target.value)}
                        placeholder="What are you up to?"
                      />
                    </label>

                    <label className="mb-3 block text-xs text-discord-muted">
                      About Me
                      <textarea
                        className="mt-1 w-full rounded bg-[#1e1f22] px-2 py-2 text-sm text-white"
                        rows={3}
                        value={aboutMe}
                        onChange={(e) => setAboutMe(e.target.value)}
                        placeholder="Tell people about yourself"
                      />
                    </label>


                  </>
                )}

                {/* ACCOUNT */}
                {tab === "account" && (
                  <>
                    <h2 className="mb-4 text-lg font-semibold">Account</h2>

                    <label className="mb-3 block text-xs text-discord-muted">
                      Username
                      <input
                        className="mt-1 w-full rounded bg-[#1e1f22] px-2 py-2 text-sm text-white"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        pattern="[A-Za-z0-9]{2,32}"
                        maxLength={32}
                      />
                      <span className="mt-1 block text-[11px]">Letters and numbers only, no spaces.</span>
                    </label>

                    <label className="mb-3 block text-xs text-discord-muted">
                      Status
                      <select
                        className="mt-1 w-full rounded bg-[#1e1f22] px-2 py-2 text-sm text-white"
                        value={status}
                        onChange={(e) => setStatus(e.target.value as UserStatus)}
                      >
                        <option value="ONLINE">Online</option>
                        <option value="IDLE">Idle</option>
                        <option value="DND">Do Not Disturb</option>
                        <option value="INVISIBLE">Invisible</option>
                      </select>
                    </label>

                    <div className="mb-3">
                      <span className="text-xs text-discord-muted">Notification Sound</span>
                      <div className="mt-1 flex gap-1 rounded bg-[#1e1f22] p-1">
                        {(["default", "alt"] as const).map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => { setNotifSound(opt); }}
                            className={`flex-1 rounded py-1.5 text-xs font-medium transition-colors ${notifSound === opt ? "bg-discord-blurple text-white" : "text-discord-muted hover:text-white"}`}
                          >
                            {opt === "default" ? "Default" : "Alternate"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* SECURITY */}
                {tab === "security" && (
                  <>
                    <h2 className="mb-4 text-lg font-semibold">Security</h2>

                    <div className="mb-4 rounded-lg border border-white/10 bg-[#232428] p-4">
                      <h3 className="text-sm font-semibold text-white">Recovery Key</h3>
                      <p className="mt-1 text-xs leading-5 text-discord-muted">
                        Save a recovery key somewhere safe. You can use it to reset your password if you get locked out.
                      </p>
                      {recoveryCode ? (
                        <div className="mt-3 rounded bg-[#111214] px-3 py-2 font-mono text-sm tracking-[0.18em] text-white">{recoveryCode}</div>
                      ) : null}
                      {recoveryError ? <p className="mt-2 text-xs text-[#ffb3b8]">{recoveryError}</p> : null}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="rounded bg-discord-blurple px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-60"
                          onClick={() => void onGenerateRecoveryCode()}
                          disabled={recoveryBusy}
                        >
                          {recoveryBusy ? "Generating..." : recoveryCode ? "Generate New Key" : "Generate Recovery Key"}
                        </button>
                        {recoveryCode ? (
                          <button
                            type="button"
                            className="rounded bg-[#3a3d45] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#4a4e59]"
                            onClick={() => void navigator.clipboard.writeText(recoveryCode)}
                          >
                            Copy Key
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-lg border border-[#ed4245]/30 bg-[#232428] p-4">
                      <h3 className="text-sm font-semibold text-[#ed4245]">Danger Zone</h3>
                      <p className="mt-1 text-xs leading-5 text-discord-muted">Permanently delete your account and all your data.</p>
                      <div className="mt-3">
                        {!confirmDelete ? (
                          <button
                            type="button"
                            className="rounded bg-[#ed4245] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#c0383b]"
                            onClick={() => setConfirmDelete(true)}
                          >
                            Delete Account
                          </button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-[#ffb3b8]">This is permanent.</span>
                            <button
                              type="button"
                              className="rounded bg-[#ed4245] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#c0383b] disabled:opacity-60"
                              onClick={() => void onDeleteAccount()}
                              disabled={deleting}
                            >
                              {deleting ? "Deleting..." : "Confirm Delete"}
                            </button>
                            <button type="button" className="text-xs text-discord-muted hover:text-white" onClick={() => setConfirmDelete(false)}>Cancel</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* Footer buttons */}
                <div className="mt-auto flex items-center justify-end gap-2 pt-6">
                  {saved ? <span className="text-xs text-[#23a55a]">Saved</span> : null}
                  <button type="button" className="rounded px-3 py-1.5 text-sm text-discord-muted hover:text-white" onClick={onClose}>
                    Cancel
                  </button>
                  <button type="submit" className="rounded bg-discord-blurple px-3 py-1.5 text-sm font-semibold text-white hover:brightness-110">
                    Save
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AvatarCropModal
        open={avatarEditorOpen}
        imageSrc={avatarEditorSrc}
        sourceFile={avatarEditorFile}
        onClose={() => setAvatarEditorOpen(false)}
        onApply={(file) => setAvatar(file)}
        outputFileName={avatarEditorFile?.type === "image/gif" ? "avatar.gif" : "avatar.png"}
      />

      <AvatarCropModal
        open={bannerEditorOpen}
        imageSrc={bannerEditorSrc}
        sourceFile={bannerEditorFile}
        onClose={() => setBannerEditorOpen(false)}
        onApply={(file) => setBannerImage(file)}
        title="Edit Banner"
        cropShape="rect"
        aspect={4}
        outputWidth={1200}
        outputHeight={300}
        outputFileName={bannerEditorFile?.type === "image/gif" ? "banner.gif" : "banner.png"}
      />
    </>
  );
};

export default SettingsModal;
