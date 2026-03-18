import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuthStore } from "../lib/stores/authStore";
import type { User } from "../types";

const downloadRecoveryKey = (username: string, recoveryKey: string): void => {
  const sanitizedUsername = username.trim().toLowerCase() || "account";
  const fileContents = [
    "Discrope Recovery Key",
    "",
    `Username: ${sanitizedUsername}`,
    `Recovery Key: ${recoveryKey}`,
    "",
    "Keep this file somewhere safe.",
    "If you forget your password, you will need this recovery key to reset it."
  ].join("\n");

  const blob = new Blob([fileContents], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `discrope-recovery-key-${sanitizedUsername}.txt`;
  link.click();
  URL.revokeObjectURL(url);
};

const LoginPage = (): JSX.Element => {
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const completeAuthSession = useAuthStore((s) => s.completeAuthSession);
  const resetPassword = useAuthStore((s) => s.resetPassword);
  const user = useAuthStore((s) => s.user);

  const [mode, setMode] = useState<"login" | "register" | "reset">("login");
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoveryCodeNotice, setRecoveryCodeNotice] = useState<string | null>(null);
  const [recoveryStep, setRecoveryStep] = useState<"register" | "reset" | null>(null);
  const [recoveryCodeHandled, setRecoveryCodeHandled] = useState(false);
  const [pendingRegistrationAuth, setPendingRegistrationAuth] = useState<{ user: User; token: string } | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isRecoveryHandoff = Boolean(recoveryCodeNotice && recoveryStep);
  const activeRecoveryCode = recoveryCodeNotice ?? "";

  if (user && !isRecoveryHandoff) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const cleanUsername = username.trim();
      if (!/^[a-zA-Z0-9]{2,32}$/.test(cleanUsername)) {
        throw new Error("Username must be 2-32 letters and numbers only.");
      }
      if (mode === "login") {
        await login(cleanUsername, password);
      } else if (mode === "register") {
        const registration = await register(cleanUsername, password, nickname.trim() || cleanUsername);
        setPendingRegistrationAuth({ user: registration.user, token: registration.token });
        setRecoveryCodeNotice(registration.recoveryCode);
        setRecoveryStep("register");
        setRecoveryCodeHandled(false);
      } else {
        if (password !== confirmPassword) {
          throw new Error("New password and confirmation must match.");
        }
        const nextRecoveryCode = await resetPassword(cleanUsername, recoveryCode, password);
        setSuccessMessage("Password reset. Your old recovery key has been replaced.");
        setRecoveryCodeNotice(nextRecoveryCode);
        setRecoveryStep("reset");
        setRecoveryCodeHandled(false);
        setPassword("");
        setConfirmPassword("");
        setRecoveryCode("");
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
          {isRecoveryHandoff
            ? recoveryStep === "register"
              ? "Step 2 of 2: save your recovery key before entering Discrope"
              : "Save your replacement recovery key before returning to login"
            : mode === "login"
            ? "We are so excited to see you again!"
            : mode === "register"
              ? "Create your account with username and nickname"
              : "Reset your password with your saved recovery key"}
        </p>

        {isRecoveryHandoff ? (
          <div className="rounded-lg border border-[#f0b232]/40 bg-[#2d2613] p-4 text-sm text-[#f8e7b2]">
            <p className="font-semibold text-white">Save this recovery key now.</p>
            <p className="mt-1 text-xs leading-5 text-[#e9d79a]">
              Discrope only shows this key once. You will need it if you ever forget your password.
            </p>
            <div className="mt-3 rounded bg-[#111214] px-3 py-2 font-mono text-base tracking-[0.2em] text-white">
              {activeRecoveryCode}
            </div>
            <p className="mt-3 text-xs leading-5 text-[#f8e7b2]">
              Download or copy this key before continuing. Discrope does not keep a readable copy for you.
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded bg-[#3a3d45] px-3 py-2 text-xs font-semibold text-white hover:bg-[#4a4e59]"
                  onClick={() => {
                    void navigator.clipboard.writeText(activeRecoveryCode);
                    setRecoveryCodeHandled(true);
                  }}
                >
                  Copy Recovery Key
                </button>
                <button
                  type="button"
                  className="rounded bg-discord-blurple px-3 py-2 text-xs font-semibold text-white hover:brightness-110"
                  onClick={() => {
                    downloadRecoveryKey(username, activeRecoveryCode);
                    setRecoveryCodeHandled(true);
                  }}
                >
                  Download Key File
                </button>
              </div>
              <button
                type="button"
                disabled={!recoveryCodeHandled}
                className="text-xs text-[#9ecbff] hover:underline disabled:cursor-not-allowed disabled:text-[#6b7280] disabled:no-underline"
                onClick={() => {
                  setRecoveryCodeNotice(null);
                  setRecoveryCodeHandled(false);
                  if (recoveryStep === "register" && pendingRegistrationAuth) {
                    completeAuthSession(pendingRegistrationAuth.user, pendingRegistrationAuth.token);
                    setPendingRegistrationAuth(null);
                    return;
                  }

                  setPendingRegistrationAuth(null);
                  setRecoveryStep(null);
                  if (recoveryStep === "reset") {
                    setMode("login");
                  }
                }}
              >
                {recoveryStep === "register" ? "Enter Discrope" : "Back to Login"}
              </button>
            </div>
          </div>
        ) : null}

        {!isRecoveryHandoff ? <form onSubmit={onSubmit} className="space-y-4">
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

          {mode === "reset" ? (
            <label className="block text-xs font-semibold uppercase tracking-wider text-discord-muted">
              Recovery Key
              <input
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                className="mt-1 w-full rounded bg-[#1e1f22] px-3 py-2 font-mono text-sm uppercase tracking-[0.18em] text-white outline-none ring-1 ring-transparent focus:ring-discord-blurple"
                required
                minLength={8}
                maxLength={64}
                placeholder="ABCD-EFGH-IJKL-MNOP"
              />
            </label>
          ) : null}

          <label className="block text-xs font-semibold uppercase tracking-wider text-discord-muted">
            {mode === "reset" ? "New Password" : "Password"}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded bg-[#1e1f22] px-3 py-2 text-sm text-white outline-none ring-1 ring-transparent focus:ring-discord-blurple"
              required
              minLength={mode === "login" ? 1 : 8}
            />
            {mode !== "login" ? <span className="mt-1 block text-[11px] text-discord-muted">Use at least 8 characters.</span> : null}
          </label>

          {mode === "reset" ? (
            <label className="block text-xs font-semibold uppercase tracking-wider text-discord-muted">
              Confirm New Password
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 w-full rounded bg-[#1e1f22] px-3 py-2 text-sm text-white outline-none ring-1 ring-transparent focus:ring-discord-blurple"
                required
                minLength={8}
              />
            </label>
          ) : null}

          {error ? <p className="text-xs text-red-300">{error}</p> : null}
          {successMessage ? <p className="text-xs text-[#86efac]">{successMessage}</p> : null}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded bg-discord-blurple py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
          >
            {busy ? "Please wait..." : mode === "login" ? "Login" : mode === "register" ? "Create Account" : "Reset Password"}
          </button>
        </form> : null}

        {!isRecoveryHandoff ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          <button
            className="text-[#00a8fc] hover:underline"
            onClick={() => {
              setError(null);
              setSuccessMessage(null);
              setMode(mode === "login" ? "register" : "login");
            }}
          >
            {mode === "login" ? "Need an account? Register" : "Already have an account? Login"}
          </button>

          {mode !== "register" ? (
            <button
              className="text-[#9ecbff] hover:underline"
              onClick={() => {
                setError(null);
                setSuccessMessage(null);
                setMode(mode === "reset" ? "login" : "reset");
              }}
            >
              {mode === "reset" ? "Back to login" : "Forgot password?"}
            </button>
          ) : null}
        </div> : null}
      </motion.div>
    </main>
  );
};

export default LoginPage;

