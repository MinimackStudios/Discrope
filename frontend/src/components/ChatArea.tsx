import { type MouseEvent, type ReactNode, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import remarkGfm from "remark-gfm";
import ReactMarkdown from "react-markdown";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { motion, AnimatePresence } from "framer-motion";
import { Edit3, Paperclip, Reply, Smile, Trash2 } from "lucide-react";
import { useChatStore } from "../lib/stores/chatStore";
import { getSocket } from "../lib/socket";
import StatusDot from "./StatusDot";
import type { DMMessage, Message, ServerMember, User } from "../types";

type Props = {
  me: User;
  mode: "SERVER" | "DM";
  channelName: string;
  messages: Array<Message | DMMessage>;
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

const SYSTEM_USERNAME = "Discrope";
const DEFAULT_AVATAR_URL = `${import.meta.env.BASE_URL}default-avatar.svg`;

const ChatArea = ({
  me,
  mode,
  channelName,
  messages,
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
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const deleteDMMessage = useChatStore((s) => s.deleteDMMessage);
  const toggleReaction = useChatStore((s) => s.toggleReaction);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const activeDMId = useChatStore((s) => s.activeDMId);

  const [content, setContent] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);
  const [memberContextMenu, setMemberContextMenu] = useState<MemberContextMenu | null>(null);
  const [highlightedMentionIndex, setHighlightedMentionIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      <div className="whitespace-pre-wrap">
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
      </div>
    );
  };

  const renderMessageContent = (rawContent: string): JSX.Element => {
    if (mode === "SERVER" && /(^|\s)@([a-zA-Z0-9_]{1,32})/.test(rawContent)) {
      return renderMentionPills(rawContent);
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

  const scrollToBottom = (behavior: ScrollBehavior = "smooth"): void => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior });
  };

  useEffect(() => {
    scrollToBottom("smooth");
  }, [messages]);

  // Auto-focus input when channel/DM changes
  useEffect(() => {
    inputRef.current?.focus();
  }, [activeChannelId, activeDMId]);

  // Focus input when replying
  useEffect(() => {
    if (replyTo) {
      inputRef.current?.focus();
      // When the reply banner appears, keep the composer visible at the bottom.
      window.requestAnimationFrame(() => scrollToBottom("auto"));
    }
  }, [replyTo]);

  useEffect(() => {
    const closeContextMenu = (): void => setMemberContextMenu(null);
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        closeContextMenu();
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
    setHighlightedMentionIndex(0);
  }, [mentionMenuOpen, mentionQuery]);

  const selectMention = (member: ServerMember): void => {
    setContent((prev) => prev.replace(/(?:^|\s)@([a-zA-Z0-9_]*)$/, (full) => `${full.startsWith(" ") ? " " : ""}@${member.user.username} `));
    setHighlightedMentionIndex(0);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!content.trim() && !attachment) {
      return;
    }

    if (mode === "DM") {
      await sendDMMessage(content, attachment);
    } else {
      await sendMessage(content, replyTo?.id, attachment);
    }
    setContent("");
    setAttachment(null);
    setReplyTo(null);
    getSocket()?.emit("typing:stop", activeChannelId);
    inputRef.current?.focus();
  };

  const submitInlineEdit = async (messageId: string): Promise<void> => {
    if (!editingDraft.trim()) {
      return;
    }
    await editMessage(messageId, editingDraft);
    setEditingId(null);
    setEditingDraft("");
  };

  const typingLabel = useMemo(() => {
    const filtered = typingUsers.filter((u) => u !== me.username);
    if (!filtered.length) {
      return "";
    }
    if (filtered.length === 1) {
      return `${filtered[0]} is typing...`;
    }
    return `${filtered.slice(0, 2).join(", ")} are typing...`;
  }, [typingUsers, me.username]);

  const renderAttachment = (attachmentUrl?: string | null, attachmentName?: string | null): JSX.Element | null => {
    if (!attachmentUrl) {
      return null;
    }

    const name = (attachmentName ?? "").toLowerCase();
    const imageExt = /\.(png|jpe?g|gif|webp|svg)$/i.test(name);
    const videoExt = /\.(mp4|webm|mov|m4v)$/i.test(name);
    const audioExt = /\.(mp3|wav|ogg|m4a|flac)$/i.test(name);

    if (imageExt) {
      return <img src={attachmentUrl} alt={attachmentName ?? "attachment"} className="mt-2 max-h-80 rounded-md object-cover" />;
    }
    if (videoExt) {
      return <video src={attachmentUrl} controls className="mt-2 max-h-80 rounded-md" />;
    }
    if (audioExt) {
      return <audio src={attachmentUrl} controls className="mt-2 w-full" />;
    }

    return (
      <a href={attachmentUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex rounded bg-[#2b2d31] px-2 py-1 text-xs text-[#00a8fc]">
        Attachment: {attachmentName || "file"}
      </a>
    );
  };

  const jumpToMessage = (messageId: string): void => {
    const element = document.getElementById(`message-${messageId}`);
    if (!element) {
      return;
    }
    element.scrollIntoView({ behavior: "smooth", block: "center" });
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
    <section className="flex h-full min-w-0 flex-1 flex-col bg-discord-dark4">
      <header className="flex h-12 items-center border-b border-black/30 px-4 text-sm font-semibold shadow-sm">
        {mode === "SERVER" ? "#" : "@"} {channelName || "select-channel"}
      </header>

      <div ref={scrollRef} className="discord-scrollbar flex-1 overflow-y-auto px-3 py-4">
        <AnimatePresence initial={false}>
          {messages.map((message, index) => {
            const mine = message.authorId === me.id;
            const mentionIds = extractMentionedUserIds(message.content);
            const mentionByText = mentionIds.has(me.id) || message.content.includes(`@${me.username}`);
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
                key={message.id}
                id={`message-${message.id}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                onContextMenu={(event) => openMemberContextMenu(event, message)}
                onDoubleClick={() => {
                  if (mode === "SERVER") {
                    if (mine) {
                      setEditingId(message.id);
                      setEditingDraft(message.content);
                    } else {
                      setReplyTo(message as Message);
                    }
                  }
                }}
                className={`group relative mb-0.5 flex gap-3 rounded px-2 ${groupedCompact ? "py-0.5" : "py-1"} hover:bg-black/10 ${mentionMe ? "bg-[#3d3a2d]" : ""} ${
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
                      src={message.author.avatarUrl || DEFAULT_AVATAR_URL}
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
                        src={message.replyTo.author.avatarUrl || DEFAULT_AVATAR_URL}
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
                      {message.editedAt ? <span className="text-[10px] text-discord-muted">(edited)</span> : null}
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
                        {groupedCompact && message.editedAt ? <span className="ml-1 text-[10px] text-discord-muted">(edited)</span> : null}
                      </div>
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

                <div className="invisible absolute right-2 top-0 -translate-y-1/2 flex h-fit items-center gap-0.5 rounded bg-[#111214] p-0.5 shadow-lg group-hover:visible">
                  {mode === "SERVER" ? (
                    <>
                      <button
                        className="rounded p-1.5 text-discord-muted hover:bg-[#35373c] hover:text-white"
                        title="Reply"
                        onClick={() => setReplyTo(message as Message)}
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
                        onClick={() => setReplyTo(message as Message)}
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
                      {mode === "SERVER" ? (
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
        </AnimatePresence>
      </div>

      <div className="px-4 pb-1 text-xs text-discord-muted">{typingLabel}</div>

      <form onSubmit={onSubmit} className="relative p-4 pt-1">
        {replyTo ? (
          <div className="mb-1 flex items-center justify-between rounded bg-[#2b2d31] px-2 py-1 text-xs text-discord-muted">
            Replying to {replyTo.author.nickname?.trim() || replyTo.author.username}
            <button onClick={() => setReplyTo(null)} type="button" className="hover:text-white">
              x
            </button>
          </div>
        ) : null}

        <div className="flex items-center gap-2 rounded-lg bg-[#383a40] px-3 py-2">
          <input
            ref={inputRef}
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              if (activeChannelId) {
                getSocket()?.emit("typing:start", activeChannelId);
              }
            }}
            onBlur={() => {
              if (activeChannelId) {
                getSocket()?.emit("typing:stop", activeChannelId);
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
            placeholder={mode === "SERVER" ? `Message #${channelName}` : `Message @${channelName}`}
            className="w-full bg-transparent text-sm text-white outline-none"
          />
          <label className="cursor-pointer text-discord-muted hover:text-white">
            <Paperclip size={18} />
            <input type="file" className="hidden" onChange={(event) => setAttachment(event.target.files?.[0] ?? null)} />
          </label>
          <button type="button" className="text-discord-muted hover:text-white" onClick={() => setShowPicker((v) => !v)}>
            <Smile size={18} />
          </button>
        </div>
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
                      <img src={member.user.avatarUrl || DEFAULT_AVATAR_URL} alt={display} className="h-8 w-8 rounded-full" />
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
        {attachment ? <p className="mt-1 text-xs text-discord-muted">Selected: {attachment.name}</p> : null}

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
