import { create } from "zustand";
import { api } from "../api";
import { connectSocket, disconnectSocket } from "../socket";
import type { User } from "../../types";

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
  user: null,
  token: localStorage.getItem("discrope_token"),
  loading: true,
  setUser: (user) => set({ user }),
  completeAuthSession: (user, token) => {
    localStorage.setItem("discrope_token", token);
    connectSocket(token);
    set({ user, token, loading: false });
  },
  login: async (username, password) => {
    try {
      const { data } = await api.post("/auth/login", { username, password });
      localStorage.setItem("discrope_token", data.token);
      connectSocket(data.token);
      set({ user: data.user, token: data.token, loading: false });
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      throw new Error(message ?? "Authentication failed. Check your username/password and try again.");
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
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      throw new Error(message ?? "Authentication failed. Check your details and try again.");
    }
  },
  resetPassword: async (username, recoveryCode, newPassword) => {
    try {
      const { data } = await api.post("/auth/reset-password", { username, recoveryCode, newPassword });
      return data.recoveryCode ?? null;
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      throw new Error(message ?? "Password reset failed. Check your recovery key and try again.");
    }
  },
  regenerateRecoveryCode: async () => {
    try {
      const { data } = await api.post("/auth/recovery-code");
      return data.recoveryCode;
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      throw new Error(message ?? "Could not generate a new recovery key.");
    }
  },
  restoreSession: async () => {
    const token = localStorage.getItem("discrope_token");
    if (!token) {
      set({ loading: false });
      return;
    }

    try {
      const { data } = await api.get("/auth/me");
      connectSocket(token);
      set({ user: data.user, token, loading: false });
    } catch {
      localStorage.removeItem("discrope_token");
      disconnectSocket();
      set({ user: null, token: null, loading: false });
    }
  },
  logout: async () => {
    await api.post("/auth/logout");
    localStorage.removeItem("discrope_token");
    disconnectSocket();
    set({ user: null, token: null, loading: false });
  }
}));



