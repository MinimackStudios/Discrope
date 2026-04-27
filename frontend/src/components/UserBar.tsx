import { ChevronUp, Palette, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useAuthStore } from "../lib/stores/authStore";
import { resolveUserAvatarUrl } from "../lib/media";
import type { User, UserStatus } from "../types";
import { formatStatusLabel } from "../lib/formatStatus";
import StatusDot from "./StatusDot";

type Props = {
  user: User;
  onOpenSettings: () => void;
  onOpenOwnProfile: () => void;
  onSetNickColor?: () => void;
};

const STATUS_OPTIONS: { value: UserStatus; label: string }[] = [
  { value: "ONLINE",    label: "Online"          },
  { value: "IDLE",      label: "Idle"            },
  { value: "DND",       label: "Do Not Disturb"  },
  { value: "INVISIBLE", label: "Invisible"       },
];

const UserBar = ({ user, onOpenSettings, onOpenOwnProfile, onSetNickColor }: Props): JSX.Element => {
  const setUser = useAuthStore((s) => s.setUser);
  const displayName = user.nickname?.trim() || user.username;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const handleStatusSelect = async (status: UserStatus) => {
    setMenuOpen(false);
    const formData = new FormData();
    formData.append("status", status);
    const { data } = await api.patch("/users/me", formData, { headers: { "Content-Type": "multipart/form-data" } });
    setUser(data.user);
  };

  // Auto-idle: go IDLE after 5 minutes of window blur, restore previous status on focus
  const IDLE_DELAY_MS = 300_000; // 5-minute production delay
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preIdleStatusRef = useRef<UserStatus | null>(null);

  useEffect(() => {
    const goIdle = () => {
      if (user.status === "INVISIBLE" || user.status === "DND" || user.status === "IDLE") return;
      preIdleStatusRef.current = user.status;
      idleTimerRef.current = setTimeout(() => {
        void handleStatusSelect("IDLE");
      }, IDLE_DELAY_MS);
    };
    const cancelIdle = () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      if (preIdleStatusRef.current && user.status === "IDLE") {
        void handleStatusSelect(preIdleStatusRef.current);
        preIdleStatusRef.current = null;
      }
    };
    window.addEventListener("blur", goIdle);
    window.addEventListener("focus", cancelIdle);
    return () => {
      window.removeEventListener("blur", goIdle);
      window.removeEventListener("focus", cancelIdle);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [user.status]);


  return (
    <div className="wc-userbar relative flex h-[60px] items-center gap-2 px-3">
      {/* Avatar → opens profile */}
      <button className="relative h-8 w-8 shrink-0 rounded-full" onClick={onOpenOwnProfile} title="View profile">
        <img src={resolveUserAvatarUrl(user)} alt={displayName} className="h-8 w-8 rounded-full" />
        <span className="absolute -bottom-1 -right-0.5 pointer-events-none">
          <StatusDot status={user.status} sizeClassName="h-2.5 w-2.5" cutoutColor="var(--wc-userbar-cutout)" ringColor="var(--wc-userbar-cutout)" ringWidth={2} />
        </span>
      </button>

      {/* Name + status row → opens status picker */}
      <button
        ref={triggerRef}
        className="group flex min-w-0 flex-1 flex-col items-stretch rounded-xl border border-transparent px-2 py-1 text-left transition hover:border-white/[0.03] hover:bg-white/[0.06]"
        onClick={() => setMenuOpen((o) => !o)}
        title="Set status"
      >
        <p className="truncate text-xs font-semibold text-white leading-4">{displayName}</p>
        <div className="flex w-full items-center gap-1 text-[11px] text-discord-muted">
          <span className="truncate flex-1">{user.customStatus?.trim() || formatStatusLabel(user.status)}</span>
          <ChevronUp
            size={12}
            strokeWidth={3}
            className={`shrink-0 transition-transform ${menuOpen ? "rotate-180" : "rotate-0"}`}
          />
        </div>
      </button>

      {/* Status picker popover */}
      {menuOpen ? (
        <div
          ref={menuRef}
          className="wc-popover absolute bottom-[62px] left-2 z-50 w-56 overflow-hidden rounded-2xl py-1.5"
        >
          <p className="px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-discord-muted">Set Status</p>
          {STATUS_OPTIONS.map(({ value, label }) => {
            const active = user.status === value;
            return (
              <button
                key={value}
                className={`flex w-full items-center gap-3 px-3 py-2 text-sm transition hover:bg-white/[0.06] ${active ? "text-white" : "text-discord-text"}`}
                onClick={() => void handleStatusSelect(value)}
              >
                <StatusDot status={value} sizeClassName="h-3.5 w-3.5" cutoutClassName="ring-0" cutoutColor="#36393f" />
                <span className="flex-1 text-left">{label}</span>
                {active ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/40" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {onSetNickColor ? (
        <button
          className="shrink-0 rounded-xl p-2 text-discord-muted transition hover:bg-white/[0.06] hover:text-white"
          onClick={onSetNickColor}
          title="Set nickname color"
        >
          <Palette size={16} />
        </button>
      ) : null}

      <button className="shrink-0 rounded-xl p-2 text-discord-muted transition hover:bg-white/[0.06] hover:text-white" onClick={onOpenSettings}>
        <Settings size={16} />
      </button>
    </div>
  );
};

export default UserBar;
