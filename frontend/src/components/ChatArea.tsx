import { Children, cloneElement, type ChangeEvent, Fragment, isValidElement, type MouseEvent, type ReactNode, FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import emojiMartDataJson from "@emoji-mart/data/sets/15/native.json";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Edit3, ExternalLink, File as FileIcon, FileAudio2, Paperclip, Pause, Play, Reply, Search, Smile, Trash2, Volume2, VolumeX, X, ZoomIn, ZoomOut } from "lucide-react";
import { useChatStore } from "../lib/stores/chatStore";
import { api } from "../lib/api";
import { resolveMediaUrl, resolveUserAvatarUrl } from "../lib/media";
import { getSocket } from "../lib/socket";
import DiscordEmojiPicker from "./DiscordEmojiPicker";
import OpenGraphEmbed from "./OpenGraphEmbed";
import StatusDot from "./StatusDot";
import type { Channel, DMMessage, Message, ServerMember, User } from "../types";

type ChatMessage = Message | DMMessage;

type Props = {
  me: User;
  mode: "SERVER" | "DM";
  channelId?: string | null;
  channelName: string;
  messages: ChatMessage[];
  focusMessageId?: string | null;
  focusMessageMode?: "unread" | "search" | null;
  typingUsers: string[];
  mentionMembers?: ServerMember[];
  channels?: Channel[];
  onOpenProfile: (user: User) => void;
  onChannelClick?: (channelId: string) => void;
  canModerateServerMessages: boolean;
  canManageChannels: boolean;
  channelReadOnly?: boolean;
  onKickMember?: (memberId: string) => void;
  onBanMember?: (memberId: string) => void;
  canKickMembers?: boolean;
  canBanMembers?: boolean;
  serverOwnerId?: string;
};

type MemberContextMenu = {
  x: number;
  y: number;
  member: User;
};

const isFileDrag = (event: DragEvent): boolean => {
  const items = event.dataTransfer?.items;
  if (!items) {
    return false;
  }
  return Array.from(items).some((item) => item.kind === "file");
};

const hasAttachableFilesInEvent = (event: DragEvent | React.DragEvent): boolean => {
  const items = event.dataTransfer?.items;
  if (!items) {
    return false;
  }

  return Array.from(items).some((item) => {
    if (item.kind !== "file") {
      return false;
    }
    const entry = (item as DataTransferItem & { webkitGetAsEntry?: () => { isDirectory?: boolean } | null }).webkitGetAsEntry?.();
    if (entry?.isDirectory) {
      return false;
    }
    return true;
  });
};

const getFirstAttachableFile = (dataTransfer: DataTransfer | null | undefined): File | null => {
  const items = dataTransfer?.items;
  if (items) {
    for (const item of Array.from(items)) {
      if (item.kind !== "file") {
        continue;
      }
      const entry = (item as DataTransferItem & { webkitGetAsEntry?: () => { isDirectory?: boolean } | null }).webkitGetAsEntry?.();
      if (entry?.isDirectory) {
        continue;
      }
      const file = item.getAsFile();
      if (file) {
        return file;
      }
    }
  }

  return dataTransfer?.files?.[0] ?? null;
};

const SYSTEM_USERNAME = "Windcord";
const DEFAULT_AVATAR_URL = `${import.meta.env.BASE_URL}default-avatar.svg`;
const INVITE_REGEX = /(?:https?:\/\/[^\s]+\/invite\/|\/invite\/)([a-z0-9-]{3,32})/i;
const URL_REGEX = /https?:\/\/[^\s<>()]+[^\s<>().,!?:;\]\)]/gi;
const DRAFT_STORAGE_KEY = "windcord_message_drafts_v1";
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
const MARKDOWN_SYNTAX_REGEX = /[`*_~\[\]()>#]|(?:^|\s)-\s|https?:\/\//;
const VIRTUALIZATION_THRESHOLD = 0;
const DEFAULT_MESSAGE_ROW_HEIGHT = 84;
const VIRTUALIZATION_OVERSCAN_PX = 200;
const FAST_HISTORY_JUMP_DURATION_MS = 150;
const EMOJI_REGEX = /(?:[\u{1F1E6}-\u{1F1FF}]{1,2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\p{Emoji_Modifier})?)*)/gu;
const EMOJI_AUTOCOMPLETE_LIMIT = 40;

const REACTION_PICKER_HEIGHT = 404;
const REACTION_PICKER_MARGIN = 12;
const IMAGE_ZOOM_MIN = 1;
const IMAGE_ZOOM_MAX = 6;
const IMAGE_ZOOM_STEP = 0.25;
const COMPOSER_MAX_HEIGHT_PX = 240;
const MESSAGE_CHAR_LIMIT = 4000;
const MESSAGE_CHAR_WARNING_THRESHOLD = 3200;
const SPOILER_FILENAME_PREFIX = "SPOILER_";

const clampComposerContent = (value: string): string => value.slice(0, MESSAGE_CHAR_LIMIT);

const isSameLocalDay = (a: Date, b: Date): boolean => {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
};

const formatMessageTimestamp = (value: string | Date): string => {
  const messageDate = value instanceof Date ? value : new Date(value);
  const now = new Date();
  const time = messageDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (isSameLocalDay(messageDate, now)) {
    return `Today at ${time}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameLocalDay(messageDate, yesterday)) {
    return `Yesterday at ${time}`;
  }

  const date = messageDate.toLocaleDateString([], { month: "numeric", day: "numeric", year: "2-digit" });
  return `${date}, ${time}`;
};

const isHighSurrogate = (codeUnit: number): boolean => codeUnit >= 0xd800 && codeUnit <= 0xdbff;
const isLowSurrogate = (codeUnit: number): boolean => codeUnit >= 0xdc00 && codeUnit <= 0xdfff;

const isCaretInsideSurrogatePair = (value: string, position: number): boolean => {
  if (position <= 0 || position >= value.length) {
    return false;
  }

  const previousCodeUnit = value.charCodeAt(position - 1);
  const nextCodeUnit = value.charCodeAt(position);
  return isHighSurrogate(previousCodeUnit) && isLowSurrogate(nextCodeUnit);
};

const REGIONAL_INDICATOR_CHAR_REGEX = /[\u{1F1E6}-\u{1F1FF}]/u;

const hasSurrogatePairBeforeCaret = (value: string, position: number): boolean => {
  if (position < 2 || position > value.length) {
    return false;
  }

  return isHighSurrogate(value.charCodeAt(position - 2)) && isLowSurrogate(value.charCodeAt(position - 1));
};

const hasSurrogatePairAfterCaret = (value: string, position: number): boolean => {
  if (position < 0 || position + 1 >= value.length) {
    return false;
  }

  return isHighSurrogate(value.charCodeAt(position)) && isLowSurrogate(value.charCodeAt(position + 1));
};

type EmojiSuggestion = {
  name: string;
  emoji: string;
  unified: string;
};

type EmojiSearchEntry = {
  shortcode: string;
  emoji: string;
  searchTerms: string[];
};

type ReactionPickerState = {
  messageId: string;
  placement: "above" | "below";
};

type ReactionSummary = {
  count: number;
  reacted: boolean;
  users: string[];
};

const emojiMartData = emojiMartDataJson as {
  emojis: Record<string, { id: string; name: string; keywords: string[]; skins: Array<{ native: string }> }>;
  aliases?: Record<string, string>;
};

const aliasesByEmojiId = Object.entries(emojiMartData.aliases ?? {}).reduce<Record<string, string[]>>((acc, [alias, id]) => {
  const normalizedId = id.toLowerCase();
  if (!acc[normalizedId]) {
    acc[normalizedId] = [];
  }
  acc[normalizedId].push(alias.toLowerCase());
  return acc;
}, {});

const REGIONAL_INDICATOR_ENTRIES: EmojiSearchEntry[] = Array.from({ length: 26 }, (_, index) => {
  const letter = String.fromCharCode(97 + index);
  const emoji = String.fromCodePoint(0x1f1e6 + index);
  const shortcode = `regional_indicator_${letter}`;

  return {
    shortcode,
    emoji,
    searchTerms: [shortcode, `letter_${letter}`, `indicator_${letter}`]
  };
});

const EMOJI_SEARCH_INDEX: EmojiSearchEntry[] = [
  ...Object.entries(emojiMartData.emojis).flatMap(([emojiId, emojiEntry]) => {
  const nativeEmoji = emojiEntry.skins?.[0]?.native;
  if (!nativeEmoji) {
    return [];
  }

  const normalizedId = emojiId.toLowerCase();
  const shortcodes = Array.from(new Set([normalizedId, ...(aliasesByEmojiId[normalizedId] ?? [])]));
  const normalizedName = emojiEntry.name.toLowerCase();
  const normalizedKeywords = (emojiEntry.keywords ?? []).map((keyword) => keyword.toLowerCase());

  return shortcodes.map((shortcode) => ({
    shortcode,
    emoji: nativeEmoji,
    searchTerms: [shortcode, normalizedName, ...normalizedKeywords]
  }));
  }),
  ...REGIONAL_INDICATOR_ENTRIES,
  // Emoji 15.1+ entries missing from @emoji-mart/data v1.2.1
  { shortcode: "head_shaking_horizontally", emoji: "🙂‍↔️", searchTerms: ["head_shaking_horizontally", "head shaking horizontally", "no", "nope", "shake", "horizontal"] },
  { shortcode: "head_shaking_vertically",   emoji: "🙂‍↕️", searchTerms: ["head_shaking_vertically",   "head shaking vertically",   "yes", "nod",   "shake", "vertical"] },
  { shortcode: "distorted_face",            emoji: "🫪",   searchTerms: ["distorted_face",            "distorted face",            "weird", "warp",  "glitch"] },
  { shortcode: "face_with_bags_under_eyes", emoji: "🫩",   searchTerms: ["face_with_bags_under_eyes", "tired", "sleepy", "exhausted", "bags"] },
];

const EMOJI_BY_SHORTCODE = EMOJI_SEARCH_INDEX.reduce<Map<string, string>>((map, entry) => {
  if (!map.has(entry.shortcode)) {
    map.set(entry.shortcode, entry.emoji);
  }
  return map;
}, new Map<string, string>());

const replaceCompletedEmojiShortcodes = (text: string): string => {
  if (!text.includes(":")) {
    return text;
  }

  return text.replace(/:([a-zA-Z0-9_+-]{1,32}):/g, (fullMatch, shortcode: string) => {
    return EMOJI_BY_SHORTCODE.get(shortcode.toLowerCase()) ?? fullMatch;
  });
};

type InvitePreview = {
  code: string;
  server: {
    id: string;
    name: string;
    description?: string;
    iconUrl?: string | null;
    bannerImageUrl?: string | null;
    createdAt: string;
    memberCount: number;
    onlineCount: number;
    offlineCount: number;
  };
};

const inviteEstablishedDateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });

const formatInviteEstablishedDate = (value: string): string | null => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return `Est. ${inviteEstablishedDateFormatter.format(date)}`;
};

const invitePreviewCache = new Map<string, InvitePreview | null>();

const extractInviteCode = (content: string): string | null => {
  const match = content.match(INVITE_REGEX);
  if (!match?.[1]) {
    return null;
  }
  return match[1].toLowerCase();
};

const extractOpenGraphUrls = (content: string): string[] => {
  const matches = content.match(URL_REGEX) ?? [];
  const uniqueUrls = new Set<string>();

  for (const rawMatch of matches) {
    try {
      const url = new URL(rawMatch);
      if (url.pathname.toLowerCase().includes("/invite/")) {
        continue;
      }
      uniqueUrls.add(url.toString());
    } catch {
      continue;
    }

    if (uniqueUrls.size >= 3) {
      break;
    }
  }

  return Array.from(uniqueUrls);
};

const loadDrafts = (): Record<string, string> => {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
};

const persistDrafts = (drafts: Record<string, string>): void => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
};

const toEmojiUnified = (emoji: string, keepFe0f = false): string => {
  const codepoints = Array.from(emoji)
    .map((char) => char.codePointAt(0)?.toString(16) ?? "")
    .filter(Boolean);

  // Original Twemoji strips all FE0F/FE0E variation selectors from filenames.
  // jdecked keeps fe0f in some ZWJ sequences (e.g. 🙂‍↔️), so we expose both forms.
  const normalized = keepFe0f
    ? codepoints.filter((codepoint) => codepoint !== "fe0e")
    : codepoints.filter((codepoint) => codepoint !== "fe0f" && codepoint !== "fe0e");

  return normalized.join("-");
};

const JDECKED_BASE = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@17.0.2/assets/svg/";
const LEGACY_CDN_BASE_URLS = [
  "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/",
  "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/dist/svg/",
  "https://unpkg.com/twemoji@14.0.2/dist/svg/"
] as const;

const emojiImageUrls = (emoji: string): string[] => {
  const unifiedNoFe0f = toEmojiUnified(emoji, false);
  if (!unifiedNoFe0f) {
    return [];
  }
  const unifiedWithFe0f = toEmojiUnified(emoji, true);
  const urls: string[] = [];
  // Try jdecked without fe0f first (covers most emojis).
  urls.push(`${JDECKED_BASE}${unifiedNoFe0f}.svg`);
  // Try jdecked with fe0f as fallback (needed for some Emoji 15.1 ZWJ sequences).
  if (unifiedWithFe0f !== unifiedNoFe0f) {
    urls.push(`${JDECKED_BASE}${unifiedWithFe0f}.svg`);
  }
  // Old Twemoji mirrors as final fallbacks.
  for (const base of LEGACY_CDN_BASE_URLS) {
    urls.push(`${base}${unifiedNoFe0f}.svg`);
  }
  return urls;
};

const unifiedToEmoji = (unified: string): string => {
  return unified
    .split("-")
    .map((codePoint) => Number.parseInt(codePoint, 16))
    .filter((codePoint) => Number.isFinite(codePoint))
    .map((codePoint) => String.fromCodePoint(codePoint))
    .join("");
};

const emojiOnlySegments = (text: string): string[] => {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return [];
  }

  const allEmojis: string[] = [];
  for (const part of parts) {
    const matches = [...part.matchAll(EMOJI_REGEX)].map((match) => match[0]);
    // Part must be entirely composed of renderable emoji (no stray text).
    if (!matches.length || matches.join("") !== part || !matches.every((emoji) => emojiImageUrls(emoji).length > 0)) {
      return [];
    }
    allEmojis.push(...matches);
  }

  if (allEmojis.length > 12) {
    return [];
  }

  return allEmojis;
};

const EmojiInlineImage = ({ emoji, sizeClassName = "h-[1.3em] w-[1.3em]" }: { emoji: string; sizeClassName?: string }): JSX.Element => {
  const urls = useMemo(() => emojiImageUrls(emoji), [emoji]);
  const [urlIndex, setUrlIndex] = useState(0);

  useEffect(() => {
    setUrlIndex(0);
  }, [emoji]);

  if (!urls.length || urlIndex >= urls.length) {
    return <span>{emoji}</span>;
  }

  return (
    <span className={`discord-inline-emoji ${sizeClassName}`}>
      <img
        src={urls[urlIndex]}
        alt=""
        draggable={false}
        onError={() => setUrlIndex((current) => current + 1)}
      />
    </span>
  );
};

const renderEmojiText = (text: string, keyPrefix: string, sizeClassName = "h-[1.3em] w-[1.3em]"): ReactNode[] => {
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(EMOJI_REGEX)) {
    const emoji = match[0];
    const index = match.index ?? 0;
    const imageUrls = emojiImageUrls(emoji);

    if (!imageUrls.length) {
      continue;
    }

    if (index > lastIndex) {
      parts.push(text.slice(lastIndex, index));
    }

    parts.push(
      <EmojiInlineImage
        key={`${keyPrefix}-${index}-${emoji}`}
        emoji={emoji}
        sizeClassName={sizeClassName}
      />
    );

    lastIndex = index + emoji.length;
  }

  if (!parts.length) {
    return [text];
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
};

const renderEmojiChildren = (children: ReactNode, keyPrefix: string, sizeClassName?: string): ReactNode => {
  return Children.map(children, (child, index) => {
    const childKey = `${keyPrefix}-${index}`;

    if (typeof child === "string") {
      return <Fragment key={childKey}>{renderEmojiText(child, childKey, sizeClassName)}</Fragment>;
    }

    if (!isValidElement(child)) {
      return child;
    }

    const existingChildren = child.props.children as ReactNode;
    if (existingChildren === undefined) {
      return child;
    }

    return cloneElement(child, {
      ...child.props,
      key: child.key ?? childKey,
      children: renderEmojiChildren(existingChildren, childKey, sizeClassName)
    });
  });
};

const EmojiGlyph = ({ emoji, sizeClassName = "h-[1.3em] w-[1.3em]" }: { emoji: string; sizeClassName?: string }): JSX.Element => {
  return <EmojiInlineImage emoji={emoji} sizeClassName={sizeClassName} />;
};

const renderComposerText = (text: string, keyPrefix: string, sizeClassName = "h-[1.25em] w-[1.25em]"): ReactNode[] => {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  const regex = new RegExp(URL_REGEX.source, "gi");
  for (const match of text.matchAll(regex)) {
    const url = match[0];
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push(...renderEmojiText(text.slice(lastIndex, index), `${keyPrefix}-pre-${index}`, sizeClassName));
    }
    parts.push(<span key={`${keyPrefix}-url-${index}`} className="text-[#00b0f4]">{url}</span>);
    lastIndex = index + url.length;
  }
  if (lastIndex < text.length) {
    parts.push(...renderEmojiText(text.slice(lastIndex), `${keyPrefix}-tail`, sizeClassName));
  }
  return parts.length ? parts : renderEmojiText(text, keyPrefix, sizeClassName);
};



const emojiOnlySizeClass = (count: number): string => {
  if (count <= 3) {
    return "h-12 w-12 md:h-16 md:w-16";
  }

  if (count <= 6) {
    return "h-10 w-10 md:h-14 md:w-14";
  }

  return "h-8 w-8 md:h-10 md:w-10";
};

const InviteEmbed = ({ inviteCode }: { inviteCode: string }): JSX.Element | null => {
  const loadServers = useChatStore((s) => s.loadServers);
  const servers = useChatStore((s) => s.servers);
  const [invite, setInvite] = useState<InvitePreview | null>(invitePreviewCache.get(inviteCode) ?? null);
  const [loading, setLoading] = useState(!invitePreviewCache.has(inviteCode));
  const [joinMessage, setJoinMessage] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const cached = invitePreviewCache.get(inviteCode);
    if (cached !== undefined) {
      setInvite(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void api
      .get(`/servers/invite/${inviteCode}`)
      .then(({ data }) => {
        const preview = data.invite as InvitePreview;
        invitePreviewCache.set(inviteCode, preview);
        if (!cancelled) {
          setInvite(preview);
          setLoading(false);
        }
      })
      .catch(() => {
        invitePreviewCache.set(inviteCode, null);
        if (!cancelled) {
          setInvite(null);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [inviteCode]);

  if (loading) {
    return (
      <div className="mt-1.5 inline-flex items-center rounded-full border border-white/[0.06] bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-discord-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] backdrop-blur-sm">
        Loading invite...
      </div>
    );
  }

  if (!invite) {
    return null;
  }

  const alreadyJoined = servers.some((server) => server.id === invite.server.id);
  const joined = alreadyJoined || joinMessage === "Joined";
  const joinMessageClassName = joined ? "text-[#86efac]" : "text-[#ffb3b8]";
  const establishedLabel = formatInviteEstablishedDate(invite.server.createdAt);
  const inviteBannerUrl = resolveMediaUrl(invite.server.bannerImageUrl);
  const inviteBannerStyle = inviteBannerUrl
    ? {
        backgroundImage: `linear-gradient(180deg, rgba(10,12,16,0.08), rgba(10,12,16,0.24)), url(${inviteBannerUrl})`,
        backgroundPosition: "center",
        backgroundSize: "cover"
      }
    : {
        background: "linear-gradient(135deg, color-mix(in srgb, var(--wc-active-top) 72%, white 28%), var(--wc-active-bottom))"
      };

  const acceptInvite = async (): Promise<void> => {
    if (joining) {
      return;
    }

    setJoining(true);
    setJoinMessage(null);
    try {
      await api.post(`/servers/invite/${invite.code}`);
      await loadServers();
      setJoinMessage("Joined");
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      const backendMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setJoinMessage(status === 403 ? (backendMessage ?? "You are banned from this server.") : (backendMessage ?? "Failed to join."));
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="wc-surface-card-strong mt-2 w-full max-w-[340px] overflow-hidden rounded-[22px] ring-1 ring-white/[0.08]">
      <div className="h-16" style={inviteBannerStyle} />

      <div className="relative px-4 pb-4 pt-0">
        <img
          src={resolveMediaUrl(invite.server.iconUrl) || DEFAULT_AVATAR_URL}
          alt={invite.server.name}
          className="-mt-7 h-14 w-14 rounded-[18px] border-4 object-cover"
          style={{ borderColor: "var(--wc-profile-cutout)" }}
        />

        <div className="mt-3 min-w-0">
          <p className="truncate text-[18px] font-bold leading-6 text-white">{invite.server.name}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-discord-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#23a55a]" />
              {invite.server.onlineCount} Online
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#80848e]" />
              {invite.server.offlineCount} Offline
            </span>
          </div>
          {establishedLabel ? <p className="mt-1 text-[11px] text-discord-muted">{establishedLabel}</p> : null}
          {invite.server.description ? <p className="mt-3 text-[12px] leading-5 text-discord-muted">{invite.server.description}</p> : null}
        </div>

        <div className="mt-4 flex items-center justify-end">
        <button
          type="button"
          onClick={() => void acceptInvite()}
          disabled={joining || joined}
          className={`${joined ? "wc-secondary-button text-discord-muted" : "wc-accent-button text-white"} rounded-xl px-3 py-1.5 text-[11px] font-semibold disabled:opacity-60`}
        >
          {joined ? "Joined" : joining ? "Joining..." : "Join"}
        </button>
        </div>
      </div>

      {joinMessage ? (
        <p className={`border-t border-white/[0.04] px-3 py-2 text-[11px] font-medium ${joinMessageClassName}`}>
          {joinMessage}
        </p>
      ) : null}
    </div>
  );
};

const formatAudioTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
};

const formatFileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "";
  }
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${mb.toFixed(2)} MB`;
  }
  const kb = bytes / 1024;
  return `${Math.max(1, Math.round(kb))} KB`;
};

const GenericAttachmentCard = ({ downloadUrl, attachmentName }: { downloadUrl: string; attachmentName?: string | null }): JSX.Element => {
  const [fileSizeLabel, setFileSizeLabel] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch(downloadUrl, { method: "HEAD", signal: controller.signal })
      .then((response) => {
        const rawSize = response.headers.get("content-length");
        const bytes = rawSize ? Number(rawSize) : 0;
        setFileSizeLabel(formatFileSize(bytes));
      })
      .catch(() => {
        setFileSizeLabel("");
      });

    return () => controller.abort();
  }, [downloadUrl]);

  const displayName = attachmentName || "attachment";

  return (
    <a
      href={downloadUrl}
      download={displayName}
      className="mt-2 flex w-full max-w-[460px] items-center gap-3 rounded-lg border border-[#3a3e46] bg-[#262931] px-4 py-3 transition hover:border-[#4a4f59] hover:bg-[#2b2e37]"
    >
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded bg-[#d8dcff] text-[#7b84ea]">
        <FileIcon size={22} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-base leading-5 text-[#5ea2ff]">{displayName}</p>
        <p className="mt-0.5 text-xs text-[#9ba0aa]">{fileSizeLabel || "File"}</p>
      </div>
    </a>
  );
};

const AudioAttachmentPlayer = ({ src, attachmentName, downloadUrl }: { src: string; attachmentName?: string | null; downloadUrl: string }): JSX.Element => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [fileSizeLabel, setFileSizeLabel] = useState("");

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const onTimeUpdate = (): void => setCurrentTime(audio.currentTime || 0);
    const onLoadedMetadata = (): void => setDuration(audio.duration || 0);
    const onEnded = (): void => setIsPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(src, { method: "HEAD", signal: controller.signal })
      .then((response) => {
        const rawSize = response.headers.get("content-length");
        const bytes = rawSize ? Number(rawSize) : 0;
        setFileSizeLabel(formatFileSize(bytes));
      })
      .catch(() => {
        setFileSizeLabel("");
      });

    return () => controller.abort();
  }, [src]);

  const togglePlayback = async (): Promise<void> => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    try {
      await audio.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  };

  const onSeek = (nextTime: number): void => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const onProgressClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (!duration || !progressBarRef.current) {
      return;
    }
    const rect = progressBarRef.current.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    onSeek(duration * ratio);
  };

  const toggleMute = (): void => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const nextMuted = !audio.muted;
    audio.muted = nextMuted;
    setIsMuted(nextMuted);
  };

  const displayName = attachmentName || "audio";
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const timer = `${formatAudioTime(currentTime)} / ${formatAudioTime(duration)}`;

  return (
    <div className="mt-2 w-full max-w-[460px] rounded-lg border border-[#3a3e46] bg-[#1f2229] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <audio ref={audioRef} src={src} preload="metadata" />
      <div className="flex items-center gap-2">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded" style={{ backgroundColor: "var(--wc-audio-icon-bg)", color: "var(--wc-audio-icon-fg)" }}>
          <FileAudio2 size={18} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-base leading-5" style={{ color: "var(--wc-accent-light)" }}>{displayName}</p>
          {fileSizeLabel ? <p className="mt-0.5 text-xs text-[#949ba4]">{fileSizeLabel}</p> : null}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 rounded-lg bg-[#0f1116] px-3 py-2">
        <button
          type="button"
          onClick={() => void togglePlayback()}
          className="grid h-6 w-6 shrink-0 place-items-center text-[#b5bac1] hover:text-white"
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
        </button>
        <span className="shrink-0 text-sm font-medium text-[#dbdee1]">{timer}</span>
        <div
          ref={progressBarRef}
          onClick={onProgressClick}
          className="relative h-2 min-w-0 flex-1 cursor-pointer rounded-full bg-[#535862]"
        >
          <div className="absolute left-0 top-0 h-2 rounded-full" style={{ width: `${progress * 100}%`, backgroundColor: "var(--wc-audio-progress-bg)" }} />
          <div
            className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-[#b5bac1]"
            style={{ left: `calc(${progress * 100}% - 5px)` }}
          />
        </div>
        <button
          type="button"
          onClick={toggleMute}
          className="grid h-6 w-6 shrink-0 place-items-center text-[#b5bac1] hover:text-white"
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <a
          href={downloadUrl}
          download={displayName}
          className="ml-auto rounded bg-[#3a3d45] px-2 py-1 text-[11px] font-semibold text-white hover:bg-[#4a4e57]"
        >
          <span className="inline-flex items-center gap-1"><Download size={12} /> Download</span>
        </a>
      </div>
    </div>
  );
};

const ImageAttachmentPreview = ({
  src,
  alt,
  blurred,
  onLoad,
}: {
  src: string;
  alt: string;
  blurred: boolean;
  onLoad?: () => void;
}): JSX.Element => {
  const [loaded, setLoaded] = useState(false);
  const [reservedSize, setReservedSize] = useState<{ width: number; height: number } | null>(null);
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;

  useEffect(() => {
    setLoaded(false);

    const probe = new Image();
    probe.decoding = "async";
    probe.src = src;

    probe.onload = () => {
      const naturalWidth = probe.naturalWidth || 1;
      const naturalHeight = probe.naturalHeight || 1;
      // Cap width to avoid horizontal overflow in the chat area.
      const MAX_WIDTH = 480;
      const MAX_HEIGHT = 320;
      const ratio = naturalWidth / naturalHeight;
      let displayWidth = naturalWidth;
      let displayHeight = naturalHeight;
      // Scale down proportionally to fit within max bounds.
      if (displayWidth > MAX_WIDTH) {
        displayWidth = MAX_WIDTH;
        displayHeight = Math.round(MAX_WIDTH / ratio);
      }
      if (displayHeight > MAX_HEIGHT) {
        displayHeight = MAX_HEIGHT;
        displayWidth = Math.round(MAX_HEIGHT * ratio);
      }
      displayWidth = Math.max(120, displayWidth);
      setReservedSize({ width: displayWidth, height: displayHeight });
      setLoaded(true);
    };

    probe.onerror = () => {
      setLoaded(true);
    };

    return () => {
      probe.onload = null;
      probe.onerror = null;
    };
  }, [src]);

  // After React commits the loaded state + final dimensions to the DOM, fire the scroll callback.
  useEffect(() => {
    if (loaded) {
      onLoadRef.current?.();
    }
  }, [loaded]);

  return (
    <div
      className="relative inline-block max-w-full overflow-hidden rounded-md bg-[#2b2d31]"
      style={reservedSize ? { width: reservedSize.width, height: reservedSize.height } : { width: 320, height: 180 }}
    >
      {!loaded ? <div className="absolute inset-0 bg-[#2b2d31]" /> : null}
      <img
        src={src}
        alt={alt}
        className={`h-full w-full object-cover transition ${blurred ? "blur-2xl" : ""} ${loaded ? "opacity-100" : "opacity-0"}`}
        onLoad={() => {
          setLoaded(true);
        }}
      />
    </div>
  );
};

const VideoAttachmentPlayer = ({
  src,
  attachmentName,
  downloadUrl,
  onMediaReady
}: {
  src: string;
  attachmentName?: string | null;
  downloadUrl: string;
  onMediaReady?: () => void;
}): JSX.Element => {
  return (
    <div className="mt-2 w-full max-w-[min(90vw,520px)] overflow-hidden rounded-xl" style={{ backgroundColor: "rgba(0, 0, 0, 0.28)", border: "1px solid rgba(255, 255, 255, 0.04)" }}>
      <video src={src} controls className="video-attachment-media w-full" style={{ backgroundColor: "#000", maxHeight: "480px", objectFit: "contain" }} onLoadedMetadata={onMediaReady} />
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <p className="truncate text-xs text-discord-muted">{attachmentName || "video"}</p>
        <a
          href={downloadUrl}
          download={attachmentName || "video"}
          className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-white/[0.08]"
          style={{ backgroundColor: "rgba(255, 255, 255, 0.04)" }}
        >
          <span className="inline-flex items-center gap-1"><Download size={12} /> Download</span>
        </a>
      </div>
    </div>
  );
};

const clampImageZoom = (value: number): number => Math.min(IMAGE_ZOOM_MAX, Math.max(IMAGE_ZOOM_MIN, value));

const withSpoilerFilename = (file: File): File => {
  if (file.name.startsWith(SPOILER_FILENAME_PREFIX)) {
    return file;
  }

  return new File([file], `${SPOILER_FILENAME_PREFIX}${file.name}`, {
    type: file.type,
    lastModified: file.lastModified
  });
};

const ChatArea = ({
  me,
  mode,
  channelId,
  channelName,
  messages,
  focusMessageId,
  focusMessageMode = null,
  typingUsers,
  mentionMembers = [],
  channels = [],
  onChannelClick,
  onOpenProfile,
  canModerateServerMessages,
  canManageChannels,
  channelReadOnly = false,
  onKickMember,
  onBanMember,
  canKickMembers,
  canBanMembers,
  serverOwnerId
}: Props): JSX.Element => {
  const sendMessage = useChatStore((s) => s.sendMessage);
  const sendDMMessage = useChatStore((s) => s.sendDMMessage);
  const editMessage = useChatStore((s) => s.editMessage);
  const editDMMessage = useChatStore((s) => s.editDMMessage);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const deleteDMMessage = useChatStore((s) => s.deleteDMMessage);
  const toggleReaction = useChatStore((s) => s.toggleReaction);
  const toggleDMReaction = useChatStore((s) => s.toggleDMReaction);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const activeDMId = useChatStore((s) => s.activeDMId);

  // Check if current user can delete a message (accounts for owner protection)
  const canDeleteMessage = (message: ChatMessage): boolean => {
    if (message.authorId === me.id) return true;
    if (mode === "DM") return false;
    if (!canModerateServerMessages) return false;
    // Don't allow deleting owner's messages unless you are the owner
    if (serverOwnerId && message.authorId === serverOwnerId && me.id !== serverOwnerId) return false;
    return true;
  };
  const hasOlderMessages = useChatStore((s) => (mode === "DM" ? s.hasOlderDMMessages : s.hasOlderMessages));
  const hasNewerMessages = useChatStore((s) => (mode === "SERVER" ? s.hasNewerMessages : s.hasNewerDMMessages));
  const loadingOlderMessages = useChatStore((s) => s.loadingOlderMessages);
  const loadingNewerMessages = useChatStore((s) => s.loadingNewerMessages);
  const loadMessages = useChatStore((s) => (mode === "SERVER" ? s.loadMessages : s.loadDMMessages));
  const loadOlderMessages = useChatStore((s) => (mode === "DM" ? s.loadOlderDMMessages : s.loadOlderMessages));
  const loadNewerMessages = useChatStore((s) => (mode === "DM" ? s.loadNewerDMMessages : s.loadNewerMessages));
  const openChannelMessage = useChatStore((s) => s.openChannelMessage);
  const openDMMessage = useChatStore((s) => s.openDMMessage);

  const onToggleReaction = useCallback(
    (messageId: string, emoji: string, reactions?: { emoji: string; userId: string }[]) => {
      // Enforce 20-unique-emoji limit: allow toggling existing emoji, block adding a new one past 20
      if (reactions) {
        const uniqueEmojis = new Set(reactions.map((r) => r.emoji));
        const alreadyExists = uniqueEmojis.has(emoji);
        if (!alreadyExists && uniqueEmojis.size >= 20) return;
      }
      if (mode === "DM") {
        if (!activeDMId) return;
        void toggleDMReaction(activeDMId, messageId, emoji);
        return;
      }
      void toggleReaction(messageId, emoji);
    },
    [activeDMId, mode, toggleDMReaction, toggleReaction]
  );

  const [content, setContent] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>(() => loadDrafts());
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentSpoiler, setAttachmentSpoiler] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [reactionPickerFor, setReactionPickerFor] = useState<ReactionPickerState | null>(null);
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null);
  const [memberContextMenu, setMemberContextMenu] = useState<MemberContextMenu | null>(null);
  const [highlightedMentionIndex, setHighlightedMentionIndex] = useState(0);
  const [highlightedEmojiIndex, setHighlightedEmojiIndex] = useState(0);
  const [highlightedChannelIndex, setHighlightedChannelIndex] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<{ src: string; name: string } | null>(null);
  const [imageZoom, setImageZoom] = useState(1);
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 });
  const [isImagePanning, setIsImagePanning] = useState(false);
  const [revealedSpoilers, setRevealedSpoilers] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composerPreviewRef = useRef<HTMLDivElement>(null);
  const mentionMenuListRef = useRef<HTMLDivElement>(null);
  const channelMenuListRef = useRef<HTMLDivElement>(null);
  const composerEmojiMenuListRef = useRef<HTMLDivElement>(null);
  const editEmojiMenuListRef = useRef<HTMLDivElement>(null);
  const [composerSel, setComposerSel] = useState<{ start: number; end: number } | null>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const editPreviewRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerPickerRef = useRef<HTMLDivElement>(null);
  const consumedFocusMessageIdRef = useRef<string | null>(null);
  const initialScrollPositionedRef = useRef(false);
  const stickToBottomRef = useRef(true);
  const lastScrollTopRef = useRef(0);
  const previousMessageCountRef = useRef(0);
  const pendingBottomLockFrameRef = useRef<number | null>(null);
  const prevScrollHeightRef = useRef(0);
  const prevFirstMessageIdRef = useRef<string | null>(null);
  const loadOlderMessagesRef = useRef(loadOlderMessages);
  loadOlderMessagesRef.current = loadOlderMessages;
  const loadNewerMessagesRef = useRef(loadNewerMessages);
  loadNewerMessagesRef.current = loadNewerMessages;
  const hasNewerMessagesRef = useRef(hasNewerMessages);
  hasNewerMessagesRef.current = hasNewerMessages;
  const loadingNewerMessagesRef = useRef(loadingNewerMessages);
  loadingNewerMessagesRef.current = loadingNewerMessages;
  const historyNewerPagingRef = useRef(false);
  const scrollRafRef = useRef<number | null>(null);
  const scrollAnimationFrameRef = useRef<number | null>(null);
  const replyJumpTimeoutRef = useRef<number | null>(null);
  const pendingScrollRequestRef = useRef<{ messageId: string; block: ScrollLogicalPosition; durationMs: number } | null>(null);
  const pendingPresentJumpRef = useRef(false);
  const measuredMessageHeightsRef = useRef<Record<string, number>>({});
  const messageResizeObserversRef = useRef<Record<string, ResizeObserver>>({});
  // Stable per-message-ID ref callbacks so React never calls them with null/element on
  // re-renders — only when the element actually mounts or unmounts.
  const stableRefsMap = useRef<Record<string, (node: HTMLElement | null) => void>>({});
  const sendInFlightRef = useRef(false);
  const dragDepthRef = useRef(0);
  const backspaceHeldRef = useRef(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [heightVersion, setHeightVersion] = useState(0);
  const imageViewportRef = useRef<HTMLDivElement>(null);
  const fullscreenImageRef = useRef<HTMLImageElement>(null);
  const imagePanStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const prevLastMessageIdRef = useRef<string | null>(null);

  const scrollMenuItemIntoView = useCallback((container: HTMLDivElement | null, itemIndex: number): void => {
    if (!container || itemIndex < 0) {
      return;
    }

    const item = container.children.item(itemIndex);
    if (!(item instanceof HTMLElement)) {
      return;
    }

    const itemTop = item.offsetTop;
    const itemBottom = itemTop + item.offsetHeight;
    const viewTop = container.scrollTop;
    const viewBottom = viewTop + container.clientHeight;

    if (itemTop < viewTop) {
      container.scrollTop = itemTop;
      return;
    }

    if (itemBottom > viewBottom) {
      container.scrollTop = itemBottom - container.clientHeight;
    }
  }, []);

  const requestLoadNewerMessages = useCallback((): void => {
    if (!hasNewerMessagesRef.current || historyNewerPagingRef.current) {
      return;
    }

    stickToBottomRef.current = false;
    historyNewerPagingRef.current = true;
    void loadNewerMessagesRef.current().finally(() => {
      window.requestAnimationFrame(() => {
        if (!loadingNewerMessagesRef.current) {
          historyNewerPagingRef.current = false;
        }
      });
    });
  }, []);

  const stopScrollAnimation = useCallback((): void => {
    if (scrollAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollAnimationFrameRef.current);
      scrollAnimationFrameRef.current = null;
    }
  }, []);

  const animateScrollTo = useCallback((targetTop: number, durationMs: number): boolean => {
    const node = scrollRef.current;
    if (!node) {
      return false;
    }

    const maxTop = Math.max(0, node.scrollHeight - node.clientHeight);
    const boundedTop = Math.min(Math.max(0, targetTop), maxTop);

    stopScrollAnimation();
    if (durationMs <= 0 || Math.abs(node.scrollTop - boundedTop) < 2) {
      node.scrollTop = boundedTop;
      lastScrollTopRef.current = boundedTop;
      return true;
    }

    const startTop = node.scrollTop;
    const delta = boundedTop - startTop;
    const startedAt = performance.now();

    const step = (timestamp: number): void => {
      const progress = Math.min((timestamp - startedAt) / durationMs, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      node.scrollTop = startTop + (delta * easedProgress);

      if (progress < 1) {
        scrollAnimationFrameRef.current = window.requestAnimationFrame(step);
      } else {
        scrollAnimationFrameRef.current = null;
      }
    };

    scrollAnimationFrameRef.current = window.requestAnimationFrame(step);
    return true;
  }, [stopScrollAnimation]);

  const centerMessageElement = useCallback((messageId: string, durationMs: number, block: ScrollLogicalPosition): boolean => {
    const node = scrollRef.current;
    if (!node) {
      return false;
    }

    const element = document.getElementById(`message-${messageId}`) as HTMLElement | null;
    if (!element) {
      return false;
    }

    let targetTop = element.offsetTop;
    if (block === "center") {
      targetTop = element.offsetTop - (node.clientHeight / 2) + (element.offsetHeight / 2);
    } else if (block === "end") {
      targetTop = element.offsetTop + element.offsetHeight - node.clientHeight;
    }

    return animateScrollTo(targetTop, durationMs);
  }, [animateScrollTo]);

  const getImagePanBounds = useCallback((zoomValue: number): { maxX: number; maxY: number } => {
    const viewport = imageViewportRef.current;
    const image = fullscreenImageRef.current;
    if (!viewport || !image) {
      return { maxX: 0, maxY: 0 };
    }

    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    const baseWidth = image.clientWidth;
    const baseHeight = image.clientHeight;
    if (!viewportWidth || !viewportHeight || !baseWidth || !baseHeight) {
      return { maxX: 0, maxY: 0 };
    }

    const scaledWidth = baseWidth * zoomValue;
    const scaledHeight = baseHeight * zoomValue;
    return {
      maxX: Math.max(0, (scaledWidth - viewportWidth) / 2),
      maxY: Math.max(0, (scaledHeight - viewportHeight) / 2)
    };
  }, []);

  const clampPan = useCallback((pan: { x: number; y: number }, zoomValue: number): { x: number; y: number } => {
    const { maxX, maxY } = getImagePanBounds(zoomValue);
    return {
      x: Math.min(maxX, Math.max(-maxX, pan.x)),
      y: Math.min(maxY, Math.max(-maxY, pan.y))
    };
  }, [getImagePanBounds]);

  useEffect(() => {
    if (!fullscreenImage) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setFullscreenImage(null);
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setImageZoom((current) => {
          const nextZoom = clampImageZoom(current + IMAGE_ZOOM_STEP);
          setImagePan((pan) => clampPan(pan, nextZoom));
          return nextZoom;
        });
      }
      if (event.key === "-") {
        event.preventDefault();
        setImageZoom((current) => {
          const nextZoom = clampImageZoom(current - IMAGE_ZOOM_STEP);
          setImagePan((pan) => clampPan(pan, nextZoom));
          return nextZoom;
        });
      }
      if (event.key === "0") {
        event.preventDefault();
        setImageZoom(1);
        setImagePan({ x: 0, y: 0 });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreenImage]);

  useEffect(() => {
    if (!fullscreenImage) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("wheel", onWheel);
      imagePanStartRef.current = null;
      setIsImagePanning(false);
      setImagePan({ x: 0, y: 0 });
    };
  }, [fullscreenImage]);

  useEffect(() => {
    if (!fullscreenImage) {
      return;
    }

    const onResize = (): void => {
      setImagePan((pan) => clampPan(pan, imageZoom));
    };

    window.addEventListener("resize", onResize);
    const id = window.setTimeout(onResize, 0);
    return () => {
      window.removeEventListener("resize", onResize);
      window.clearTimeout(id);
    };
  }, [fullscreenImage, imageZoom, clampPan]);

  const activeDraftKey = useMemo(() => {
    if (mode === "SERVER" && activeChannelId) {
      return `SERVER:${activeChannelId}`;
    }
    if (mode === "DM" && activeDMId) {
      return `DM:${activeDMId}`;
    }
    return null;
  }, [mode, activeChannelId, activeDMId]);

  const mentionToken = useMemo(() => {
    if (mode !== "SERVER") {
      return null;
    }
    return content.match(/(?:^|\s)@([a-zA-Z0-9_]*)$/);
  }, [content, mode]);

  const channelToken = useMemo(() => {
    if (mode !== "SERVER") {
      return null;
    }
    return content.match(/(?:^|\s)#([a-zA-Z0-9_\-]*)$/);
  }, [content, mode]);

  const mentionQuery = mentionToken ? mentionToken[1].toLowerCase() : null;
  const channelQuery = channelToken ? (channelToken[1] ?? "").toLowerCase() : null;
  const emojiSourceText = editingId ? editingDraft : content;
  const emojiToken = useMemo(() => emojiSourceText.match(/(?:^|\s):([a-zA-Z0-9_+-]{1,32})$/), [emojiSourceText]);
  const emojiQuery = emojiToken?.[1]?.toLowerCase() ?? null;
  const mentionCandidates = useMemo(() => {
    if (mode !== "SERVER" || !mentionToken) {
      return [] as (ServerMember | { type: "special"; value: "everyone" | "here"; display: string })[];
    }

    const query = mentionQuery ?? "";
    const results: (ServerMember | { type: "special"; value: "everyone" | "here"; display: string })[] = [];

    // Add @everyone and @here if they match the query
    if ("everyone".includes(query) || query === "") {
      results.push({ type: "special", value: "everyone", display: "everyone" });
    }
    if ("here".includes(query) || query === "") {
      results.push({ type: "special", value: "here", display: "here" });
    }

    // Add member candidates
    const filtered = mentionMembers.filter((member) => {
      if (member.user.isDeleted) {
        return false;
      }
      const displayName = (member.nickname || member.user.nickname || member.user.username).toLowerCase();
      const username = member.user.username.toLowerCase();
      return displayName.includes(query) || username.includes(query);
    });

    results.push(...filtered.sort((a, b) => {
      const aDisplay = (a.nickname || a.user.nickname || a.user.username).toLowerCase();
      const bDisplay = (b.nickname || b.user.nickname || b.user.username).toLowerCase();
      const aStarts = aDisplay.startsWith(query) || a.user.username.toLowerCase().startsWith(query);
      const bStarts = bDisplay.startsWith(query) || b.user.username.toLowerCase().startsWith(query);
      if (aStarts !== bStarts) {
        return aStarts ? -1 : 1;
      }
      return aDisplay.localeCompare(bDisplay);
    }));

    return results;
  }, [mentionMembers, mentionQuery, mentionToken, mode]);

  const emojiCandidates = useMemo(() => {
    if (!emojiQuery || emojiQuery.length < 2) {
      return [] as EmojiSuggestion[];
    }

    const seen = new Set<string>();

    return EMOJI_SEARCH_INDEX
      .filter((entry) => entry.searchTerms.some((term) => term.includes(emojiQuery)))
      .flatMap((entry) => {
        if (seen.has(entry.shortcode)) {
          return [];
        }
        seen.add(entry.shortcode);
        return [{
          name: entry.shortcode,
          emoji: entry.emoji,
          unified: entry.shortcode
        }];
      })
      .sort((a, b) => {
        const aStarts = a.name.startsWith(emojiQuery);
        const bStarts = b.name.startsWith(emojiQuery);
        if (aStarts !== bStarts) {
          return aStarts ? -1 : 1;
        }
        if (a.name.length !== b.name.length) {
          return a.name.length - b.name.length;
        }
        return a.name.localeCompare(b.name);
      })
        .slice(0, EMOJI_AUTOCOMPLETE_LIMIT);
  }, [emojiQuery]);

  const mentionMenuOpen = mode === "SERVER" && Boolean(mentionToken) && mentionCandidates.length > 0;
  const channelCandidates = useMemo(() => {
    if (mode !== "SERVER" || !channelToken) {
      return [] as Channel[];
    }
    const query = channelQuery ?? "";
    const textChannels = channels.filter((c) => c.type === "TEXT");
    const filtered = textChannels.filter((c) => c.name.toLowerCase().includes(query));
    return filtered
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(query);
        const bStarts = b.name.toLowerCase().startsWith(query);
        if (aStarts !== bStarts) return aStarts ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [channels, channelQuery, channelToken, mode]);
  const channelMenuOpen = mode === "SERVER" && Boolean(channelToken) && channelCandidates.length > 0;
  const emojiMenuOpen = Boolean(emojiToken) && emojiCandidates.length > 0;
  const overlayMenuOpen = showPicker || reactionPickerFor !== null || mentionMenuOpen || emojiMenuOpen || channelMenuOpen;
  const composerMatchMenuClass = "absolute bottom-14 left-4 right-4 z-40 overflow-hidden rounded-[22px] wc-popover";
  const composerMatchMenuHeaderClass = "border-b border-white/[0.04] px-3.5 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-discord-muted";
  const composerMatchMenuListClass = "discord-scrollbar max-h-60 overflow-y-auto p-2";
  const composerMatchMenuItemClass = "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left transition";

  const membersByUsername = useMemo(() => {
    const map = new Map<string, ServerMember>();
    for (const member of mentionMembers) {
      map.set(member.user.username.toLowerCase(), member);
    }
    return map;
  }, [mentionMembers]);

  const memberDisplayNamesByUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of mentionMembers) {
      map.set(member.userId, member.nickname || member.user.nickname || member.user.username);
    }
    return map;
  }, [mentionMembers]);

  const memberNickColorByUserId = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const member of mentionMembers) {
      map.set(member.userId, member.nickColor ?? null);
    }
    return map;
  }, [mentionMembers]);

  const membersByNickname = useMemo(() => {
    const map = new Map<string, ServerMember>();
    for (const member of mentionMembers) {
      const displayName = (member.nickname || member.user.nickname || "").trim().toLowerCase();
      if (displayName) {
        map.set(displayName, member);
      }
    }
    return map;
  }, [mentionMembers]);

  const channelsByName = useMemo(() => {
    const map = new Map<string, Channel>();
    for (const channel of channels) {
      if (channel.type === "TEXT") {
        map.set(channel.name.toLowerCase(), channel);
      }
    }
    return map;
  }, [channels]);

  const resolveMentionMember = (token: string): ServerMember | null => {
    const lower = token.toLowerCase();
    return membersByUsername.get(lower) || membersByNickname.get(lower) || null;
  };

  const extractMentionedUserIds = (text: string): Set<string> => {
    const ids = new Set<string>();
    const matches = text.matchAll(/(^|\s)@([a-zA-Z0-9_]{1,32})/g);
    for (const match of matches) {
      const token = match[2];
      if (!token) {
        continue;
      }
      
      // Handle @everyone - mention all members
      if (token.toLowerCase() === "everyone") {
        mentionMembers.forEach((member) => {
          if (!member.user.isDeleted) {
            ids.add(member.user.id);
          }
        });
        continue;
      }
      
      // Handle @here - mention online members only
      if (token.toLowerCase() === "here") {
        mentionMembers.forEach((member) => {
          if (!member.user.isDeleted && member.user.status !== "OFFLINE" && member.user.status !== "INVISIBLE") {
            ids.add(member.user.id);
          }
        });
        continue;
      }
      
      // Handle regular @username mentions
      const member = resolveMentionMember(token);
      if (member) {
        ids.add(member.user.id);
      }
    }
    return ids;
  };

  const renderMentionPills = (rawContent: string): JSX.Element => {
    const lines = rawContent.split("\n");
    return (
      <span className="whitespace-pre-wrap">
        {lines.map((line, lineIndex) => {
          const parts: ReactNode[] = [];
          // Match both @username and #channelname tokens
          const regex = /(^|\s)([@#])([a-zA-Z0-9_\-]{1,32})/g;
          let lastIndex = 0;
          let match = regex.exec(line);

          while (match) {
            const fullMatch = match[0];
            const leading = match[1] ?? "";
            const sigil = match[2] ?? "";
            const token = match[3] ?? "";
            const fullStart = match.index;
            const tokenStart = fullStart + leading.length;

            if (fullStart > lastIndex) {
              parts.push(...renderEmojiText(line.slice(lastIndex, fullStart), `mention-text-${lineIndex}-${lastIndex}`));
            }
            if (leading) {
              parts.push(...renderEmojiText(leading, `mention-leading-${lineIndex}-${tokenStart}`));
            }

            if (sigil === "@") {
              // Handle @everyone and @here with special styling
              if (token.toLowerCase() === "everyone" || token.toLowerCase() === "here") {
                const isEveryone = token.toLowerCase() === "everyone";
                parts.push(
                  <span
                    key={`mention-${lineIndex}-${tokenStart}-special`}
                    className="mx-0.5 rounded-[3px] bg-[#f0b232]/20 px-1 font-medium text-[#f0b232] hover:bg-[#f0b232]/30"
                  >
                    @{token}
                  </span>
                );
              } else {
                const member = resolveMentionMember(token);
                if (member) {
                  const display = member.nickname || member.user.nickname || member.user.username;
                  parts.push(
                    <button
                      key={`mention-${lineIndex}-${tokenStart}-${member.user.id}`}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                      }}
                      onClick={() => onOpenProfile(member.user)}
                      className="mx-0.5 rounded-[3px] px-1 font-medium hover:text-white" style={{ backgroundColor: "var(--wc-mention-bg)", color: "var(--wc-mention-text)" }} onMouseEnter={(e) => { (e.target as HTMLElement).style.backgroundColor = "var(--wc-accent)"; }} onMouseLeave={(e) => { (e.target as HTMLElement).style.backgroundColor = "var(--wc-mention-bg)"; }}
                    >
                      @{display}
                    </button>
                  );
                } else {
                  parts.push(fullMatch);
                }
              }
            } else {
              // sigil === "#"
              const channel = channelsByName.get(token.toLowerCase());
              if (channel) {
                parts.push(
                  <button
                    key={`chanmention-${lineIndex}-${tokenStart}-${channel.id}`}
                    type="button"
                    onPointerDown={(event) => {
                      if (event.button !== 0) {
                        return;
                      }
                      event.preventDefault();
                      event.stopPropagation();
                      void onChannelClick?.(channel.id);
                    }}
                    onClick={(event) => {
                      if (event.detail !== 0) {
                        event.preventDefault();
                        event.stopPropagation();
                        return;
                      }
                      event.preventDefault();
                      event.stopPropagation();
                      void onChannelClick?.(channel.id);
                    }}
                    className="mx-0.5 rounded-[3px] px-1 font-medium hover:text-white" style={{ backgroundColor: "var(--wc-mention-bg)", color: "var(--wc-mention-text)" }} onMouseEnter={(e) => { (e.target as HTMLElement).style.backgroundColor = "var(--wc-accent)"; }} onMouseLeave={(e) => { (e.target as HTMLElement).style.backgroundColor = "var(--wc-mention-bg)"; }}
                  >
                    # {channel.name}
                  </button>
                );
              } else {
                parts.push(fullMatch);
              }
            }

            lastIndex = fullStart + fullMatch.length;
            match = regex.exec(line);
          }

          if (lastIndex < line.length) {
            parts.push(...renderEmojiText(line.slice(lastIndex), `mention-tail-${lineIndex}-${lastIndex}`));
          }

          return (
            <span key={`line-${lineIndex}`}>
              {parts}
              {lineIndex < lines.length - 1 ? "\n" : ""}
            </span>
          );
        })}
      </span>
    );
  };

  const renderChannelMentionText = (text: string, keyPrefix: string, sizeClassName?: string): ReactNode[] => {
    if (mode !== "SERVER" || channelsByName.size === 0 || !onChannelClick) {
      return renderEmojiText(text, keyPrefix, sizeClassName);
    }

    const parts: ReactNode[] = [];
    const regex = /(^|\s)#([a-zA-Z0-9_\-]{1,32})/g;
    let lastIndex = 0;

    for (const match of text.matchAll(regex)) {
      const fullMatch = match[0] ?? "";
      const leading = match[1] ?? "";
      const token = match[2] ?? "";
      const fullStart = match.index ?? 0;
      const tokenStart = fullStart + leading.length;
      const channel = channelsByName.get(token.toLowerCase());

      if (!channel) {
        continue;
      }

      if (fullStart > lastIndex) {
        parts.push(...renderEmojiText(text.slice(lastIndex, fullStart), `${keyPrefix}-text-${fullStart}`, sizeClassName));
      }

      if (leading) {
        parts.push(...renderEmojiText(leading, `${keyPrefix}-leading-${tokenStart}`, sizeClassName));
      }

      parts.push(
        <button
          key={`${keyPrefix}-channel-${channel.id}-${tokenStart}`}
          type="button"
          onPointerDown={(event) => {
            if (event.button !== 0) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            void onChannelClick(channel.id);
          }}
          onClick={(event) => {
            if (event.detail !== 0) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            void onChannelClick(channel.id);
          }}
          className="mx-0.5 rounded-[3px] px-1 font-medium hover:text-white"
          style={{ backgroundColor: "var(--wc-mention-bg)", color: "var(--wc-mention-text)" }}
          onMouseEnter={(event) => {
            event.currentTarget.style.backgroundColor = "var(--wc-accent)";
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.backgroundColor = "var(--wc-mention-bg)";
          }}
        >
          # {channel.name}
        </button>
      );

      lastIndex = fullStart + fullMatch.length;
    }

    if (!parts.length) {
      return renderEmojiText(text, keyPrefix, sizeClassName);
    }

    if (lastIndex < text.length) {
      parts.push(...renderEmojiText(text.slice(lastIndex), `${keyPrefix}-tail-${lastIndex}`, sizeClassName));
    }

    return parts;
  };

  const renderMarkdownChildren = (children: ReactNode, keyPrefix: string, sizeClassName?: string): ReactNode => {
    return Children.map(children, (child, index) => {
      const childKey = `${keyPrefix}-${index}`;

      if (typeof child === "string") {
        return <Fragment key={childKey}>{renderChannelMentionText(child, childKey, sizeClassName)}</Fragment>;
      }

      if (!isValidElement(child)) {
        return child;
      }

      const existingChildren = child.props.children as ReactNode;
      if (existingChildren === undefined) {
        return child;
      }

      const childType = typeof child.type === "string" ? child.type : null;
      const nextChildren = childType === "a"
        ? renderEmojiChildren(existingChildren, childKey, sizeClassName)
        : renderMarkdownChildren(existingChildren, childKey, sizeClassName);

      return cloneElement(child, {
        ...child.props,
        key: child.key ?? childKey,
        children: nextChildren
      });
    });
  };

  const renderMessageContent = (rawContent: string): JSX.Element => {
    const jumboEmoji = emojiOnlySegments(rawContent);
    if (jumboEmoji.length > 0) {
      const sizeClassName = emojiOnlySizeClass(jumboEmoji.length);
      return (
        <span className="discord-jumbo-emoji-row" aria-label={rawContent.trim()}>
          {jumboEmoji.map((emoji, index) => (
            <EmojiGlyph key={`jumbo-${index}-${emoji}`} emoji={emoji} sizeClassName={sizeClassName} />
          ))}
        </span>
      );
    }

    // Check for markdown syntax FIRST — if present, let ReactMarkdown handle it
    // so headings, lists, code blocks, etc. render correctly.
    // Channel mentions in markdown still render as clickable pills.
    if (MARKDOWN_SYNTAX_REGEX.test(rawContent)) {
      // Proceed to ReactMarkdown below
    } else if (mode === "SERVER" && (/(^|\s)@([a-zA-Z0-9_]{1,32})/.test(rawContent) || (channels.length > 0 && /(^|\s)#([a-zA-Z0-9_\-]{1,32})/.test(rawContent)))) {
      return renderMentionPills(rawContent);
    } else {
      return <span className="whitespace-pre-wrap">{renderEmojiText(rawContent, "plain-message")}</span>;
    }

    // Preserve multiple consecutive blank lines by filling each extra blank line
    // with a non-breaking space paragraph — Markdown collapses runs of 3+ newlines
    // into a single paragraph break otherwise.
    const processedContent = rawContent.replace(/\n{3,}/g, (match) => {
      const extraBlanks = match.length - 2;
      return "\n\n" + "\u00A0\n\n".repeat(extraBlanks);
    });

    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[]}
        components={{
          // Headings
          h1: ({ children }) => <h1 className="mt-4 mb-2 text-2xl font-bold text-white">{renderMarkdownChildren(children, "markdown-h1")}</h1>,
          h2: ({ children }) => <h2 className="mt-3 mb-2 text-xl font-bold text-white">{renderMarkdownChildren(children, "markdown-h2")}</h2>,
          h3: ({ children }) => <h3 className="mt-3 mb-1 text-lg font-bold text-white">{renderMarkdownChildren(children, "markdown-h3")}</h3>,
          h4: ({ children }) => <h4 className="mt-2 mb-1 text-base font-bold text-white">{renderMarkdownChildren(children, "markdown-h4")}</h4>,
          h5: ({ children }) => <h5 className="mt-2 mb-1 text-sm font-bold text-white">{renderMarkdownChildren(children, "markdown-h5")}</h5>,
          h6: ({ children }) => <h6 className="mt-2 mb-1 text-sm font-bold text-discord-muted">{renderMarkdownChildren(children, "markdown-h6")}</h6>,

          // Paragraphs
          p: ({ children }) => <span className="block">{renderMarkdownChildren(children, "markdown-paragraph")}</span>,

          // Text formatting
          strong: ({ children }) => <strong className="font-bold">{renderMarkdownChildren(children, "markdown-strong")}</strong>,
          em: ({ children }) => <em className="italic">{renderMarkdownChildren(children, "markdown-em")}</em>,
          del: ({ children }) => <del className="line-through">{renderMarkdownChildren(children, "markdown-del")}</del>,

          // Links
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener" className="hover:underline" style={{ color: "var(--wc-link)" }}>
              {renderEmojiChildren(children, "markdown-link")}
            </a>
          ),

          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-[#4f545c] bg-[#2f3136]/50 pl-3 py-1 my-2 rounded-r">
              <div className="text-[#dcddde]">{renderMarkdownChildren(children, "markdown-blockquote")}</div>
            </blockquote>
          ),

          // Lists
          ul: ({ children }) => (
            <ul className="list-disc pl-6 my-2 space-y-1">{renderMarkdownChildren(children, "markdown-ul")}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-6 my-2 space-y-1">{renderMarkdownChildren(children, "markdown-ol")}</ol>
          ),
          li: ({ children }) => (
            <li className="pl-1">{renderMarkdownChildren(children, "markdown-li")}</li>
          ),

          // Tables
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded border border-[#202225]">
              <table className="w-full border-collapse text-sm">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[#2f3136]">{children}</thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-[#202225]">{children}</tbody>
          ),
          tr: ({ children }) => <tr className="border-b border-[#202225]">{children}</tr>,
          th: ({ children }) => (
            <th className="px-3 py-2 text-left font-semibold text-[#b9bbbe] border-r border-[#202225] last:border-r-0">
              {renderMarkdownChildren(children, "markdown-th")}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-[#dcddde] border-r border-[#202225] last:border-r-0">
              {renderMarkdownChildren(children, "markdown-td")}
            </td>
          ),

          // Horizontal rule
          hr: () => <hr className="my-3 border-[#4f545c]" />,

          // Task lists (GFM)
          input: ({ checked, ...props }) => (
            <input
              type="checkbox"
              checked={checked || false}
              readOnly
              className="mr-1.5 h-4 w-4 accent-discord-blurple cursor-default"
              {...props}
            />
          ),
        }}
      >
        {processedContent}
      </ReactMarkdown>
    );
  };


  const messageLayout = useMemo(() => {
    const offsets = new Array<number>(messages.length + 1);
    offsets[0] = 0;

    for (let index = 0; index < messages.length; index += 1) {
      const message = messages[index];
      const height = measuredMessageHeightsRef.current[message.id] ?? DEFAULT_MESSAGE_ROW_HEIGHT;
      offsets[index + 1] = offsets[index] + height;
    }

    return {
      offsets,
      totalHeight: offsets[messages.length] ?? 0
    };
  }, [messages, heightVersion]);

  const visibleRange = useMemo(() => {
    const overscannedTop = Math.max(0, scrollTop - VIRTUALIZATION_OVERSCAN_PX);
    const overscannedBottom = scrollTop + Math.max(viewportHeight, 1) + VIRTUALIZATION_OVERSCAN_PX;

    let start = 0;
    while (start < messages.length && messageLayout.offsets[start + 1] < overscannedTop) {
      start += 1;
    }

    let end = start;
    while (end < messages.length && messageLayout.offsets[end] < overscannedBottom) {
      end += 1;
    }

    const safeEnd = Math.min(messages.length, end + 1);
    return {
      start,
      end: safeEnd,
      topPadding: messageLayout.offsets[start] ?? 0,
      bottomPadding: Math.max(0, messageLayout.totalHeight - (messageLayout.offsets[safeEnd] ?? messageLayout.totalHeight))
    };
  }, [messageLayout, messages.length, scrollTop, viewportHeight]);

  const visibleMessages = messages.slice(visibleRange.start, visibleRange.end);

  const scrollMessageIntoView = useCallback((messageId: string, block: ScrollLogicalPosition, durationMs = 0): boolean => {
    const node = scrollRef.current;
    if (!node) {
      return false;
    }

    const messageIndex = messages.findIndex((message) => message.id === messageId);
    if (messageIndex === -1) {
      return false;
    }

    const top = messageLayout.offsets[messageIndex] ?? 0;
    const bottom = messageLayout.offsets[messageIndex + 1] ?? (top + DEFAULT_MESSAGE_ROW_HEIGHT);
    const height = bottom - top;

    let targetTop = top;
    if (block === "center") {
      targetTop = top - (node.clientHeight / 2) + (height / 2);
    } else if (block === "end") {
      targetTop = bottom - node.clientHeight;
    }

    pendingScrollRequestRef.current = { messageId, block, durationMs };
    return animateScrollTo(targetTop, durationMs);
  }, [animateScrollTo, messageLayout.offsets, messages]);

  // All three helpers only read/write refs and call the stable setState updater.
  // useCallback([]) makes their identities stable across renders, which is required
  // for the per-message ref cache (stableRefsMap) that prevents ResizeObserver churn.
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth"): void => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior });
  }, []);

  const lockToBottomIfSticky = useCallback((): void => {
    if (!initialScrollPositionedRef.current || !stickToBottomRef.current || historyNewerPagingRef.current || pendingBottomLockFrameRef.current !== null) {
      return;
    }

    pendingBottomLockFrameRef.current = window.requestAnimationFrame(() => {
      pendingBottomLockFrameRef.current = null;
      if (!stickToBottomRef.current) {
        return;
      }
      scrollToBottom("auto");
    });
  }, [scrollToBottom]);

  const jumpToPresent = useCallback((): void => {
    const targetId = mode === "SERVER" ? activeChannelId : activeDMId;
    if (!targetId) {
      return;
    }

    stopScrollAnimation();
    setHighlightMessageId(null);
    pendingPresentJumpRef.current = true;
    void loadMessages(targetId).catch(() => {
      pendingPresentJumpRef.current = false;
    });
  }, [activeChannelId, activeDMId, loadMessages, mode, stopScrollAnimation]);

  const bindMessageNode = useCallback((messageId: string, node: HTMLElement | null): void => {
    const existingObserver = messageResizeObserversRef.current[messageId];
    if (existingObserver) {
      existingObserver.disconnect();
      delete messageResizeObserversRef.current[messageId];
    }

    if (!node) {
      return;
    }

    const syncHeight = (): void => {
      const nextHeight = Math.ceil(node.getBoundingClientRect().height) + 2;
      if (measuredMessageHeightsRef.current[messageId] === nextHeight) {
        return;
      }

      measuredMessageHeightsRef.current[messageId] = nextHeight;
      setHeightVersion((current) => current + 1);
    };

    syncHeight();

    const observer = new ResizeObserver(() => {
      syncHeight();
      lockToBottomIfSticky();
    });
    observer.observe(node);
    messageResizeObserversRef.current[messageId] = observer;
  }, [lockToBottomIfSticky]);

  const getReactionPickerPlacement = (trigger: HTMLElement): "above" | "below" => {
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    if (spaceBelow < REACTION_PICKER_HEIGHT + REACTION_PICKER_MARGIN && spaceAbove > spaceBelow) {
      return "above";
    }

    return "below";
  };

  const toggleReactionPicker = (messageId: string, trigger: HTMLElement): void => {
    setReactionPickerFor((current) => {
      if (current?.messageId === messageId) {
        return null;
      }

      return {
        messageId,
        placement: getReactionPickerPlacement(trigger)
      };
    });
  };

  useEffect(() => {
    stopScrollAnimation();
    initialScrollPositionedRef.current = false;
    consumedFocusMessageIdRef.current = null;
    previousMessageCountRef.current = 0;
    if (replyJumpTimeoutRef.current !== null) {
      window.clearTimeout(replyJumpTimeoutRef.current);
      replyJumpTimeoutRef.current = null;
    }
    if (pendingBottomLockFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingBottomLockFrameRef.current);
      pendingBottomLockFrameRef.current = null;
    }
    pendingScrollRequestRef.current = null;
    measuredMessageHeightsRef.current = {};
    Object.values(messageResizeObserversRef.current).forEach((observer) => observer.disconnect());
    messageResizeObserversRef.current = {};
    stickToBottomRef.current = true;
    lastScrollTopRef.current = 0;
    stableRefsMap.current = {};
    setScrollTop(0);
    setViewportHeight(0);
    setHeightVersion(0);
  }, [activeChannelId, activeDMId, mode, stopScrollAnimation]);

  useEffect(() => () => {
    stopScrollAnimation();
  }, [stopScrollAnimation]);

  useEffect(() => {
    if (!focusMessageId) {
      consumedFocusMessageIdRef.current = null;
    }
  }, [focusMessageId]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }

    const updateScrollMetrics = (): void => {
      const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
      const scrollingUp = node.scrollTop < lastScrollTopRef.current;
      if (distanceFromBottom <= 8 && !historyNewerPagingRef.current) {
        // Being at the bottom always re-enables sticky (including browser-clamped scrolls from shrinking content).
        stickToBottomRef.current = true;
      } else if (scrollingUp) {
        // User scrolled up and is not near the bottom; stop forced snapping.
        stickToBottomRef.current = false;
      }
      lastScrollTopRef.current = node.scrollTop;

      // Load older messages when near the top (only after initial positioning is done)
      if (initialScrollPositionedRef.current && node.scrollTop < 300) {
        prevScrollHeightRef.current = node.scrollHeight;
        void loadOlderMessagesRef.current();
      }

      if (initialScrollPositionedRef.current && hasNewerMessagesRef.current && distanceFromBottom < 300) {
        requestLoadNewerMessages();
      }

      // Throttle React state updates (virtualization recalc) to one per animation frame.
      // The sticky/direction logic above runs synchronously on every event.
      if (scrollRafRef.current !== null) {
        return;
      }
      scrollRafRef.current = window.requestAnimationFrame(() => {
        scrollRafRef.current = null;
        setScrollTop(node.scrollTop);
        setViewportHeight(node.clientHeight);
      });
    };

    updateScrollMetrics();
    const resizeObserver = new ResizeObserver(() => updateScrollMetrics());
    const onWheelIntent = (event: WheelEvent): void => {
      if (event.deltaY < 0) {
        stickToBottomRef.current = false;
        return;
      }

      const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
      if (initialScrollPositionedRef.current && hasNewerMessagesRef.current && distanceFromBottom < 300) {
        requestLoadNewerMessages();
      }
    };
    resizeObserver.observe(node);
    node.addEventListener("scroll", updateScrollMetrics, { passive: true });
    node.addEventListener("wheel", onWheelIntent, { passive: true });
    return () => {
      node.removeEventListener("scroll", updateScrollMetrics);
      node.removeEventListener("wheel", onWheelIntent);
      resizeObserver.disconnect();
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [activeChannelId, activeDMId, mode, requestLoadNewerMessages]);

  useLayoutEffect(() => {
    if (!messages.length) {
      previousMessageCountRef.current = 0;
      prevFirstMessageIdRef.current = null;
      return;
    }

    const node = scrollRef.current;
    if (!node) {
      return;
    }

    const previousCount = previousMessageCountRef.current;
    const messageCountIncreased = messages.length > previousCount;
    previousMessageCountRef.current = messages.length;
    const currentLastId = messages[messages.length - 1]?.id ?? null;

    // Detect prepend (loading older messages) and restore scroll position
    const currentFirstId = messages[0]?.id ?? null;
    const previousFirstId = prevFirstMessageIdRef.current;
    const prependedMessages = previousFirstId !== null && currentFirstId !== previousFirstId;
    const appendedMessages = prevLastMessageIdRef.current !== null && currentLastId !== prevLastMessageIdRef.current && !prependedMessages;
    if (
      initialScrollPositionedRef.current &&
      previousFirstId !== null &&
      currentFirstId !== previousFirstId &&
      prevScrollHeightRef.current > 0
    ) {
      const previousFirstIndex = messages.findIndex((message) => message.id === previousFirstId);
      const prependedHeight = previousFirstIndex > 0 ? (messageLayout.offsets[previousFirstIndex] ?? 0) : 0;
      const heightAdded = node.scrollHeight - prevScrollHeightRef.current;
      if (prependedHeight > 0) {
        node.scrollTop += prependedHeight;
        lastScrollTopRef.current = node.scrollTop;
      } else if (heightAdded > 0) {
        node.scrollTop += heightAdded;
        lastScrollTopRef.current = node.scrollTop;
      }
      prevScrollHeightRef.current = 0;
    }
    prevFirstMessageIdRef.current = currentFirstId;
    prevLastMessageIdRef.current = currentLastId;

    const isInitialPosition = !initialScrollPositionedRef.current;
    const scrollBottom = (durationMs = 0): void => {
      animateScrollTo(node.scrollHeight, durationMs);
    };

    if (pendingPresentJumpRef.current) {
      pendingPresentJumpRef.current = false;
      historyNewerPagingRef.current = false;
      stickToBottomRef.current = true;
      initialScrollPositionedRef.current = true;
      scrollBottom(FAST_HISTORY_JUMP_DURATION_MS);
      return;
    }

    if (focusMessageId && consumedFocusMessageIdRef.current !== focusMessageId) {
      const focusBlock: ScrollLogicalPosition = focusMessageMode === "search" ? "center" : "start";
      const focusDurationMs = focusMessageMode === "search" ? FAST_HISTORY_JUMP_DURATION_MS : 220;

      const focusUnreadMessage = (attempt = 0): void => {
        if (centerMessageElement(focusMessageId, focusDurationMs, focusBlock) || scrollMessageIntoView(focusMessageId, focusBlock, focusDurationMs)) {
          consumedFocusMessageIdRef.current = focusMessageId;
          initialScrollPositionedRef.current = true;
          if (focusMessageMode === "search") {
            setHighlightMessageId(focusMessageId);
            window.setTimeout(() => setHighlightMessageId((current) => (current === focusMessageId ? null : current)), 2000);
          }
          return;
        }

        if (attempt < 2) {
          window.requestAnimationFrame(() => focusUnreadMessage(attempt + 1));
          return;
        }

        scrollBottom();
      };

      focusUnreadMessage();
      return;
    }

    if (isInitialPosition) {
      scrollBottom();

      const allMeasured = messages.every((message) => Boolean(measuredMessageHeightsRef.current[message.id]));
      if (allMeasured || heightVersion > 0) {
        initialScrollPositionedRef.current = true;
        if (!focusMessageId) {
          window.requestAnimationFrame(() => {
            if (stickToBottomRef.current) {
              scrollBottom();
            }
          });
        }
      }
      return;
    }

    if (!isInitialPosition && !stickToBottomRef.current) {
      return;
    }

    if (!isInitialPosition && appendedMessages && historyNewerPagingRef.current) {
      historyNewerPagingRef.current = false;
      return;
    }

    if (!isInitialPosition && !messageCountIncreased) {
      // Preserve bottom lock while attachment/image/video content finishes loading.
      scrollBottom();
      return;
    }

    scrollBottom();
  }, [animateScrollTo, focusMessageId, focusMessageMode, heightVersion, messageLayout, messages, scrollMessageIntoView]);

  // Auto-focus input when channel/DM changes
  useEffect(() => {
    inputRef.current?.focus();
  }, [activeChannelId, activeDMId]);

  // Focus input when replying
  useEffect(() => {
    if (replyTo) {
      inputRef.current?.focus();
    }
  }, [replyTo]);

  useEffect(() => {
    const closeContextMenu = (): void => setMemberContextMenu(null);
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        closeContextMenu();
        setReplyTo(null);
        setAttachment(null);
        setAttachmentError(null);
        setShowPicker(false);
        setReactionPickerFor(null);
      }
    };
    const onPointerDown = (event: globalThis.MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      if (target.closest(".discord-emoji-picker") || target.closest("[data-emoji-picker-toggle]") || target.closest("[data-reaction-picker-toggle]")) {
        return;
      }

      if (composerPickerRef.current?.contains(target)) {
        return;
      }

      setShowPicker(false);
      setReactionPickerFor(null);
    };
    window.addEventListener("click", closeContextMenu);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", closeContextMenu, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", closeContextMenu);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", closeContextMenu, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    const onBackspaceDown = (event: KeyboardEvent): void => {
      if (event.key === "Backspace") backspaceHeldRef.current = true;
    };
    const onBackspaceUp = (event: KeyboardEvent): void => {
      if (event.key === "Backspace") backspaceHeldRef.current = false;
    };
    window.addEventListener("keydown", onBackspaceDown);
    window.addEventListener("keyup", onBackspaceUp);
    window.addEventListener("blur", () => { backspaceHeldRef.current = false; });
    return () => {
      window.removeEventListener("keydown", onBackspaceDown);
      window.removeEventListener("keyup", onBackspaceUp);
    };
  }, []);

  useEffect(() => {
    const onWindowDragOver = (event: DragEvent): void => {
      if (!isFileDrag(event)) {
        return;
      }
      event.preventDefault();
    };

    const onWindowDrop = (event: DragEvent): void => {
      if (!isFileDrag(event)) {
        return;
      }
      event.preventDefault();
    };

    window.addEventListener("dragover", onWindowDragOver);
    window.addEventListener("drop", onWindowDrop);
    return () => {
      window.removeEventListener("dragover", onWindowDragOver);
      window.removeEventListener("drop", onWindowDrop);
    };
  }, []);

  useEffect(() => {
    setHighlightedMentionIndex(0);
  }, [mentionMenuOpen, mentionQuery]);

  useEffect(() => {
    if (!mentionMenuOpen) {
      return;
    }
    scrollMenuItemIntoView(mentionMenuListRef.current, highlightedMentionIndex);
  }, [mentionMenuOpen, highlightedMentionIndex, mentionCandidates.length, scrollMenuItemIntoView]);

  useEffect(() => {
    setHighlightedEmojiIndex(0);
  }, [emojiMenuOpen, emojiQuery]);

  useEffect(() => {
    if (!emojiMenuOpen) {
      return;
    }
    scrollMenuItemIntoView(
      editingId ? editEmojiMenuListRef.current : composerEmojiMenuListRef.current,
      highlightedEmojiIndex
    );
  }, [editingId, emojiMenuOpen, highlightedEmojiIndex, emojiCandidates.length, scrollMenuItemIntoView]);

  useEffect(() => {
    setHighlightedChannelIndex(0);
  }, [channelMenuOpen, channelQuery]);

  useEffect(() => {
    if (!channelMenuOpen) {
      return;
    }
    scrollMenuItemIntoView(channelMenuListRef.current, highlightedChannelIndex);
  }, [channelMenuOpen, highlightedChannelIndex, channelCandidates.length, scrollMenuItemIntoView]);

  // Only load draft when the channel changes (activeDraftKey), not on every keystroke.
  // Including `drafts` in deps would re-clamp content on every char typed past the limit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!activeDraftKey) {
      setContent("");
      return;
    }
    setContent(clampComposerContent(drafts[activeDraftKey] ?? ""));
  }, [activeDraftKey]);

  useLayoutEffect(() => {
    resizeComposerInput();
    syncComposerPreviewScroll();
    // Auto-resize edit textarea
    const editEl = editInputRef.current;
    if (editEl) {
      editEl.style.height = "auto";
      editEl.style.height = `${editEl.scrollHeight}px`;
    }
  }, [content, editingDraft]);

  useEffect(() => {
    if (!attachment || (!attachment.type.startsWith("image/") && !attachment.type.startsWith("video/"))) {
      setAttachmentPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(attachment);
    setAttachmentPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [attachment]);

  const onAttachmentInputChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setAttachment(null);
      setAttachmentSpoiler(false);
      setAttachmentError(null);
      event.target.value = "";
      return;
    }

    if (file.size > MAX_ATTACHMENT_BYTES) {
      setAttachment(null);
      setAttachmentSpoiler(false);
      setAttachmentError("You can't send files larger than 50 MB.");
      event.target.value = "";
      return;
    }

    setAttachment(file);
    setAttachmentSpoiler(false);
    setAttachmentError(null);
    event.target.value = "";
  };

  const selectMention = (candidate: ServerMember | { type: "special"; value: "everyone" | "here"; display: string }): void => {
    // Handle special @everyone/@here mentions
    if ("type" in candidate && candidate.type === "special") {
      setContent((prev) => prev.replace(/(?:^|\s)@([a-zA-Z0-9_]*)$/, (full) => `${full.startsWith(" ") ? " " : ""}@${candidate.value} `));
    } else {
      // Handle regular member mentions
      const member = candidate as ServerMember;
      setContent((prev) => prev.replace(/(?:^|\s)@([a-zA-Z0-9_]*)$/, (full) => `${full.startsWith(" ") ? " " : ""}@${member.user.username} `));
    }
    setHighlightedMentionIndex(0);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const selectChannel = (channel: Channel): void => {
    setContent((prev) => prev.replace(/(?:^|\s)#([a-zA-Z0-9_\-]*)$/, (full) => `${full.startsWith(" ") ? " " : ""}#${channel.name} `));
    setHighlightedChannelIndex(0);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const selectEmoji = (emojiSuggestion: EmojiSuggestion): void => {
    if (editingId) {
      setEditingDraft((prev) => clampComposerContent(prev.replace(/(?:^|\s):([a-zA-Z0-9_+-]{1,32})$/, (full) => `${full.startsWith(" ") ? " " : ""}${emojiSuggestion.emoji} `)));
      setHighlightedEmojiIndex(0);
      window.requestAnimationFrame(() => editInputRef.current?.focus());
      return;
    }

    setContent((prev) => prev.replace(/(?:^|\s):([a-zA-Z0-9_+-]{1,32})$/, (full) => `${full.startsWith(" ") ? " " : ""}${emojiSuggestion.emoji} `));
    setHighlightedEmojiIndex(0);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const applyComposerValue = (nextValue: string): void => {
    setContent(nextValue);
    if (activeDraftKey) {
      setDrafts((prev) => {
        const next = { ...prev };
        if (nextValue.trim()) {
          next[activeDraftKey] = nextValue;
        } else {
          delete next[activeDraftKey];
        }
        persistDrafts(next);
        return next;
      });
    }
  };

  const resizeComposerInput = (): void => {
    if (!inputRef.current) {
      return;
    }

    inputRef.current.style.height = "0px";
    const nextHeight = Math.min(inputRef.current.scrollHeight, COMPOSER_MAX_HEIGHT_PX);
    inputRef.current.style.height = `${nextHeight}px`;
    inputRef.current.style.overflowY = inputRef.current.scrollHeight > COMPOSER_MAX_HEIGHT_PX ? "auto" : "hidden";
  };

  const syncComposerPreviewScroll = (): void => {
    if (!inputRef.current || !composerPreviewRef.current) {
      return;
    }

    composerPreviewRef.current.style.transform = `translate(${-inputRef.current.scrollLeft}px, ${-inputRef.current.scrollTop}px)`;
  };

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (attachmentError) {
      return;
    }
    if (sendInFlightRef.current) {
      return;
    }

    const contentToSend = content;
    const attachmentToSend = attachment;
    const attachmentSpoilerToSend = attachmentSpoiler;
    const replyToMessage = replyTo;
    const draftKey = activeDraftKey;

    if (!contentToSend.trim() && !attachmentToSend) {
      return;
    }
    if (contentToSend.length > MESSAGE_CHAR_LIMIT) {
      return;
    }

    sendInFlightRef.current = true;

    if (draftKey) {
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[draftKey];
        persistDrafts(next);
        return next;
      });
    }

    setContent("");
    setAttachment(null);
    setAttachmentSpoiler(false);
    setAttachmentError(null);
    setReplyTo(null);
    const socket = getSocket();
    if (mode === "SERVER" && activeChannelId) {
      socket?.emit("typing:stop", { scope: "CHANNEL", id: activeChannelId });
    } else if (mode === "DM" && activeDMId) {
      socket?.emit("typing:stop", { scope: "DM", id: activeDMId });
    }
    lockToBottomIfSticky();
    inputRef.current?.focus();

    try {
      if (mode === "DM") {
        const outgoingAttachment = attachmentToSend && attachmentSpoilerToSend ? withSpoilerFilename(attachmentToSend) : attachmentToSend;
        await sendDMMessage(contentToSend, replyToMessage?.id, outgoingAttachment);
      } else {
        const outgoingAttachment = attachmentToSend && attachmentSpoilerToSend ? withSpoilerFilename(attachmentToSend) : attachmentToSend;
        await sendMessage(contentToSend, replyToMessage?.id, outgoingAttachment);
      }
    } catch (error: unknown) {
      const backendMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      const isFileTooLarge = typeof backendMessage === "string" && backendMessage.toLowerCase().includes("file too large");
      setAttachmentError(isFileTooLarge ? "You can't send files larger than 50 MB." : (backendMessage ?? "Failed to send message."));

      // Restore unsent draft only if user hasn't already started typing something new.
      setContent((current) => (current.length === 0 ? contentToSend : current));
      setAttachment((current) => (current ?? attachmentToSend));
      setAttachmentSpoiler(attachmentToSend ? attachmentSpoilerToSend : false);
      setReplyTo((current) => (current ?? replyToMessage));
      if (draftKey && contentToSend.trim()) {
        setDrafts((prev) => {
          const next = { ...prev, [draftKey]: contentToSend };
          persistDrafts(next);
          return next;
        });
      }
    } finally {
      sendInFlightRef.current = false;
    }
  };

  const composerLength = content.length;
  const composerOverLimit = composerLength > MESSAGE_CHAR_LIMIT;
  const showComposerCounter = composerLength >= MESSAGE_CHAR_WARNING_THRESHOLD;
  const composerCounterTone = composerOverLimit ? "text-[#ed4245]" : composerLength >= MESSAGE_CHAR_LIMIT - 200 ? "text-[#f0b232]" : "text-discord-muted";

  const submitInlineEdit = async (messageId: string): Promise<void> => {
    if (!editingDraft.trim()) {
      return;
    }
    if (mode === "DM" && activeDMId) {
      await editDMMessage(activeDMId, messageId, editingDraft);
    } else {
      await editMessage(messageId, editingDraft);
    }
    setEditingId(null);
    setEditingDraft("");
  };

  const typingLabel = useMemo(() => {
    const myNickname = me.nickname?.trim();
    const filtered = typingUsers.filter((u) => u !== me.username && (!myNickname || u !== myNickname));
    if (!filtered.length) {
      return "";
    }
    if (filtered.length === 1) {
      return `${filtered[0]} is typing...`;
    }
    if (filtered.length === 2) {
      return `${filtered[0]} and ${filtered[1]} is typing...`;
    }
    return `${filtered.join(", ")} are typing...`;
  }, [typingUsers, me.username, me.nickname]);

  const getReplyPreviewLabel = (reply: { content?: string | null; attachmentUrl?: string | null; attachmentName?: string | null }): string => {
    const previewContent = reply.content?.trim() ?? "";
    const hasAttachment = Boolean(reply.attachmentUrl);

    if (hasAttachment && previewContent) {
      return `Attachment: ${previewContent}`;
    }
    if (hasAttachment) {
      return "Attachment";
    }
    return previewContent || "Message";
  };

  const getAttachmentUrlForName = (rawUrl: string, fileName?: string | null, forceDownload = false): string => {
    const resolvedUrl = resolveMediaUrl(rawUrl) || rawUrl;
    const normalizedName = (fileName ?? "attachment").trim() || "attachment";

    try {
      const url = new URL(resolvedUrl, window.location.origin);
      if (url.pathname.includes("/uploads/attachments/")) {
        url.searchParams.set("name", normalizedName);
        if (forceDownload) {
          url.searchParams.set("download", "1");
        }
      }
      return url.toString();
    } catch {
      return resolvedUrl;
    }
  };

  const renderAttachment = (attachmentUrl?: string | null, attachmentName?: string | null): JSX.Element | null => {
    if (!attachmentUrl) {
      return null;
    }

    const name = (attachmentName ?? "").toLowerCase();
    const imageExt = /\.(png|jpe?g|gif|webp|svg)$/i.test(name);
    const videoExt = /\.(mp4|webm|mov|m4v)$/i.test(name);
    const audioExt = /\.(mp3|wav|ogg|m4a|flac)$/i.test(name);
    const spoilerKey = `${attachmentUrl}|${attachmentName ?? ""}`;
    const isSpoiler = Boolean(attachmentName?.startsWith(SPOILER_FILENAME_PREFIX)) && imageExt;
    const isRevealed = revealedSpoilers[spoilerKey] ?? false;
    const displayName = attachmentName?.startsWith(SPOILER_FILENAME_PREFIX)
      ? attachmentName.slice(SPOILER_FILENAME_PREFIX.length)
      : attachmentName;
    const inlineAttachmentUrl = getAttachmentUrlForName(attachmentUrl, displayName ?? attachmentName, false);
    const downloadAttachmentUrl = getAttachmentUrlForName(attachmentUrl, displayName ?? attachmentName, true);

    if (imageExt) {
      return (
        <button
          type="button"
          className="mt-2 block cursor-pointer"
          onClick={() => {
            if (isSpoiler && !isRevealed) {
              setRevealedSpoilers((prev) => ({ ...prev, [spoilerKey]: true }));
              return;
            }
            setFullscreenImage({ src: inlineAttachmentUrl, name: attachmentName ?? "attachment" });
            setImageZoom(1);
          }}
          title={isSpoiler && !isRevealed ? "Reveal spoiler" : "View image fullscreen"}
        >
          <div className="relative inline-block max-w-[min(90vw,560px)]">
            <ImageAttachmentPreview
              src={inlineAttachmentUrl}
              alt={displayName ?? "attachment"}
              blurred={isSpoiler && !isRevealed}
              onLoad={!focusMessageId ? lockToBottomIfSticky : undefined}
            />
            {isSpoiler && !isRevealed ? (
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <span className="inline-flex items-center rounded-full border border-[#3f4248] bg-[#1e1f22]/95 px-4 py-1.5 text-sm font-bold tracking-wide text-[#dbdee1] shadow-[0_3px_10px_rgba(0,0,0,0.35)]">
                  SPOILER
                </span>
              </div>
            ) : null}
          </div>
        </button>
      );
    }
    if (videoExt) {
      return <VideoAttachmentPlayer src={inlineAttachmentUrl} attachmentName={displayName ?? attachmentName} downloadUrl={downloadAttachmentUrl} onMediaReady={lockToBottomIfSticky} />;
    }
    if (audioExt) {
      return <AudioAttachmentPlayer src={inlineAttachmentUrl} attachmentName={displayName ?? attachmentName} downloadUrl={downloadAttachmentUrl} />;
    }

    return <GenericAttachmentCard downloadUrl={downloadAttachmentUrl} attachmentName={displayName} />;
  };

  const renderInviteEmbed = (rawContent: string): JSX.Element | null => {
    const inviteCode = extractInviteCode(rawContent);
    if (!inviteCode) {
      return null;
    }
    return <InviteEmbed inviteCode={inviteCode} />;
  };

  const renderOpenGraphEmbeds = (rawContent: string): JSX.Element | null => {
    const urls = extractOpenGraphUrls(rawContent);
    if (!urls.length) {
      return null;
    }

    return (
      <div>
        {urls.map((url) => (
          <OpenGraphEmbed key={url} url={url} />
        ))}
      </div>
    );
  };

  const jumpToMessage = (messageId: string): void => {
    const durationMs = FAST_HISTORY_JUMP_DURATION_MS;

    if (replyJumpTimeoutRef.current !== null) {
      window.clearTimeout(replyJumpTimeoutRef.current);
      replyJumpTimeoutRef.current = null;
    }

    const centered = centerMessageElement(messageId, durationMs, "center") || scrollMessageIntoView(messageId, "center", durationMs);
    if (!centered) {
      if (mode === "SERVER" && activeChannelId) {
        void openChannelMessage(activeChannelId, messageId);
      } else if (mode === "DM" && activeDMId) {
        void openDMMessage(activeDMId, messageId);
      }
      return;
    }

    let attempts = 0;
    const retryCenter = (): void => {
      attempts += 1;
      const recentered = centerMessageElement(messageId, durationMs, "center") || scrollMessageIntoView(messageId, "center", durationMs);
      if (recentered || attempts >= 5) {
        replyJumpTimeoutRef.current = null;
        return;
      }
      replyJumpTimeoutRef.current = window.setTimeout(retryCenter, 90);
    };

    replyJumpTimeoutRef.current = window.setTimeout(retryCenter, 90);
    setHighlightMessageId(messageId);
    window.setTimeout(() => setHighlightMessageId((current) => (current === messageId ? null : current)), 2000);
  };

  const openMemberContextMenu = (event: MouseEvent<HTMLElement>, message: Message | DMMessage): void => {
    if (mode !== "SERVER") {
      return;
    }
    if (!canModerateServerMessages) {
      return;
    }
    if (message.authorId === me.id) {
      return;
    }
    if (message.author.username === SYSTEM_USERNAME) {
      return;
    }

    event.preventDefault();
    const menuWidth = 176;
    const menuHeight = 120;
    const x = Math.min(event.clientX, window.innerWidth - menuWidth - 8);
    const y = Math.min(event.clientY, window.innerHeight - menuHeight - 8);
    setMemberContextMenu({ x, y, member: message.author });
  };

  return (
    <section
      className="wc-chat-surface relative flex h-full min-w-0 flex-1 flex-col"
      onDragEnter={(event) => {
        if (!hasAttachableFilesInEvent(event)) {
          return;
        }
        event.preventDefault();
        dragDepthRef.current += 1;
        setDragActive(true);
      }}
      onDragOver={(event) => {
        if (!hasAttachableFilesInEvent(event)) {
          return;
        }
        event.preventDefault();
      }}
      onDragLeave={(event) => {
        if (!hasAttachableFilesInEvent(event)) {
          return;
        }
        event.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) {
          setDragActive(false);
        }
      }}
      onDrop={(event) => {
        if (!isFileDrag(event.nativeEvent)) {
          return;
        }
        event.preventDefault();
        dragDepthRef.current = 0;
        setDragActive(false);
        const file = getFirstAttachableFile(event.dataTransfer);
        if (!file) {
          return;
        }
        if (file.size > MAX_ATTACHMENT_BYTES) {
          setAttachment(null);
          setAttachmentSpoiler(false);
          setAttachmentError("You can't send files larger than 50 MB.");
          return;
        }
        setAttachment(file);
        setAttachmentSpoiler(false);
        setAttachmentError(null);
      }}
    >
      {dragActive ? (
        <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center bg-black/45 backdrop-blur-[2px]">
          <div className="wc-popover rounded-2xl px-4 py-3 text-sm font-semibold text-white">
            Drop file to attach
          </div>
        </div>
      ) : null}
      <header className="wc-chat-header flex h-14 items-center justify-between px-5 text-sm font-semibold shadow-sm">
        <span>
          {mode === "SERVER" ? "#" : "@"} {channelName || "select-channel"}
        </span>
      </header>

      <div ref={scrollRef} className="discord-scrollbar flex-1 overflow-y-auto px-3 py-4">
          <div className="flex min-h-full flex-col justify-end">
          {hasOlderMessages ? (
            <div className="mb-2 flex justify-center">
              {loadingOlderMessages ? (
                <div className="flex items-center gap-2 py-2 text-xs text-discord-muted">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-discord-muted border-t-transparent" />
                  Loading older messages...
                </div>
              ) : (
                <div className="py-2 text-xs text-discord-muted/50 select-none">Scroll up to load more</div>
              )}
            </div>
          ) : null}
          {visibleRange.topPadding > 0 ? <div style={{ height: visibleRange.topPadding }} /> : null}
          {visibleMessages.map((message, visibleIndex) => {
            const index = visibleRange.start + visibleIndex;
            const mine = message.authorId === me.id;
            const couldMention = mode === "SERVER" && message.content.includes("@");
            const mentionByText = couldMention && (extractMentionedUserIds(message.content).has(me.id) || message.content.includes(`@${me.username}`));
            const mentionByReply =
              "replyTo" in message &&
              Boolean(message.replyTo) &&
              message.replyTo?.author?.id === me.id &&
              message.authorId !== me.id;
            const mentionMe = mentionByText || mentionByReply;
            const authorName = message.author.nickname?.trim() || message.author.username;
            const hasReplyPreview = "replyTo" in message && Boolean(message.replyTo);
            const previousMessage = messages[index - 1];
            const previousSameAuthor = previousMessage?.authorId === message.authorId;
            const deltaMs = previousMessage
              ? new Date(message.createdAt).getTime() - new Date(previousMessage.createdAt).getTime()
              : Number.POSITIVE_INFINITY;
            const groupedCompact = !hasReplyPreview && previousSameAuthor && deltaMs < 5 * 60 * 1000;
            const isReplyTarget = replyTo?.id === message.id;
            // Stable per-ID ref so React never tears down/recreates the ResizeObserver on re-renders.
            if (!stableRefsMap.current[message.id]) {
              stableRefsMap.current[message.id] = (n: HTMLElement | null) => bindMessageNode(message.id, n);
            }
            const messageRef = stableRefsMap.current[message.id]!;
            const isFirstUnread = focusMessageMode === "unread" && focusMessageId === message.id;
            return (
              <Fragment key={message.id}>
                {isFirstUnread ? (
                  <div className="mx-2 my-1 flex items-center gap-2 select-none" aria-label="New messages">
                    <div className="h-px flex-1 bg-[#f23f43]/60" />
                    <span className="rounded-full bg-[#f23f43]/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[#f23f43]">
                      New Messages
                    </span>
                    <div className="h-px flex-1 bg-[#f23f43]/60" />
                  </div>
                ) : null}
              <article
                ref={messageRef}
                key={message.id}
                id={`message-${message.id}`}
                className={`group relative mb-0 flex gap-3 rounded px-2 isolate ${groupedCompact ? "py-0.5" : "py-1"} ${overlayMenuOpen ? "" : mentionMe ? "hover:brightness-95" : "hover:bg-black/10"} ${highlightMessageId === message.id || isReplyTarget ? "rounded-lg" : ""} ${highlightMessageId === message.id ? "message-search-highlight" : ""}`}
                style={mentionMe ? { backgroundColor: "var(--wc-mention-me-bg)" } : highlightMessageId === message.id ? { backgroundColor: "var(--wc-reply-highlight-bg)", boxShadow: `inset 0 0 0 1px var(--wc-highlight-ring)` } : isReplyTarget ? { backgroundColor: "var(--wc-reply-target-bg)", boxShadow: `inset 0 0 0 1px var(--wc-highlight-ring)` } : undefined}
                onClick={() => {
                  if (message.pending) return;
                  if (!backspaceHeldRef.current) return;
                  const canDelete = canDeleteMessage(message);
                  if (!canDelete) return;
                  if (mode === "DM" && activeDMId) {
                    void deleteDMMessage(activeDMId, message.id);
                  } else {
                    void deleteMessage(message.id);
                  }
                }}
                onDoubleClick={() => {
                  if (message.pending) return;
                  if (mine) {
                    setEditingId(message.id);
                    setEditingDraft(message.content);
                  } else {
                    setReplyTo(message);
                  }
                }}
              >
                {mentionMe ? <span className="pointer-events-none absolute bottom-0 left-0 top-0 w-0.5 rounded-l" style={{ backgroundColor: "var(--wc-highlight-edge)" }} /> : null}
                {groupedCompact ? (
                  <span className={`invisible absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-discord-muted ${overlayMenuOpen ? "" : "group-hover:visible"}`}>
                    {new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </span>
                ) : null}
                {groupedCompact ? (
                  <div className="w-10 shrink-0" />
                ) : (
                  <button
                    onClick={() => onOpenProfile(message.author)}
                    onContextMenu={(event) => openMemberContextMenu(event, message)}
                    className={`shrink-0 self-start ${hasReplyPreview ? "mt-4" : ""}`}
                  >
                    <img
                      src={resolveUserAvatarUrl(message.author)}
                      alt={authorName}
                      className="h-10 w-10 rounded-full"
                    />
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  {"replyTo" in message && message.replyTo ? (
                    <div className="relative mb-0.5 flex items-center gap-1 text-xs text-discord-muted">
                      <span className="pointer-events-none absolute -left-5 top-1 h-3 w-4">
                        <span className="absolute left-0 top-0 h-3 w-4 rounded-tl-md border-l-2 border-t-2 border-[#63656e]" />
                      </span>
                      <img
                        src={resolveUserAvatarUrl(message.replyTo.author)}
                        alt={message.replyTo.author.nickname?.trim() || message.replyTo.author.username}
                        className="h-4 w-4 shrink-0 rounded-full"
                      />
                      <button
                        className="min-w-0 truncate text-discord-muted hover:text-discord-text"
                        onClick={() => message.replyTo?.id && jumpToMessage(message.replyTo.id)}
                      >
                        @{message.replyTo.author.nickname?.trim() || message.replyTo.author.username}
                        {message.replyTo.attachmentUrl ? <span className="ml-1 inline-flex items-center"><Paperclip size={11} /></span> : null}
                        {renderEmojiText(` ${getReplyPreviewLabel(message.replyTo)}`, `reply-preview-${message.id}`)}
                      </button>
                    </div>
                  ) : null}

                  {!groupedCompact ? (
                    <div className="flex items-baseline gap-2">
                      <button
                        className="text-sm font-semibold hover:underline"
                        style={{ color: (mode === "SERVER" ? (memberNickColorByUserId.get(message.authorId) ?? "white") : "white") }}
                        onClick={() => onOpenProfile(message.author)}
                        onContextMenu={(event) => openMemberContextMenu(event, message)}
                      >
                        {authorName}
                      </button>
                      <time className="text-xs text-discord-muted">
                        {formatMessageTimestamp(message.createdAt)}
                      </time>
                    </div>
                  ) : null}

                  {editingId === message.id ? (
                    <div className="mt-1 flex flex-col gap-1.5">
                      <div className="relative min-w-0 w-full">
                        {editingDraft ? (
                          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded bg-[#1e1f22] px-2 pb-1.5 pt-[calc(0.375rem+3px)] text-sm text-white">
                            <div ref={editPreviewRef} className="whitespace-pre-wrap break-words">
                              {renderEmojiText(editingDraft, `edit-draft-${message.id}`)}
                            </div>
                          </div>
                        ) : null}
                        <textarea
                          ref={(el) => {
                            (editInputRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
                            if (el) {
                              el.focus();
                              el.setSelectionRange(el.value.length, el.value.length);
                            }
                          }}
                          value={editingDraft}
                          rows={1}
                          maxLength={MESSAGE_CHAR_LIMIT}
                          onChange={(event) => setEditingDraft(clampComposerContent(replaceCompletedEmojiShortcodes(event.target.value)))}
                          onKeyDown={(e) => {
                            if (emojiMenuOpen) {
                              if (e.key === "ArrowDown") {
                                e.preventDefault();
                                setHighlightedEmojiIndex((current) => (current + 1) % emojiCandidates.length);
                                return;
                              }
                              if (e.key === "ArrowUp") {
                                e.preventDefault();
                                setHighlightedEmojiIndex((current) => (current - 1 + emojiCandidates.length) % emojiCandidates.length);
                                return;
                              }
                              if (e.key === "Enter" || e.key === "Tab") {
                                e.preventDefault();
                                selectEmoji(emojiCandidates[highlightedEmojiIndex] ?? emojiCandidates[0]);
                                return;
                              }
                            }

                            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submitInlineEdit(message.id); }
                            if (e.key === "Escape") { setEditingId(null); setEditingDraft(""); }
                          }}
                          className={`emoji-hidden-text relative z-10 w-full resize-none overflow-hidden rounded bg-transparent px-2 pb-1.5 pt-[calc(0.375rem+3px)] text-sm whitespace-pre-wrap outline-none ${editingDraft ? "text-transparent caret-white" : "text-white"}`}
                        />
                        {emojiMenuOpen ? (
                          <div className="absolute bottom-full left-0 right-0 z-40 mb-1 overflow-hidden rounded-md border border-white/[0.06] bg-[#111214] shadow-lg">
                            <p className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-discord-muted">
                              Emojis matching :{emojiQuery}
                            </p>
                            <div ref={editEmojiMenuListRef} className="discord-scrollbar max-h-60 overflow-y-auto py-1">
                              {emojiCandidates.map((emojiCandidate, index) => {
                                const selected = index === highlightedEmojiIndex;
                                return (
                                  <button
                                    key={emojiCandidate.unified}
                                    type="button"
                                    className={`flex w-full items-center gap-3 px-3 py-2 text-left ${selected ? "bg-[#3a3d45]" : "hover:bg-[#2b2d31]"}`}
                                    onMouseDown={(event) => {
                                      event.preventDefault();
                                      selectEmoji(emojiCandidate);
                                    }}
                                  >
                                    <EmojiGlyph emoji={emojiCandidate.emoji} sizeClassName="h-6 w-6" />
                                    <span className="truncate text-sm text-white">:{emojiCandidate.name}:</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <div className="flex gap-2">
                        <button className="rounded bg-discord-blurple px-2 py-1 text-xs" onClick={() => void submitInlineEdit(message.id)}>
                          Save
                        </button>
                        <button
                          className="rounded bg-[#3a3d45] px-2 py-1 text-xs"
                          onClick={() => {
                            setEditingId(null);
                            setEditingDraft("");
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className={`message-markdown break-words text-[15px] ${message.pending ? "text-discord-muted" : "text-discord-text"}`}>
                        {renderMessageContent(message.content)}
                        {message.editedAt ? <span className="ml-1 text-[10px] text-discord-muted">(edited)</span> : null}
                      </div>
                      {renderInviteEmbed(message.content)}
                      {renderOpenGraphEmbeds(message.content)}
                      {renderAttachment(message.attachmentUrl, message.attachmentName)}
                    </>
                  )}

                  {"reactions" in message && message.reactions.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(() => {
                        // Build ordered map: preserve first-seen order of each emoji
                        const order: string[] = [];
                        const map: Record<string, ReactionSummary> = {};
                        for (const reaction of message.reactions) {
                          if (!map[reaction.emoji]) {
                            order.push(reaction.emoji);
                            map[reaction.emoji] = { count: 0, reacted: false, users: [] };
                          }
                          map[reaction.emoji].count += 1;
                          map[reaction.emoji].reacted = map[reaction.emoji].reacted || reaction.userId === me.id;
                          const reactionDisplayName = memberDisplayNamesByUserId.get(reaction.userId)
                            || reaction.user?.nickname?.trim()
                            || reaction.user?.username
                            || "Unknown user";
                          if (!map[reaction.emoji].users.includes(reactionDisplayName)) {
                            map[reaction.emoji].users.push(reactionDisplayName);
                          }
                        }
                        return order.map((emoji) => {
                          const reactionState = map[emoji];
                          return (
                            <button
                              key={`${message.id}-${emoji}`}
                              onClick={() => onToggleReaction(message.id, emoji, message.reactions)}
                              className={`group/reaction relative inline-flex min-h-8 items-center justify-center rounded-full border px-2.5 py-1 text-xs leading-none transition-colors ${reactionState.reacted ? "" : "hover:bg-[var(--wc-reaction-idle-hover-bg)]"}`}
                              style={reactionState.reacted
                                ? { borderColor: "var(--wc-reaction-active-border)", backgroundColor: "var(--wc-reaction-active-bg)", color: "var(--wc-reaction-active-text)" }
                                : { borderColor: "var(--wc-reaction-idle-border)", backgroundColor: "var(--wc-reaction-idle-bg)", color: "var(--wc-reaction-idle-text)" }}
                            >
                              <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-[#111214] px-2 py-1 text-[11px] font-medium text-white shadow-lg group-hover/reaction:block">
                                {reactionState.users.join(", ")}
                              </span>
                              <span className="inline-flex items-center justify-center gap-1.5 leading-none">
                                <EmojiGlyph emoji={emoji} sizeClassName="h-5 w-5" />
                                <span className="relative top-[0.5px] font-medium">{reactionState.count}</span>
                              </span>
                            </button>
                          );
                        });
                      })()}
                    </div>
                  ) : null}
                </div>

                {editingId !== message.id ? (
                  <div className={`pointer-events-none absolute -top-7 right-0 z-20 flex h-fit items-center gap-0.5 rounded bg-[#111214] p-0.5 shadow-md opacity-0 transition-opacity ${overlayMenuOpen ? "" : "group-hover:opacity-100"}`}>
                    {mode === "SERVER" ? (
                      <>
                        {!(channelReadOnly && !canModerateServerMessages) ? (
                          <button
                            className="pointer-events-auto rounded p-1.5 text-discord-muted hover:bg-[#35373c] hover:text-white"
                            title="Reply"
                            onClick={() => setReplyTo(message)}
                          >
                            <Reply size={14} />
                          </button>
                        ) : null}
                        <button
                          className="pointer-events-auto rounded p-1.5 text-discord-muted hover:bg-[#35373c] hover:text-white"
                          title="React"
                          data-reaction-picker-toggle="true"
                          onClick={(event) => toggleReactionPicker(message.id, event.currentTarget)}
                        >
                          <Smile size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="rounded p-1.5 text-discord-muted hover:bg-[#35373c] hover:text-white"
                          title="Reply"
                          onClick={() => setReplyTo(message)}
                        >
                          <Reply size={14} />
                        </button>
                        <button
                          className="pointer-events-auto rounded p-1.5 text-discord-muted hover:bg-[#35373c] hover:text-white"
                          title="React"
                          data-reaction-picker-toggle="true"
                          onClick={(event) => toggleReactionPicker(message.id, event.currentTarget)}
                        >
                          <Smile size={14} />
                        </button>
                      </>
                    )}
                    {mine ? (
                      <>
                        {mode === "SERVER" || mode === "DM" ? (
                          <button
                            className="pointer-events-auto rounded p-1.5 text-discord-muted hover:bg-[#35373c] hover:text-white"
                            title="Edit"
                            onClick={() => {
                              setEditingId(message.id);
                              setEditingDraft(message.content);
                            }}
                          >
                            <Edit3 size={14} />
                          </button>
                        ) : null}
                        <button
                          className="pointer-events-auto rounded p-1.5 text-discord-muted hover:bg-[#35373c] hover:text-red-300"
                          title="Delete"
                          onClick={() => {
                            if (mode === "DM" && activeDMId) {
                              void deleteDMMessage(activeDMId, message.id);
                            } else {
                              void deleteMessage(message.id);
                            }
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    ) : mode === "SERVER" && canDeleteMessage(message) ? (
                      <button
                        className="pointer-events-auto rounded p-1.5 text-discord-muted hover:bg-[#35373c] hover:text-red-300"
                        title="Delete"
                        onClick={() => void deleteMessage(message.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {reactionPickerFor?.messageId === message.id ? (
                  <div className={`absolute right-2 z-50 ${reactionPickerFor.placement === "above" ? "bottom-8" : "top-8"}`}>
                    <DiscordEmojiPicker
                      variant="reaction"
                      onEmojiClick={(emoji, shiftKey) => {
                        onToggleReaction(message.id, emoji);
                        if (!shiftKey) setReactionPickerFor(null);
                      }}
                    />
                  </div>
                ) : null}
              </article>
              </Fragment>
            );
          })}
          {visibleRange.bottomPadding > 0 ? <div style={{ height: visibleRange.bottomPadding }} /> : null}
          </div>
      </div>

      {hasNewerMessages ? (
        <div className="pointer-events-none absolute bottom-[5.6rem] left-1/2 z-30 flex w-full max-w-[28rem] -translate-x-1/2 px-4">
          <div className="wc-popover pointer-events-auto flex w-full items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="whitespace-nowrap text-sm font-medium text-white">You're viewing older messages.</p>
            </div>
            <button
              type="button"
              onClick={jumpToPresent}
              disabled={loadingNewerMessages}
              className="shrink-0 rounded-xl bg-[linear-gradient(180deg,var(--wc-active-top),var(--wc-active-bottom))] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Jump to present
            </button>
          </div>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="relative border-t border-white/[0.04] px-4 pb-4 pt-3">
        {channelReadOnly && !canModerateServerMessages ? (
          <div className="wc-compose-box rounded-2xl px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <p className="cursor-default select-none py-[3px] text-sm text-discord-muted">This channel is read-only.</p>
          </div>
        ) : null}
        <div className="pointer-events-none absolute bottom-full left-0 right-0 px-4 pb-1 text-xs text-discord-muted">
          <AnimatePresence initial={false} mode="wait">
            {typingLabel ? (
              <motion.div
                key={typingLabel}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
                {typingLabel}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={onAttachmentInputChange}
        />

        {replyTo ? (
          <div className="mb-2 flex items-center justify-between rounded-2xl border border-white/[0.06] bg-black/20 px-3 py-2 text-xs text-discord-muted backdrop-blur-sm">
            <span className="truncate">
              Replying to {replyTo.author.nickname?.trim() || replyTo.author.username}
              {replyTo.attachmentUrl ? <span className="ml-2 inline-flex items-center gap-1"><Paperclip size={11} />Attachment</span> : null}
            </span>
            <button onClick={() => setReplyTo(null)} type="button" className="hover:text-white">
              x
            </button>
          </div>
        ) : null}

        <div className={`wc-compose-box rounded-[22px] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ${channelReadOnly && !canModerateServerMessages ? "hidden" : ""}`}>
          {attachment ? (
            <div className="mb-2 w-fit max-w-[280px] rounded-2xl border border-white/[0.06] bg-black/20 p-2">
              <div className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-[#171c26]">
                {attachmentPreviewUrl && attachment.type.startsWith("image/") ? (
                  <img src={attachmentPreviewUrl} alt={attachment.name} className="max-h-52 w-full object-cover" />
                ) : attachmentPreviewUrl && attachment.type.startsWith("video/") ? (
                  <video
                    src={attachmentPreviewUrl}
                    className="max-h-52 w-full object-cover"
                    muted
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <div className="grid h-36 w-56 place-items-center text-discord-muted">
                    <Paperclip size={40} />
                  </div>
                )}
                <div className="absolute right-2 top-2 flex items-center gap-0.5 rounded-md bg-[#1e1f22]/90 p-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setAttachment(null);
                      setAttachmentSpoiler(false);
                      setAttachmentError(null);
                    }}
                    className="rounded p-1.5 text-[#ed4245] hover:bg-[#35373c]"
                    title="Remove attachment"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              {attachment.type.startsWith("image/") ? (
                <label className="mt-2 inline-flex items-center gap-2 text-xs text-discord-muted">
                  <input
                    type="checkbox"
                    checked={attachmentSpoiler}
                    onChange={(event) => setAttachmentSpoiler(event.target.checked)}
                    className="h-3.5 w-3.5 rounded border-white/[0.12] bg-[#1e1f22]"
                  />
                  Mark as spoiler
                </label>
              ) : null}
              <p className="mt-2 truncate text-sm text-white">{attachment.name}</p>
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <button type="button" className="text-discord-muted hover:text-white" onClick={() => fileInputRef.current?.click()}>
              <Paperclip size={18} />
            </button>
            <div className="relative min-w-0 flex-1">
              {content ? (
                <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden pt-[3px] text-sm leading-5 text-white">
                  <div ref={composerPreviewRef} className="min-h-full min-w-full whitespace-pre-wrap break-words pr-2">
                    {composerSel !== null
                      ? composerSel.start === composerSel.end
                        ? <>
                            {renderComposerText(content.slice(0, composerSel.start), "composer-input-l", "h-[1.25em] w-[1.25em]")}
                            <span className="composer-fake-caret" />
                            {renderComposerText(content.slice(composerSel.start), "composer-input-r", "h-[1.25em] w-[1.25em]")}
                          </>
                        : <>
                            {renderComposerText(content.slice(0, composerSel.start), "composer-input-l", "h-[1.25em] w-[1.25em]")}
                            <span className="rounded-[2px]" style={{ backgroundColor: "color-mix(in srgb, var(--wc-accent) 40%, transparent)" }}>{renderComposerText(content.slice(composerSel.start, composerSel.end), "composer-input-m", "h-[1.25em] w-[1.25em]")}</span>
                            {renderComposerText(content.slice(composerSel.end), "composer-input-r", "h-[1.25em] w-[1.25em]")}
                          </>
                      : renderComposerText(content, "composer-input", "h-[1.25em] w-[1.25em]")}
                  </div>
                </div>
              ) : null}
              <textarea
                ref={inputRef}
                value={content}
                rows={1}
                onChange={(event) => {
                  const nextValue = replaceCompletedEmojiShortcodes(event.target.value);
                  applyComposerValue(nextValue);
                  setComposerSel(event.target.selectionStart === event.target.selectionEnd
                    ? { start: event.target.selectionStart, end: event.target.selectionStart }
                    : { start: event.target.selectionStart, end: event.target.selectionEnd });
                  const socket = getSocket();
                  if (mode === "SERVER" && activeChannelId) {
                    socket?.emit("typing:start", { scope: "CHANNEL", id: activeChannelId });
                  } else if (mode === "DM" && activeDMId) {
                    socket?.emit("typing:start", { scope: "DM", id: activeDMId });
                  }
                }}
                onKeyDown={(event) => {
                  if (event.currentTarget.selectionStart === event.currentTarget.selectionEnd) {
                    const caretPosition = event.currentTarget.selectionStart;
                    const textareaValue = event.currentTarget.value;

                    if (event.key === "ArrowLeft" && hasSurrogatePairBeforeCaret(textareaValue, caretPosition)) {
                      event.preventDefault();
                      event.currentTarget.setSelectionRange(caretPosition - 2, caretPosition - 2);
                      return;
                    }

                    if (event.key === "ArrowRight" && hasSurrogatePairAfterCaret(textareaValue, caretPosition)) {
                      event.preventDefault();
                      event.currentTarget.setSelectionRange(caretPosition + 2, caretPosition + 2);
                      return;
                    }

                    if (event.key === "Backspace" && hasSurrogatePairBeforeCaret(textareaValue, caretPosition)) {
                      event.preventDefault();
                      const nextValue = `${textareaValue.slice(0, caretPosition - 2)}${textareaValue.slice(caretPosition)}`;
                      const nextNormalizedValue = replaceCompletedEmojiShortcodes(nextValue);
                      applyComposerValue(nextNormalizedValue);
                      window.requestAnimationFrame(() => {
                        inputRef.current?.setSelectionRange(caretPosition - 2, caretPosition - 2);
                      });
                      return;
                    }

                    if (event.key === "Delete" && hasSurrogatePairAfterCaret(textareaValue, caretPosition)) {
                      event.preventDefault();
                      const nextValue = `${textareaValue.slice(0, caretPosition)}${textareaValue.slice(caretPosition + 2)}`;
                      const nextNormalizedValue = replaceCompletedEmojiShortcodes(nextValue);
                      applyComposerValue(nextNormalizedValue);
                      window.requestAnimationFrame(() => {
                        inputRef.current?.setSelectionRange(caretPosition, caretPosition);
                      });
                      return;
                    }

                    if (isCaretInsideSurrogatePair(textareaValue, caretPosition)) {
                      event.currentTarget.setSelectionRange(caretPosition + 1, caretPosition + 1);
                    }
                  }

                  if (mentionMenuOpen || emojiMenuOpen || channelMenuOpen) {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      if (mentionMenuOpen) {
                        setHighlightedMentionIndex((current) => (current + 1) % mentionCandidates.length);
                      } else if (channelMenuOpen) {
                        setHighlightedChannelIndex((current) => (current + 1) % channelCandidates.length);
                      } else if (emojiMenuOpen) {
                        setHighlightedEmojiIndex((current) => (current + 1) % emojiCandidates.length);
                      }
                      return;
                    }
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      if (mentionMenuOpen) {
                        setHighlightedMentionIndex((current) => (current - 1 + mentionCandidates.length) % mentionCandidates.length);
                      } else if (channelMenuOpen) {
                        setHighlightedChannelIndex((current) => (current - 1 + channelCandidates.length) % channelCandidates.length);
                      } else if (emojiMenuOpen) {
                        setHighlightedEmojiIndex((current) => (current - 1 + emojiCandidates.length) % emojiCandidates.length);
                      }
                      return;
                    }
                    if (event.key === "Enter" || event.key === "Tab") {
                      event.preventDefault();
                      if (mentionMenuOpen) {
                        selectMention(mentionCandidates[highlightedMentionIndex] ?? mentionCandidates[0]);
                      } else if (channelMenuOpen) {
                        selectChannel(channelCandidates[highlightedChannelIndex] ?? channelCandidates[0]);
                      } else if (emojiMenuOpen) {
                        selectEmoji(emojiCandidates[highlightedEmojiIndex] ?? emojiCandidates[0]);
                      }
                      return;
                    }
                  }

                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    if (!composerOverLimit) event.currentTarget.form?.requestSubmit();
                  }
                }}
                onSelect={(event) => {
                  const textarea = event.currentTarget;
                  const s = textarea.selectionStart;
                  const e = textarea.selectionEnd;

                  if (s !== e) {
                    setComposerSel({ start: s, end: e });
                    return;
                  }

                  if (!isCaretInsideSurrogatePair(textarea.value, s)) {
                    setComposerSel({ start: s, end: s });
                    return;
                  }

                  textarea.setSelectionRange(s + 1, s + 1);
                  setComposerSel({ start: s + 1, end: s + 1 });
                }}
                onClick={(event) => {
                  const textarea = event.currentTarget;
                  const s = textarea.selectionStart;
                  const e = textarea.selectionEnd;
                  if (s !== e) {
                    setComposerSel({ start: s, end: e });
                    return;
                  }
                  if (isCaretInsideSurrogatePair(textarea.value, s)) {
                    textarea.setSelectionRange(s + 1, s + 1);
                    setComposerSel({ start: s + 1, end: s + 1 });
                  } else {
                    setComposerSel({ start: s, end: s });
                  }
                }}
                onKeyUp={(event) => {
                  const textarea = event.currentTarget;
                  const s = textarea.selectionStart;
                  const e = textarea.selectionEnd;
                  if (s !== e) {
                    setComposerSel({ start: s, end: e });
                    return;
                  }
                  if (isCaretInsideSurrogatePair(textarea.value, s)) {
                    textarea.setSelectionRange(s + 1, s + 1);
                    setComposerSel({ start: s + 1, end: s + 1 });
                  } else {
                    setComposerSel({ start: s, end: s });
                  }
                }}
                onPaste={(event) => {
                  const file = getFirstAttachableFile(event.clipboardData);
                  if (!file) {
                    return;
                  }
                  event.preventDefault();
                  if (file.size > MAX_ATTACHMENT_BYTES) {
                    setAttachment(null);
                    setAttachmentSpoiler(false);
                    setAttachmentError("You can't send files larger than 50 MB.");
                    return;
                  }
                  setAttachment(file);
                  setAttachmentSpoiler(false);
                  setAttachmentError(null);
                }}
                onScroll={syncComposerPreviewScroll}
                onFocus={(event) => {
                  const t = event.currentTarget;
                  setComposerSel(t.selectionStart === t.selectionEnd
                    ? { start: t.selectionStart, end: t.selectionStart }
                    : { start: t.selectionStart, end: t.selectionEnd });
                }}
                onBlur={() => setComposerSel(null)}
                placeholder={channelReadOnly && !canModerateServerMessages ? "This channel is read-only" : mode === "SERVER" ? `Message #${channelName}` : `Message @${channelName}`}
                className={`emoji-hidden-text relative z-10 w-full resize-none overflow-hidden bg-transparent pt-[3px] text-sm leading-5 outline-none ${content ? "text-transparent caret-transparent" : "text-white"} placeholder:text-[#dadde5] selection:bg-transparent`}
              />
            </div>
            <button
              type="button"
              className="text-discord-muted hover:text-white"
              data-emoji-picker-toggle="composer"
              onClick={() => setShowPicker((v) => !v)}
            >
              <Smile size={18} />
            </button>
          </div>
        </div>
        {attachmentError || showComposerCounter ? (
          <div className="mt-1 flex items-center justify-between gap-2 text-xs">
            <p className="min-h-[1rem] text-[#ed4245]">{attachmentError ?? ""}</p>
            {showComposerCounter ? <span className={`shrink-0 tabular-nums ${composerCounterTone}`}>{`${composerLength}/${MESSAGE_CHAR_LIMIT}`}</span> : null}
          </div>
        ) : null}
        {mentionMenuOpen ? (
          <div className={composerMatchMenuClass}>
            <p className={composerMatchMenuHeaderClass}>
              {mentionQuery ? `Mentions matching @${mentionQuery}` : "Mention someone"}
            </p>
            <div ref={mentionMenuListRef} className={composerMatchMenuListClass}>
              {mentionCandidates.map((candidate, index) => {
                const selected = index === highlightedMentionIndex;
                
                // Handle special @everyone/@here entries
                if ("type" in candidate && candidate.type === "special") {
                  return (
                    <button
                      key={candidate.value}
                      type="button"
                      className={`${composerMatchMenuItemClass} ${selected ? "bg-[var(--wc-surface-tint-strong)]" : "hover:bg-white/[0.05]"}`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        selectMention(candidate as any);
                      }}
                    >
                      <div className="flex h-6 w-6 items-center justify-center rounded-lg" style={{ backgroundColor: "var(--wc-mention-bg)", color: "var(--wc-mention-text)" }}>
                        <span className="text-xs font-semibold">@</span>
                      </div>
                      <div className="min-w-0 flex flex-1 items-center gap-2">
                        <div className="truncate text-[13px] font-medium text-white">@{candidate.display}</div>
                        <div className="truncate text-[11px] text-discord-muted">
                          {candidate.value === "everyone" ? "Notifies all members" : "Notifies online members"}
                        </div>
                      </div>
                    </button>
                  );
                }

                // Handle regular member entries
                const member = candidate as ServerMember;
                const display = member.nickname || member.user.nickname || member.user.username;
                return (
                  <button
                    key={member.userId}
                    type="button"
                    className={`${composerMatchMenuItemClass} ${selected ? "bg-[var(--wc-surface-tint-strong)]" : "hover:bg-white/[0.05]"}`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      selectMention(member);
                    }}
                  >
                    <div className="relative h-7 w-7 shrink-0">
                      <img src={resolveUserAvatarUrl(member.user)} alt={display} className="h-7 w-7 rounded-full" />
                      <span className="absolute -bottom-1 -right-0.5">
                        <StatusDot status={member.user.status} sizeClassName="h-2 w-2" cutoutColor="var(--wc-profile-cutout)" ringColor="var(--wc-profile-cutout)" ringWidth={2} />
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-white">{display}</div>
                      <div className="mt-0.5 truncate text-[11px] text-discord-muted">@{member.user.username}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {channelMenuOpen ? (
          <div className={composerMatchMenuClass}>
            <p className={composerMatchMenuHeaderClass}>
              Channels matching #{channelQuery}
            </p>
            <div ref={channelMenuListRef} className={composerMatchMenuListClass}>
              {channelCandidates.map((channel, index) => {
                const selected = index === highlightedChannelIndex;
                return (
                  <button
                    key={channel.id}
                    type="button"
                    className={`${composerMatchMenuItemClass} ${selected ? "bg-[var(--wc-surface-tint-strong)]" : "hover:bg-white/[0.05]"}`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      selectChannel(channel);
                    }}
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.04] text-[13px] font-semibold text-discord-muted">
                      #
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-white">{channel.name}</div>
                      <div className="mt-0.5 text-[11px] text-discord-muted">Insert channel mention</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {emojiMenuOpen && !editingId ? (
          <div className={composerMatchMenuClass}>
            <p className={composerMatchMenuHeaderClass}>
              Emojis matching :{emojiQuery}
            </p>
            <div ref={composerEmojiMenuListRef} className={composerMatchMenuListClass}>
              {emojiCandidates.map((emojiCandidate, index) => {
                const selected = index === highlightedEmojiIndex;
                return (
                  <button
                    key={emojiCandidate.unified}
                    type="button"
                    className={`${composerMatchMenuItemClass} ${selected ? "bg-[var(--wc-surface-tint-strong)]" : "hover:bg-white/[0.05]"}`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      selectEmoji(emojiCandidate);
                    }}
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.04]">
                      <EmojiGlyph emoji={emojiCandidate.emoji} sizeClassName="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-white">:{emojiCandidate.name}:</div>
                      <div className="mt-0.5 text-[11px] text-discord-muted">Insert emoji</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {showPicker ? (
          <div ref={composerPickerRef} className="absolute bottom-16 right-4 z-50">
            <DiscordEmojiPicker
              variant="composer"
              onEmojiClick={(emoji, shiftKey) => {
                const separator = content.length > 0 && !/\s$/.test(content) ? " " : "";
                const nextValue = `${content}${separator}${emoji} `;
                applyComposerValue(nextValue);
                if (!shiftKey) setShowPicker(false);
                window.requestAnimationFrame(() => {
                  inputRef.current?.focus();
                  inputRef.current?.setSelectionRange(nextValue.length, nextValue.length);
                });
              }}
            />
          </div>
        ) : null}
      </form>

      {memberContextMenu ? (
        <div
          className="fixed z-50 w-44 overflow-hidden rounded-md border border-white/[0.06] bg-[#111214] shadow-lg"
          style={{ top: memberContextMenu.y, left: memberContextMenu.x }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            className="w-full px-3 py-2 text-left text-sm text-white hover:bg-[#2b2d31]"
            onClick={() => {
              onOpenProfile(memberContextMenu.member);
              setMemberContextMenu(null);
            }}
          >
            View Profile
          </button>
          {(canKickMembers || canBanMembers) && memberContextMenu.member.id !== me.id && memberContextMenu.member.username !== SYSTEM_USERNAME ? (
            <>
              {canKickMembers ? (
                <button
                  className="w-full px-3 py-2 text-left text-sm text-[#f0b232] hover:bg-[#2b2d31]"
                  onClick={() => {
                    onKickMember?.(memberContextMenu.member.id);
                    setMemberContextMenu(null);
                  }}
                >
                  Kick Member
                </button>
              ) : null}
              {canBanMembers ? (
                <button
                  className="w-full px-3 py-2 text-left text-sm text-[#ed4245] hover:bg-[#2b2d31]"
                  onClick={() => {
                    onBanMember?.(memberContextMenu.member.id);
                    setMemberContextMenu(null);
                  }}
                >
                  Ban Member
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      <AnimatePresence>
        {fullscreenImage ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] backdrop-blur-xl" style={{ backgroundColor: "rgba(0, 0, 0, 0.88)" }}
            onClick={() => setFullscreenImage(null)}
          >
              <div className="absolute left-4 right-4 top-4 z-10 flex items-center justify-between gap-2" onClick={(event) => event.stopPropagation()}>
              <p className="truncate text-sm text-white">{fullscreenImage.name}</p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="rounded p-2 text-white backdrop-blur-sm" style={{ backgroundColor: "rgba(43, 45, 49, 0.85)", border: "1px solid rgba(255, 255, 255, 0.06)" }}
                  onClick={(event) => {
                    event.stopPropagation();
                      setImageZoom((current) => {
                        const nextZoom = clampImageZoom(current - IMAGE_ZOOM_STEP);
                        setImagePan((pan) => clampPan(pan, nextZoom));
                        return nextZoom;
                      });
                  }}
                  title="Zoom out"
                >
                  <ZoomOut size={16} />
                </button>
                <button
                  type="button"
                  className="rounded p-2 text-white backdrop-blur-sm" style={{ backgroundColor: "rgba(43, 45, 49, 0.85)", border: "1px solid rgba(255, 255, 255, 0.06)" }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setImageZoom(1);
                    setImagePan({ x: 0, y: 0 });
                  }}
                  title="Reset zoom"
                >
                  <Search size={16} />
                </button>
                <button
                  type="button"
                  className="rounded p-2 text-white backdrop-blur-sm" style={{ backgroundColor: "rgba(43, 45, 49, 0.85)", border: "1px solid rgba(255, 255, 255, 0.06)" }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setImageZoom((current) => {
                      const nextZoom = clampImageZoom(current + IMAGE_ZOOM_STEP);
                      setImagePan((pan) => clampPan(pan, nextZoom));
                      return nextZoom;
                    });
                  }}
                  title="Zoom in"
                >
                  <ZoomIn size={16} />
                </button>
                <a
                  href={fullscreenImage.src}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded p-2 text-white backdrop-blur-sm" style={{ backgroundColor: "rgba(43, 45, 49, 0.85)", border: "1px solid rgba(255, 255, 255, 0.06)" }}
                  onClick={(event) => event.stopPropagation()}
                  title="Open direct URL"
                >
                  <ExternalLink size={16} />
                </a>
                <button
                  type="button"
                  className="rounded p-2 text-white backdrop-blur-sm" style={{ backgroundColor: "rgba(43, 45, 49, 0.85)", border: "1px solid rgba(255, 255, 255, 0.06)" }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setFullscreenImage(null);
                  }}
                  title="Close"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div
              ref={imageViewportRef}
              className="absolute inset-0 overflow-hidden pt-16"
              onWheel={(event) => {
                event.preventDefault();
                const delta = event.deltaY < 0 ? IMAGE_ZOOM_STEP : -IMAGE_ZOOM_STEP;
                setImageZoom((current) => {
                  const nextZoom = clampImageZoom(current + delta);
                  setImagePan((pan) => clampPan(pan, nextZoom));
                  return nextZoom;
                });
              }}
              onMouseDown={(event) => {
                if (imageZoom <= 1) {
                  return;
                }
                event.preventDefault();
                imagePanStartRef.current = {
                  x: event.clientX,
                  y: event.clientY,
                  panX: imagePan.x,
                  panY: imagePan.y
                };
                setIsImagePanning(true);
              }}
              onMouseMove={(event) => {
                if (!isImagePanning || !imagePanStartRef.current) {
                  return;
                }
                event.preventDefault();
                const dx = event.clientX - imagePanStartRef.current.x;
                const dy = event.clientY - imagePanStartRef.current.y;
                const nextPan = {
                  x: imagePanStartRef.current.panX + dx,
                  y: imagePanStartRef.current.panY + dy
                };
                setImagePan(clampPan(nextPan, imageZoom));
              }}
              onMouseUp={() => {
                imagePanStartRef.current = null;
                setIsImagePanning(false);
              }}
              onMouseLeave={() => {
                imagePanStartRef.current = null;
                setIsImagePanning(false);
              }}
              style={{ cursor: imageZoom > 1 ? (isImagePanning ? "grabbing" : "grab") : "default" }}
            >
              <div className="flex h-full w-full items-center justify-center p-6">
                <img
                  ref={fullscreenImageRef}
                  src={fullscreenImage.src}
                  alt={fullscreenImage.name}
                  className="max-h-[85vh] max-w-[95vw] select-none object-contain"
                  style={{ transform: `translate(${imagePan.x}px, ${imagePan.y}px) scale(${imageZoom})` }}
                  onClick={(event) => event.stopPropagation()}
                  draggable={false}
                />
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
};

export default ChatArea;
