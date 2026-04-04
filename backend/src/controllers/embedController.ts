import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { Request, Response } from "express";
import { load } from "cheerio";

type EmbedPreview = {
  url: string;
  resolvedUrl: string;
  providerHost: string;
  siteName: string | null;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
  color: string | null;
};

type CacheEntry = {
  expiresAt: number;
  value: EmbedPreview | null;
};

const EMBED_CACHE_TTL_MS = 1000 * 60 * 30;
const MAX_HTML_BYTES = 1024 * 1024;
const embedCache = new Map<string, CacheEntry>();

const isPrivateIpv4 = (ip: string): boolean => {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return true;
  }

  const [first, second] = parts;
  if (first === 10 || first === 127 || first === 0) {
    return true;
  }
  if (first === 169 && second === 254) {
    return true;
  }
  if (first === 172 && second >= 16 && second <= 31) {
    return true;
  }
  if (first === 192 && second === 168) {
    return true;
  }

  return false;
};

const isPrivateIpv6 = (ip: string): boolean => {
  const normalized = ip.toLowerCase();
  return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
};

const isPrivateIpAddress = (address: string): boolean => {
  const version = isIP(address);
  if (version === 4) {
    return isPrivateIpv4(address);
  }
  if (version === 6) {
    return isPrivateIpv6(address);
  }
  return true;
};

const isBlockedHostname = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local");
};

const normalizeText = (value?: string | null): string | null => {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed : null;
};

const getMetaContent = ($: ReturnType<typeof load>, keys: Array<{ attribute: "property" | "name"; value: string }>): string | null => {
  for (const key of keys) {
    const raw = $(`meta[${key.attribute}="${key.value}"]`).attr("content");
    const normalized = normalizeText(raw);
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

const getLinkHref = ($: ReturnType<typeof load>, rel: string): string | null => {
  const raw = $(`link[rel="${rel}"]`).attr("href");
  return normalizeText(raw);
};

const resolveMaybeRelativeUrl = (value: string | null, baseUrl: string): string | null => {
  if (!value) {
    return null;
  }

  try {
    const resolved = new URL(value, baseUrl);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return null;
    }
    return resolved.toString();
  } catch {
    return null;
  }
};

const normalizeColor = (value: string | null): string | null => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed) ? trimmed : null;
};

const readLimitedHtml = async (response: globalThis.Response): Promise<string> => {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_HTML_BYTES) {
    throw new Error("Response too large");
  }

  if (!response.body) {
    return response.text();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }

    totalBytes += value.byteLength;
    if (totalBytes > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new Error("Response too large");
    }

    chunks.push(value);
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(merged);
};

const assertPublicUrl = async (targetUrl: URL): Promise<void> => {
  if (!["http:", "https:"].includes(targetUrl.protocol)) {
    throw new Error("Unsupported protocol");
  }

  if (isBlockedHostname(targetUrl.hostname)) {
    throw new Error("Blocked hostname");
  }

  const results = await lookup(targetUrl.hostname, { all: true, verbatim: true });
  if (!results.length) {
    throw new Error("Unable to resolve hostname");
  }

  if (results.some((result) => isPrivateIpAddress(result.address))) {
    throw new Error("Blocked address");
  }
};

const fetchEmbedPreview = async (targetUrl: string): Promise<EmbedPreview | null> => {
  const parsedUrl = new URL(targetUrl);
  await assertPublicUrl(parsedUrl);

  const response = await fetch(parsedUrl, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "WindcordBot/1.0 (+https://windcord.github.io)"
    },
    redirect: "follow",
    signal: AbortSignal.timeout(8000)
  });

  if (!response.ok) {
    return null;
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
    return null;
  }

  const resolvedUrl = response.url || parsedUrl.toString();
  const html = await readLimitedHtml(response);
  const $ = load(html);

  const siteName = getMetaContent($, [
    { attribute: "property", value: "og:site_name" },
    { attribute: "name", value: "application-name" },
    { attribute: "name", value: "twitter:site" }
  ]);
  const title =
    getMetaContent($, [
      { attribute: "property", value: "og:title" },
      { attribute: "name", value: "twitter:title" }
    ]) ?? normalizeText($("title").first().text());
  const description = getMetaContent($, [
    { attribute: "property", value: "og:description" },
    { attribute: "name", value: "twitter:description" },
    { attribute: "name", value: "description" }
  ]);
  const imageUrl = resolveMaybeRelativeUrl(
    getMetaContent($, [
      { attribute: "property", value: "og:image" },
      { attribute: "name", value: "twitter:image" }
    ]),
    resolvedUrl
  );
  const faviconUrl =
    resolveMaybeRelativeUrl(getLinkHref($, "icon"), resolvedUrl) ??
    resolveMaybeRelativeUrl(getLinkHref($, "shortcut icon"), resolvedUrl) ??
    resolveMaybeRelativeUrl("/favicon.ico", resolvedUrl);
  const color = normalizeColor(getMetaContent($, [{ attribute: "name", value: "theme-color" }]));

  if (!title && !description && !imageUrl && !siteName) {
    return null;
  }

  return {
    url: parsedUrl.toString(),
    resolvedUrl,
    providerHost: new URL(resolvedUrl).hostname.replace(/^www\./i, ""),
    siteName,
    title,
    description,
    imageUrl,
    faviconUrl,
    color
  };
};

export const previewEmbed = async (req: Request, res: Response): Promise<void> => {
  const rawUrl = String(req.query.url ?? "").trim();
  if (!rawUrl) {
    res.status(400).json({ message: "URL is required" });
    return;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    res.status(400).json({ message: "Invalid URL" });
    return;
  }

  const cacheKey = parsedUrl.toString();
  const cached = embedCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.json({ embed: cached.value });
    return;
  }

  try {
    const embed = await fetchEmbedPreview(cacheKey);
    embedCache.set(cacheKey, { value: embed, expiresAt: Date.now() + EMBED_CACHE_TTL_MS });
    res.json({ embed });
  } catch {
    embedCache.set(cacheKey, { value: null, expiresAt: Date.now() + EMBED_CACHE_TTL_MS });
    res.json({ embed: null });
  }
};