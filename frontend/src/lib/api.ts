import axios from "axios";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api";

export const api = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("discrope_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});



