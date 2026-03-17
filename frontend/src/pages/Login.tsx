import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuthStore } from "../lib/stores/authStore";

const LoginPage = (): JSX.Element => {
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const user = useAuthStore((s) => s.user);

  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const cleanUsername = username.trim();
      if (!/^[a-zA-Z0-9]{2,32}$/.test(cleanUsername)) {
        throw new Error("Username must be 2-32 letters and numbers only.");
      }
      if (mode === "login") {
        await login(cleanUsername, password);
      } else {
        await register(cleanUsername, password, nickname.trim() || cleanUsername);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Authentication failed. Check your username/password and try again.";
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid h-screen place-items-center bg-gradient-to-b from-[#23262a] to-[#111214] px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-xl bg-[#313338] p-8 shadow-2xl"
      >
        <h1 className="mb-2 text-center text-2xl font-bold text-white">Welcome to Discrope</h1>
        <p className="mb-6 text-center text-sm text-discord-muted">
          {mode === "login" ? "We are so excited to see you again!" : "Create your account with username and nickname"}
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block text-xs font-semibold uppercase tracking-wider text-discord-muted">
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full rounded bg-[#1e1f22] px-3 py-2 text-sm text-white outline-none ring-1 ring-transparent focus:ring-discord-blurple"
              required
              minLength={2}
              maxLength={32}
              pattern="[A-Za-z0-9]{2,32}"
            />
            <span className="mt-1 block text-[11px] text-discord-muted">Letters and numbers only, no spaces.</span>
          </label>

          {mode === "register" ? (
            <label className="block text-xs font-semibold uppercase tracking-wider text-discord-muted">
              Nickname
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="mt-1 w-full rounded bg-[#1e1f22] px-3 py-2 text-sm text-white outline-none ring-1 ring-transparent focus:ring-discord-blurple"
                required
                minLength={1}
                maxLength={32}
              />
            </label>
          ) : null}

          <label className="block text-xs font-semibold uppercase tracking-wider text-discord-muted">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded bg-[#1e1f22] px-3 py-2 text-sm text-white outline-none ring-1 ring-transparent focus:ring-discord-blurple"
              required
              minLength={6}
            />
          </label>

          {error ? <p className="text-xs text-red-300">{error}</p> : null}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded bg-discord-blurple py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
          >
            {busy ? "Please wait..." : mode === "login" ? "Login" : "Create Account"}
          </button>
        </form>

        <button
          className="mt-4 text-xs text-[#00a8fc] hover:underline"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login" ? "Need an account? Register" : "Already have an account? Login"}
        </button>
      </motion.div>
    </main>
  );
};

export default LoginPage;

