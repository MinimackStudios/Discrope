import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import emojiMartDataJson from "@emoji-mart/data/sets/15/native.json";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Hash, Search, X } from "lucide-react";
import { api } from "../lib/api";
import { resolveUserAvatarUrl } from "../lib/media";
import type { DMMessage, Message, ServerMember } from "../types";

type SearchScope = "server" | "dm";

type SearchResultMessage = (Message | DMMessage) & {
  channel?: {
    id: string;
    name: string;
  } | null;
};

type SearchResult = {
  message: SearchResultMessage;
  highlightedText: string;
};

type Props = {
  scope: SearchScope;
  targetId: string | null;
  members?: ServerMember[];
  conversationLabel?: string | null;
  onJumpToMessage: (conversationId: string, messageId: string) => Promise<void> | void;
  onOpenChange?: (open: boolean) => void;
};

type SearchGroup = {
  conversationId: string;
  conversationName: string;
  items: SearchResult[];
};

type SearchPaginationItem =
  | { type: "page"; value: number }
  | { type: "ellipsis"; key: string };

type EmojiSearchEntry = {
  shortcode: string;
  emoji: string;
};

const DEBOUNCE_MS = 220;
const SEARCH_PAGE_SIZE = 25;
const EMOJI_REGEX = /(?:[\u{1F1E6}-\u{1F1FF}]{1,2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\p{Emoji_Modifier})?)*)/gu;
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
  return {
    shortcode: `regional_indicator_${letter}`,
    emoji
  };
});

const EMOJI_BY_SHORTCODE = [
  ...Object.entries(emojiMartData.emojis).flatMap(([emojiId, emojiEntry]) => {
    const nativeEmoji = emojiEntry.skins?.[0]?.native;
    if (!nativeEmoji) {
      return [];
    }

    const normalizedId = emojiId.toLowerCase();
    const shortcodes = Array.from(new Set([normalizedId, ...(aliasesByEmojiId[normalizedId] ?? [])]));
    return shortcodes.map((shortcode) => ({ shortcode, emoji: nativeEmoji }));
  }),
  ...REGIONAL_INDICATOR_ENTRIES,
  { shortcode: "head_shaking_horizontally", emoji: "🙂‍↔️" },
  { shortcode: "head_shaking_vertically", emoji: "🙂‍↕️" },
  { shortcode: "distorted_face", emoji: "🫪" },
  { shortcode: "face_with_bags_under_eyes", emoji: "🫩" }
].reduce<Map<string, string>>((map, entry) => {
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

const toEmojiUnified = (emoji: string, keepFe0f = false): string => {
  const codepoints = Array.from(emoji)
    .map((char) => char.codePointAt(0)?.toString(16) ?? "")
    .filter(Boolean);

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
  const urls: string[] = [`${JDECKED_BASE}${unifiedNoFe0f}.svg`];
  if (unifiedWithFe0f !== unifiedNoFe0f) {
    urls.push(`${JDECKED_BASE}${unifiedWithFe0f}.svg`);
  }
  for (const base of LEGACY_CDN_BASE_URLS) {
    urls.push(`${base}${unifiedNoFe0f}.svg`);
  }
  return urls;
};

const EmojiInlineImage = ({ emoji, sizeClassName = "h-[1.15em] w-[1.15em]" }: { emoji: string; sizeClassName?: string }): JSX.Element => {
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

const renderEmojiText = (text: string, keyPrefix: string, sizeClassName = "h-[1.15em] w-[1.15em]"): ReactNode[] => {
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

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const formatSearchTimestamp = (value: string): string => {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
};

const buildPreviewText = (message: SearchResultMessage): string => {
  const normalizedContent = replaceCompletedEmojiShortcodes(message.content || "").trim();
  if (normalizedContent) {
    return normalizedContent;
  }
  if (message.attachmentName?.trim()) {
    return `Attachment: ${message.attachmentName}`;
  }
  return "No text content";
};

const highlightPreview = (text: string, query: string, keyPrefix: string): JSX.Element => {
  if (!query) {
    return <>{renderEmojiText(text, `${keyPrefix}-plain`)}</>;
  }

  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, "ig"));
  return (
    <>
      {parts.map((part, index) => (
        index % 2 === 1 ? (
          <mark key={`${keyPrefix}-${part}-${index}`} className="rounded-[3px] bg-[var(--wc-surface-tint-strong)] px-[2px] font-medium text-[#eef2ff]">
            {renderEmojiText(part, `${keyPrefix}-mark-${index}`)}
          </mark>
        ) : (
          <span key={`${keyPrefix}-${part}-${index}`}>{renderEmojiText(part, `${keyPrefix}-text-${index}`)}</span>
        )
      ))}
    </>
  );
};

const getResultConversationId = (message: SearchResultMessage): string => {
  if ("channelId" in message) {
    return message.channel?.id ?? message.channelId;
  }
  return message.dmChannelId;
};

const getSearchEndpoint = (scope: SearchScope, targetId: string): string => {
  return scope === "server"
    ? `/servers/${targetId}/messages/search`
    : `/dms/${targetId}/messages/search`;
};

const MessageSearchModal = ({ scope, targetId, members = [], conversationLabel, onJumpToMessage, onOpenChange }: Props): JSX.Element => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [totalResults, setTotalResults] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [jumpingMessageId, setJumpingMessageId] = useState<string | null>(null);
  const [activeJumpSlot, setActiveJumpSlot] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pageJumpInputRef = useRef<HTMLInputElement>(null);

  const memberNickColorByUserId = useMemo(() => {
    const next = new Map<string, string>();
    for (const member of members) {
      if (member.nickColor) {
        next.set(member.userId, member.nickColor);
      }
    }
    return next;
  }, [members]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    onOpenChange?.(open);
  }, [onOpenChange, open]);

  useEffect(() => {
    setPageInput(String(page));
    setActiveJumpSlot(null);
  }, [page]);

  useEffect(() => {
    if (!activeJumpSlot) {
      return;
    }

    pageJumpInputRef.current?.focus();
    pageJumpInputRef.current?.select();
  }, [activeJumpSlot]);

  useEffect(() => {
    setOpen(false);
    setQuery("");
    setDebouncedQuery("");
    setPage(1);
    setTotalResults(0);
    setTotalPages(1);
    setResults([]);
    setSelectedIndex(-1);
    setError(null);
    setActiveJumpSlot(null);
  }, [scope, targetId]);

  useEffect(() => {
    if (!targetId || !debouncedQuery) {
      setResults([]);
      setTotalResults(0);
      setTotalPages(1);
      setError(null);
      setLoading(false);
      setSelectedIndex(-1);
      return;
    }

    let cancelled = false;

    const fetchResults = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      setSelectedIndex(-1);
      try {
        const { data } = await api.get(getSearchEndpoint(scope, targetId), {
          params: { q: debouncedQuery, page, pageSize: SEARCH_PAGE_SIZE }
        });
        if (!cancelled) {
          setResults((data.results ?? []) as SearchResult[]);
          setTotalResults(typeof data.total === "number" ? data.total : 0);
          setTotalPages(typeof data.totalPages === "number" ? data.totalPages : 1);
        }
      } catch {
        if (!cancelled) {
          setResults([]);
          setTotalResults(0);
          setTotalPages(1);
          setError("Search failed. Please try again.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchResults();

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, page, scope, targetId]);

  const groupedResults = useMemo<SearchGroup[]>(() => {
    const groups = new Map<string, SearchGroup>();
    const orderedGroups: SearchGroup[] = [];

    for (const result of results) {
      const conversationId = getResultConversationId(result.message);
      const conversationName = scope === "server"
        ? (result.message.channel?.name ?? "unknown-channel")
        : (conversationLabel?.trim() || "Conversation");
      if (!groups.has(conversationId)) {
        const nextGroup = { conversationId, conversationName, items: [] };
        groups.set(conversationId, nextGroup);
        orderedGroups.push(nextGroup);
      }
      groups.get(conversationId)?.items.push(result);
    }

    return orderedGroups;
  }, [conversationLabel, results, scope]);

  const paginationItems = useMemo<SearchPaginationItem[]>(() => {
    if (totalPages <= 1) {
      return [];
    }

    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, index) => ({ type: "page", value: index + 1 }));
    }

    const visiblePages = new Set<number>([1, totalPages]);
    if (page <= 3) {
      visiblePages.add(2);
      visiblePages.add(3);
    } else if (page >= totalPages - 2) {
      visiblePages.add(totalPages - 1);
      visiblePages.add(totalPages - 2);
    } else {
      visiblePages.add(page - 1);
      visiblePages.add(page);
      visiblePages.add(page + 1);
    }

    const sortedPages = Array.from(visiblePages)
      .filter((value) => value >= 1 && value <= totalPages)
      .sort((a, b) => a - b);

    const items: SearchPaginationItem[] = [];
    sortedPages.forEach((value, index) => {
      if (index > 0) {
        const previousValue = sortedPages[index - 1];
        if (value - previousValue > 1) {
          items.push({ type: "ellipsis", key: `${previousValue}-${value}` });
        }
      }

      items.push({ type: "page", value });
    });

    return items;
  }, [page, totalPages]);

  const handleResultClick = useCallback(async (result: SearchResult) => {
    setJumpingMessageId(result.message.id);
    try {
      await onJumpToMessage(getResultConversationId(result.message), result.message.id);
    } finally {
      setJumpingMessageId(null);
    }
  }, [onJumpToMessage]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setSelectedIndex(-1);
      return;
    }

    if (!results.length) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (event.key === "Enter" && selectedIndex >= 0 && selectedIndex < results.length) {
      event.preventDefault();
      void handleResultClick(results[selectedIndex]);
    }
  }, [handleResultClick, results, selectedIndex]);

  const clearSearch = (): void => {
    setQuery("");
    setDebouncedQuery("");
    setPage(1);
    setPageInput("1");
    setTotalResults(0);
    setTotalPages(1);
    setResults([]);
    setSelectedIndex(-1);
    setError(null);
    setActiveJumpSlot(null);
    inputRef.current?.focus();
  };

  const closePanel = (): void => {
    clearSearch();
    setOpen(false);
  };

  const commitPageInput = useCallback((): void => {
    const parsedPage = parseInt(pageInput, 10);
    if (!Number.isFinite(parsedPage)) {
      setPageInput(String(page));
      setActiveJumpSlot(null);
      return;
    }

    const clampedPage = Math.min(totalPages, Math.max(1, parsedPage));
    setPage(clampedPage);
    setPageInput(String(clampedPage));
    setActiveJumpSlot(null);
  }, [page, pageInput, totalPages]);

  const paginationButtonClass = "shrink-0 flex h-8 min-w-[2rem] items-center justify-center rounded-full px-2 text-xs font-semibold transition";
  const pageNavButtonClass = "shrink-0 inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold transition";

  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-xl border border-white/[0.05] bg-black/20 px-3 py-2 backdrop-blur-xl transition focus-within:border-white/[0.08] focus-within:bg-black/30"
        style={{ boxShadow: "var(--wc-search-shell-shadow)" }}
      >
        <Search size={14} className="shrink-0 text-discord-muted" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
            setOpen(true);
          }}
          placeholder="Search"
          className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder-discord-muted outline-none"
          aria-label={scope === "server" ? "Search server messages" : "Search direct messages"}
        />
        {open ? (
          <button
            type="button"
            onClick={closePanel}
            className="rounded-md p-1 text-discord-muted transition hover:bg-white/[0.06] hover:text-white"
            aria-label="Close search results"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="absolute inset-x-0 bottom-0 top-[3.85rem] z-30 flex flex-col overflow-hidden border-t border-white/[0.04]"
            style={{ background: "var(--wc-member-panel-bg)" }}
            role="dialog"
            aria-label={scope === "server" ? "Server search results" : "Direct message search results"}
          >
            <div className="flex items-center justify-between gap-2 border-b border-white/[0.04] px-4 py-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-discord-muted">Search Results</p>
                <p className="mt-1 text-xs text-discord-muted">
                  {debouncedQuery
                    ? `${totalResults} result${totalResults === 1 ? "" : "s"}`
                    : (scope === "server" ? "Search across this server" : "Search this conversation")}
                </p>
              </div>
              {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-[var(--wc-accent)]" /> : null}
            </div>

            <div className="discord-scrollbar min-h-0 flex-1 overflow-y-auto p-2.5">
              {error ? (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-3 py-4 text-center text-sm text-red-300" role="alert">
                  {error}
                </div>
              ) : !debouncedQuery ? (
                <div className="rounded-2xl border border-white/[0.04] bg-white/[0.02] px-4 py-5 text-center">
                  <p className="text-sm font-medium text-white">{scope === "server" ? "Search every channel in this server" : "Search this DM"}</p>
                  <p className="mt-1 text-xs leading-5 text-discord-muted">
                    {scope === "server"
                      ? "Results open directly in their channel, and older hits load enough context to land on the exact message."
                      : "Results open directly in this conversation, and older hits load enough context to land on the exact message."}
                  </p>
                </div>
              ) : !loading && groupedResults.length === 0 ? (
                <div className="rounded-2xl border border-white/[0.04] bg-white/[0.02] px-4 py-5 text-center">
                  <p className="text-sm font-medium text-white">No messages found for "{debouncedQuery}"</p>
                  <p className="mt-1 text-xs leading-5 text-discord-muted">Try a different word, phrase, or channel conversation.</p>
                </div>
              ) : (
                groupedResults.map((group) => {
                  const groupOffset = results.findIndex((result) => result.message.id === group.items[0]?.message.id);
                  return (
                    <section key={group.conversationId} className="mb-4 last:mb-0">
                      <div
                        className="sticky top-0 z-10 mb-2 flex items-center gap-2 rounded-xl px-2.5 py-2 backdrop-blur"
                        style={{ backgroundColor: "var(--wc-card-surface-strong)", boxShadow: "inset 0 0 0 1px var(--wc-line-strong)" }}
                      >
                        {scope === "server" ? <Hash size={13} className="text-discord-muted" /> : null}
                        <span className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-discord-muted">{group.conversationName}</span>
                      </div>
                      <div className="space-y-1.5">
                        {group.items.map((result, itemIndex) => {
                          const resultIndex = groupOffset + itemIndex;
                          const isSelected = resultIndex === selectedIndex;
                          const authorName = result.message.author.nickname?.trim() || result.message.author.username;
                          const previewText = buildPreviewText(result.message);
                          const isJumping = jumpingMessageId === result.message.id;

                          return (
                            <button
                              key={result.message.id}
                              type="button"
                              className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                                isSelected
                                  ? "border-white/[0.08] bg-white/[0.08]"
                                  : "border-transparent bg-white/[0.02] hover:border-white/[0.05] hover:bg-white/[0.05]"
                              }`}
                              onMouseEnter={() => setSelectedIndex(resultIndex)}
                              onClick={() => {
                                void handleResultClick(result);
                              }}
                            >
                              <div className="flex items-start gap-2.5">
                                <img
                                  src={resolveUserAvatarUrl(result.message.author)}
                                  alt={authorName}
                                  className="mt-0.5 h-9 w-9 shrink-0 rounded-full"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="truncate text-sm font-semibold"
                                      style={{ color: memberNickColorByUserId.get(result.message.authorId) ?? "#ffffff" }}
                                    >
                                      {authorName}
                                    </span>
                                    <span className="shrink-0 text-[11px] text-discord-muted">{formatSearchTimestamp(result.message.createdAt)}</span>
                                  </div>
                                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-[13px] leading-5 text-discord-text">
                                    {highlightPreview(previewText, debouncedQuery, `preview-${result.message.id}`)}
                                  </p>
                                  {result.message.replyTo?.content ? (
                                    <p className="mt-2 line-clamp-1 text-[11px] text-discord-muted">
                                      Replying to {result.message.replyTo.author.nickname || result.message.replyTo.author.username}: {renderEmojiText(replaceCompletedEmojiShortcodes(result.message.replyTo.content), `reply-${result.message.id}`, "h-[1em] w-[1em]")}
                                    </p>
                                  ) : null}
                                </div>
                                {isJumping ? <span className="mt-1 h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-[var(--wc-accent)]" /> : null}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  );
                })
              )}
            </div>

            {debouncedQuery && totalPages > 1 ? (
              <div className="border-t border-white/[0.04] px-3 py-2.5">
                <div className="flex items-center justify-between gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={page <= 1 || loading}
                    className={`${pageNavButtonClass} text-discord-text hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    <ChevronLeft size={13} className="shrink-0" />
                    <span>Back</span>
                  </button>
                  <div className="flex min-w-0 flex-1 items-center justify-center gap-1 px-1">
                    {paginationItems.map((item) => {
                      if (item.type === "ellipsis") {
                        return activeJumpSlot === item.key ? (
                          <input
                            key={item.key}
                            ref={pageJumpInputRef}
                            type="number"
                            min={1}
                            max={totalPages}
                            inputMode="numeric"
                            value={pageInput}
                            onChange={(event) => setPageInput(event.target.value)}
                            onBlur={commitPageInput}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                commitPageInput();
                              }

                              if (event.key === "Escape") {
                                event.preventDefault();
                                setPageInput(String(page));
                                setActiveJumpSlot(null);
                              }
                            }}
                            className="h-8 w-12 shrink-0 rounded-full bg-white/[0.06] px-2 text-center text-xs font-semibold leading-none text-white outline-none ring-1 ring-white/[0.1] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            aria-label="Jump to search results page"
                          />
                        ) : (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => {
                              setPageInput(String(page));
                              setActiveJumpSlot(item.key);
                            }}
                            className={`${paginationButtonClass} text-discord-muted hover:bg-white/[0.04] hover:text-white`}
                            aria-label="Jump to a specific page"
                          >
                            ...
                          </button>
                        );
                      }

                      const isActive = item.value === page;
                      return (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => setPage(item.value)}
                          disabled={loading}
                          className={`${paginationButtonClass} ${
                            isActive
                              ? "bg-[var(--wc-accent)] text-white shadow-[0_10px_20px_rgba(0,0,0,0.18)]"
                              : "text-discord-text hover:bg-white/[0.06]"
                          } disabled:cursor-not-allowed disabled:opacity-40`}
                          aria-current={isActive ? "page" : undefined}
                          aria-label={`Page ${item.value}`}
                        >
                          {item.value}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    disabled={page >= totalPages || loading}
                    className={`${pageNavButtonClass} text-discord-text hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    <span>Next</span>
                    <ChevronRight size={13} className="shrink-0" />
                  </button>
                </div>
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

export default MessageSearchModal;
