import { create } from "zustand";
import { api } from "../api";
import { connectSocket, disconnectSocket } from "../socket";
import type { User } from "../../types";

type AuthState = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, nickname?: string) => Promise<void>;
  restoreSession: () => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem("discrope_token"),
  loading: true,
  setUser: (user) => set({ user }),
  login: async (username, password) => {
    const { data } = await api.post("/auth/login", { username, password });
    localStorage.setItem("discrope_token", data.token);
    connectSocket(data.token);
    set({ user: data.user, token: data.token, loading: false });
  },
  register: async (username, password, nickname) => {
    const { data } = await api.post("/auth/register", { username, password, nickname });
    localStorage.setItem("discrope_token", data.token);
    connectSocket(data.token);
    set({ user: data.user, token: data.token, loading: false });
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



