import { useEffect, useMemo, useState } from "react";
import { Globe } from "lucide-react";
import { api } from "../lib/api";
import type { LinkEmbed } from "../types";

const DEFAULT_ACCENT = "#4f545c";
const embedCache = new Map<string, LinkEmbed | null>();

type Props = {
  url: string;
};

const clampStyle = {
  display: "-webkit-box",
  WebkitBoxOrient: "vertical" as const,
  overflow: "hidden"
};

type YouTubeEmbedConfig = {
  embedUrl: string;
  watchUrl: string;
};

const parseYouTubeEmbed = (rawUrl: string): YouTubeEmbedConfig | null => {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const segments = parsed.pathname.split("/").filter(Boolean);
  let videoId: string | null = null;

  if (host === "youtu.be") {
    videoId = segments[0] ?? null;
  } else if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    if (segments[0] === "watch") {
      videoId = parsed.searchParams.get("v");
    } else if (segments[0] === "shorts" || segments[0] === "live" || segments[0] === "embed") {
      videoId = segments[1] ?? null;
    }
  }

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return null;
  }

  const startRaw =
    parsed.searchParams.get("start") ??
    parsed.searchParams.get("t") ??
    parsed.searchParams.get("time_continue");
  const startSeconds = startRaw ? Number.parseInt(startRaw.replace(/s$/i, ""), 10) : NaN;

  const embedParams = new URLSearchParams({
    rel: "0",
    modestbranding: "1",
    playsinline: "1"
  });
  if (Number.isFinite(startSeconds) && startSeconds > 0) {
    embedParams.set("start", String(startSeconds));
  }

  const canonicalWatchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  return {
    embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?${embedParams.toString()}`,
    watchUrl: canonicalWatchUrl
  };
};

const OpenGraphEmbed = ({ url }: Props): JSX.Element | null => {
  const youtubeEmbed = useMemo(() => parseYouTubeEmbed(url), [url]);
  const [embed, setEmbed] = useState<LinkEmbed | null>(() => (youtubeEmbed ? null : (embedCache.get(url) ?? null)));
  const [loading, setLoading] = useState(() => (youtubeEmbed ? false : !embedCache.has(url)));

  useEffect(() => {
    if (youtubeEmbed) {
      setEmbed(null);
      setLoading(false);
      return;
    }

    const cached = embedCache.get(url);
    if (cached !== undefined) {
      setEmbed(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void api
      .get("/embeds", { params: { url } })
      .then(({ data }) => {
        const nextEmbed = (data.embed as LinkEmbed | null) ?? null;
        embedCache.set(url, nextEmbed);
        if (!cancelled) {
          setEmbed(nextEmbed);
          setLoading(false);
        }
      })
      .catch(() => {
        embedCache.set(url, null);
        if (!cancelled) {
          setEmbed(null);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url, youtubeEmbed]);

  if (youtubeEmbed) {
    return (
      <div className="mt-2 w-full max-w-[620px] overflow-hidden rounded-md border border-[#3f4248] bg-[#2b2d31]">
        <div className="aspect-video w-full bg-black">
          <iframe
            src={youtubeEmbed.embedUrl}
            title="YouTube video embed"
            className="h-full w-full"
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
        <a
          href={youtubeEmbed.watchUrl}
          target="_blank"
          rel="noreferrer"
          className="block border-t border-[#232428] px-3 py-2 text-xs text-[#9ecbff] hover:text-[#c2dcff]"
        >
          Open on YouTube
        </a>
      </div>
    );
  }

  if (loading) {
    return <div className="mt-2 h-[124px] w-full max-w-[520px] animate-pulse rounded-md border border-[#3f4248] bg-[#2b2d31]" />;
  }

  if (!embed) {
    return null;
  }

  const accentColor = embed.color || DEFAULT_ACCENT;
  const title = embed.title || embed.siteName || embed.providerHost;
  const siteLabel = embed.siteName || embed.providerHost;

  return (
    <a
      href={embed.resolvedUrl}
      target="_blank"
      rel="noreferrer"
      className="mt-2 block w-full max-w-[520px] overflow-hidden rounded-md border border-[#3f4248] bg-[#2b2d31] no-underline transition-colors hover:border-[#4a4e57]"
    >
      <div className="flex min-h-[124px]">
        <div className="w-1 shrink-0" style={{ backgroundColor: accentColor }} />
        <div className="min-w-0 flex-1 p-3">
          <div className="flex items-center gap-2 text-xs text-discord-muted">
            {embed.faviconUrl ? (
              <img src={embed.faviconUrl} alt="" className="h-4 w-4 rounded-sm object-cover" loading="lazy" referrerPolicy="no-referrer" />
            ) : (
              <span className="grid h-4 w-4 place-items-center rounded-sm bg-[#1e1f22] text-[#b5bac1]">
                <Globe size={11} />
              </span>
            )}
            <span className="truncate">{siteLabel}</span>
          </div>
          <p className="mt-2 text-base font-semibold leading-5 text-[#00a8fc]">{title}</p>
          {embed.description ? (
            <p className="mt-1 text-sm leading-4 text-[#dbdee1]" style={{ ...clampStyle, WebkitLineClamp: 3 }}>
              {embed.description}
            </p>
          ) : null}
          <p className="mt-2 truncate text-xs text-discord-muted">{embed.providerHost}</p>
        </div>
        {embed.imageUrl ? (
          <div className="w-[160px] shrink-0 self-stretch border-l border-[#232428] bg-[#1e1f22]">
            <img src={embed.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
          </div>
        ) : null}
      </div>
    </a>
  );
};

export default OpenGraphEmbed;