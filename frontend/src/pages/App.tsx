import { useEffect, useMemo, useState } from "react";
import { Search, Shield, UserPlus } from "lucide-react";
import ServerBar from "../components/ServerBar";
import ChannelList from "../components/ChannelList";
import ChatArea from "../components/ChatArea";
import MemberList from "../components/MemberList";
import VoicePanel from "../components/VoicePanel";
import UserBar from "../components/UserBar";
import SettingsModal from "../components/SettingsModal";
import CreateServerModal from "../components/CreateServerModal";
import CreateChannelModal from "../components/CreateChannelModal";
import DMList from "../components/DMList";
import FriendsPanel from "../components/FriendsPanel";
import ServerSettingsModal from "../components/ServerSettingsModal";
import UserProfileModal from "../components/UserProfileModal";
import ConfirmDialog from "../components/ConfirmDialog";
import InputDialog from "../components/InputDialog";
import { useAuthStore } from "../lib/stores/authStore";
import { useChatStore } from "../lib/stores/chatStore";
import { getSocket } from "../lib/socket";
import { api } from "../lib/api";
import type { User } from "../types";

const MainPage = (): JSX.Element => {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

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
    typingByChannel,
    unreadByChannel,
    mentionUnreadByChannel,
    unreadDMs,
    loadServers,
    loadFriends,
    loadDMs,
    setActiveServer,
    setActiveChannel,
    setActiveDM,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    removeFriend,
    createOrOpenDM,
    leaveServer,
    deleteServer,
    regenerateInvite,
    markDMRead,
    bindSocketEvents
  } = useChatStore();

  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
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

  const activeServer = useMemo(
    () => servers.find((server) => server.id === activeServerId) ?? null,
    [servers, activeServerId]
  );
  const activeChannel = activeServer?.channels.find((channel) => channel.id === activeChannelId) ?? null;
  const activeDM = dms.find((dm) => dm.id === activeDMId) ?? null;
  const isServerOwner = activeServer?.ownerId === user?.id;
  const hasServers = servers.length > 0;

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
        await api.post(`/servers/invite/${code}`);
        await loadServers();
        setInputState((state) => ({ ...state, open: false }));
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

  const updateVoiceState = (nextMuted: boolean, nextDeafened: boolean): void => {
    setMuted(nextMuted);
    setDeafened(nextDeafened);
    getSocket()?.emit("voice:state", { muted: nextMuted, deafened: nextDeafened });
  };

  return (
    <main className="flex h-screen w-screen bg-discord-dark5 text-discord-text">
      <ServerBar
        servers={servers}
        activeServerId={activeServerId}
        unreadServerIds={unreadServerIds}
        mentionServerIds={mentionServerIds}
        dms={dms}
        me={user}
        unreadDMs={unreadDMs}
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
              <button className="flex-1 rounded bg-[#313338] px-2 py-1 text-xs hover:bg-[#3a3d45]" onClick={() => setFriendsOpen(true)}>
                <UserPlus size={12} className="mr-1 inline" />
                Friends
              </button>
              {isServerOwner ? (
                <button
                  className="rounded bg-[#313338] px-2 py-1 text-xs hover:bg-[#3a3d45]"
                  onClick={() => setServerSettingsOpen(true)}
                >
                  <Shield size={12} className="mr-1 inline" />
                  Server
                </button>
              ) : null}
            </div>

            {hasServers ? (
              <ChannelList
                serverName={activeServer?.name ?? ""}
                categories={activeServer?.categories ?? []}
                channels={activeServer?.channels ?? []}
                activeChannelId={activeChannelId}
                unreadByChannel={unreadByChannel}
                mentionUnreadByChannel={mentionUnreadByChannel}
                onSelectChannel={(id) => void setActiveChannel(id)}
                onCreateChannel={() => setCreateChannelOpen(true)}
                onLeaveServer={() => leaveCurrentServer()}
                canManage={Boolean(isServerOwner)}
                onDeleteChannel={(id) => deleteChannel(id)}
                onRenameChannel={(id) => renameChannel(id)}
                onDeleteCategory={(id) => deleteCategory(id)}
                onMoveChannel={(channelId, categoryId) => void moveChannel(channelId, categoryId)}
              />
            ) : (
              <div className="flex-1" />
            )}
          </div>

          <DMList
            dms={dms}
            me={user}
            activeDMId={activeDMId}
            onOpenDM={(id) => void setActiveDM(id)}
            unreadDMs={unreadDMs}
          />
          <VoicePanel me={user} channels={activeServer?.channels ?? []} />
          <UserBar
            user={user}
            muted={muted}
            deafened={deafened}
            onToggleMute={() => updateVoiceState(!muted, deafened)}
            onToggleDeafen={() => updateVoiceState(muted, !deafened)}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenOwnProfile={() => setProfileUser(user)}
          />
        </div>

        {mode === "SERVER" && !activeServer ? (
          <div className="flex flex-1 items-center justify-center text-discord-muted">
            <p className="text-sm">Select or join a server to get started</p>
          </div>
        ) : (
          <ChatArea
            me={user}
            mode={mode}
            channelName={mode === "SERVER" ? activeChannel?.name ?? "general" : activeDMName}
            messages={mode === "SERVER" ? messages : dmMessages}
            typingUsers={typingByChannel[activeChannelId ?? ""] ?? []}
            mentionMembers={activeServer?.members ?? []}
            onOpenProfile={setProfileUser}
            canModerateServerMessages={Boolean(isServerOwner)}
            onKickMember={(memberId) => kickMember(memberId)}
            onBanMember={(memberId) => banMember(memberId)}
          />
        )}

        <MemberList
          members={activeServer?.members ?? []}
          onSelectUser={setProfileUser}
          canModerate={Boolean(isServerOwner)}
          currentUserId={user.id}
          ownerId={activeServer?.ownerId}
          onKick={(memberId) => kickMember(memberId)}
          onBan={(memberId) => banMember(memberId)}
        />
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
        open={Boolean(profileUser)}
        user={profileUser}
        me={user}
        friends={friends}
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
    </main>
  );
};

export default MainPage;
