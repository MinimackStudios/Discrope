import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuthStore } from "../lib/stores/authStore";

const JoinInvitePage = (): JSX.Element => {
  const { inviteCode } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<{
    code: string;
    server: { id: string; name: string; iconUrl?: string | null; memberCount: number };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <main className="grid h-screen place-items-center bg-[#0f1014] px-4">
      <section className="w-full max-w-md rounded-xl bg-[#2b2d31] p-6 shadow-2xl">
        {loading ? <p className="text-sm text-discord-muted">Loading invite...</p> : null}
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        {invite ? (
          <>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-discord-muted">You have been invited to join a server</p>
            <div className="mb-4 flex items-center gap-3">
              <img src={invite.server.iconUrl || "/default-avatar.svg"} alt={invite.server.name} className="h-14 w-14 rounded-2xl" />
              <div>
                <h1 className="text-xl font-bold text-white">{invite.server.name}</h1>
                <p className="text-xs text-discord-muted">{invite.server.memberCount} members</p>
              </div>
            </div>
            <button className="w-full rounded bg-discord-blurple py-2 text-sm font-semibold text-white" onClick={() => void acceptInvite()}>
              Accept Invite
            </button>
          </>
        ) : null}
      </section>
    </main>
  );
};

export default JoinInvitePage;
