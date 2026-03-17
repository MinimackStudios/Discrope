import { PhoneOff, Volume2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getSocket } from "../lib/socket";
import type { Channel, User } from "../types";

type Props = {
  me: User;
  channels: Channel[];
};

const VoicePanel = ({ me, channels }: Props): JSX.Element => {
  const [activeVoiceId, setActiveVoiceId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<string[]>([]);
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const audioRef = useRef<MediaStream | null>(null);

  const voiceChannels = useMemo(() => channels.filter((c) => c.type === "VOICE"), [channels]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) {
      return;
    }

    const onParticipants = ({ channelId, userIds }: { channelId: string; userIds: string[] }) => {
      if (channelId === activeVoiceId) {
        setParticipants(userIds);
      }
    };

    socket.on("voice:participants", onParticipants);
    return () => {
      socket.off("voice:participants", onParticipants);
    };
  }, [activeVoiceId]);

  const joinVoice = async (channelId: string): Promise<void> => {
    const socket = getSocket();
    if (!socket) {
      return;
    }

    if (!audioRef.current) {
      audioRef.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }

    if (activeVoiceId) {
      socket.emit("voice:leave", { channelId: activeVoiceId });
    }

    socket.emit("voice:join", { channelId });
    setActiveVoiceId(channelId);
  };

  const leaveVoice = (): void => {
    const socket = getSocket();
    if (!socket || !activeVoiceId) {
      return;
    }

    socket.emit("voice:leave", { channelId: activeVoiceId });
    setActiveVoiceId(null);
    setParticipants([]);
  };

  return (
    <section className="border-t border-black/20 p-2">
      <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-discord-muted">Voice Channels</p>
      <div className="space-y-1">
        {voiceChannels.map((channel) => {
          const active = channel.id === activeVoiceId;
          return (
            <button
              key={channel.id}
              onClick={() => void joinVoice(channel.id)}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm ${
                active ? "bg-[#404249] text-white" : "text-discord-muted hover:bg-[#35373c] hover:text-discord-text"
              }`}
            >
              <Volume2 size={14} />
              <span className="truncate">{channel.name}</span>
            </button>
          );
        })}
      </div>

      {activeVoiceId ? (
        <div className="mt-3 rounded bg-[#1f2024] p-2 text-xs text-discord-muted">
          <div className="mb-2 flex items-center justify-between text-discord-text">
            <span>Connected as {me.nickname || me.username}</span>
            <button className="rounded bg-[#ed4245] px-2 py-1 text-white" onClick={leaveVoice}>
              <PhoneOff size={12} />
            </button>
          </div>

          <p>Participants: {participants.length}</p>
          <div className="mt-2 space-y-1">
            {participants.map((userId) => (
              <label key={userId} className="flex items-center gap-2">
                <span className="w-24 truncate">{userId === me.id ? "You" : userId.slice(0, 6)}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={volumes[userId] ?? 80}
                  onChange={(e) => setVolumes((prev) => ({ ...prev, [userId]: Number(e.target.value) }))}
                  className="w-full"
                />
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default VoicePanel;
