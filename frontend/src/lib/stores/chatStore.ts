import { create } from "zustand";
import { api } from "../api";
import { getSocket } from "../socket";
import { useAuthStore } from "./authStore";
import type { Channel, ChannelCategory, DMChannel, DMMessage, Message, Server, User } from "../../types";

const typingTimeouts = new Map<string, number>();
const UNREAD_STORAGE_KEY = "windcord_unreads_v1";
const VIEW_STORAGE_KEY = "windcord_view_v1";
const HIDDEN_DMS_STORAGE_KEY = "windcord_hidden_dms_v1";
const LAST_CHANNEL_BY_SERVER_STORAGE_KEY = "windcord_last_channel_by_server_v1";
const NOTIF_SOUND_STORAGE_KEY = "windcord_notif_sound_v1";
const UNREAD_DMS_STORAGE_KEY = "windcord_unread_dms_v1";
const LAST_UNREAD_MSG_STORAGE_KEY = "windcord_last_unread_msg_v1";
const LAST_SEEN_BY_CHANNEL_KEY = "windcord_last_seen_by_channel_v1";
const LAST_SEEN_BY_DM_KEY = "windcord_last_seen_by_dm_v1";
const NOTIFICATION_SOUND_DEFAULT_URL = `${import.meta.env.BASE_URL}notif.mp3`;
const NOTIFICATION_SOUND_ALT_URL = `${import.meta.env.BASE_URL}notifalt.mp3`;

export const getNotifSoundPref = (): "default" | "alt" => {
  try {
    const raw = window.localStorage.getItem(NOTIF_SOUND_STORAGE_KEY);
    return raw === "alt" ? "alt" : "default";
  } catch {
    return "default";
  }
};

export const setNotifSoundPref = (pref: "default" | "alt"): void => {
  try {
    window.localStorage.setItem(NOTIF_SOUND_STORAGE_KEY, pref);
    notificationAudio = null;
  } catch { /* ignore */ }
};

let notificationAudio: HTMLAudioElement | null = null;
let audioUnlocked = false;
let pendingNotificationPlay = false;

const doPlayAudio = (): void => {
  const currentUser = useAuthStore.getState().user;
  if (!currentUser || currentUser.status === "DND") {
    return;
  }
  const url = getNotifSoundPref() === "alt" ? NOTIFICATION_SOUND_ALT_URL : NOTIFICATION_SOUND_DEFAULT_URL;
  if (!notificationAudio || !notificationAudio.src.endsWith(new URL(url, location.href).pathname)) {
    notificationAudio = new Audio(url);
    notificationAudio.preload = "auto";
  }
  notificationAudio.currentTime = 0;
  notificationAudio.play().catch(() => {
    // Play failed silently (e.g. audio not yet decoded). Queue for next interaction.
    pendingNotificationPlay = true;
  });
};

const onFirstUserInteraction = (): void => {
  audioUnlocked = true;
  if (pendingNotificationPlay) {
    pendingNotificationPlay = false;
    doPlayAudio();
  }
};

if (typeof document !== "undefined") {
  document.addEventListener("click", onFirstUserInteraction, { capture: true });
  document.addEventListener("keydown", onFirstUserInteraction, { capture: true });
  document.addEventListener("touchstart", onFirstUserInteraction, { capture: true });
  // Window focus fires when the user switches back to the tab. Some browsers
  // treat this as a sufficient user gesture to unblock autoplay.
  window.addEventListener("focus", onFirstUserInteraction);
}

let tabHiddenAt: number | null = null;
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      tabHiddenAt = Date.now();
    } else if (document.visibilityState === "visible" && tabHiddenAt !== null) {
      const hiddenMs = Date.now() - tabHiddenAt;
      tabHiddenAt = null;
      // Only re-fetch if the tab was hidden long enough that we might have missed messages
      if (hiddenMs > 30_000) {
        const store = useChatStore.getState();
        if (store.activeChannelId) {
          void store.loadMessages(store.activeChannelId);
        } else if (store.mode === "DM" && store.activeDMId) {
          void store.loadDMMessages(store.activeDMId);
        }
      }
    }
  });
}
const processedSocketEventKeys: string[] = [];
const processedSocketEventSet = new Set<string>();
const MAX_PROCESSED_SOCKET_EVENTS = 500;

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

const loadPersistedUnreadDMs = (): Record<string, number> => {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(UNREAD_DMS_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return {};
  }
};

const persistUnreadDMs = (unreadDMs: Record<string, number>): void => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(UNREAD_DMS_STORAGE_KEY, JSON.stringify(unreadDMs));
};

const loadPersistedLastUnreadMessageIds = (): Record<string, string> => {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(LAST_UNREAD_MSG_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
};

const persistLastUnreadMessageIds = (ids: Record<string, string>): void => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(LAST_UNREAD_MSG_STORAGE_KEY, JSON.stringify(ids));
};

const loadLastSeenByChannel = (): Record<string, string> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LAST_SEEN_BY_CHANNEL_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch { return {}; }
};

const persistLastSeenByChannel = (ids: Record<string, string>): void => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAST_SEEN_BY_CHANNEL_KEY, JSON.stringify(ids));
};

const loadLastSeenByDM = (): Record<string, string> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LAST_SEEN_BY_DM_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch { return {}; }
};

const persistLastSeenByDM = (ids: Record<string, string>): void => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAST_SEEN_BY_DM_KEY, JSON.stringify(ids));
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

const loadLastChannelByServer = (): Record<string, string> => {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(LAST_CHANNEL_BY_SERVER_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed ?? {};
  } catch {
    return {};
  }
};

const persistLastChannelByServer = (lastChannelByServer: Record<string, string>): void => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(LAST_CHANNEL_BY_SERVER_STORAGE_KEY, JSON.stringify(lastChannelByServer));
};

const playUnreadNotification = (): void => {
  if (typeof window === "undefined") {
    return;
  }
  const currentUser = useAuthStore.getState().user;
  if (!currentUser || currentUser.status === "DND") {
    return;
  }
  if (audioUnlocked) {
    doPlayAudio();
    return;
  }
  // Always attempt immediate playback — some browsers allow it (e.g. user ran the
  // page before, or has a media-autoplay permission). If the browser rejects it,
  // fall back to playing on the next user interaction.
  const url = getNotifSoundPref() === "alt" ? NOTIFICATION_SOUND_ALT_URL : NOTIFICATION_SOUND_DEFAULT_URL;
  if (!notificationAudio || !notificationAudio.src.endsWith(new URL(url, location.href).pathname)) {
    notificationAudio = new Audio(url);
    notificationAudio.preload = "auto";
  }
  notificationAudio.currentTime = 0;
  notificationAudio.play().then(() => {
    audioUnlocked = true;
    pendingNotificationPlay = false;
  }).catch(() => {
    pendingNotificationPlay = true;
  });
};

const isAppFocused = (): boolean => {
  if (typeof document === "undefined") {
    return true;
  }

  return document.visibilityState === "visible" && document.hasFocus();
};

const normalizeUserPresence = (user: User, onlineUserIds: Set<string>): User => {
  if (user.isDeleted) {
    return user.status === "OFFLINE" ? user : { ...user, status: "OFFLINE" };
  }

  const isOnline = onlineUserIds.has(user.id);
  if (!isOnline) {
    return user.status === "OFFLINE" ? user : { ...user, status: "OFFLINE" };
  }

  return user.status === "OFFLINE" ? { ...user, status: "ONLINE" } : user;
};

const normalizeServersByPresence = (servers: Server[], onlineUserIds: Set<string>): Server[] => {
  return servers.map((server) => ({
    ...server,
    members: server.members.map((member) => ({
      ...member,
      user: normalizeUserPresence(member.user, onlineUserIds)
    }))
  }));
};

const normalizeDMChannelsByPresence = (channels: DMChannel[], onlineUserIds: Set<string>): DMChannel[] => {
  return channels.map((channel) => ({
    ...channel,
    participants: channel.participants.map((participant) => normalizeUserPresence(participant, onlineUserIds))
  }));
};

const normalizePendingFriendsByPresence = (
  pendingFriends: Array<{ id: string; from: User }>,
  onlineUserIds: Set<string>
): Array<{ id: string; from: User }> => {
  return pendingFriends.map((pending) => ({
    ...pending,
    from: normalizeUserPresence(pending.from, onlineUserIds)
  }));
};

const markSocketEventProcessed = (scope: "channel" | "dm", messageId: string): boolean => {
  const eventKey = `${scope}:${messageId}`;
  if (processedSocketEventSet.has(eventKey)) {
    return false;
  }

  processedSocketEventSet.add(eventKey);
  processedSocketEventKeys.push(eventKey);

  if (processedSocketEventKeys.length > MAX_PROCESSED_SOCKET_EVENTS) {
    const oldestKey = processedSocketEventKeys.shift();
    if (oldestKey) {
      processedSocketEventSet.delete(oldestKey);
    }
  }

  return true;
};

const persistedUnreads = loadPersistedUnreads();
const persistedView = loadPersistedView();
const persistedHiddenDMs = loadHiddenDMs();
const persistedUnreadDMs = loadPersistedUnreadDMs();
const persistedLastUnreadMessageIds = loadPersistedLastUnreadMessageIds();
const persistedLastChannelByServer = loadLastChannelByServer();

type ChatState = {
  mode: "SERVER" | "DM";
  servers: Server[];
  onlineUserIds: string[];
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
  lastChannelByServer: Record<string, string>;
  notices: SystemNotice[];
  dismissNotice: (id: string) => void;
  lastUnreadMessageIdByChannel: Record<string, string>;
  channelOpenFocusMessageId: string | null;
  dmChannelOpenFocusMessageId: string | null;
  hasOlderMessages: boolean;
  hasOlderDMMessages: boolean;
  loadingOlderMessages: boolean;
  loadServers: () => Promise<void>;
  setActiveServer: (id: string) => Promise<void>;
  setActiveChannel: (id: string) => Promise<void>;
  setActiveDM: (id: string) => Promise<void>;
  openHome: () => Promise<void>;
  loadMessages: (channelId: string) => Promise<void>;
  loadDMMessages: (dmChannelId: string, previousUnreadCount?: number) => Promise<void>;
  loadOlderMessages: () => Promise<void>;
  loadOlderDMMessages: () => Promise<void>;
  sendMessage: (content: string, replyToId?: string, attachment?: File | null) => Promise<void>;
  sendDMMessage: (content: string, replyToId?: string, attachment?: File | null) => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  editDMMessage: (dmChannelId: string, messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  deleteDMMessage: (dmChannelId: string, messageId: string) => Promise<void>;
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
  toggleDMReaction: (dmChannelId: string, messageId: string, emoji: string) => Promise<void>;
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
  refreshOfflineUnreads: () => Promise<void>;
};

export type SystemNotice = {
  id: string;
  title: string;
  body: string;
};

export const useChatStore = create<ChatState>((set, get) => ({
  mode: persistedView.mode,
  servers: [],
  onlineUserIds: [],
  activeServerId: persistedView.activeServerId,
  activeChannelId: persistedView.activeChannelId,
  activeDMId: persistedView.activeDMId,
  messages: [],
  dmMessages: [],
  dms: [],
  friends: [],
  notices: [],
  dismissNotice: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
  pendingFriends: [],
  outgoingPendingFriends: [],
  typingByChannel: {},
  unreadByChannel: persistedUnreads.unreadByChannel,
  mentionUnreadByChannel: persistedUnreads.mentionUnreadByChannel,
  unreadDMs: persistedUnreadDMs,
  hiddenDMIds: persistedHiddenDMs,
  lastChannelByServer: persistedLastChannelByServer,
  lastUnreadMessageIdByChannel: persistedLastUnreadMessageIds,
  channelOpenFocusMessageId: null,
  dmChannelOpenFocusMessageId: null,
  hasOlderMessages: false,
  hasOlderDMMessages: false,
  loadingOlderMessages: false,
  loadServers: async () => {
    const socket = getSocket();
    const previousServer = get().servers.find((s) => s.id === get().activeServerId);
    for (const channel of previousServer?.channels ?? []) {
      if (channel.type === "TEXT") {
        socket?.emit("channel:leave", channel.id);
      }
    }

    const { data } = await api.get("/servers");
    const onlineUserIds = new Set(get().onlineUserIds);
    const servers = normalizeServersByPresence(data.servers as Server[], onlineUserIds);
    const persisted = loadPersistedView();
    const targetServer =
      servers.find((s) => s.id === persisted.activeServerId) ??
      servers.find((s) => s.id === get().activeServerId) ??
      servers[0];
    const rememberedChannelId = targetServer ? get().lastChannelByServer[targetServer.id] : null;
    const targetChannel =
      targetServer?.channels.find((c) => c.id === rememberedChannelId && c.type === "TEXT") ??
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

    if (targetServer?.id && targetChannel?.id) {
      const nextLastChannelByServer = {
        ...get().lastChannelByServer,
        [targetServer.id]: targetChannel.id
      };
      persistLastChannelByServer(nextLastChannelByServer);
      set({ lastChannelByServer: nextLastChannelByServer });
    }

    for (const channel of targetServer?.channels ?? []) {
      if (channel.type === "TEXT") {
        socket?.emit("channel:join", channel.id);
      }
    }

    // Only load messages when the user is actually in server mode.
    // If they're in DM mode, calling loadMessages would clear the unread
    // badge and last-seen pointer for the server channel without the user
    // having seen those messages.
    if (targetChannel && currentMode !== "DM") {
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
      hasOlderMessages: false,
      loadingOlderMessages: false,
      channelOpenFocusMessageId: null
    });

    const { data } = await api.get(`/servers/${id}`);
    const server = normalizeServersByPresence([data.server as Server], new Set(get().onlineUserIds))[0];
    const rememberedChannelId = get().lastChannelByServer[id];
    const targetChannelId =
      server.channels.find((c) => c.id === rememberedChannelId && c.type === "TEXT")?.id ??
      server.channels.find((c) => c.type === "TEXT")?.id ??
      null;
    set((state) => ({
      mode: "SERVER",
      servers: state.servers.map((s) => (s.id === id ? server : s)),
      activeServerId: id,
      activeChannelId: targetChannelId,
      activeDMId: previousDMId,
      messages: [],
      channelOpenFocusMessageId: (() => {
        return targetChannelId ? (state.lastUnreadMessageIdByChannel[targetChannelId] ?? null) : null;
      })()
    }));

    persistView(id, targetChannelId, "SERVER", previousDMId);
    if (targetChannelId) {
      const nextLastChannelByServer = {
        ...get().lastChannelByServer,
        [id]: targetChannelId
      };
      persistLastChannelByServer(nextLastChannelByServer);
      set({ lastChannelByServer: nextLastChannelByServer });
    }

    for (const channel of server.channels) {
      if (channel.type === "TEXT") {
        socket?.emit("channel:join", channel.id);
      }
    }

    if (targetChannelId) {
      await get().loadMessages(targetChannelId);
    }
  },
  setActiveChannel: async (id) => {
    const previousDMId = get().activeDMId;
    const activeServerId = get().activeServerId;
    const socket = getSocket();
    if (previousDMId) {
      socket?.emit("dm:leave", previousDMId);
    }
    set((state) => {
      const nextLastChannelByServer = activeServerId
        ? {
            ...state.lastChannelByServer,
            [activeServerId]: id
          }
        : state.lastChannelByServer;

      return {
        mode: "SERVER",
        activeChannelId: id,
        messages: [],
        hasOlderMessages: false,
        loadingOlderMessages: false,
        lastChannelByServer: nextLastChannelByServer,
        channelOpenFocusMessageId: state.lastUnreadMessageIdByChannel[id] ?? null
      };
    });
    if (activeServerId) {
      const nextLastChannelByServer = {
        ...get().lastChannelByServer,
        [activeServerId]: id
      };
      persistLastChannelByServer(nextLastChannelByServer);
    }
    persistView(get().activeServerId, id, "SERVER", previousDMId);
    await get().loadMessages(id);
  },
  setActiveDM: async (id) => {
    const previousDMId = get().activeDMId;
    const socket = getSocket();
    if (previousDMId && previousDMId !== id) {
      socket?.emit("dm:leave", previousDMId);
    }
    const previousUnreadCount = get().unreadDMs[id] ?? 0;
    set((state) => {
      if (!state.hiddenDMIds[id]) {
        return { mode: "DM", activeDMId: id, activeChannelId: null, messages: [], dmMessages: [], hasOlderDMMessages: false, loadingOlderMessages: false, channelOpenFocusMessageId: null, dmChannelOpenFocusMessageId: null };
      }

      const nextHidden = { ...state.hiddenDMIds };
      delete nextHidden[id];
      persistHiddenDMs(nextHidden);
      return { mode: "DM", activeDMId: id, activeChannelId: null, messages: [], dmMessages: [], hasOlderDMMessages: false, loadingOlderMessages: false, hiddenDMIds: nextHidden, channelOpenFocusMessageId: null, dmChannelOpenFocusMessageId: null };
    });
    persistView(get().activeServerId, null, "DM", id);
    get().markDMRead(id);
    await get().loadDMMessages(id, previousUnreadCount);
    socket?.emit("dm:join", id);
  },
  openHome: async () => {
    const socket = getSocket();
    const activeDMId = get().activeDMId;

    persistUnreadDMs({});
    set({ mode: "DM", activeChannelId: null, messages: [], channelOpenFocusMessageId: null, dmChannelOpenFocusMessageId: null, unreadDMs: {} });
    persistView(get().activeServerId, null, "DM", activeDMId);

    if (activeDMId) {
      await get().loadDMMessages(activeDMId);
      socket?.emit("dm:join", activeDMId);
    }
  },
  loadMessages: async (channelId) => {
    const { data } = await api.get(`/chat/channels/${channelId}/messages`);
    const msgs = data.messages as Message[];

    // If socket-based unreads are 0, check last-seen in localStorage to catch
    // messages sent while the tab was closed/disconnected.
    let previousUnreadCount = get().unreadByChannel[channelId] ?? 0;
    let focusMessageId: string | null = get().lastUnreadMessageIdByChannel[channelId] ?? null;

    if (previousUnreadCount === 0 && !focusMessageId) {
      const lastSeenId = loadLastSeenByChannel()[channelId];
      if (lastSeenId) {
        const lastSeenIdx = msgs.findIndex((m) => m.id === lastSeenId);
        if (lastSeenIdx !== -1 && lastSeenIdx < msgs.length - 1) {
          previousUnreadCount = msgs.length - 1 - lastSeenIdx;
          focusMessageId = msgs[lastSeenIdx + 1]?.id ?? null;
        }
      }
    }

    if (!focusMessageId && previousUnreadCount > 0) {
      focusMessageId = msgs[Math.max(msgs.length - previousUnreadCount, 0)]?.id ?? null;
    }

    // Update last-seen to the newest message we just loaded
    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg) {
      persistLastSeenByChannel({ ...loadLastSeenByChannel(), [channelId]: lastMsg.id });
    }

    const nextUnread = { ...get().unreadByChannel, [channelId]: 0 };
    const nextMentionUnread = { ...get().mentionUnreadByChannel, [channelId]: 0 };
    const nextUnreadMessageIds = { ...get().lastUnreadMessageIdByChannel };
    delete nextUnreadMessageIds[channelId];
    persistUnreads(nextUnread, nextMentionUnread);
    persistLastUnreadMessageIds(nextUnreadMessageIds);
    set({
      messages: msgs,
      hasOlderMessages: data.hasOlder === true,
      unreadByChannel: nextUnread,
      mentionUnreadByChannel: nextMentionUnread,
      lastUnreadMessageIdByChannel: nextUnreadMessageIds,
      channelOpenFocusMessageId: focusMessageId
    });
  },
  loadDMMessages: async (dmChannelId, previousUnreadCount = 0) => {
    const { data } = await api.get(`/dms/${dmChannelId}/messages`);
    const msgs = data.messages as DMMessage[];

    // If caller passed no socket-based unread count, check last-seen in localStorage
    let unreadCount = previousUnreadCount;
    let focusMessageId: string | null = previousUnreadCount > 0
      ? (msgs[Math.max(msgs.length - previousUnreadCount, 0)]?.id ?? null)
      : null;

    if (unreadCount === 0 && !focusMessageId) {
      const lastSeenId = loadLastSeenByDM()[dmChannelId];
      if (lastSeenId) {
        const lastSeenIdx = msgs.findIndex((m) => m.id === lastSeenId);
        if (lastSeenIdx !== -1 && lastSeenIdx < msgs.length - 1) {
          unreadCount = msgs.length - 1 - lastSeenIdx;
          focusMessageId = msgs[lastSeenIdx + 1]?.id ?? null;
        }
      }
    }

    // Update last-seen to the newest message loaded
    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg) {
      persistLastSeenByDM({ ...loadLastSeenByDM(), [dmChannelId]: lastMsg.id });
    }

    set({ dmMessages: msgs, hasOlderDMMessages: data.hasOlder === true, dmChannelOpenFocusMessageId: focusMessageId });
  },
  loadOlderMessages: async () => {
    const channelId = get().activeChannelId;
    if (!channelId || get().loadingOlderMessages || !get().hasOlderMessages) {
      return;
    }
    const firstMessageId = get().messages[0]?.id;
    if (!firstMessageId) {
      return;
    }
    set({ loadingOlderMessages: true });
    try {
      const { data } = await api.get(`/chat/channels/${channelId}/messages?before=${firstMessageId}`);
      set((state) => ({
        messages: [...(data.messages as Message[]).filter((m) => !state.messages.some((existing) => existing.id === m.id)), ...state.messages],
        hasOlderMessages: data.hasOlder === true,
        loadingOlderMessages: false
      }));
    } catch {
      set({ loadingOlderMessages: false });
    }
  },
  loadOlderDMMessages: async () => {
    const dmChannelId = get().activeDMId;
    if (!dmChannelId || get().loadingOlderMessages || !get().hasOlderDMMessages) {
      return;
    }
    const firstMessageId = get().dmMessages[0]?.id;
    if (!firstMessageId) {
      return;
    }
    set({ loadingOlderMessages: true });
    try {
      const { data } = await api.get(`/dms/${dmChannelId}/messages?before=${firstMessageId}`);
      set((state) => ({
        dmMessages: [...(data.messages as DMMessage[]).filter((m) => !state.dmMessages.some((existing) => existing.id === m.id)), ...state.dmMessages],
        hasOlderDMMessages: data.hasOlder === true,
        loadingOlderMessages: false
      }));
    } catch {
      set({ loadingOlderMessages: false });
    }
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

    // Optimistic: show message immediately with pending flag
    const currentUser = useAuthStore.getState().user;
    const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (currentUser) {
      const replyToMsg = replyToId ? (get().messages.find((m) => m.id === replyToId) ?? null) : null;
      const tempMessage: Message = {
        id: tempId,
        content,
        channelId,
        authorId: currentUser.id,
        createdAt: new Date().toISOString(),
        author: currentUser,
        reactions: [],
        replyTo: replyToMsg
          ? { id: replyToMsg.id, content: replyToMsg.content, attachmentUrl: replyToMsg.attachmentUrl ?? null, attachmentName: replyToMsg.attachmentName ?? null, author: replyToMsg.author }
          : null,
        pending: true,
      };
      set((state) => ({ messages: [...state.messages, tempMessage] }));
    }

    try {
      const { data } = await api.post(`/chat/channels/${channelId}/messages`, { content, replyToId });
      set((state) => ({
        messages: state.messages
          .filter((m) => m.id !== tempId)
          .concat(state.messages.some((m) => m.id === data.message.id) ? [] : [data.message])
      }));
    } catch (err) {
      set((state) => ({ messages: state.messages.filter((m) => m.id !== tempId) }));
      throw err;
    }
  },
  sendDMMessage: async (content, replyToId, attachment) => {
    const dmChannelId = get().activeDMId;
    if (!dmChannelId || (!content.trim() && !attachment)) {
      return;
    }

    // Optimistic for text-only DM messages
    let tempId: string | null = null;
    if (!attachment) {
      const currentUser = useAuthStore.getState().user;
      if (currentUser) {
        tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const replyToMsg = replyToId ? (get().dmMessages.find((m) => m.id === replyToId) ?? null) : null;
        const tempMessage: DMMessage = {
          id: tempId,
          content,
          dmChannelId,
          authorId: currentUser.id,
          createdAt: new Date().toISOString(),
          author: currentUser,
          reactions: [],
          replyTo: replyToMsg
            ? { id: replyToMsg.id, content: replyToMsg.content, attachmentUrl: replyToMsg.attachmentUrl ?? null, attachmentName: replyToMsg.attachmentName ?? null, author: replyToMsg.author }
            : null,
          pending: true,
        };
        set((state) => ({ dmMessages: [...state.dmMessages, tempMessage] }));
      }
    }

    const formData = new FormData();
    formData.append("content", content);
    if (replyToId) {
      formData.append("replyToId", replyToId);
    }
    if (attachment) {
      formData.append("attachment", attachment);
    }

    try {
      const { data } = await api.post(`/dms/${dmChannelId}/messages`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      if (tempId) {
        set((state) => ({
          dmMessages: state.dmMessages
            .filter((m) => m.id !== tempId)
            .concat(state.dmMessages.some((m) => m.id === data.message.id) ? [] : [data.message])
        }));
      } else {
        set((state) => ({
          dmMessages: state.dmMessages.some((m) => m.id === data.message.id) ? state.dmMessages : [...state.dmMessages, data.message]
        }));
      }
    } catch (err) {
      if (tempId) {
        set((state) => ({ dmMessages: state.dmMessages.filter((m) => m.id !== tempId) }));
      }
      throw err;
    }
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
      messages: state.messages.map((m) => (m.id === messageId ? data.message : m))
    }));
  },
  toggleDMReaction: async (dmChannelId, messageId, emoji) => {
    const { data } = await api.post(`/dms/${dmChannelId}/messages/${messageId}/reactions`, { emoji });
    set((state) => ({
      dmMessages: state.dmMessages.map((m) => (m.id === messageId ? data.message : m))
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
    const onlineUserIds = new Set(get().onlineUserIds);
    set({
      friends: (data.friends as User[]).map((friend) => normalizeUserPresence(friend, onlineUserIds)),
      pendingFriends: normalizePendingFriendsByPresence(data.pending as Array<{ id: string; from: User }>, onlineUserIds),
      outgoingPendingFriends: ((data.pendingOutgoing ?? []) as User[]).map((friend) => normalizeUserPresence(friend, onlineUserIds))
    });
  },
  loadDMs: async () => {
    const { data } = await api.get("/dms");
    const channels = normalizeDMChannelsByPresence(data.channels as DMChannel[], new Set(get().onlineUserIds));
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
    set((state) => {
      const next = { ...state.unreadDMs, [dmId]: 0 };
      persistUnreadDMs(next);
      return { unreadDMs: next };
    });
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
  refreshOfflineUnreads: async () => {
    const lastSeenChannels = loadLastSeenByChannel();
    const lastSeenDMs = loadLastSeenByDM();
    if (Object.keys(lastSeenChannels).length === 0 && Object.keys(lastSeenDMs).length === 0) return;
    try {
      const { data } = await api.post("/users/me/unread-counts", {
        channels: lastSeenChannels,
        dms: lastSeenDMs
      });
      set((state) => {
        const nextUnread = { ...state.unreadByChannel };
        for (const [channelId, count] of Object.entries(data.channels as Record<string, number>)) {
          nextUnread[channelId] = Math.max(nextUnread[channelId] ?? 0, count);
        }
        const nextDMs = { ...state.unreadDMs };
        for (const [dmId, count] of Object.entries(data.dms as Record<string, number>)) {
          nextDMs[dmId] = Math.max(nextDMs[dmId] ?? 0, count);
        }
        persistUnreads(nextUnread, state.mentionUnreadByChannel);
        persistUnreadDMs(nextDMs);
        return { unreadByChannel: nextUnread, unreadDMs: nextDMs };
      });
    } catch {
      // Non-fatal: badge counts may be stale but app still works
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
    socket.off("server:member:updated");
    socket.off("server:member:left");
    socket.off("server:deleted");
    socket.off("channel:updated");
    socket.off("category:updated");
    socket.off("categories:reordered");
    socket.off("channels:reordered");
    socket.off("notice:broadcast");
    socket.off("connect");
    socket.off("disconnect");
    socket.off("connect_error");

    const forceAllUsersOffline = (): void => {
      const authUser = useAuthStore.getState().user;
      if (authUser && authUser.status !== "OFFLINE") {
        useAuthStore.getState().setUser({ ...authUser, status: "OFFLINE" });
      }

      set((state) => ({
        onlineUserIds: [],
        servers: state.servers.map((server) => ({
          ...server,
          members: server.members.map((member) => ({
            ...member,
            user: member.user.status === "OFFLINE" ? member.user : { ...member.user, status: "OFFLINE" }
          }))
        })),
        friends: state.friends.map((friend) => (friend.status === "OFFLINE" ? friend : { ...friend, status: "OFFLINE" })),
        pendingFriends: state.pendingFriends.map((pending) => ({
          ...pending,
          from: pending.from.status === "OFFLINE" ? pending.from : { ...pending.from, status: "OFFLINE" }
        })),
        outgoingPendingFriends: state.outgoingPendingFriends.map((friend) =>
          friend.status === "OFFLINE" ? friend : { ...friend, status: "OFFLINE" }
        ),
        dms: state.dms.map((dm) => ({
          ...dm,
          participants: dm.participants.map((participant) =>
            participant.status === "OFFLINE" ? participant : { ...participant, status: "OFFLINE" }
          )
        }))
      }));
    };

    if (!socket.connected) {
      forceAllUsersOffline();
    }

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

      // If servers are already loaded in state, this is a reconnect after a
      // disconnect (not the initial page-load connect). On the initial connect
      // loadServers() handles the first loadMessages call; calling it again here
      // would advance lastSeenByChannel before the divider is rendered, erasing it.
      const isReconnect = get().servers.length > 0;
      if (isReconnect) {
        const activeChannelId = get().activeChannelId;
        const currentMode = get().mode;
        // Only reload channel messages when the user is actually viewing the
        // server. In DM mode activeChannelId still points at the last visited
        // server channel (needed for room joins above), so calling loadMessages
        // here would clear the unread badge and advance lastSeenByChannel even
        // though the user hasn't seen those messages.
        if (currentMode === "SERVER" && activeChannelId) {
          void get().loadMessages(activeChannelId);
        } else if (activeDMId && currentMode === "DM") {
          void get().loadDMMessages(activeDMId);
        }
        void get().refreshOfflineUnreads();
      }
    });

    socket.on("disconnect", () => {
      forceAllUsersOffline();
    });

    socket.on("connect_error", () => {
      forceAllUsersOffline();
    });

    socket.on("message:new", (message: Message) => {
      if (!markSocketEventProcessed("channel", message.id)) {
        return;
      }

      const active = get().activeChannelId;
      const isViewingChannel = get().mode === "SERVER" && message.channelId === active;
      const shouldMarkUnread = !isViewingChannel || !isAppFocused();
      const isSelfAuthored = Boolean(currentUser?.id && message.authorId === currentUser.id);

      if (isViewingChannel) {
        set((state) => {
          if (state.messages.some((m) => m.id === message.id)) {
            return { messages: state.messages };
          }
          // Replace a matching pending message so we don't briefly show both
          // the muted optimistic message and the confirmed one simultaneously.
          if (isSelfAuthored) {
            const pendingIdx = state.messages.findIndex(
              (m) => m.pending && m.authorId === message.authorId && m.content === message.content
            );
            if (pendingIdx !== -1) {
              const next = [...state.messages];
              next[pendingIdx] = message;
              return { messages: next };
            }
          }
          return { messages: [...state.messages, message] };
        });
        // Keep last-seen in sync so a refresh doesn't create a false "New Messages" divider
        persistLastSeenByChannel({ ...loadLastSeenByChannel(), [message.channelId]: message.id });
      }

      if (shouldMarkUnread && !isSelfAuthored) {
        const mentionByUsername = currentUser ? message.content.includes(`@${currentUser.username}`) : false;
        const mentionByNickname = currentUser?.nickname ? message.content.includes(`@${currentUser.nickname}`) : false;
        const mentionByReply = Boolean(currentUser && message.replyTo?.author?.id === currentUser.id && message.authorId !== currentUser.id);
        const isMention = mentionByUsername || mentionByNickname || mentionByReply;
        playUnreadNotification();
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
          lastUnreadMessageIdByChannel: (() => {
            const next = {
              ...state.lastUnreadMessageIdByChannel,
              [message.channelId]: state.lastUnreadMessageIdByChannel[message.channelId] ?? message.id
            };
            persistLastUnreadMessageIds(next);
            return next;
          })()
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
        const nextStatus = !isOnline
          ? "OFFLINE"
          : authUser.status === "OFFLINE"
            ? "ONLINE"
            : authUser.status;
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
        onlineUserIds,
        servers: state.servers.map((server) => ({
          ...server,
          members: server.members.map((member) => ({
            ...member,
            user: applySyncedStatus(member.user)
          }))
        })),
        friends: state.friends.map(applySyncedStatus),
        pendingFriends: state.pendingFriends.map((pending) => ({
          ...pending,
          from: applySyncedStatus(pending.from)
        })),
        outgoingPendingFriends: state.outgoingPendingFriends.map(applySyncedStatus),
        dms: state.dms.map((dm) => ({ ...dm, participants: dm.participants.map(applySyncedStatus) }))
      }));
    });

    socket.on("presence:update", ({ userId, status }: { userId: string; status: string }) => {
      const authUser = useAuthStore.getState().user;
      if (authUser && authUser.id === userId) {
        useAuthStore.getState().setUser({ ...authUser, status: status as User["status"] });
      }

      const nextOnlineUserIds = new Set(get().onlineUserIds);
      if (status === "OFFLINE") {
        nextOnlineUserIds.delete(userId);
      } else {
        nextOnlineUserIds.add(userId);
      }

      const applyStatus = (u: User): User => {
        const candidate = u.id === userId ? { ...u, status: status as User["status"] } : u;
        return normalizeUserPresence(candidate, nextOnlineUserIds);
      };

      set((state) => ({
        onlineUserIds: Array.from(nextOnlineUserIds),
        servers: state.servers.map((server) => ({
          ...server,
          members: server.members.map((member) =>
            member.userId === userId ? { ...member, user: applyStatus(member.user) } : member
          )
        })),
        friends: state.friends.map(applyStatus),
        pendingFriends: state.pendingFriends.map((pending) => ({
          ...pending,
          from: applyStatus(pending.from)
        })),
        outgoingPendingFriends: state.outgoingPendingFriends.map(applyStatus),
        dms: state.dms.map((dm) => ({ ...dm, participants: dm.participants.map(applyStatus) }))
      }));
    });

    socket.on("user:updated", (updated: Partial<User> & { id: string }) => {
      const authUser = useAuthStore.getState().user;
      if (authUser && authUser.id === updated.id) {
        useAuthStore.getState().setUser({ ...authUser, ...updated });
      }

      const onlineSet = new Set(get().onlineUserIds);
      const applyUpdate = (u: User): User => {
        const candidate = u.id === updated.id ? { ...u, ...updated } : u;
        return normalizeUserPresence(candidate, onlineSet);
      };
      set((state) => ({
        servers: state.servers.map((server) => ({
          ...server,
          members: server.members.map((member) =>
            member.userId === updated.id ? { ...member, user: applyUpdate(member.user) } : member
          )
        })),
        friends: state.friends.map(applyUpdate),
        pendingFriends: state.pendingFriends.map((pending) => ({
          ...pending,
          from: applyUpdate(pending.from)
        })),
        outgoingPendingFriends: state.outgoingPendingFriends.map(applyUpdate),
        dms: state.dms.map((dm) => ({ ...dm, participants: dm.participants.map(applyUpdate) }))
      }));
    });

    socket.on("dm:message:new", (message: DMMessage) => {
      if (!markSocketEventProcessed("dm", message.id)) {
        return;
      }

      const isViewingDM = get().mode === "DM" && get().activeDMId === message.dmChannelId;
      const shouldMarkUnread = !isViewingDM || !isAppFocused();

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
        if (isViewingDM) {
          set((state) => {
            if (state.dmMessages.some((m) => m.id === message.id)) {
              return { dmMessages: state.dmMessages };
            }
            // Replace matching pending message to avoid the brief duplicate flash.
            const pendingIdx = state.dmMessages.findIndex(
              (m) => m.pending && m.authorId === message.authorId && m.content === message.content
            );
            if (pendingIdx !== -1) {
              const next = [...state.dmMessages];
              next[pendingIdx] = message;
              return { dmMessages: next };
            }
            return { dmMessages: [...state.dmMessages, message] };
          });
          persistLastSeenByDM({ ...loadLastSeenByDM(), [message.dmChannelId]: message.id });
        }
        return;
      }

      if (isViewingDM) {
        set((state) => ({
          dmMessages: state.dmMessages.some((m) => m.id === message.id) ? state.dmMessages : [...state.dmMessages, message]
        }));
        persistLastSeenByDM({ ...loadLastSeenByDM(), [message.dmChannelId]: message.id });
      }

      if (shouldMarkUnread) {
        playUnreadNotification();
        set((state) => {
          const next = {
            ...state.unreadDMs,
            [message.dmChannelId]: (state.unreadDMs[message.dmChannelId] ?? 0) + 1
          };
          persistUnreadDMs(next);
          return { unreadDMs: next };
        });
      }
    });

    socket.on("dm:message:updated", (message: DMMessage) => {
      if (get().mode === "DM" && get().activeDMId === message.dmChannelId) {
        set((state) => ({
          dmMessages: state.dmMessages.map((m) => (m.id === message.id ? message : m))
        }));
      }
    });

    socket.on("dm:message:deleted", ({ id, dmChannelId }: { id: string; dmChannelId: string }) => {
      if (get().mode === "DM" && get().activeDMId === dmChannelId) {
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

    socket.on("server:member:updated", ({ serverId, member }: { serverId: string; member: Server["members"][number] }) => {
      set((state) => ({
        servers: state.servers.map((server) => {
          if (server.id !== serverId) return server;
          return {
            ...server,
            members: server.members.map((m) =>
              m.userId === member.userId ? { ...m, ...member } : m
            )
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

    socket.on("category:updated", ({ category }: { category: ChannelCategory }) => {
      set((state) => ({
        servers: state.servers.map((server) => {
          if (!server.categories.some((c) => c.id === category.id)) return server;
          return {
            ...server,
            categories: server.categories.map((c) => c.id === category.id ? { ...c, ...category } : c)
          };
        })
      }));
    });

    socket.on("categories:reordered", ({ serverId, items }: { serverId: string; items: { id: string; order: number }[] }) => {
      set((state) => ({
        servers: state.servers.map((server) => {
          if (server.id !== serverId) return server;
          const orderMap = new Map(items.map(({ id, order }) => [id, order]));
          return {
            ...server,
            categories: server.categories.map((c) =>
              orderMap.has(c.id) ? { ...c, order: orderMap.get(c.id)! } : c
            )
          };
        })
      }));
    });

    socket.on("channels:reordered", ({ serverId, items }: { serverId: string; items: { id: string; order: number; categoryId?: string | null }[] }) => {
      set((state) => ({
        servers: state.servers.map((server) => {
          if (server.id !== serverId) return server;
          const itemMap = new Map(items.map((i) => [i.id, i]));
          return {
            ...server,
            channels: server.channels.map((ch) => {
              const update = itemMap.get(ch.id);
              if (!update) return ch;
              return { ...ch, order: update.order, ...(Object.prototype.hasOwnProperty.call(update, "categoryId") ? { categoryId: update.categoryId ?? null } : {}) };
            })
          };
        })
      }));
    });

    socket.on("notice:broadcast", (notice: { title: string; body: string }) => {
      set((s) => ({
        notices: [...s.notices, { id: `${Date.now()}-${Math.random()}`, title: notice.title, body: notice.body }]
      }));
    });

    socket.on("channel:created", ({ serverId, channel }: { serverId: string; channel: Channel }) => {
      set((state) => ({
        servers: state.servers.map((server) => {
          if (server.id !== serverId) return server;
          if (server.channels.some((c) => c.id === channel.id)) return server;
          return { ...server, channels: [...server.channels, channel] };
        })
      }));
    });

    socket.on("channel:deleted", ({ serverId, channelId }: { serverId: string; channelId: string }) => {
      const { activeChannelId, servers } = get();
      const server = servers.find((s) => s.id === serverId);
      const remainingChannels = server?.channels.filter((c) => c.id !== channelId) ?? [];

      set((state) => ({
        servers: state.servers.map((s) =>
          s.id !== serverId ? s : { ...s, channels: remainingChannels }
        ),
        ...(activeChannelId === channelId
          ? { activeChannelId: remainingChannels.find((c) => c.type === "TEXT")?.id ?? null }
          : {})
      }));
    });
  }
}));

// Clear unread for the active channel/DM when the user re-focuses the window.
// This handles the case where a ping arrives while the user is on another window,
// marks the channel as unread, and then never gets cleared when returning.
const clearActiveUnreadOnFocus = (): void => {
  if (!isAppFocused()) {
    return;
  }
  const state = useChatStore.getState();
  if (state.mode === "SERVER" && state.activeChannelId) {
    const channelId = state.activeChannelId;
    const hasUnread = (state.unreadByChannel[channelId] ?? 0) > 0
      || (state.mentionUnreadByChannel[channelId] ?? 0) > 0;
    if (hasUnread) {
      const nextUnread = { ...state.unreadByChannel, [channelId]: 0 };
      const nextMentionUnread = { ...state.mentionUnreadByChannel, [channelId]: 0 };
      persistUnreads(nextUnread, nextMentionUnread);
      useChatStore.setState({ unreadByChannel: nextUnread, mentionUnreadByChannel: nextMentionUnread });
    }
  } else if (state.mode === "DM" && state.activeDMId) {
    const dmId = state.activeDMId;
    if ((state.unreadDMs[dmId] ?? 0) > 0) {
      useChatStore.setState({ unreadDMs: { ...state.unreadDMs, [dmId]: 0 } });
    }
  }
};

if (typeof window !== "undefined") {
  window.addEventListener("focus", clearActiveUnreadOnFocus);
  document.addEventListener("visibilitychange", clearActiveUnreadOnFocus);
}
