import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { api } from "../lib/api";

type Props = {
  open: boolean;
  serverId: string;
  currentColor: string | null | undefined;
  onClose: () => void;
  onApplied: (color: string | null) => void;
};

const PRESET_COLORS: { label: string; value: string }[] = [
  { label: "Light Blue",  value: "#00b8ff" },
  { label: "Dark Blue",   value: "#0074d9" },
  { label: "Brown",       value: "#533a11" },
  { label: "Light Green", value: "#22ff00" },
  { label: "Orange",      value: "#ff7f00" },
  { label: "Red",         value: "#ff0000" },
  { label: "Pink",        value: "#ff00e3" },
  { label: "Purple",      value: "#7d00ff" },
  { label: "Yellow",      value: "#f1c40f" },
];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const NickColorModal = ({ open, serverId, currentColor, onClose, onApplied }: Props): JSX.Element | null => {
  const [selected, setSelected] = useState<string | null>(currentColor ?? null);
  const [customInput, setCustomInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);

  // sync when modal opens
  useEffect(() => {
    if (open) {
      setSelected(currentColor ?? null);
      setCustomInput(currentColor ?? "");
      setError(null);
    }
  }, [open, currentColor]);

  const isPreset = (v: string | null): boolean =>
    v !== null && PRESET_COLORS.some((p) => p.value.toLowerCase() === v.toLowerCase());

  const handlePreset = (value: string): void => {
    setSelected(value);
    setCustomInput(value);
    setError(null);
  };

  const handleCustomInput = (value: string): void => {
    setCustomInput(value);
    if (value === "" || HEX_RE.test(value)) {
      setSelected(value === "" ? null : value);
      setError(null);
    } else {
      setError("Enter a valid hex color, e.g. #ff0000");
    }
  };

  const handleEyeDropper = async (): Promise<void> => {
    if (!("EyeDropper" in window)) return;
    try {
      const result = await (new (window as any).EyeDropper()).open();
      const hex = result.sRGBHex as string;
      setCustomInput(hex);
      setSelected(hex);
      setError(null);
    } catch {
      // user cancelled
    }
  };

  const handleSave = async (): Promise<void> => {
    if (error) return;
    setSaving(true);
    try {
      await api.patch(`/servers/${serverId}/members/me`, { nickColor: selected ?? null });
      onApplied(selected ?? null);
      onClose();
    } catch {
      setError("Failed to save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async (): Promise<void> => {
    setSaving(true);
    try {
      await api.patch(`/servers/${serverId}/members/me`, { nickColor: null });
      onApplied(null);
      onClose();
    } catch {
      setError("Failed to reset. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4"
          onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.97 }}
            transition={{ duration: 0.22 }}
            className="w-full max-w-sm rounded-xl bg-[#2b2d31] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">Nickname Color</h2>
              <button onClick={onClose} className="text-discord-muted hover:text-white">
                <X size={16} />
              </button>
            </div>

            {/* Preview */}
            <div className="mb-4 rounded-lg bg-[#1e1f22] px-4 py-3 text-sm font-semibold" style={{ color: selected ?? "white" }}>
              Preview Text
            </div>

            {/* Presets grid */}
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-discord-muted">Preset Colors</p>
            <div className="mb-4 grid grid-cols-5 gap-2">
              {PRESET_COLORS.map((p) => (
                <button
                  key={p.value}
                  title={p.label}
                  onClick={() => handlePreset(p.value)}
                  className={`h-8 w-full rounded-md border-2 transition-all ${selected?.toLowerCase() === p.value.toLowerCase() ? "border-white scale-110" : "border-transparent hover:border-white/40"}`}
                  style={{ backgroundColor: p.value }}
                />
              ))}
            </div>

            {/* Custom */}
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-discord-muted">Custom Color</p>
            <div className="mb-1 flex gap-2">
              <input
                ref={colorInputRef}
                type="color"
                value={HEX_RE.test(customInput) ? customInput : "#ffffff"}
                onChange={(e) => handleCustomInput(e.target.value)}
                className="h-9 w-10 cursor-pointer rounded border border-white/10 bg-[#1e1f22] p-0.5"
                title="Color picker"
              />
              {"EyeDropper" in window ? (
                <button
                  type="button"
                  onClick={() => void handleEyeDropper()}
                  title="Pick color from screen"
                  className="flex h-9 items-center gap-1.5 rounded bg-[#1e1f22] px-3 text-xs text-discord-muted hover:text-white border border-white/10"
                >
                  <span>💉</span> Eyedrop
                </button>
              ) : null}
              <input
                type="text"
                value={customInput}
                onChange={(e) => handleCustomInput(e.target.value)}
                placeholder="#000000"
                maxLength={7}
                className="min-w-0 flex-1 rounded bg-[#1e1f22] px-3 text-sm text-white outline-none ring-1 ring-transparent focus:ring-discord-blurple border border-white/10"
              />
            </div>
            {error ? <p className="mb-2 text-xs text-[#ed4245]">{error}</p> : <div className="mb-2 h-4" />}

            {/* Actions */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleReset()}
                disabled={saving || currentColor === null}
                className="rounded bg-[#3a3d45] px-3 py-1.5 text-sm text-discord-muted hover:text-white disabled:opacity-40"
              >
                Reset
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={onClose}
                className="rounded px-3 py-1.5 text-sm text-discord-muted hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || Boolean(error)}
                className="rounded bg-discord-blurple px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#4752c4] disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};

export default NickColorModal;
