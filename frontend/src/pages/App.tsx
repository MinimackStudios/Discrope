import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Shield, UserPlus } from "lucide-react";
import ServerBar from "../components/ServerBar";
import ChannelList from "../components/ChannelList";
import ChatArea from "../components/ChatArea";
import MemberList from "../components/MemberList";
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
    dmChannelOpenFocusMessageId,
    unreadByChannel,
    mentionUnreadByChannel,
    unreadDMs,
    hiddenDMIds,
    loadServers,
    loadFriends,
    loadDMs,
    setActiveServer,
    setActiveChannel,
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
    bindSocketEvents
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
  const isServerOwner = activeServer?.ownerId === user?.id;
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

  useEffect(() => {
    void loadServers();
    void loadFriends();
    void loadDMs();
  }, [loadServers, loadFriends, loadDMs]);

  useEffect(() => {
    bindSocketEvents(user);
  }, [bindSocketEvents, user]);

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
    <main className="flex h-screen w-screen bg-discord-dark5 text-discord-text">
      <ServerBar
        servers={servers}
        homeActive={homeActive}
        activeServerId={activeServerId}
        unreadServerIds={unreadServerIds}
        mentionServerIds={mentionServerIds}
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
        <div className="flex h-full w-60 flex-col">
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex gap-1 border-b border-black/20 bg-[#232428] p-2">
              <button className="relative flex-1 rounded bg-[#313338] px-2 py-1 text-xs hover:bg-[#3a3d45]" onClick={() => setFriendsOpen(true)}>
                <UserPlus size={12} className="mr-1 inline" />
                Friends
                {pendingFriends.length > 0 ? (
                  <span className="absolute -right-1 -top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-[#ed4245] px-1 text-[10px] font-semibold text-white">
                    {Math.min(pendingFriends.length, 99)}
                  </span>
                ) : null}
              </button>
              {mode === "SERVER" && activeServer && isServerOwner ? (
                <button
                  className="rounded bg-[#313338] px-2 py-1 text-xs hover:bg-[#3a3d45]"
                  onClick={() => setServerSettingsOpen(true)}
                >
                  <Shield size={12} className="mr-1 inline" />
                  Server
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
                canManage={Boolean(isServerOwner)}
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
          <div className="flex flex-1 items-center justify-center text-discord-muted">
            <p className="text-sm">Select or join a server to get started</p>
          </div>
        ) : mode === "DM" && !activeDM ? (
          <div className="flex flex-1 items-center justify-center text-discord-muted">
            <p className="text-sm">Select a direct message to start chatting</p>
          </div>
        ) : (
          <ChatArea
            key={`${mode}:${mode === "SERVER" ? (activeChannelId ?? "none") : (activeDMId ?? "none")}`}
            me={user}
            mode={mode}
            channelName={mode === "SERVER" ? activeChannel?.name ?? "general" : activeDMName}
            messages={mode === "SERVER" ? messages : dmMessages}
            focusMessageId={mode === "SERVER" ? channelOpenFocusMessageId : dmChannelOpenFocusMessageId}
            typingUsers={(typingByChannel[mode === "SERVER" ? (activeChannelId ?? "") : (activeDMId ?? "")] ?? []).map((entry) => entry.displayName)}
            mentionMembers={activeServer?.members ?? []}
            onOpenProfile={setProfileUser}
            canModerateServerMessages={Boolean(isServerOwner)}
            channelReadOnly={mode === "SERVER" ? Boolean(activeChannel?.readOnly) : false}
            onKickMember={(memberId) => kickMember(memberId)}
            onBanMember={(memberId) => banMember(memberId)}
          />
        )}

        {homeActive ? (
          <DMProfilePanel user={activeDMUser} />
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
          />
        )}
      </div>

      {commandOpen ? (
        <div className="fixed inset-0 z-40 grid place-items-start bg-black/40 pt-24" onClick={() => setCommandOpen(false)}>
          <div className="w-full max-w-xl rounded-lg bg-[#313338] p-3" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2 rounded bg-[#1e1f22] px-3 py-2 text-sm text-discord-muted">
              <Search size={14} />
              Quick switcher (Ctrl+K)
            </div>
            <div className="space-y-1">
              {(activeServer?.channels ?? []).map((channel) => (
                <button
                  key={channel.id}
                  className="flex w-full rounded px-2 py-1.5 text-left text-sm hover:bg-[#404249]"
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
        onCreated={async () => {
          if (activeServerId) {
            await setActiveServer(activeServerId);
          }
        }}
      />

      <UserProfileModal
        open={Boolean(liveProfileUser)}
        user={liveProfileUser}
        serverName={mode === "SERVER" ? (activeServer?.name ?? null) : null}
        serverMemberSince={activeProfileServerMemberSince}
        me={user}
        friends={friends}
        outgoingPendingFriends={outgoingPendingFriends}
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
        onDelete={(channelId) => deleteChannel(channelId)}
      />
      <SystemNoticeBanner notices={notices} onDismiss={dismissNotice} />
    </main>
  );
};

export default MainPage;
