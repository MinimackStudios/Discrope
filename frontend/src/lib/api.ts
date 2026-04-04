import axios from "axios";
import { useSystemStore } from "./stores/systemStore";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api";
const API_OUTAGE_SIMULATION_KEY = "windcord_simulate_api_down";

const isApiOutageSimulated = (): boolean => {
  if (import.meta.env.VITE_FORCE_API_DOWN === "true") {
    return true;
  }
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(API_OUTAGE_SIMULATION_KEY) === "1";
};

export const api = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true
});

api.interceptors.request.use((config) => {
  if (isApiOutageSimulated()) {
    useSystemStore.getState().setApiUnreachable(true);
    return Promise.reject(new Error("Simulated API outage"));
  }

  const token = localStorage.getItem("windcord_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    useSystemStore.getState().setApiUnreachable(false);
    return response;
  },
  (error: unknown) => {
    const response = (error as { response?: { status?: number; data?: unknown } })?.response;
    const status = response?.status;
    const message = String((error as { message?: string })?.message ?? "").toLowerCase();
    const responseText = typeof response?.data === "string" ? response.data.toLowerCase() : "";
    const proxyConnectionFailed =
      status === 502 ||
      status === 503 ||
      status === 504 ||
      message.includes("econnrefused") ||
      responseText.includes("econnrefused") ||
      responseText.includes("proxy error") ||
      responseText.includes("connection refused");
    const hasResponse = Boolean(response);
    useSystemStore.getState().setApiUnreachable(!hasResponse || proxyConnectionFailed);
    return Promise.reject(error);
  }
);



