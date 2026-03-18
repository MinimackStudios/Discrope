import { type ChangeEvent, type MouseEvent, type ReactNode, FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import remarkGfm from "remark-gfm";
import ReactMarkdown from "react-markdown";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Edit3, FileAudio2, Paperclip, Pause, Play, Reply, Smile, Trash2, Volume2, VolumeX } from "lucide-react";
import { useChatStore } from "../lib/stores/chatStore";
import { api } from "../lib/api";
import { resolveMediaUrl } from "../lib/media";
import { getSocket } from "../lib/socket";
import OpenGraphEmbed from "./OpenGraphEmbed";
import StatusDot from "./StatusDot";
import type { DMMessage, Message, ServerMember, User } from "../types";

type ChatMessage = Message | DMMessage;

type Props = {
  me: User;
  mode: "SERVER" | "DM";
  channelName: string;
  messages: ChatMessage[];
  focusMessageId?: string | null;
  typingUsers: string[];
  mentionMembers?: ServerMember[];
  onOpenProfile: (user: User) => void;
  canModerateServerMessages: boolean;
  onKickMember?: (memberId: string) => void;
  onBanMember?: (memberId: string) => void;
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

const SYSTEM_USERNAME = "Discrope";
const DEFAULT_AVATAR_URL = `${import.meta.env.BASE_URL}default-avatar.svg`;
const INVITE_REGEX = /(?:https?:\/\/[^\s]+\/invite\/|\/invite\/)([a-z0-9-]{3,32})/i;
const URL_REGEX = /https?:\/\/[^\s<>()]+[^\s<>().,!?:;\]\)]/gi;
const DRAFT_STORAGE_KEY = "discrope_message_drafts_v1";
const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;
const MARKDOWN_SYNTAX_REGEX = /[`*_~\[\]()>#]|(?:^|\s)-\s|https?:\/\//;
const VIRTUALIZATION_THRESHOLD = 80;
const DEFAULT_MESSAGE_ROW_HEIGHT = 84;
const VIRTUALIZATION_OVERSCAN_PX = 800;

type InvitePreview = {
  code: string;
  server: {
    id: string;
    name: string;
    iconUrl?: string | null;
    memberCount: number;
  };
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

const InviteEmbed = ({ inviteCode }: { inviteCode: string }): JSX.Element | null => {
  const loadServers = useChatStore((s) => s.loadServers);
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
    return <div className="mt-1.5 inline-flex rounded-md border border-[#3f4248] bg-[#2b2d31] px-2 py-1 text-[11px] text-discord-muted">Loading invite...</div>;
  }

  if (!invite) {
    return null;
  }

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
    <div className="mt-1.5 w-full max-w-[320px] rounded-md border border-[#3f4248] bg-[#2b2d31] p-2">
      <div className="flex items-center gap-2">
        <img
          src={resolveMediaUrl(invite.server.iconUrl) || DEFAULT_AVATAR_URL}
          alt={invite.server.name}
          className="h-8 w-8 rounded-lg object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-discord-muted">Invite</p>
          <p className="truncate text-xs font-semibold text-white">{invite.server.name}</p>
          <p className="text-[11px] text-discord-muted">{invite.server.memberCount} members</p>
        </div>
        <div className="flex gap-1">
          <a
            href={`${import.meta.env.BASE_URL}invite/${invite.code}`}
            className="rounded bg-[#3a3d45] px-2 py-1 text-[11px] font-semibold text-white hover:bg-[#4a4e57]"
          >
            Open
          </a>
          <button
            type="button"
            onClick={() => void acceptInvite()}
            disabled={joining}
            className="rounded bg-discord-blurple px-2 py-1 text-[11px] font-semibold text-white hover:bg-[#4752c4] disabled:opacity-60"
          >
            {joining ? "Joining..." : "Accept"}
          </button>
        </div>
      </div>
      {joinMessage ? <p className="mt-1 text-[11px] text-discord-muted">{joinMessage}</p> : null}
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

const AudioAttachmentPlayer = ({ src, attachmentName }: { src: string; attachmentName?: string | null }): JSX.Element => {
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
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded bg-[#dfe2ff] text-[#5865f2]">
          <FileAudio2 size={18} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-base leading-5 text-[#69a0ff]">{displayName}</p>
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
          <div className="absolute left-0 top-0 h-2 rounded-full bg-[#5865f2]" style={{ width: `${progress * 100}%` }} />
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
      </div>
    </div>
  );
};

const VideoAttachmentPlayer = ({ src, attachmentName }: { src: string; attachmentName?: string | null }): JSX.Element => {
  return (
    <div className="mt-2 w-full max-w-[520px] rounded-md border border-[#3f4248] bg-[#2b2d31] p-2">
      <video src={src} controls className="max-h-80 w-full rounded-md" />
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="truncate text-xs text-discord-muted">{attachmentName || "video"}</p>
        <div className="flex items-center gap-1">
          <a
            href={src}
            download={attachmentName || "video"}
            className="rounded bg-[#3a3d45] px-2 py-1 text-[11px] font-semibold text-white hover:bg-[#4a4e57]"
          >
            <span className="inline-flex items-center gap-1"><Download size={12} /> Download</span>
          </a>
        </div>
      </div>
    </div>
  );
};

const ChatArea = ({
  me,
  mode,
  channelName,
  messages,
  focusMessageId,
  typingUsers,
  mentionMembers = [],
  onOpenProfile,
  canModerateServerMessages,
  onKickMember,
  onBanMember
}: Props): JSX.Element => {
  const sendMessage = useChatStore((s) => s.sendMessage);
  const sendDMMessage = useChatStore((s) => s.sendDMMessage);
  const editMessage = useChatStore((s) => s.editMessage);
  const editDMMessage = useChatStore((s) => s.editDMMessage);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const deleteDMMessage = useChatStore((s) => s.deleteDMMessage);
  const toggleReaction = useChatStore((s) => s.toggleReaction);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const activeDMId = useChatStore((s) => s.activeDMId);

  const [content, setContent] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>(() => loadDrafts());
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null);
  const [memberContextMenu, setMemberContextMenu] = useState<MemberContextMenu | null>(null);
  const [highlightedMentionIndex, setHighlightedMentionIndex] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const consumedFocusMessageIdRef = useRef<string | null>(null);
  const initialScrollPositionedRef = useRef(false);
  const stickToBottomRef = useRef(true);
  const previousMessageCountRef = useRef(0);
  const pendingScrollRequestRef = useRef<{ messageId: string; behavior: ScrollBehavior; block: ScrollLogicalPosition } | null>(null);
  const measuredMessageHeightsRef = useRef<Record<string, number>>({});
  const messageResizeObserversRef = useRef<Record<string, ResizeObserver>>({});
  const dragDepthRef = useRef(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [heightVersion, setHeightVersion] = useState(0);

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

  const mentionQuery = mentionToken ? mentionToken[1].toLowerCase() : null;
  const mentionCandidates = useMemo(() => {
    if (mode !== "SERVER" || !mentionToken) {
      return [] as ServerMember[];
    }

    const query = mentionQuery ?? "";
    const filtered = mentionMembers.filter((member) => {
      if (member.user.isDeleted) {
        return false;
      }
      const displayName = (member.nickname || member.user.nickname || member.user.username).toLowerCase();
      const username = member.user.username.toLowerCase();
      return displayName.includes(query) || username.includes(query);
    });

    return filtered.sort((a, b) => {
      const aDisplay = (a.nickname || a.user.nickname || a.user.username).toLowerCase();
      const bDisplay = (b.nickname || b.user.nickname || b.user.username).toLowerCase();
      const aStarts = aDisplay.startsWith(query) || a.user.username.toLowerCase().startsWith(query);
      const bStarts = bDisplay.startsWith(query) || b.user.username.toLowerCase().startsWith(query);
      if (aStarts !== bStarts) {
        return aStarts ? -1 : 1;
      }
      return aDisplay.localeCompare(bDisplay);
    });
  }, [mentionMembers, mentionQuery, mentionToken, mode]);

  const mentionMenuOpen = mode === "SERVER" && Boolean(mentionToken) && mentionCandidates.length > 0;

  const membersByUsername = useMemo(() => {
    const map = new Map<string, ServerMember>();
    for (const member of mentionMembers) {
      map.set(member.user.username.toLowerCase(), member);
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
          const regex = /(^|\s)@([a-zA-Z0-9_]{1,32})/g;
          let lastIndex = 0;
          let match = regex.exec(line);

          while (match) {
            const fullMatch = match[0];
            const leading = match[1] ?? "";
            const token = match[2] ?? "";
            const fullStart = match.index;
            const mentionStart = fullStart + leading.length;

            if (fullStart > lastIndex) {
              parts.push(line.slice(lastIndex, fullStart));
            }
            if (leading) {
              parts.push(leading);
            }

            const member = resolveMentionMember(token);
            if (member) {
              const display = member.nickname || member.user.nickname || member.user.username;
              parts.push(
                <button
                  key={`mention-${lineIndex}-${mentionStart}-${member.user.id}`}
                  type="button"
                  onClick={() => onOpenProfile(member.user)}
                  className="mx-0.5 rounded-[3px] bg-[#3a4273] px-1 font-medium text-[#d7e1ff] hover:bg-[#5865f2] hover:text-white"
                >
                  @{display}
                </button>
              );
            } else {
              parts.push(fullMatch);
            }

            lastIndex = fullStart + fullMatch.length;
            match = regex.exec(line);
          }

          if (lastIndex < line.length) {
            parts.push(line.slice(lastIndex));
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

  const renderMessageContent = (rawContent: string): JSX.Element => {
    if (mode === "SERVER" && /(^|\s)@([a-zA-Z0-9_]{1,32})/.test(rawContent)) {
      return renderMentionPills(rawContent);
    }

    if (!MARKDOWN_SYNTAX_REGEX.test(rawContent)) {
      return <span className="whitespace-pre-wrap">{rawContent}</span>;
    }

    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-[#00a8fc] hover:underline">
              {children}
            </a>
          )
        }}
      >
        {rawContent}
      </ReactMarkdown>
    );
  };

  const shouldVirtualizeMessages = messages.length > VIRTUALIZATION_THRESHOLD;

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
    if (!shouldVirtualizeMessages) {
      return {
        start: 0,
        end: messages.length,
        topPadding: 0,
        bottomPadding: 0
      };
    }

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
  }, [messageLayout, messages.length, scrollTop, shouldVirtualizeMessages, viewportHeight]);

  const visibleMessages = shouldVirtualizeMessages ? messages.slice(visibleRange.start, visibleRange.end) : messages;

  const scrollMessageIntoView = (messageId: string, behavior: ScrollBehavior, block: ScrollLogicalPosition): void => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }

    const messageIndex = messages.findIndex((message) => message.id === messageId);
    if (messageIndex === -1) {
      return;
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

    pendingScrollRequestRef.current = { messageId, behavior, block };
    node.scrollTo({ top: Math.max(0, targetTop), behavior });
  };

  const bindMessageNode = (messageId: string, node: HTMLElement | null): void => {
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
    });
    observer.observe(node);
    messageResizeObserversRef.current[messageId] = observer;
  };

  const scrollToBottom = (behavior: ScrollBehavior = "smooth"): void => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior });
  };

  useEffect(() => {
    initialScrollPositionedRef.current = false;
    consumedFocusMessageIdRef.current = null;
    previousMessageCountRef.current = 0;
    pendingScrollRequestRef.current = null;
    measuredMessageHeightsRef.current = {};
    Object.values(messageResizeObserversRef.current).forEach((observer) => observer.disconnect());
    messageResizeObserversRef.current = {};
    stickToBottomRef.current = true;
    setScrollTop(0);
    setViewportHeight(0);
    setHeightVersion(0);
  }, [mode, activeChannelId, activeDMId]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }

    const updateScrollMetrics = (): void => {
      const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
      stickToBottomRef.current = distanceFromBottom <= 72;
      setScrollTop(node.scrollTop);
      setViewportHeight(node.clientHeight);
    };

    updateScrollMetrics();
    const resizeObserver = new ResizeObserver(() => updateScrollMetrics());
    resizeObserver.observe(node);
    node.addEventListener("scroll", updateScrollMetrics, { passive: true });
    return () => {
      node.removeEventListener("scroll", updateScrollMetrics);
      resizeObserver.disconnect();
    };
  }, [mode, activeChannelId, activeDMId]);

  useLayoutEffect(() => {
    if (!messages.length) {
      previousMessageCountRef.current = 0;
      return;
    }

    const previousCount = previousMessageCountRef.current;
    const messageCountIncreased = messages.length > previousCount;
    previousMessageCountRef.current = messages.length;

    const isInitialPosition = !initialScrollPositionedRef.current;
    const defaultBehavior: ScrollBehavior = "auto";

    const scrollBottom = (): void => {
      scrollToBottom(defaultBehavior);
      initialScrollPositionedRef.current = true;
    };

    if (mode === "SERVER" && focusMessageId && consumedFocusMessageIdRef.current !== focusMessageId) {
      const focusUnreadMessage = (attempt = 0): void => {
        const element = document.getElementById(`message-${focusMessageId}`);
        if (element) {
          element.scrollIntoView({ behavior: defaultBehavior, block: "center" });
          consumedFocusMessageIdRef.current = focusMessageId;
          initialScrollPositionedRef.current = true;
          return;
        }

        if (attempt < 2) {
          scrollMessageIntoView(focusMessageId, defaultBehavior, "center");
          window.requestAnimationFrame(() => focusUnreadMessage(attempt + 1));
          return;
        }

        scrollBottom();
      };

      focusUnreadMessage();
      return;
    }

    if (!isInitialPosition && !messageCountIncreased) {
      return;
    }

    if (!isInitialPosition && !stickToBottomRef.current) {
      return;
    }

    scrollBottom();
  }, [focusMessageId, messages, mode, scrollMessageIntoView]);

  useLayoutEffect(() => {
    const pendingRequest = pendingScrollRequestRef.current;
    if (!pendingRequest) {
      return;
    }

    const element = document.getElementById(`message-${pendingRequest.messageId}`);
    if (!element) {
      return;
    }

    element.scrollIntoView({ behavior: pendingRequest.behavior, block: pendingRequest.block });
    pendingScrollRequestRef.current = null;
  }, [heightVersion, scrollTop, visibleRange.end, visibleRange.start]);

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
      }
    };
    window.addEventListener("click", closeContextMenu);
    window.addEventListener("scroll", closeContextMenu, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", closeContextMenu);
      window.removeEventListener("scroll", closeContextMenu, true);
      window.removeEventListener("keydown", onKeyDown);
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
    if (!activeDraftKey) {
      setContent("");
      return;
    }
    setContent(drafts[activeDraftKey] ?? "");
  }, [activeDraftKey, drafts]);

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
      setAttachmentError(null);
      event.target.value = "";
      return;
    }

    if (file.size > MAX_ATTACHMENT_BYTES) {
      setAttachment(null);
      setAttachmentError("You can't send files larger than 100 MB.");
      event.target.value = "";
      return;
    }

    setAttachment(file);
    setAttachmentError(null);
    event.target.value = "";
  };

  const selectMention = (member: ServerMember): void => {
    setContent((prev) => prev.replace(/(?:^|\s)@([a-zA-Z0-9_]*)$/, (full) => `${full.startsWith(" ") ? " " : ""}@${member.user.username} `));
    setHighlightedMentionIndex(0);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (attachmentError) {
      return;
    }
    if (!content.trim() && !attachment) {
      return;
    }

    try {
      if (mode === "DM") {
        await sendDMMessage(content, replyTo?.id, attachment);
      } else {
        await sendMessage(content, replyTo?.id, attachment);
      }
    } catch (error: unknown) {
      const backendMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      const isFileTooLarge = typeof backendMessage === "string" && backendMessage.toLowerCase().includes("file too large");
      setAttachmentError(isFileTooLarge ? "You can't send files larger than 100 MB." : (backendMessage ?? "Failed to send message."));
      return;
    }

    if (activeDraftKey) {
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[activeDraftKey];
        persistDrafts(next);
        return next;
      });
    }

    setContent("");
    setAttachment(null);
    setAttachmentError(null);
    setReplyTo(null);
    const socket = getSocket();
    if (mode === "SERVER" && activeChannelId) {
      socket?.emit("typing:stop", { scope: "CHANNEL", id: activeChannelId });
    } else if (mode === "DM" && activeDMId) {
      socket?.emit("typing:stop", { scope: "DM", id: activeDMId });
    }
    inputRef.current?.focus();
  };

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

  const renderAttachment = (attachmentUrl?: string | null, attachmentName?: string | null): JSX.Element | null => {
    if (!attachmentUrl) {
      return null;
    }

    const resolvedAttachmentUrl = resolveMediaUrl(attachmentUrl) || attachmentUrl;

    const name = (attachmentName ?? "").toLowerCase();
    const imageExt = /\.(png|jpe?g|gif|webp|svg)$/i.test(name);
    const videoExt = /\.(mp4|webm|mov|m4v)$/i.test(name);
    const audioExt = /\.(mp3|wav|ogg|m4a|flac)$/i.test(name);

    if (imageExt) {
      return <img src={resolvedAttachmentUrl} alt={attachmentName ?? "attachment"} className="mt-2 max-h-80 rounded-md object-cover" />;
    }
    if (videoExt) {
      return <VideoAttachmentPlayer src={resolvedAttachmentUrl} attachmentName={attachmentName} />;
    }
    if (audioExt) {
      return <AudioAttachmentPlayer src={resolvedAttachmentUrl} attachmentName={attachmentName} />;
    }

    return (
      <a href={resolvedAttachmentUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex rounded bg-[#2b2d31] px-2 py-1 text-xs text-[#00a8fc]">
        Attachment: {attachmentName || "file"}
      </a>
    );
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
    scrollMessageIntoView(messageId, "smooth", "center");
    setHighlightMessageId(messageId);
    window.setTimeout(() => setHighlightMessageId((current) => (current === messageId ? null : current)), 1800);
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
      className="relative flex h-full min-w-0 flex-1 flex-col bg-discord-dark4"
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
          setAttachmentError("You can't send files larger than 100 MB.");
          return;
        }
        setAttachment(file);
        setAttachmentError(null);
      }}
    >
      {dragActive ? (
        <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center bg-black/45">
          <div className="rounded-lg border border-[#7f8699] bg-[#2b2d31] px-4 py-3 text-sm font-semibold text-white shadow-lg">
            Drop file to attach
          </div>
        </div>
      ) : null}
      <header className="flex h-12 items-center border-b border-black/30 px-4 text-sm font-semibold shadow-sm">
        {mode === "SERVER" ? "#" : "@"} {channelName || "select-channel"}
      </header>

      <div ref={scrollRef} className="discord-scrollbar flex-1 overflow-y-auto px-3 py-4">
          {visibleRange.topPadding > 0 ? <div style={{ height: visibleRange.topPadding }} /> : null}
          {visibleMessages.map((message, visibleIndex) => {
            const index = shouldVirtualizeMessages ? visibleRange.start + visibleIndex : visibleIndex;
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
            return (
              <motion.article
                ref={(node) => bindMessageNode(message.id, node)}
                key={message.id}
                id={`message-${message.id}`}
                onContextMenu={(event) => openMemberContextMenu(event, message)}
                onDoubleClick={() => {
                  if (mine) {
                    setEditingId(message.id);
                    setEditingDraft(message.content);
                  } else {
                    setReplyTo(message);
                  }
                }}
                className={`group relative mb-0.5 flex gap-3 rounded px-2 isolate ${groupedCompact ? "py-0.5" : "py-1"} hover:bg-black/10 ${mentionMe ? "bg-[#3d3a2d]" : ""} ${
                  highlightMessageId === message.id || isReplyTarget ? "ring-1 ring-[#5865f2] bg-[#2d3244]/40" : ""
                }`}
              >
                {groupedCompact ? (
                  <span className="invisible absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-discord-muted group-hover:visible">
                    {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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
                      src={resolveMediaUrl(message.author.avatarUrl) || DEFAULT_AVATAR_URL}
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
                        src={resolveMediaUrl(message.replyTo.author.avatarUrl) || DEFAULT_AVATAR_URL}
                        alt={message.replyTo.author.nickname?.trim() || message.replyTo.author.username}
                        className="h-4 w-4 shrink-0 rounded-full"
                      />
                      <button
                        className="min-w-0 truncate text-discord-muted hover:text-discord-text"
                        onClick={() => message.replyTo?.id && jumpToMessage(message.replyTo.id)}
                      >
                        @{message.replyTo.author.nickname?.trim() || message.replyTo.author.username} {message.replyTo.content}
                      </button>
                    </div>
                  ) : null}

                  {!groupedCompact ? (
                    <div className="flex items-baseline gap-2">
                      <button className="text-sm font-semibold text-white hover:underline" onClick={() => onOpenProfile(message.author)} onContextMenu={(event) => openMemberContextMenu(event, message)}>
                        {authorName}
                      </button>
                      <time className="text-xs text-discord-muted">
                        {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </time>
                    </div>
                  ) : null}

                  {editingId === message.id ? (
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        value={editingDraft}
                        onChange={(event) => setEditingDraft(event.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void submitInlineEdit(message.id);
                          if (e.key === "Escape") { setEditingId(null); setEditingDraft(""); }
                        }}
                        className="w-full rounded bg-[#1e1f22] px-2 py-1.5 text-sm"
                        autoFocus
                      />
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
                  ) : (
                    <>
                      <div className="message-markdown break-words text-[15px] text-discord-text">
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
                      {Object.entries(
                        message.reactions.reduce<Record<string, number>>((acc, reaction) => {
                          acc[reaction.emoji] = (acc[reaction.emoji] ?? 0) + 1;
                          return acc;
                        }, {})
                      ).map(([emoji, count]) => (
                        <button
                          key={`${message.id}-${emoji}`}
                          onClick={() => void toggleReaction(message.id, emoji)}
                          className="rounded bg-[#2b2d31] px-2 py-0.5 text-xs hover:bg-[#35373c]"
                        >
                          {emoji} {count}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                {editingId !== message.id ? (
                  <div className="pointer-events-none absolute right-2 top-1 z-10 flex h-fit items-center gap-0.5 rounded bg-[#111214] p-0.5 opacity-0 shadow-md transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                    {mode === "SERVER" ? (
                      <>
                        <button
                          className="rounded p-1.5 text-discord-muted hover:bg-[#35373c] hover:text-white"
                          title="Reply"
                          onClick={() => setReplyTo(message)}
                        >
                          <Reply size={14} />
                        </button>
                        <button
                          className="rounded p-1.5 text-discord-muted hover:bg-[#35373c] hover:text-white"
                          title="React"
                          onClick={() => setReactionPickerFor(reactionPickerFor === message.id ? null : message.id)}
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
                          className="rounded p-1.5 text-discord-muted hover:bg-[#35373c] hover:text-white"
                          title="React"
                          onClick={() => setReactionPickerFor(reactionPickerFor === message.id ? null : message.id)}
                        >
                          <Smile size={14} />
                        </button>
                      </>
                    )}
                    {mine ? (
                      <>
                        {mode === "SERVER" || mode === "DM" ? (
                          <button
                            className="rounded p-1.5 text-discord-muted hover:bg-[#35373c] hover:text-white"
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
                          className="rounded p-1.5 text-discord-muted hover:bg-[#35373c] hover:text-red-300"
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
                    ) : (mode === "SERVER" && canModerateServerMessages) ? (
                      <button
                        className="rounded p-1.5 text-discord-muted hover:bg-[#35373c] hover:text-red-300"
                        title="Delete"
                        onClick={() => void deleteMessage(message.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {reactionPickerFor === message.id ? (
                  <div className="absolute right-2 top-8 z-30">
                    <EmojiPicker
                      onEmojiClick={(emojiData) => {
                        void toggleReaction(message.id, emojiData.emoji);
                        setReactionPickerFor(null);
                      }}
                      theme={Theme.DARK}
                    />
                  </div>
                ) : null}
              </motion.article>
            );
          })}
          {visibleRange.bottomPadding > 0 ? <div style={{ height: visibleRange.bottomPadding }} /> : null}
      </div>

      {typingLabel ? (
        <div className="px-4 pb-1 text-xs text-discord-muted">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={typingLabel}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 3 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {typingLabel}
            </motion.div>
          </AnimatePresence>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="relative p-4 pt-2">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={onAttachmentInputChange}
        />

        {replyTo ? (
          <div className="mb-1 flex items-center justify-between rounded bg-[#2b2d31] px-2 py-1 text-xs text-discord-muted">
            Replying to {replyTo.author.nickname?.trim() || replyTo.author.username}
            <button onClick={() => setReplyTo(null)} type="button" className="hover:text-white">
              x
            </button>
          </div>
        ) : null}

        <div className="rounded-lg border border-[#5a5e69] bg-[#4a4d57] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition focus-within:border-[#7f8699] focus-within:shadow-[0_0_0_2px_rgba(127,134,153,0.25)]">
          {attachment ? (
            <div className="mb-2 w-fit max-w-[280px] rounded-lg border border-white/10 bg-[#2b2d31] p-2">
              <div className="relative overflow-hidden rounded-md border border-white/10 bg-[#1e1f22]">
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
                      setAttachmentError(null);
                    }}
                    className="rounded p-1.5 text-[#ed4245] hover:bg-[#35373c]"
                    title="Remove attachment"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <p className="mt-2 truncate text-sm text-white">{attachment.name}</p>
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <button type="button" className="text-discord-muted hover:text-white" onClick={() => fileInputRef.current?.click()}>
              <Paperclip size={18} />
            </button>
            <input
              ref={inputRef}
              value={content}
              onChange={(event) => {
                const nextValue = event.target.value;
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
                const socket = getSocket();
                if (mode === "SERVER" && activeChannelId) {
                  socket?.emit("typing:start", { scope: "CHANNEL", id: activeChannelId });
                } else if (mode === "DM" && activeDMId) {
                  socket?.emit("typing:start", { scope: "DM", id: activeDMId });
                }
              }}
              onKeyDown={(event) => {
                if (!mentionMenuOpen) {
                  return;
                }
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setHighlightedMentionIndex((current) => (current + 1) % mentionCandidates.length);
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setHighlightedMentionIndex((current) => (current - 1 + mentionCandidates.length) % mentionCandidates.length);
                  return;
                }
                if (event.key === "Enter" || event.key === "Tab") {
                  event.preventDefault();
                  selectMention(mentionCandidates[highlightedMentionIndex] ?? mentionCandidates[0]);
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
                  setAttachmentError("You can't send files larger than 100 MB.");
                  return;
                }
                setAttachment(file);
                setAttachmentError(null);
              }}
              placeholder={mode === "SERVER" ? `Message #${channelName}` : `Message @${channelName}`}
              className="w-full bg-transparent text-sm text-white placeholder:text-[#dadde5] outline-none"
            />
            <button type="button" className="text-discord-muted hover:text-white" onClick={() => setShowPicker((v) => !v)}>
              <Smile size={18} />
            </button>
          </div>
        </div>
        {attachmentError ? <p className="mt-1 text-xs text-[#ed4245]">{attachmentError}</p> : null}
        {mentionMenuOpen ? (
          <div className="absolute bottom-14 left-4 right-4 z-30 overflow-hidden rounded-md border border-white/10 bg-[#111214] shadow-lg">
            <p className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-discord-muted">
              Members matching @{mentionQuery}
            </p>
            <div className="py-1">
              {mentionCandidates.slice(0, 8).map((member, index) => {
                const display = member.nickname || member.user.nickname || member.user.username;
                const selected = index === highlightedMentionIndex;
                return (
                  <button
                    key={member.userId}
                    type="button"
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left ${selected ? "bg-[#3a3d45]" : "hover:bg-[#2b2d31]"}`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      selectMention(member);
                    }}
                  >
                    <div className="relative h-8 w-8 shrink-0">
                      <img src={resolveMediaUrl(member.user.avatarUrl) || DEFAULT_AVATAR_URL} alt={display} className="h-8 w-8 rounded-full" />
                      <span className="absolute -bottom-1 -right-0.5">
                        <StatusDot status={member.user.status} sizeClassName="h-2.5 w-2.5" cutoutClassName="ring-2 ring-[#111214]" />
                      </span>
                    </div>
                    <span className="truncate text-sm text-white">{display}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {showPicker ? (
          <div className="absolute bottom-16 right-4 z-20">
            <EmojiPicker
              onEmojiClick={(emojiData) => {
                setContent((prev) => `${prev}${emojiData.emoji}`);
                setShowPicker(false);
              }}
              theme={Theme.DARK}
            />
          </div>
        ) : null}
      </form>

      {memberContextMenu ? (
        <div
          className="fixed z-50 w-44 overflow-hidden rounded-md border border-white/10 bg-[#111214] shadow-lg"
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
          {canModerateServerMessages && memberContextMenu.member.id !== me.id && memberContextMenu.member.username !== SYSTEM_USERNAME ? (
            <>
              <button
                className="w-full px-3 py-2 text-left text-sm text-[#f0b232] hover:bg-[#2b2d31]"
                onClick={() => {
                  onKickMember?.(memberContextMenu.member.id);
                  setMemberContextMenu(null);
                }}
              >
                Kick Member
              </button>
              <button
                className="w-full px-3 py-2 text-left text-sm text-[#ed4245] hover:bg-[#2b2d31]"
                onClick={() => {
                  onBanMember?.(memberContextMenu.member.id);
                  setMemberContextMenu(null);
                }}
              >
                Ban Member
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};

export default ChatArea;
