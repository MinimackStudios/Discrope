import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { resolveMediaUrl } from "../lib/media";
import { useAuthStore } from "../lib/stores/authStore";
import { useChatStore } from "../lib/stores/chatStore";

const DEFAULT_AVATAR_URL = `${import.meta.env.BASE_URL}default-avatar.svg`;
const inviteEstablishedDateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });

const formatInviteEstablishedDate = (value: string): string | null => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return `Est. ${inviteEstablishedDateFormatter.format(date)}`;
};

const JoinInvitePage = (): JSX.Element => {
  const { inviteCode } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const servers = useChatStore((s) => s.servers);
  const loadServers = useChatStore((s) => s.loadServers);
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<{
    code: string;
    server: {
      id: string;
      name: string;
      description?: string;
      iconUrl?: string | null;
      bannerImageUrl?: string | null;
      createdAt: string;
      memberCount: number;
      onlineCount: number;
      offlineCount: number;
    };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alreadyJoined = Boolean(user && invite && servers.some((server) => server.id === invite.server.id));
  const inviteButtonLabel = alreadyJoined ? "Joined" : user ? "Join" : "Log In To Join";

  useEffect(() => {
    if (!user) {
      return;
    }

    void loadServers();
  }, [loadServers, user]);

  useEffect(() => {
    const loadInvite = async (): Promise<void> => {
      if (!inviteCode) {
        setError("Invalid invite");
        setLoading(false);
        return;
      }

      try {
        const { data } = await api.get(`/servers/invite/${inviteCode}`);
        setInvite(data.invite);
      } catch {
        setError("Invite expired or invalid");
      } finally {
        setLoading(false);
      }
    };

    void loadInvite();
  }, [inviteCode]);

  const acceptInvite = async (): Promise<void> => {
    if (!inviteCode) {
      return;
    }
    if (!user) {
      navigate("/login");
      return;
    }
    try {
      await api.post(`/servers/invite/${inviteCode}`);
      navigate("/");
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number; data?: { message?: string } } })?.response?.status;
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      if (status === 403) {
        setError(message ?? "You are banned from this server.");
      } else {
        setError("Failed to join server.");
      }
    }
  };

  const establishedLabel = invite ? formatInviteEstablishedDate(invite.server.createdAt) : null;
  const inviteBannerUrl = invite ? resolveMediaUrl(invite.server.bannerImageUrl) : null;
  const inviteBannerStyle = inviteBannerUrl
    ? {
        backgroundImage: `linear-gradient(180deg, rgba(10,12,16,0.08), rgba(10,12,16,0.24)), url(${inviteBannerUrl})`,
        backgroundPosition: "center",
        backgroundSize: "cover"
      }
    : {
        background: "linear-gradient(135deg, color-mix(in srgb, var(--wc-active-top) 72%, white 28%), var(--wc-active-bottom))"
      };

  return (
    <main className="wc-shell grid h-screen place-items-center px-4">
      <section className="wc-modal-card w-full max-w-md overflow-hidden rounded-[28px]">
        <div className="h-28" style={inviteBannerStyle} />

        <div className="px-6 pb-6 pt-0">
          {loading ? (
            <div className="-mt-4 wc-surface-card rounded-[22px] px-4 py-5 text-center text-sm text-discord-muted">Loading invite...</div>
          ) : null}

          {error ? (
            <div className="-mt-4 mb-4 rounded-[22px] border border-[#ed4245]/30 bg-[rgba(52,20,24,0.44)] px-4 py-3 text-sm text-[#ffb3b8]">
              {error}
            </div>
          ) : null}

          {invite ? (
            <>
              <div className="-mt-10 wc-surface-card-strong overflow-hidden rounded-[24px] ring-1 ring-white/[0.08]">
                <div className="px-5 pb-5 pt-0">
                  <div className="flex items-center gap-4">
                    <img
                      src={resolveMediaUrl(invite.server.iconUrl) || DEFAULT_AVATAR_URL}
                      alt={invite.server.name}
                      className="-mt-6 h-16 w-16 rounded-[22px] border-4 object-cover"
                      style={{ borderColor: "var(--wc-profile-cutout)" }}
                    />
                    <div className="min-w-0 flex-1 pt-3">
                      <h2 className="truncate text-xl font-bold text-white">{invite.server.name}</h2>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-discord-muted">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-[#23a55a]" />
                          {invite.server.onlineCount} Online
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-[#80848e]" />
                          {invite.server.offlineCount} Offline
                        </span>
                      </div>
                      {establishedLabel ? <p className="mt-1 text-xs text-discord-muted">{establishedLabel}</p> : null}
                      {invite.server.description ? <p className="mt-3 text-sm leading-5 text-discord-muted">{invite.server.description}</p> : null}
                    </div>
                  </div>
                </div>
              </div>

              <button
                className={`${alreadyJoined ? "wc-secondary-button text-discord-muted" : "wc-accent-button text-white"} mt-5 w-full rounded-2xl py-2.5 text-sm font-semibold`}
                onClick={() => void acceptInvite()}
                disabled={alreadyJoined}
              >
                {inviteButtonLabel}
              </button>
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
};

export default JoinInvitePage;
