const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api";

const getBackendOrigin = (): string => {
  if (typeof window === "undefined") {
    try {
      return new URL(apiBaseUrl, "http://localhost").origin;
    } catch {
      return "";
    }
  }

  try {
    return new URL(apiBaseUrl, window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
};

export const resolveMediaUrl = (value?: string | null): string | null | undefined => {
  if (!value) {
    return value;
  }

  if (/^https?:\/\//i.test(value) || value.startsWith("data:") || value.startsWith("blob:")) {
    return value;
  }

  if (value.startsWith("/uploads/")) {
    const origin = getBackendOrigin();
    return origin ? `${origin}${value}` : value;
  }

  return value;
};