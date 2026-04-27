import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Shield, UserPlus } from "lucide-react";
import ServerBar from "../components/ServerBar";
import ChannelList from "../components/ChannelList";
import ChatArea from "../components/ChatArea";
import MemberList from "../components/MemberList";
import MessageSearchModal from "../components/MessageSearchModal";
import UserBar from "../components/UserBar";
import SettingsModal from "../components/SettingsModal";
import CreateServerModal from "../components/CreateServerModal";
import CreateChannelModal from "../components/CreateChannelModal";
import DMList from "../components/DMList";
import DMProfilePanel from "../components/DMProfilePanel";
import FriendsPanel from "../components/FriendsPanel";
import ServerSettingsModal from "../components/ServerSettingsModal";
import UserProfileModal from "../components/UserProfileModal";
import ConfirmDialog from "../components/ConfirmDialog";
import InputDialog from "../components/InputDialog";
import NickColorModal from "../components/NickColorModal";
import ChannelSettingsModal from "../components/ChannelSettingsModal";
import SystemNoticeBanner from "../components/SystemNoticeBanner";
import { useAuthStore } from "../lib/stores/authStore";
import { useChatStore } from "../lib/stores/chatStore";
import { useSystemStore } from "../lib/stores/systemStore";
import { api } from "../lib/api";
import type { Channel, User } from "../types";

const MainPage = (): JSX.Element => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const apiUnreachable = useSystemStore((s) => s.apiUnreachable);

  const {
    servers,
    activeServerId,
    activeChannelId,
    activeDMId,
    mode,
    messages,
    dmMessages,
    dms,
    friends,
    pendingFriends,
    outgoingPendingFriends,
    typingByChannel,
    channelOpenFocusMessageId,
    channelOpenFocusMode,
    dmChannelOpenFocusMessageId,
    dmChannelOpenFocusMode,
    unreadByChannel,
    mentionUnreadByChannel,
    unreadDMs,
    hiddenDMIds,
    loadServers,
    loadFriends,
    loadDMs,
    loadNotices,
    setActiveServer,
    setActiveChannel,
    openChannelMessage,
    openDMMessage,
    setActiveDM,
    openHome,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    removeFriend,
    createOrOpenDM,
    leaveServer,
    deleteServer,
    regenerateInvite,
    markDMRead,
    hideDM,
    bindSocketEvents,
    refreshOfflineUnreads
  } = useChatStore();

  const notices = useChatStore((s) => s.notices);
  const dismissNotice = useChatStore((s) => s.dismissNotice);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createServerOpen, setCreateServerOpen] = useState(false);
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title?: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    onConfirm: () => void;
  }>({ open: false, message: "", onConfirm: () => undefined });
  const [inputState, setInputState] = useState<{
    open: boolean;
    title: string;
    message?: string;
    placeholder?: string;
    initialValue?: string;
    confirmLabel?: string;
    danger?: boolean;
    onConfirm: (value: string) => void | Promise<void>;
  }>({ open: false, title: "", onConfirm: () => undefined });
  const [nickColorServerId, setNickColorServerId] = useState<string | null>(null);
  const [channelSettingsTarget, setChannelSettingsTarget] = useState<Channel | null>(null);

  const activeServer = useMemo(
    () => servers.find((server) => server.id === activeServerId) ?? null,
    [servers, activeServerId]
  );
  const activeChannel = activeServer?.channels.find((channel) => channel.id === activeChannelId) ?? null;
  const activeDM = dms.find((dm) => dm.id === activeDMId) ?? null;
  const visibleDMs = useMemo(() => dms.filter((dm) => !hiddenDMIds[dm.id]), [dms, hiddenDMIds]);
  const homeActive = mode === "DM";
  const activeDMUser = useMemo(() => {
    const base = activeDM?.participants.find((p) => p.id !== user?.id) ?? null;
    if (!base) return null;
    const friendMatch = friends.find((f) => f.id === base.id);
    return friendMatch?.friendsSince ? { ...base, friendsSince: friendMatch.friendsSince } : base;
  }, [activeDM, user?.id, friends]);

  useEffect(() => {
    if ((mode === "SERVER" && activeServerId) || (mode === "DM" && activeDMId)) {
      return;
    }
    setSearchPanelOpen(false);
  }, [activeDMId, activeServerId, mode]);

  const isServerOwner = activeServer?.ownerId === user?.id;
  const currentMember = activeServer?.members.find((m) => m.userId === user?.id);
  const memberPerms = useMemo(() => {
    try {
      return JSON.parse(currentMember?.permissions || "{}");
    } catch {
      return {};
    }
  }, [currentMember?.permissions]);
  const hasServers = servers.length > 0;

  const liveProfileUser = useMemo(() => {
    if (!profileUser) {
      return null;
    }

    const latestFromAuth = user && user.id === profileUser.id ? user : null;
    if (latestFromAuth) {
      return { ...profileUser, ...latestFromAuth };
    }

    const latestFromServer = servers
      .flatMap((server) => server.members.map((member) => member.user))
      .find((memberUser) => memberUser.id === profileUser.id);
    if (latestFromServer) {
      return { ...profileUser, ...latestFromServer };
    }

    const latestFromFriends = friends.find((friend) => friend.id === profileUser.id);
    if (latestFromFriends) {
      return { ...profileUser, ...latestFromFriends };
    }

    const latestFromDMs = dms
      .flatMap((dm) => dm.participants)
      .find((participant) => participant.id === profileUser.id);
    if (latestFromDMs) {
      return { ...profileUser, ...latestFromDMs };
    }

    return profileUser;
  }, [profileUser, user, servers, friends, dms]);

  const activeProfileServerMemberSince = useMemo(() => {
    if (mode !== "SERVER" || !liveProfileUser || !activeServer) {
      return null;
    }

    return activeServer.members.find((member) => member.userId === liveProfileUser.id)?.createdAt ?? null;
  }, [mode, liveProfileUser, activeServer]);

  const unreadServerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const server of servers) {
      if (server.channels.some((channel) => (unreadByChannel[channel.id] ?? 0) > 0)) {
        ids.add(server.id);
      }
    }
    return ids;
  }, [servers, unreadByChannel]);

  const mentionServerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const server of servers) {
      if (server.channels.some((channel) => (mentionUnreadByChannel[channel.id] ?? 0) > 0)) {
        ids.add(server.id);
      }
    }
    return ids;
  }, [servers, mentionUnreadByChannel]);

  const mentionCountByServer = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const server of servers) {
      const count = server.channels.reduce((sum, channel) => sum + (mentionUnreadByChannel[channel.id] ?? 0), 0);
      if (count > 0) {
        counts[server.id] = count;
      }
    }
    return counts;
  }, [servers, mentionUnreadByChannel]);

  useEffect(() => {
    void (async () => {
      await Promise.all([loadServers(), loadFriends(), loadDMs(), loadNotices()]);
      void refreshOfflineUnreads();
    })();
  }, [loadServers, loadFriends, loadDMs, loadNotices, refreshOfflineUnreads]);

  useEffect(() => {
    bindSocketEvents(user);
    // Depend only on user.id, not the full user object reference. restoreSession
    // first sets a cached user then overwrites with a fresh API response — the
    // same user, but a new object reference. That would normally fire this effect
    // twice, calling socket.off("presence:sync") while the first presence:sync
    // packet is still in-flight, dropping it and leaving everyone "offline".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bindSocketEvents, user?.id]);

  useEffect(() => {
    if (user && apiUnreachable) {
      navigate("/status", { replace: true });
    }
  }, [apiUnreachable, navigate, user]);

  // Dynamic tab title: "(N) #channel | Server" or "(N) @user | Windcord"
  useEffect(() => {
    const mentionUnread = Object.values(mentionUnreadByChannel).reduce((a, b) => a + b, 0);
    const dmUnread = Object.values(unreadDMs).reduce((a, b) => a + b, 0);
    const totalUnread = mentionUnread + dmUnread;
    const prefix = totalUnread > 0 ? `(${totalUnread}) ` : "";

    let context = "Windcord";
    if (mode === "SERVER" && activeChannel) {
      context = `#${activeChannel.name} | ${activeServer?.name ?? "Windcord"}`;
    } else if (mode === "DM" && activeDMUser) {
      const dmName = activeDMUser.nickname?.trim() || activeDMUser.username;
      context = `@${dmName} | Windcord`;
    } else if (mode === "DM") {
      context = "Home | Windcord";
    }

    document.title = `${prefix}${context}`;
  }, [mode, activeChannel, activeServer, activeDMUser, mentionUnreadByChannel, unreadDMs]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
        setSettingsOpen(false);
        setCreateChannelOpen(false);
        setCreateServerOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!user) {
    return <div className="grid h-screen place-items-center">Loading...</div>;
  }

  const openConfirm = (opts: { title?: string; message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void }): void => {
    setConfirmState({ ...opts, open: true });
  };

  const openInput = (opts: {
    title: string;
    message?: string;
    placeholder?: string;
    initialValue?: string;
    confirmLabel?: string;
    danger?: boolean;
    onConfirm: (value: string) => void | Promise<void>;
  }): void => {
    setInputState({ ...opts, open: true });
  };

  const activeDMName = activeDM?.participants.find((p) => p.id !== user.id)?.username ?? "direct-message";

  const joinViaInvite = async (): Promise<void> => {
    openInput({
      title: "Join Server",
      message: "Paste invite link or code",
      placeholder: "invite-code",
      confirmLabel: "Join",
      onConfirm: async (rawValue) => {
        const raw = rawValue.trim();
        const code = raw.replace(`${window.location.origin}/invite/`, "").replace("/invite/", "");
        if (!code) {
          setInputState((state) => ({ ...state, open: false }));
          return;
        }

        try {
          await api.post(`/servers/invite/${code}`);
          await loadServers();
          setInputState((state) => ({ ...state, open: false }));
        } catch (error: unknown) {
          const status = (error as { response?: { status?: number } })?.response?.status;
          const backendMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
          const message = status === 403 ? (backendMessage ?? "You are banned from this server.") : (backendMessage ?? "Failed to join server.");
          setInputState((state) => ({
            ...state,
            message
          }));
        }
      }
    });
  };

  const deleteChannel = (channelId: string): void => {
    if (!activeServerId) return;
    openConfirm({
      title: "Delete Channel",
      message: "Are you sure you want to delete this channel? This cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        await api.delete(`/chat/channels/${channelId}`);
        await setActiveServer(activeServerId);
      }
    });
  };

  const renameChannel = (channelId: string): void => {
    if (!activeServerId) return;
    const current = activeServer?.channels.find((c) => c.id === channelId);
    openInput({
      title: "Rename Channel",
      placeholder: "channel-name",
      initialValue: current?.name ?? "",
      confirmLabel: "Save",
      onConfirm: async (nextName) => {
        if (!nextName) {
          return;
        }
        await api.patch(`/chat/channels/${channelId}`, { name: nextName });
        await setActiveServer(activeServerId);
        setInputState((state) => ({ ...state, open: false }));
      }
    });
  };

  const deleteCategory = (categoryId: string): void => {
    if (!activeServerId) return;
    openConfirm({
      title: "Delete Category",
      message: "Delete this category? Channels inside will be moved to uncategorized.",
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        await api.delete(`/chat/categories/${categoryId}`);
        await setActiveServer(activeServerId);
      }
    });
  };

  const kickMember = (memberId: string): void => {
    if (!activeServerId) return;
    openConfirm({
      title: "Kick Member",
      message: "Kick this member from the server?",
      confirmLabel: "Kick",
      danger: true,
      onConfirm: async () => {
        await api.post(`/servers/${activeServerId}/members/${memberId}/kick`);
        await setActiveServer(activeServerId);
      }
    });
  };

  const banMember = (memberId: string): void => {
    if (!activeServerId) return;
    openConfirm({
      title: "Ban Member",
      message: "Ban this member? They will not be able to rejoin with any invite.",
      confirmLabel: "Ban",
      danger: true,
      onConfirm: async () => {
        await api.post(`/servers/${activeServerId}/members/${memberId}/ban`);
        await setActiveServer(activeServerId);
      }
    });
  };

  const moveChannel = async (channelId: string, newCategoryId: string | null): Promise<void> => {
    if (!activeServerId) return;
    await api.patch(`/chat/channels/${channelId}`, { categoryId: newCategoryId });
    await setActiveServer(activeServerId);
  };

  const leaveCurrentServer = (): void => {
    if (!activeServerId) return;
    openConfirm({
      title: "Leave Server",
      message: "Leave this server? You can only rejoin with an invite.",
      confirmLabel: "Leave",
      danger: true,
      onConfirm: async () => {
        await leaveServer(activeServerId);
      }
    });
  };

  return (
    <main className="wc-shell flex h-screen w-screen text-discord-text">
      <ServerBar
        servers={servers}
        homeActive={homeActive}
        activeServerId={activeServerId}
        unreadServerIds={unreadServerIds}
        mentionServerIds={mentionServerIds}
        mentionCountByServer={mentionCountByServer}
        dms={dms}
        me={user}
        unreadDMs={unreadDMs}
        onSelectHome={() => void openHome()}
        onSelectDM={(id) => void setActiveDM(id)}
        onSelect={(id) => void setActiveServer(id)}
        onCreateServer={() => setCreateServerOpen(true)}
        onJoinByInvite={() => void joinViaInvite()}
        onLogout={() => void logout()}
      />

      <div className="flex min-w-0 flex-1">
        <div className="wc-sidebar flex h-full w-60 flex-col">
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mx-2 my-2 flex min-h-[54px] items-center gap-1 rounded-2xl border border-white/[0.035] bg-white/[0.03] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] backdrop-blur-xl">
              <button className="relative flex-1 rounded-xl border border-transparent bg-[var(--wc-surface-tint)] px-2.5 py-1.5 text-xs font-medium text-white transition hover:border-white/[0.04] hover:bg-[var(--wc-surface-tint-strong)]" onClick={() => setFriendsOpen(true)}>
                <UserPlus size={12} className="mr-1 inline" />
                Friends
                {pendingFriends.length > 0 ? (
                  <span className="absolute -right-1 -top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-[#ed4245] px-1 text-[10px] font-semibold text-white">
                    {Math.min(pendingFriends.length, 99)}
                  </span>
                ) : null}
              </button>
              {mode === "SERVER" && activeServer && (isServerOwner || memberPerms.banMembers) ? (
                <button
                  className="rounded-xl border border-transparent bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-discord-text transition hover:border-white/[0.04] hover:bg-white/[0.07]"
                  onClick={() => setServerSettingsOpen(true)}
                >
                  <Shield size={12} className="mr-1 inline" />
                  {isServerOwner ? "Server" : "Bans"}
                </button>
              ) : null}
            </div>

            {homeActive ? (
              <DMList
                dms={visibleDMs}
                me={user}
                activeDMId={activeDMId}
                onOpenDM={(id) => void setActiveDM(id)}
                onRemoveDM={(id) => hideDM(id)}
                unreadDMs={unreadDMs}
                fullHeight
              />
            ) : hasServers ? (
              <ChannelList
                serverName={activeServer?.name ?? ""}
                serverBannerUrl={activeServer?.bannerImageUrl ?? null}
                categories={activeServer?.categories ?? []}
                channels={activeServer?.channels ?? []}
                activeChannelId={activeChannelId}
                unreadByChannel={unreadByChannel}
                mentionUnreadByChannel={mentionUnreadByChannel}
                onSelectChannel={(id) => void setActiveChannel(id)}
                onCreateChannel={() => setCreateChannelOpen(true)}
                onCreateCategory={() => {
                  openInput({
                    title: "Create Category",
                    placeholder: "category name",
                    confirmLabel: "Create",
                    onConfirm: async (name) => {
                      if (!name.trim() || !activeServerId) return;
                      await api.post(`/chat/servers/${activeServerId}/categories`, { name: name.trim() });
                      await setActiveServer(activeServerId);
                      setInputState((s) => ({ ...s, open: false }));
                    }
                  });
                }}
                onLeaveServer={() => leaveCurrentServer()}
                canManage={Boolean(isServerOwner || memberPerms.manageChannels)}
                onDeleteChannel={(id) => deleteChannel(id)}
                onRenameChannel={(id) => renameChannel(id)}
                onDeleteCategory={(id) => deleteCategory(id)}
                onRenameCategory={(id) => {
                  const current = activeServer?.categories.find((c) => c.id === id);
                  openInput({
                    title: "Rename Category",
                    placeholder: "CATEGORY NAME",
                    initialValue: current?.name ?? "",
                    confirmLabel: "Save",
                    onConfirm: async (nextName) => {
                      if (!nextName.trim()) return;
                      await api.patch(`/chat/categories/${id}`, { name: nextName.trim() });
                      if (activeServerId) await setActiveServer(activeServerId);
                      setInputState((s) => ({ ...s, open: false }));
                    }
                  });
                }}
                onMoveChannel={(channelId, categoryId) => void moveChannel(channelId, categoryId)}
                onReorderCategories={async (items) => {
                  if (!activeServerId) return;
                  await api.patch(`/chat/servers/${activeServerId}/categories/reorder`, { items });
                }}
                onReorderChannels={async (items) => {
                  if (!activeServerId) return;
                  await api.patch(`/chat/servers/${activeServerId}/channels/reorder`, { items });
                }}
                onToggleReadOnly={async (channelId) => {
                  const ch = activeServer?.channels.find((c) => c.id === channelId);
                  if (!ch || !activeServerId) return;
                  await api.patch(`/chat/channels/${channelId}`, { readOnly: !ch.readOnly });
                  await setActiveServer(activeServerId);
                }}
                onOpenChannelSettings={(channel) => setChannelSettingsTarget(channel)}
              />
            ) : (
              <div className="flex-1" />
            )}
          </div>

          <UserBar
            user={user}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenOwnProfile={() => setProfileUser(user)}
            onSetNickColor={mode === "SERVER" && activeServerId ? () => setNickColorServerId(activeServerId) : undefined}
          />
        </div>

        {mode === "SERVER" && !activeServer ? (
          <div className="flex flex-1 items-center justify-center px-6 text-discord-muted">
            <div className="wc-empty-state flex max-w-md flex-col items-center gap-3 rounded-3xl px-8 py-10 text-center">
              <p className="text-sm font-semibold text-white">Choose a server</p>
              <p className="text-sm text-discord-muted">Select one from the rail or join a new space to start talking.</p>
            </div>
          </div>
        ) : mode === "DM" && !activeDM ? (
          <div className="flex flex-1 items-center justify-center px-6 text-discord-muted">
            <div className="wc-empty-state flex max-w-md flex-col items-center gap-3 rounded-3xl px-8 py-10 text-center">
              <p className="text-sm font-semibold text-white">Pick a DM</p>
              <p className="text-sm text-discord-muted">Open a direct message on the left to jump back into the conversation.</p>
            </div>
          </div>
        ) : (
          <ChatArea
            key={`${mode}:${mode === "SERVER" ? (activeChannelId ?? "none") : (activeDMId ?? "none")}`}
            me={user}
            mode={mode}
            channelId={mode === "SERVER" ? activeChannelId : null}
            channelName={mode === "SERVER" ? activeChannel?.name ?? "general" : activeDMName}
            messages={mode === "SERVER" ? messages : dmMessages}
            focusMessageId={mode === "SERVER" ? channelOpenFocusMessageId : dmChannelOpenFocusMessageId}
            focusMessageMode={mode === "SERVER" ? channelOpenFocusMode : dmChannelOpenFocusMode}
            typingUsers={(typingByChannel[mode === "SERVER" ? (activeChannelId ?? "") : (activeDMId ?? "")] ?? []).map((entry) => entry.displayName)}
            mentionMembers={activeServer?.members ?? []}
            channels={activeServer?.channels ?? []}
            onChannelClick={setActiveChannel}
            onOpenProfile={setProfileUser}
            canModerateServerMessages={Boolean(isServerOwner || memberPerms.manageMessages)}
            canManageChannels={Boolean(isServerOwner || memberPerms.manageChannels)}
            channelReadOnly={mode === "SERVER" ? Boolean(activeChannel?.readOnly) : false}
            onKickMember={(memberId) => kickMember(memberId)}
            onBanMember={(memberId) => banMember(memberId)}
            canKickMembers={Boolean(isServerOwner || memberPerms.kickMembers)}
            canBanMembers={Boolean(isServerOwner || memberPerms.banMembers)}
            serverOwnerId={activeServer?.ownerId}
          />
        )}

        {homeActive ? (
          <DMProfilePanel
            user={activeDMUser}
            me={user}
            servers={servers}
            topSlot={mode === "DM" && activeDMId ? <MessageSearchModal scope="dm" targetId={activeDMId} conversationLabel={activeDMUser?.nickname?.trim() || activeDMUser?.username || activeDMName} onJumpToMessage={openDMMessage} onOpenChange={setSearchPanelOpen} /> : null}
          />
        ) : (
          <MemberList
            members={activeServer?.members ?? []}
            onSelectUser={setProfileUser}
            canModerate={Boolean(isServerOwner)}
            currentUserId={user.id}
            ownerId={activeServer?.ownerId}
            onKick={(memberId) => kickMember(memberId)}
            onBan={(memberId) => banMember(memberId)}
            onSetNickColor={() => setNickColorServerId(activeServerId)}
            expanded={mode === "SERVER" && searchPanelOpen}
            topSlot={mode === "SERVER" && activeServerId ? <MessageSearchModal scope="server" targetId={activeServerId} members={activeServer?.members ?? []} onJumpToMessage={openChannelMessage} onOpenChange={setSearchPanelOpen} /> : null}
          />
        )}
      </div>

      {commandOpen ? (
        <div className="fixed inset-0 z-40 grid place-items-start bg-black/40 pt-24" onClick={() => setCommandOpen(false)}>
          <div className="wc-modal-card w-full max-w-xl rounded-[22px] p-3" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2 rounded-2xl border border-white/[0.04] bg-black/20 px-3 py-2 text-sm text-discord-muted backdrop-blur-xl">
              <Search size={14} />
              Quick switcher (Ctrl+K)
            </div>
            <div className="space-y-1">
              {(activeServer?.channels ?? []).map((channel) => (
                <button
                  key={channel.id}
                  className="flex w-full rounded-xl border border-transparent px-3 py-2 text-left text-sm transition hover:border-white/[0.04] hover:bg-white/[0.05]"
                  onClick={() => {
                    void setActiveChannel(channel.id);
                    setCommandOpen(false);
                  }}
                >
                  #{channel.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      <FriendsPanel
        open={friendsOpen}
        friends={friends}
        pending={pendingFriends}
        onClose={() => setFriendsOpen(false)}
        onAdd={sendFriendRequest}
        onAccept={acceptFriendRequest}
        onReject={rejectFriendRequest}
        onRemoveFriend={removeFriend}
        onOpenProfile={setProfileUser}
        onStartDM={async (userId) => {
          await createOrOpenDM([userId]);
          setFriendsOpen(false);
        }}
      />

      <ServerSettingsModal
        open={serverSettingsOpen}
        server={activeServer}
        isOwner={Boolean(isServerOwner)}
        canViewBans={Boolean(isServerOwner || memberPerms.banMembers)}
        onClose={() => setServerSettingsOpen(false)}
        onRefresh={async () => {
          if (activeServerId) {
            await setActiveServer(activeServerId);
          }
        }}
        onRegenerateInvite={async (customCode) => {
          if (!activeServerId) {
            return null;
          }
          return regenerateInvite(activeServerId, customCode);
        }}
        onLeave={async () => {
          if (!activeServerId) {
            return;
          }
          await leaveServer(activeServerId);
          setServerSettingsOpen(false);
        }}
        onDelete={async () => {
          if (!activeServerId) {
            return;
          }
          openConfirm({
            title: "Delete Server",
            message: "Delete this server permanently? This cannot be undone.",
            confirmLabel: "Delete",
            danger: true,
            onConfirm: async () => {
              await deleteServer(activeServerId);
              setServerSettingsOpen(false);
            },
          });
        }}
        onKick={(memberId) => void kickMember(memberId)}
        onBan={(memberId) => void banMember(memberId)}
      />
      <CreateServerModal
        open={createServerOpen}
        onClose={() => setCreateServerOpen(false)}
        onCreated={async () => {
          await loadServers();
        }}
      />
      <CreateChannelModal
        open={createChannelOpen}
        serverId={activeServerId}
        categories={activeServer?.categories ?? []}
        onClose={() => setCreateChannelOpen(false)}
        onCreated={async () => { /* channel:created socket event handles the store update */ }}
      />

      <UserProfileModal
        open={Boolean(liveProfileUser)}
        user={liveProfileUser}
        serverName={mode === "SERVER" ? (activeServer?.name ?? null) : null}
        serverMemberSince={activeProfileServerMemberSince}
        me={user}
        friends={friends}
        outgoingPendingFriends={outgoingPendingFriends}
        servers={servers}
        onClose={() => setProfileUser(null)}
        onAddFriend={sendFriendRequest}
        onStartDM={async (userId) => {
          await createOrOpenDM([userId]);
          setProfileUser(null);
        }}
      />
      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        danger={confirmState.danger}
        onConfirm={() => {
          void confirmState.onConfirm();
          setConfirmState((s) => ({ ...s, open: false }));
        }}
        onCancel={() => setConfirmState((s) => ({ ...s, open: false }))}
      />
      <InputDialog
        open={inputState.open}
        title={inputState.title}
        message={inputState.message}
        placeholder={inputState.placeholder}
        initialValue={inputState.initialValue}
        confirmLabel={inputState.confirmLabel}
        danger={inputState.danger}
        onConfirm={async (value) => {
          await inputState.onConfirm(value);
        }}
        onCancel={() => setInputState((s) => ({ ...s, open: false }))}
      />
      <NickColorModal
        open={nickColorServerId !== null}
        serverId={nickColorServerId ?? ""}
        currentColor={nickColorServerId ? (servers.find((s) => s.id === nickColorServerId)?.members.find((m) => m.userId === user.id)?.nickColor ?? null) : null}
        onClose={() => setNickColorServerId(null)}
        onApplied={() => setNickColorServerId(null)}
      />
      <ChannelSettingsModal
        open={channelSettingsTarget !== null}
        channel={channelSettingsTarget}
        onClose={() => setChannelSettingsTarget(null)}
        onRename={async (channelId, name) => {
          await api.patch(`/chat/channels/${channelId}`, { name });
          if (activeServerId) await setActiveServer(activeServerId);
        }}
        onToggleReadOnly={async (channelId) => {
          const ch = activeServer?.channels.find((c) => c.id === channelId);
          if (!ch) return;
          await api.patch(`/chat/channels/${channelId}`, { readOnly: !ch.readOnly });
          if (activeServerId) await setActiveServer(activeServerId);
        }}
        onToggleAnnouncement={async (channelId) => {
          const ch = activeServer?.channels.find((c) => c.id === channelId);
          if (!ch) return;
          await api.patch(`/chat/channels/${channelId}`, { isAnnouncement: !ch.isAnnouncement });
          if (activeServerId) await setActiveServer(activeServerId);
        }}
        onDelete={(channelId) => deleteChannel(channelId)}
      />
      <SystemNoticeBanner notices={notices} onDismiss={dismissNotice} />
    </main>
  );
};

export default MainPage;
