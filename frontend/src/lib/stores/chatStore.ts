import { create } from "zustand";
import { api } from "../api";
import { getSocket } from "../socket";
import { useAuthStore } from "./authStore";
import type { Channel, DMChannel, DMMessage, Message, Server, User } from "../../types";

const typingTimeouts = new Map<string, number>();
const UNREAD_STORAGE_KEY = "discrope_unreads_v1";
const VIEW_STORAGE_KEY = "discrope_view_v1";
const HIDDEN_DMS_STORAGE_KEY = "discrope_hidden_dms_v1";

type PersistedUnreadState = {
  unreadByChannel: Record<string, number>;
  mentionUnreadByChannel: Record<string, number>;
};

type PersistedViewState = {
  mode: "SERVER" | "DM";
  activeServerId: string | null;
  activeChannelId: string | null;
  activeDMId: string | null;
};

const loadPersistedUnreads = (): PersistedUnreadState => {
  if (typeof window === "undefined") {
    return { unreadByChannel: {}, mentionUnreadByChannel: {} };
  }
  try {
    const raw = window.localStorage.getItem(UNREAD_STORAGE_KEY);
    if (!raw) {
      return { unreadByChannel: {}, mentionUnreadByChannel: {} };
    }
    const parsed = JSON.parse(raw) as Partial<PersistedUnreadState>;
    return {
      unreadByChannel: parsed.unreadByChannel ?? {},
      mentionUnreadByChannel: parsed.mentionUnreadByChannel ?? {}
    };
  } catch {
    return { unreadByChannel: {}, mentionUnreadByChannel: {} };
  }
};

const persistUnreads = (unreadByChannel: Record<string, number>, mentionUnreadByChannel: Record<string, number>): void => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(
    UNREAD_STORAGE_KEY,
    JSON.stringify({ unreadByChannel, mentionUnreadByChannel } satisfies PersistedUnreadState)
  );
};

const loadPersistedView = (): PersistedViewState => {
  if (typeof window === "undefined") {
    return { mode: "SERVER", activeServerId: null, activeChannelId: null, activeDMId: null };
  }
  try {
    const raw = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (!raw) {
      return { mode: "SERVER", activeServerId: null, activeChannelId: null, activeDMId: null };
    }
    const parsed = JSON.parse(raw) as Partial<PersistedViewState>;
    return {
      mode: parsed.mode === "DM" ? "DM" : "SERVER",
      activeServerId: parsed.activeServerId ?? null,
      activeChannelId: parsed.activeChannelId ?? null,
      activeDMId: parsed.activeDMId ?? null
    };
  } catch {
    return { mode: "SERVER", activeServerId: null, activeChannelId: null, activeDMId: null };
  }
};

const persistView = (
  activeServerId: string | null,
  activeChannelId: string | null,
  mode: "SERVER" | "DM",
  activeDMId: string | null
): void => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(
    VIEW_STORAGE_KEY,
    JSON.stringify({ mode, activeServerId, activeChannelId, activeDMId } satisfies PersistedViewState)
  );
};

const loadHiddenDMs = (): Record<string, boolean> => {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(HIDDEN_DMS_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return parsed ?? {};
  } catch {
    return {};
  }
};

const persistHiddenDMs = (hiddenDMIds: Record<string, boolean>): void => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(HIDDEN_DMS_STORAGE_KEY, JSON.stringify(hiddenDMIds));
};

const persistedUnreads = loadPersistedUnreads();
const persistedView = loadPersistedView();
const persistedHiddenDMs = loadHiddenDMs();

type ChatState = {
  mode: "SERVER" | "DM";
  servers: Server[];
  activeServerId: string | null;
  activeChannelId: string | null;
  activeDMId: string | null;
  messages: Message[];
  dmMessages: DMMessage[];
  dms: DMChannel[];
  friends: User[];
  pendingFriends: { id: string; from: User }[];
  outgoingPendingFriends: User[];
  typingByChannel: Record<string, { userKey: string; displayName: string }[]>;
  unreadByChannel: Record<string, number>;
  mentionUnreadByChannel: Record<string, number>;
  unreadDMs: Record<string, number>;
  hiddenDMIds: Record<string, boolean>;
  lastUnreadMessageIdByChannel: Record<string, string>;
  channelOpenFocusMessageId: string | null;
  loadServers: () => Promise<void>;
  setActiveServer: (id: string) => Promise<void>;
  setActiveChannel: (id: string) => Promise<void>;
  setActiveDM: (id: string) => Promise<void>;
  openHome: () => Promise<void>;
  loadMessages: (channelId: string) => Promise<void>;
  loadDMMessages: (dmChannelId: string) => Promise<void>;
  sendMessage: (content: string, replyToId?: string, attachment?: File | null) => Promise<void>;
  sendDMMessage: (content: string, replyToId?: string, attachment?: File | null) => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  editDMMessage: (dmChannelId: string, messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  deleteDMMessage: (dmChannelId: string, messageId: string) => Promise<void>;
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
  togglePin: (messageId: string) => Promise<void>;
  loadFriends: () => Promise<void>;
  loadDMs: () => Promise<void>;
  sendFriendRequest: (username: string) => Promise<void>;
  acceptFriendRequest: (requestId: string) => Promise<void>;
  rejectFriendRequest: (requestId: string) => Promise<void>;
  removeFriend: (friendId: string) => Promise<void>;
  createOrOpenDM: (participantIds: string[]) => Promise<string | null>;
  leaveServer: (serverId: string) => Promise<void>;
  deleteServer: (serverId: string) => Promise<void>;
  regenerateInvite: (serverId: string, customCode?: string) => Promise<string | null>;
  markDMRead: (dmId: string) => void;
  hideDM: (dmId: string) => void;
  bindSocketEvents: (currentUser?: User | null) => void;
};

export const useChatStore = create<ChatState>((set, get) => ({
  mode: persistedView.mode,
  servers: [],
  activeServerId: persistedView.activeServerId,
  activeChannelId: persistedView.activeChannelId,
  activeDMId: persistedView.activeDMId,
  messages: [],
  dmMessages: [],
  dms: [],
  friends: [],
  pendingFriends: [],
  outgoingPendingFriends: [],
  typingByChannel: {},
  unreadByChannel: persistedUnreads.unreadByChannel,
  mentionUnreadByChannel: persistedUnreads.mentionUnreadByChannel,
  unreadDMs: {},
  hiddenDMIds: persistedHiddenDMs,
  lastUnreadMessageIdByChannel: {},
  channelOpenFocusMessageId: null,
  loadServers: async () => {
    const socket = getSocket();
    const previousServer = get().servers.find((s) => s.id === get().activeServerId);
    for (const channel of previousServer?.channels ?? []) {
      if (channel.type === "TEXT") {
        socket?.emit("channel:leave", channel.id);
      }
    }

    const { data } = await api.get("/servers");
    const servers = data.servers as Server[];
    const persisted = loadPersistedView();
    const targetServer =
      servers.find((s) => s.id === persisted.activeServerId) ??
      servers.find((s) => s.id === get().activeServerId) ??
      servers[0];
    const targetChannel =
      targetServer?.channels.find((c) => c.id === persisted.activeChannelId && c.type === "TEXT") ??
      targetServer?.channels.find((c) => c.type === "TEXT");

    const currentMode = get().mode;
    const currentActiveDMId = get().activeDMId;
    persistView(targetServer?.id ?? null, targetChannel?.id ?? null, currentMode, currentActiveDMId);
    set({
      mode: currentMode,
      servers,
      activeServerId: targetServer?.id ?? null,
      activeChannelId: targetChannel?.id ?? null,
      activeDMId: currentActiveDMId,
      channelOpenFocusMessageId: targetChannel ? (get().lastUnreadMessageIdByChannel[targetChannel.id] ?? null) : null
    });

    for (const channel of targetServer?.channels ?? []) {
      if (channel.type === "TEXT") {
        socket?.emit("channel:join", channel.id);
      }
    }

    if (targetChannel) {
      await get().loadMessages(targetChannel.id);
    }
  },
  setActiveServer: async (id) => {
    const previousDMId = get().activeDMId;
    const socket = getSocket();
    const previousServer = get().servers.find((s) => s.id === get().activeServerId);
    for (const channel of previousServer?.channels ?? []) {
      if (channel.type === "TEXT") {
        socket?.emit("channel:leave", channel.id);
      }
    }

    set({
      mode: "SERVER",
      activeServerId: id,
      activeChannelId: null,
      messages: [],
      channelOpenFocusMessageId: null
    });

    const { data } = await api.get(`/servers/${id}`);
    const server = data.server as Server;
    set((state) => ({
      mode: "SERVER",
      servers: state.servers.map((s) => (s.id === id ? server : s)),
      activeServerId: id,
      activeChannelId: server.channels.find((c) => c.type === "TEXT")?.id ?? null,
      activeDMId: previousDMId,
      messages: [],
      channelOpenFocusMessageId: (() => {
        const firstTextChannelId = server.channels.find((c) => c.type === "TEXT")?.id;
        return firstTextChannelId ? (state.lastUnreadMessageIdByChannel[firstTextChannelId] ?? null) : null;
      })()
    }));

    persistView(id, server.channels.find((c) => c.type === "TEXT")?.id ?? null, "SERVER", previousDMId);

    for (const channel of server.channels) {
      if (channel.type === "TEXT") {
        socket?.emit("channel:join", channel.id);
      }
    }

    if (server.channels.length > 0) {
      const channel = server.channels.find((c) => c.type === "TEXT");
      if (channel) {
        await get().loadMessages(channel.id);
      }
    }
  },
  setActiveChannel: async (id) => {
    const previousDMId = get().activeDMId;
    const socket = getSocket();
    if (previousDMId) {
      socket?.emit("dm:leave", previousDMId);
    }
    set((state) => ({
      mode: "SERVER",
      activeChannelId: id,
      messages: [],
      channelOpenFocusMessageId: state.lastUnreadMessageIdByChannel[id] ?? null
    }));
    persistView(get().activeServerId, id, "SERVER", previousDMId);
    await get().loadMessages(id);
  },
  setActiveDM: async (id) => {
    const previousDMId = get().activeDMId;
    const socket = getSocket();
    if (previousDMId && previousDMId !== id) {
      socket?.emit("dm:leave", previousDMId);
    }
    set((state) => {
      if (!state.hiddenDMIds[id]) {
        return { mode: "DM", activeDMId: id, activeChannelId: null, messages: [], channelOpenFocusMessageId: null };
      }

      const nextHidden = { ...state.hiddenDMIds };
      delete nextHidden[id];
      persistHiddenDMs(nextHidden);
      return { mode: "DM", activeDMId: id, activeChannelId: null, messages: [], hiddenDMIds: nextHidden, channelOpenFocusMessageId: null };
    });
    persistView(get().activeServerId, null, "DM", id);
    get().markDMRead(id);
    await get().loadDMMessages(id);
    socket?.emit("dm:join", id);
  },
  openHome: async () => {
    const socket = getSocket();
    const activeDMId = get().activeDMId;

    set({ mode: "DM", activeChannelId: null, messages: [], channelOpenFocusMessageId: null });
    persistView(get().activeServerId, null, "DM", activeDMId);

    if (activeDMId) {
      await get().loadDMMessages(activeDMId);
      socket?.emit("dm:join", activeDMId);
    }
  },
  loadMessages: async (channelId) => {
    const { data } = await api.get(`/chat/channels/${channelId}/messages`);
    const previousUnreadCount = get().unreadByChannel[channelId] ?? 0;
    const firstUnreadByCount = previousUnreadCount > 0
      ? (data.messages[Math.max(data.messages.length - previousUnreadCount, 0)]?.id ?? null)
      : null;
    const focusMessageId = get().lastUnreadMessageIdByChannel[channelId] ?? firstUnreadByCount;
    const nextUnread = { ...get().unreadByChannel, [channelId]: 0 };
    const nextMentionUnread = { ...get().mentionUnreadByChannel, [channelId]: 0 };
    const nextUnreadMessageIds = { ...get().lastUnreadMessageIdByChannel };
    delete nextUnreadMessageIds[channelId];
    persistUnreads(nextUnread, nextMentionUnread);
    set({
      messages: data.messages,
      unreadByChannel: nextUnread,
      mentionUnreadByChannel: nextMentionUnread,
      lastUnreadMessageIdByChannel: nextUnreadMessageIds,
      channelOpenFocusMessageId: focusMessageId
    });
  },
  loadDMMessages: async (dmChannelId) => {
    const { data } = await api.get(`/dms/${dmChannelId}/messages`);
    set({ dmMessages: data.messages });
  },
  sendMessage: async (content, replyToId, attachment) => {
    const channelId = get().activeChannelId;
    if (!channelId || (!content.trim() && !attachment)) {
      return;
    }

    if (attachment) {
      const formData = new FormData();
      formData.append("content", content);
      formData.append("attachment", attachment);
      if (replyToId) {
        formData.append("replyToId", replyToId);
      }
      const { data } = await api.post(`/chat/channels/${channelId}/messages`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      set((state) => ({
        messages: state.messages.some((m) => m.id === data.message.id) ? state.messages : [...state.messages, data.message]
      }));
      return;
    }

    const { data } = await api.post(`/chat/channels/${channelId}/messages`, { content, replyToId });
    set((state) => ({
      messages: state.messages.some((m) => m.id === data.message.id) ? state.messages : [...state.messages, data.message]
    }));
  },
  sendDMMessage: async (content, replyToId, attachment) => {
    const dmChannelId = get().activeDMId;
    if (!dmChannelId || (!content.trim() && !attachment)) {
      return;
    }

    const formData = new FormData();
    formData.append("content", content);
    if (replyToId) {
      formData.append("replyToId", replyToId);
    }
    if (attachment) {
      formData.append("attachment", attachment);
    }

    const { data } = await api.post(`/dms/${dmChannelId}/messages`, formData, {
      headers: { "Content-Type": "multipart/form-data" }
    });
    set((state) => ({
      dmMessages: state.dmMessages.some((m) => m.id === data.message.id) ? state.dmMessages : [...state.dmMessages, data.message]
    }));
  },
  editMessage: async (messageId, content) => {
    await api.patch(`/chat/messages/${messageId}`, { content });
  },
  editDMMessage: async (dmChannelId, messageId, content) => {
    await api.patch(`/dms/${dmChannelId}/messages/${messageId}`, { content });
  },
  deleteMessage: async (messageId) => {
    await api.delete(`/chat/messages/${messageId}`);
  },
  deleteDMMessage: async (dmChannelId, messageId) => {
    await api.delete(`/dms/${dmChannelId}/messages/${messageId}`);
  },
  toggleReaction: async (messageId, emoji) => {
    const { data } = await api.post(`/chat/messages/${messageId}/reactions`, { emoji });
    set((state) => ({
      messages: state.messages.map((m) => (m.id === messageId ? { ...m, reactions: data.reactions } : m))
    }));
  },
  togglePin: async (messageId) => {
    const { data } = await api.post(`/chat/messages/${messageId}/pin`);
    set((state) => ({
      messages: state.messages.map((m) => (m.id === messageId ? { ...m, isPinned: data.message.isPinned } : m))
    }));
  },
  loadFriends: async () => {
    const { data } = await api.get("/users/friends");
    set({
      friends: data.friends,
      pendingFriends: data.pending,
      outgoingPendingFriends: data.pendingOutgoing ?? []
    });
  },
  loadDMs: async () => {
    const { data } = await api.get("/dms");
    const channels = data.channels as DMChannel[];
    set({ dms: channels });

    const { mode, activeDMId } = get();
    if (mode === "DM" && activeDMId) {
      const exists = channels.some((channel) => channel.id === activeDMId);
      if (exists) {
        await get().loadDMMessages(activeDMId);
        getSocket()?.emit("dm:join", activeDMId);
      } else {
        set({ mode: "SERVER", activeDMId: null, dmMessages: [] });
        persistView(get().activeServerId, get().activeChannelId, "SERVER", null);
      }
    }
  },
  sendFriendRequest: async (username) => {
    await api.post("/users/friends/request", { username });
    await get().loadFriends();
  },
  acceptFriendRequest: async (requestId) => {
    await api.post(`/users/friends/accept/${requestId}`);
    await get().loadFriends();
  },
  rejectFriendRequest: async (requestId) => {
    await api.post(`/users/friends/reject/${requestId}`);
    await get().loadFriends();
  },
  removeFriend: async (friendId) => {
    await api.delete(`/users/friends/${friendId}`);
    await get().loadFriends();
    await get().loadDMs();
  },
  createOrOpenDM: async (participantIds) => {
    const { data } = await api.post("/dms", { participantIds });
    await get().loadDMs();
    const id = data.channel?.id as string | undefined;
    if (!id) {
      return null;
    }
    await get().setActiveDM(id);
    return id;
  },
  leaveServer: async (serverId) => {
    await api.delete(`/servers/${serverId}/leave`);
    await get().loadServers();
  },
  deleteServer: async (serverId) => {
    await api.delete(`/servers/${serverId}`);
    await get().loadServers();
  },
  regenerateInvite: async (serverId, customCode) => {
    const { data } = await api.post(`/servers/${serverId}/regenerate-invite`, {
      inviteCode: customCode?.trim() || undefined
    });
    await get().setActiveServer(serverId);
    return data.server?.inviteCode ?? null;
  },
  markDMRead: (dmId) => {
    set((state) => ({
      unreadDMs: { ...state.unreadDMs, [dmId]: 0 }
    }));
  },
  hideDM: (dmId) => {
    const activeDMId = get().activeDMId;
    const mode = get().mode;
    set((state) => {
      const nextHidden = { ...state.hiddenDMIds, [dmId]: true };
      persistHiddenDMs(nextHidden);
      return {
        hiddenDMIds: nextHidden,
        activeDMId: activeDMId === dmId ? null : state.activeDMId,
        dmMessages: activeDMId === dmId ? [] : state.dmMessages
      };
    });

    if (activeDMId === dmId) {
      persistView(get().activeServerId, get().activeChannelId, mode, null);
      getSocket()?.emit("dm:leave", dmId);
    }
  },
  bindSocketEvents: (currentUser) => {
    const socket = getSocket();
    if (!socket) {
      window.setTimeout(() => {
        get().bindSocketEvents();
      }, 300);
      return;
    }

    socket.off("message:new");
    socket.off("message:updated");
    socket.off("message:deleted");
    socket.off("typing:start");
    socket.off("typing:stop");
    socket.off("presence:sync");
    socket.off("presence:update");
    socket.off("user:updated");
    socket.off("dm:message:new");
    socket.off("dm:message:updated");
    socket.off("dm:message:deleted");
    socket.off("friends:changed");
    socket.off("server:member:joined");
    socket.off("server:member:left");
    socket.off("server:deleted");
    socket.off("channel:updated");
    socket.off("connect");

    socket.on("connect", () => {
      const activeServerId = get().activeServerId;
      const activeServer = get().servers.find((s) => s.id === activeServerId);
      const activeDMId = get().activeDMId;

      for (const channel of activeServer?.channels ?? []) {
        if (channel.type === "TEXT") {
          socket.emit("channel:join", channel.id);
        }
      }

      if (activeDMId) {
        socket.emit("dm:join", activeDMId);
      }
    });

    socket.on("message:new", (message: Message) => {
      const active = get().activeChannelId;
      if (message.channelId === active) {
        set((state) => ({
          messages: state.messages.some((m) => m.id === message.id) ? state.messages : [...state.messages, message]
        }));
      } else {
        const mentionByUsername = currentUser ? message.content.includes(`@${currentUser.username}`) : false;
        const mentionByNickname = currentUser?.nickname ? message.content.includes(`@${currentUser.nickname}`) : false;
        const mentionByReply = Boolean(currentUser && message.replyTo?.author?.id === currentUser.id && message.authorId !== currentUser.id);
        const isMention = mentionByUsername || mentionByNickname || mentionByReply;
        set((state) => ({
          unreadByChannel: (() => {
            const nextUnread = {
              ...state.unreadByChannel,
              [message.channelId]: (state.unreadByChannel[message.channelId] ?? 0) + 1
            };
            const nextMentionUnread = {
              ...state.mentionUnreadByChannel,
              [message.channelId]: isMention ? (state.mentionUnreadByChannel[message.channelId] ?? 0) + 1 : (state.mentionUnreadByChannel[message.channelId] ?? 0)
            };
            persistUnreads(nextUnread, nextMentionUnread);
            return nextUnread;
          })(),
          mentionUnreadByChannel: {
            ...state.mentionUnreadByChannel,
            [message.channelId]: isMention ? (state.mentionUnreadByChannel[message.channelId] ?? 0) + 1 : (state.mentionUnreadByChannel[message.channelId] ?? 0)
          },
          lastUnreadMessageIdByChannel: {
            ...state.lastUnreadMessageIdByChannel,
            [message.channelId]: state.lastUnreadMessageIdByChannel[message.channelId] ?? message.id
          }
        }));
      }
    });

    socket.on("message:updated", (message: Message) => {
      set((state) => ({
        messages: state.messages.map((m) => (m.id === message.id ? message : m))
      }));
    });

    socket.on("message:deleted", ({ id }: { id: string }) => {
      set((state) => ({
        messages: state.messages.filter((m) => m.id !== id)
      }));
    });

    socket.on(
      "typing:start",
      ({ channelId, userId, username, nickname }: { channelId: string; userId?: string; username: string; nickname?: string }) => {
      if (currentUser?.id && userId && currentUser.id === userId) {
        return;
      }
      const displayName = nickname?.trim() || username;
      const userKey = userId || `username:${username}`;
      const timerKey = `${channelId}:${userKey}`;
      const existingTimer = typingTimeouts.get(timerKey);
      if (existingTimer) {
        window.clearTimeout(existingTimer);
      }
      set((state) => ({
        typingByChannel: {
          ...state.typingByChannel,
          [channelId]: [
            ...(state.typingByChannel[channelId] ?? []).filter((entry) => entry.userKey !== userKey),
            { userKey, displayName }
          ]
        }
      }));

      const timeoutId = window.setTimeout(() => {
        set((state) => ({
          typingByChannel: {
            ...state.typingByChannel,
            [channelId]: (state.typingByChannel[channelId] ?? []).filter((entry) => entry.userKey !== userKey)
          }
        }));
        typingTimeouts.delete(timerKey);
      }, 4500);
      typingTimeouts.set(timerKey, timeoutId);
      }
    );

    socket.on(
      "typing:stop",
      ({ channelId, userId, username, nickname }: { channelId: string; userId?: string; username: string; nickname?: string }) => {
      if (currentUser?.id && userId && currentUser.id === userId) {
        return;
      }
      const displayName = nickname?.trim() || username;
      const userKey = userId || `username:${username}`;
      const timerKey = `${channelId}:${userKey}`;
      const existingTimer = typingTimeouts.get(timerKey);
      if (existingTimer) {
        window.clearTimeout(existingTimer);
        typingTimeouts.delete(timerKey);
      }
      set((state) => ({
        typingByChannel: {
          ...state.typingByChannel,
          [channelId]: (state.typingByChannel[channelId] ?? []).filter((entry) => entry.userKey !== userKey && entry.displayName !== displayName)
        }
      }));
      }
    );

    socket.on("presence:sync", ({ onlineUserIds }: { onlineUserIds: string[] }) => {
      const onlineSet = new Set(onlineUserIds);
      const authUser = useAuthStore.getState().user;

      if (authUser) {
        const isOnline = onlineSet.has(authUser.id);
        const nextStatus = isOnline ? "ONLINE" : "OFFLINE";
        if (authUser.status !== nextStatus) {
          useAuthStore.getState().setUser({ ...authUser, status: nextStatus });
        }
      }

      const applySyncedStatus = (u: User): User => {
        const isOnline = onlineSet.has(u.id);
        if (isOnline) {
          return u.status === "OFFLINE" ? { ...u, status: "ONLINE" } : u;
        }
        return u.status !== "OFFLINE" ? { ...u, status: "OFFLINE" } : u;
      };

      set((state) => ({
        servers: state.servers.map((server) => ({
          ...server,
          members: server.members.map((member) => ({
            ...member,
            user: applySyncedStatus(member.user)
          }))
        })),
        friends: state.friends.map(applySyncedStatus),
        dms: state.dms.map((dm) => ({ ...dm, participants: dm.participants.map(applySyncedStatus) }))
      }));
    });

    socket.on("presence:update", ({ userId, status }: { userId: string; status: string }) => {
      const authUser = useAuthStore.getState().user;
      if (authUser && authUser.id === userId) {
        useAuthStore.getState().setUser({ ...authUser, status: status as User["status"] });
      }

      const applyStatus = (u: User): User => u.id === userId ? { ...u, status: status as User["status"] } : u;
      set((state) => ({
        servers: state.servers.map((server) => ({
          ...server,
          members: server.members.map((member) =>
            member.userId === userId ? { ...member, user: applyStatus(member.user) } : member
          )
        })),
        friends: state.friends.map(applyStatus),
        dms: state.dms.map((dm) => ({ ...dm, participants: dm.participants.map(applyStatus) }))
      }));
    });

    socket.on("user:updated", (updated: Partial<User> & { id: string }) => {
      const authUser = useAuthStore.getState().user;
      if (authUser && authUser.id === updated.id) {
        useAuthStore.getState().setUser({ ...authUser, ...updated });
      }

      const applyUpdate = (u: User): User => u.id === updated.id ? { ...u, ...updated } : u;
      set((state) => ({
        servers: state.servers.map((server) => ({
          ...server,
          members: server.members.map((member) =>
            member.userId === updated.id ? { ...member, user: applyUpdate(member.user) } : member
          )
        })),
        friends: state.friends.map(applyUpdate),
        dms: state.dms.map((dm) => ({ ...dm, participants: dm.participants.map(applyUpdate) }))
      }));
    });

    socket.on("dm:message:new", (message: DMMessage) => {
      if (get().hiddenDMIds[message.dmChannelId]) {
        set((state) => {
          const nextHidden = { ...state.hiddenDMIds };
          delete nextHidden[message.dmChannelId];
          persistHiddenDMs(nextHidden);
          return { hiddenDMIds: nextHidden };
        });
      }

      if (!get().dms.some((dm) => dm.id === message.dmChannelId)) {
        void get().loadDMs();
      }

      if (currentUser?.id && message.authorId === currentUser.id) {
        if (get().activeDMId === message.dmChannelId) {
          set((state) => ({
            dmMessages: state.dmMessages.some((m) => m.id === message.id) ? state.dmMessages : [...state.dmMessages, message]
          }));
        }
        return;
      }

      if (get().activeDMId === message.dmChannelId) {
        set((state) => ({
          dmMessages: state.dmMessages.some((m) => m.id === message.id) ? state.dmMessages : [...state.dmMessages, message]
        }));
      } else {
        set((state) => ({
          unreadDMs: {
            ...state.unreadDMs,
            [message.dmChannelId]: (state.unreadDMs[message.dmChannelId] ?? 0) + 1
          }
        }));
      }
    });

    socket.on("dm:message:updated", (message: DMMessage) => {
      if (get().activeDMId === message.dmChannelId) {
        set((state) => ({
          dmMessages: state.dmMessages.map((m) => (m.id === message.id ? message : m))
        }));
      }
    });

    socket.on("dm:message:deleted", ({ id, dmChannelId }: { id: string; dmChannelId: string }) => {
      if (get().activeDMId === dmChannelId) {
        set((state) => ({
          dmMessages: state.dmMessages.filter((m) => m.id !== id)
        }));
      }
    });

    socket.on("friends:changed", () => {
      void get().loadFriends();
      void get().loadDMs();
    });

    socket.on("server:member:joined", ({ serverId, member }: { serverId: string; member: Server["members"][number] }) => {
      set((state) => ({
        servers: state.servers.map((server) => {
          if (server.id !== serverId) {
            return server;
          }

          const exists = server.members.some((existingMember) => existingMember.userId === member.userId);
          if (exists) {
            return server;
          }

          return {
            ...server,
            members: [...server.members, member]
          };
        })
      }));
    });

    socket.on("server:member:left", ({ serverId, userId }: { serverId: string; userId: string }) => {
      if (currentUser?.id && userId === currentUser.id) {
        void get().loadServers();
        return;
      }

      set((state) => ({
        servers: state.servers.map((server) => {
          if (server.id !== serverId) {
            return server;
          }

          return {
            ...server,
            members: server.members.filter((member) => member.userId !== userId)
          };
        })
      }));
    });

    socket.on("server:deleted", ({ serverId }: { serverId: string }) => {
      if (!get().servers.some((server) => server.id === serverId)) {
        return;
      }
      void get().loadServers();
    });

    socket.on("channel:updated", ({ channel }: { channel: Channel }) => {
      set((state) => ({
        servers: state.servers.map((server) => {
          if (!server.channels.some((existingChannel) => existingChannel.id === channel.id)) {
            return server;
          }

          return {
            ...server,
            channels: server.channels.map((existingChannel) =>
              existingChannel.id === channel.id ? { ...existingChannel, ...channel } : existingChannel
            )
          };
        })
      }));
    });
  }
}));
