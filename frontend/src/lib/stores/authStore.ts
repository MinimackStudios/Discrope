import { create } from "zustand";
import { api } from "../api";
import { connectSocket, disconnectSocket } from "../socket";
import type { User } from "../../types";

const USER_STORAGE_KEY = "windcord_user";

const loadStoredUser = (): User | null => {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
};

const persistStoredUser = (user: User | null): void => {
  if (!user) {
    localStorage.removeItem(USER_STORAGE_KEY);
    return;
  }
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
};

const getAuthErrorMessage = (error: unknown, fallbackMessage: string): string => {
  const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
  if (apiMessage) {
    return apiMessage;
  }

  const status = (error as { response?: { status?: number } })?.response?.status;
  const message = String((error as { message?: string })?.message ?? "").toLowerCase();
  const responseText = String((error as { response?: { data?: unknown } })?.response?.data ?? "").toLowerCase();
  const noResponse = !(error as { response?: unknown })?.response;
  const proxyConnectionFailed =
    status === 502 ||
    status === 503 ||
    status === 504 ||
    message.includes("econnrefused") ||
    responseText.includes("econnrefused") ||
    responseText.includes("proxy error") ||
    responseText.includes("connection refused");
  if (noResponse || proxyConnectionFailed) {
    return "Windcord could not reach the API server. It may be temporarily down. Please try again in a moment.";
  }

  return fallbackMessage;
};

const isAuthFailure = (error: unknown): boolean => {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status === 401 || status === 403;
};

type PendingRegistration = {
  user: User;
  token: string;
  recoveryCode: string | null;
};

type AuthState = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, nickname?: string) => Promise<PendingRegistration>;
  completeAuthSession: (user: User, token: string) => void;
  resetPassword: (username: string, recoveryCode: string, newPassword: string) => Promise<string | null>;
  regenerateRecoveryCode: () => Promise<string>;
  restoreSession: () => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: loadStoredUser(),
  token: localStorage.getItem("windcord_token"),
  loading: true,
  setUser: (user) => {
    persistStoredUser(user);
    set({ user });
  },
  completeAuthSession: (user, token) => {
    localStorage.setItem("windcord_token", token);
    persistStoredUser(user);
    connectSocket(token);
    set({ user, token, loading: false });
  },
  login: async (username, password) => {
    try {
      const { data } = await api.post("/auth/login", { username, password });
      localStorage.setItem("windcord_token", data.token);
      persistStoredUser(data.user);
      connectSocket(data.token);
      set({ user: data.user, token: data.token, loading: false });
    } catch (error: unknown) {
      throw new Error(getAuthErrorMessage(error, "Authentication failed. Check your username/password and try again."));
    }
  },
  register: async (username, password, nickname) => {
    try {
      const { data } = await api.post("/auth/register", { username, password, nickname });
      return {
        user: data.user,
        token: data.token,
        recoveryCode: data.recoveryCode ?? null
      };
    } catch (error: unknown) {
      throw new Error(getAuthErrorMessage(error, "Authentication failed. Check your details and try again."));
    }
  },
  resetPassword: async (username, recoveryCode, newPassword) => {
    try {
      const { data } = await api.post("/auth/reset-password", { username, recoveryCode, newPassword });
      return data.recoveryCode ?? null;
    } catch (error: unknown) {
      throw new Error(getAuthErrorMessage(error, "Password reset failed. Check your recovery key and try again."));
    }
  },
  regenerateRecoveryCode: async () => {
    try {
      const { data } = await api.post("/auth/recovery-code");
      return data.recoveryCode;
    } catch (error: unknown) {
      throw new Error(getAuthErrorMessage(error, "Could not generate a new recovery key."));
    }
  },
  restoreSession: async () => {
    const token = localStorage.getItem("windcord_token");
    const cachedUser = loadStoredUser();
    if (!token) {
      persistStoredUser(null);
      set({ loading: false });
      return;
    }

    if (cachedUser) {
      connectSocket(token);
      set({ user: cachedUser, token, loading: false });
    }

    try {
      const { data } = await api.get("/auth/me");
      persistStoredUser(data.user);
      connectSocket(token);
      set({ user: data.user, token, loading: false });
    } catch (error: unknown) {
      if (isAuthFailure(error)) {
        localStorage.removeItem("windcord_token");
        persistStoredUser(null);
        disconnectSocket();
        set({ user: null, token: null, loading: false });
        return;
      }

      // Temporary API/network failures should not erase an existing session.
      if (cachedUser) {
        set({ user: cachedUser, token, loading: false });
        return;
      }

      set({ loading: false });
    }
  },
  logout: async () => {
    await api.post("/auth/logout");
    localStorage.removeItem("windcord_token");
    persistStoredUser(null);
    disconnectSocket();
    set({ user: null, token: null, loading: false });
  }
}));



