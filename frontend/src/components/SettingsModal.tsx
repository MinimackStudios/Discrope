import { FormEvent, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "../lib/api";
import { useBackdropClose } from "../lib/useBackdropClose";
import { useAuthStore } from "../lib/stores/authStore";
import type { UserStatus } from "../types";
import AvatarCropModal from "./AvatarCropModal";

type Props = {
  open: boolean;
  onClose: () => void;
};

const SettingsModal = ({ open, onClose }: Props): JSX.Element | null => {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const regenerateRecoveryCode = useAuthStore((s) => s.regenerateRecoveryCode);

  const [username, setUsername] = useState(user?.username ?? "");
  const [nickname, setNickname] = useState(user?.nickname ?? "");
  const [status, setStatus] = useState<UserStatus>((user?.status as UserStatus) ?? "ONLINE");
  const [aboutMe, setAboutMe] = useState(user?.aboutMe ?? "");
  const [customStatus, setCustomStatus] = useState(user?.customStatus ?? "");
  const [avatar, setAvatar] = useState<File | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);
  const [avatarEditorSrc, setAvatarEditorSrc] = useState<string | null>(null);
  const [avatarEditorFile, setAvatarEditorFile] = useState<File | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const { onBackdropPointerDown, onBackdropClick } = useBackdropClose(onClose);

  useEffect(() => {
    setUsername(user?.username ?? "");
    setNickname(user?.nickname ?? "");
    setStatus((user?.status as UserStatus) ?? "ONLINE");
    setAboutMe(user?.aboutMe ?? "");
    setCustomStatus(user?.customStatus ?? "");
    setAvatar(null);
    setRemoveAvatar(false);
    setAdvancedOpen(false);
    setRecoveryCode(null);
    setRecoveryError(null);
  }, [user?.id, user?.username, user?.nickname, user?.status, user?.aboutMe, user?.customStatus]);

  useEffect(() => {
    if (open) {
      setSaved(false);
    }
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
    formData.append("removeAvatar", removeAvatar ? "true" : "false");
    if (avatar) {
      formData.append("avatar", avatar);
    }

    const { data } = await api.patch("/users/me", formData, {
      headers: { "Content-Type": "multipart/form-data" }
    });
    setUser(data.user);
    if (avatarEditorSrc) {
      URL.revokeObjectURL(avatarEditorSrc);
      setAvatarEditorSrc(null);
    }
    setAvatarEditorFile(null);
    setAvatar(null);
    setRemoveAvatar(false);
    setSaved(true);
  };

  const onAvatarPicked = (file: File | null): void => {
    if (!file) {
      return;
    }

    if (avatarEditorSrc) {
      URL.revokeObjectURL(avatarEditorSrc);
    }
    const src = URL.createObjectURL(file);
    setAvatarEditorSrc(src);
    setAvatarEditorFile(file);
    setRemoveAvatar(false);
    setAvatarEditorOpen(true);
  };

  const clearAvatarSelection = (): void => {
    if (avatarEditorSrc) {
      URL.revokeObjectURL(avatarEditorSrc);
      setAvatarEditorSrc(null);
    }
    setAvatarEditorFile(null);
    setAvatar(null);
    setRemoveAvatar(true);
  };

  const onDeleteAccount = async (): Promise<void> => {
    try {
      setDeleting(true);
      await api.delete("/users/me");
      await logout();
    } finally {
      setDeleting(false);
    }
  };

  const onGenerateRecoveryCode = async (): Promise<void> => {
    try {
      setRecoveryBusy(true);
      setRecoveryError(null);
      const nextRecoveryCode = await regenerateRecoveryCode();
      setRecoveryCode(nextRecoveryCode);
    } catch (error) {
      setRecoveryError(error instanceof Error ? error.message : "Could not generate a new recovery key.");
    } finally {
      setRecoveryBusy(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {open && user ? (
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
              initial={{ opacity: 0, y: 14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 14, scale: 0.97 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              onSubmit={onSubmit}
              className="discord-scrollbar max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-lg bg-[#2b2d31] p-4 shadow-[0_28px_90px_rgba(0,0,0,0.44)]"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold">User Settings</h2>
              <label className="mt-3 block text-xs text-discord-muted">
                Username
                <input
                  className="mt-1 w-full rounded bg-[#1e1f22] px-2 py-2 text-sm"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  pattern="[A-Za-z0-9]{2,32}"
                  maxLength={32}
                />
                <span className="mt-1 block text-[11px]">Letters and numbers only, no spaces.</span>
              </label>
              <label className="mt-3 block text-xs text-discord-muted">
                Nickname
                <input
                  className="mt-1 w-full rounded bg-[#1e1f22] px-2 py-2 text-sm"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={32}
                />
              </label>
              <label className="mt-3 block text-xs text-discord-muted">
                Status
                <select
                  className="mt-1 w-full rounded bg-[#1e1f22] px-2 py-2 text-sm"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as UserStatus)}
                >
                  <option value="ONLINE">Online</option>
                  <option value="IDLE">Idle</option>
                  <option value="DND">Do Not Disturb</option>
                  <option value="INVISIBLE">Invisible</option>
                </select>
              </label>
              <label className="mt-3 block text-xs text-discord-muted">
                Custom Status
                <input
                  className="mt-1 w-full rounded bg-[#1e1f22] px-2 py-2 text-sm"
                  value={customStatus}
                  onChange={(e) => setCustomStatus(e.target.value)}
                  placeholder="What are you up to?"
                />
              </label>
              <label className="mt-3 block text-xs text-discord-muted">
                About Me
                <textarea
                  className="mt-1 w-full rounded bg-[#1e1f22] px-2 py-2 text-sm"
                  rows={3}
                  value={aboutMe}
                  onChange={(e) => setAboutMe(e.target.value)}
                  placeholder="Tell people about yourself"
                />
              </label>
              <label className="mt-3 block text-xs text-discord-muted">
                Avatar
                <input className="mt-1 w-full text-sm" type="file" accept="image/*" onChange={(e) => onAvatarPicked(e.target.files?.[0] ?? null)} />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="rounded bg-[#3a3d45] px-2 py-1 text-[11px] text-white hover:bg-[#4a4e59]"
                    onClick={clearAvatarSelection}
                  >
                    Remove Avatar
                  </button>
                  {avatar ? <span className="text-[11px]">Edited image ready to upload.</span> : null}
                  {removeAvatar ? <span className="text-[11px]">Avatar will revert to default on save.</span> : null}
                </div>
              </label>

              <section className="mt-4 rounded-lg border border-white/10 bg-[#232428] p-3">
                <button
                  type="button"
                  className="flex w-full items-center justify-between text-left"
                  onClick={() => setAdvancedOpen((current) => !current)}
                >
                  <div>
                    <h3 className="text-sm font-semibold text-white">Advanced</h3>
                    <p className="mt-1 text-xs leading-5 text-discord-muted">
                      Sensitive account actions and recovery tools.
                    </p>
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-discord-muted">
                    {advancedOpen ? "Hide" : "Show"}
                  </span>
                </button>

                {advancedOpen ? (
                  <div className="mt-3 border-t border-white/10 pt-3">
                    <h4 className="text-sm font-semibold text-white">Recovery Key</h4>
                    <p className="mt-1 text-xs leading-5 text-discord-muted">
                      Save a recovery key somewhere safe. You can use it to reset your password if you ever get locked out.
                    </p>
                    {recoveryCode ? (
                      <div className="mt-3 rounded bg-[#111214] px-3 py-2 font-mono text-sm tracking-[0.18em] text-white">
                        {recoveryCode}
                      </div>
                    ) : null}
                    {recoveryError ? <p className="mt-2 text-xs text-[#ffb3b8]">{recoveryError}</p> : null}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="rounded bg-discord-blurple px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-60"
                        onClick={() => void onGenerateRecoveryCode()}
                        disabled={recoveryBusy}
                      >
                        {recoveryBusy ? "Generating..." : recoveryCode ? "Generate New Recovery Key" : "Generate Recovery Key"}
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
                ) : null}
              </section>

              <div className="mt-4 flex items-center justify-between gap-2">
                <div>
                  {!confirmDelete ? (
                    <button
                      type="button"
                      className="rounded bg-[#ed4245] px-3 py-1 text-sm font-semibold text-white hover:bg-[#c0383b]"
                      onClick={() => setConfirmDelete(true)}
                    >
                      Delete Account
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#ffb3b8]">This is permanent.</span>
                      <button
                        type="button"
                        className="rounded bg-[#ed4245] px-3 py-1 text-sm font-semibold text-white hover:bg-[#c0383b] disabled:opacity-60"
                        onClick={() => void onDeleteAccount()}
                        disabled={deleting}
                      >
                        {deleting ? "Deleting..." : "Confirm Delete"}
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {saved ? <span className="text-xs text-[#23a55a]">Saved</span> : null}
                  <button type="button" className="rounded px-3 py-1 text-sm text-discord-muted hover:-translate-y-[1px] hover:text-white" onClick={onClose}>
                    Cancel
                  </button>
                  <button type="submit" className="rounded bg-discord-blurple px-3 py-1 text-sm font-semibold text-white hover:-translate-y-[1px]">
                    Save
                  </button>
                </div>
              </div>
            </motion.form>
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
    </>
  );
};

export default SettingsModal;
