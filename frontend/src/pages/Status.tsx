import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { api } from "../lib/api";
import { useAuthStore } from "../lib/stores/authStore";
import { useSystemStore } from "../lib/stores/systemStore";

const StatusPage = (): JSX.Element => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const apiUnreachable = useSystemStore((s) => s.apiUnreachable);
  const setApiUnreachable = useSystemStore((s) => s.setApiUnreachable);
  const [checking, setChecking] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    if (user && !apiUnreachable) {
      navigate("/", { replace: true });
    }
  }, [apiUnreachable, navigate, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void api
        .get("/health")
        .then(async () => {
          setApiUnreachable(false);
          await restoreSession();
        })
        .catch(() => {
          setApiUnreachable(true);
        });
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [restoreSession, setApiUnreachable, user]);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const checkNow = async (): Promise<void> => {
    setChecking(true);
    setLastError(null);
    try {
      await api.get("/health");
      setApiUnreachable(false);
      await restoreSession();
      navigate("/", { replace: true });
    } catch {
      setApiUnreachable(true);
      setLastError("Windcord still cannot reach the API server.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <main className="grid h-screen place-items-center bg-gradient-to-b from-[#23262a] to-[#111214] px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-xl border border-white/[0.06] bg-[#313338] p-6 shadow-2xl"
      >
        <h1 className="text-2xl font-bold text-white">API Connection Lost</h1>
        <p className="mt-2 text-sm text-discord-muted">
          Windcord could not reach the backend service. Your session is still saved locally and will resume once the API comes back.
        </p>
        <p className="mt-3 text-xs text-[#9ecbff]">We retry automatically every 5 seconds.</p>
        {lastError ? <p className="mt-3 text-xs text-red-300">{lastError}</p> : null}
        <button
          type="button"
          disabled={checking}
          onClick={() => void checkNow()}
          className="mt-5 w-full rounded bg-discord-blurple py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {checking ? "Checking..." : "Retry Now"}
        </button>
      </motion.div>
    </main>
  );
};

export default StatusPage;
