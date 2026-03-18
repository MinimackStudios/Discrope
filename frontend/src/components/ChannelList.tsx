import { ChevronDown, Hash, LogOut, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { Channel, ChannelCategory } from "../types";

type Props = {
  serverName: string;
  categories: ChannelCategory[];
  channels: Channel[];
  activeChannelId: string | null;
  unreadByChannel: Record<string, number>;
  mentionUnreadByChannel: Record<string, number>;
  onSelectChannel: (id: string) => void;
  onCreateChannel: () => void;
  onLeaveServer?: () => void;
  canManage: boolean;
  onDeleteChannel: (id: string) => void;
  onRenameChannel: (id: string) => void;
  onDeleteCategory: (id: string) => void;
  onMoveChannel?: (channelId: string, newCategoryId: string | null) => void;
};

const ChannelList = ({
  serverName,
  categories,
  channels,
  activeChannelId,
  unreadByChannel,
  mentionUnreadByChannel,
  onSelectChannel,
  onCreateChannel,
  onLeaveServer,
  canManage,
  onDeleteChannel,
  onRenameChannel,
  onDeleteCategory,
  onMoveChannel
}: Props): JSX.Element => {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const base = categories.map((category) => ({
      category,
      channels: channels.filter((c) => c.categoryId === category.id)
    }));

    const uncategorized = channels.filter((c) => !c.categoryId);
    if (uncategorized.length > 0) {
      base.push({
        category: { id: "none", name: "UNCATEGORIZED", order: 999, serverId: "" },
        channels: uncategorized
      });
    }

    return base;
  }, [categories, channels]);

  return (
    <aside className="flex h-full w-60 flex-col bg-discord-dark2 text-discord-text">
      <div className="flex items-center justify-between border-b border-black/30 px-4 py-3 shadow-sm">
        <h2 className="truncate text-sm font-bold">{serverName || "Channels"}</h2>
        {canManage ? (
          <button className="text-discord-muted hover:text-white" onClick={onCreateChannel} title="Create channel">
            <Plus size={16} />
          </button>
        ) : (
          <button className="text-discord-muted hover:text-red-300" onClick={onLeaveServer} title="Leave server">
            <LogOut size={16} />
          </button>
        )}
      </div>

      <div className="discord-scrollbar flex-1 overflow-y-auto px-2 py-3">
        {grouped.map(({ category, channels: categoryChannels }) => {
          const isCollapsed = collapsed[category.id];
          const isDragOver = dragOverCategory === category.id;
          return (
            <section
              key={category.id}
              className={`mb-3 rounded ${isDragOver ? "ring-1 ring-discord-blurple/50" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverCategory(category.id);
              }}
              onDragLeave={() => setDragOverCategory(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverCategory(null);
                const channelId = e.dataTransfer.getData("channelId");
                if (channelId && onMoveChannel) {
                  onMoveChannel(channelId, category.id === "none" ? null : category.id);
                }
              }}
            >
              <button
                onClick={() => setCollapsed((prev) => ({ ...prev, [category.id]: !prev[category.id] }))}
                className="flex w-full items-center gap-1 px-1 text-xs font-semibold uppercase tracking-wider text-discord-muted hover:text-discord-text"
              >
                <ChevronDown size={14} className={`transition ${isCollapsed ? "-rotate-90" : ""}`} />
                {category.name}
                {canManage && category.id !== "none" ? (
                  <Trash2
                    size={12}
                    className="ml-auto"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDeleteCategory(category.id);
                    }}
                  />
                ) : null}
              </button>

              {!isCollapsed ? (
                <div className="mt-1 space-y-0.5">
                  {categoryChannels.map((channel) => {
                    const active = activeChannelId === channel.id;
                    const unread = unreadByChannel[channel.id] ?? 0;
                    const mentionUnread = mentionUnreadByChannel[channel.id] ?? 0;
                    const hasUnread = unread > 0;
                    const hasMention = mentionUnread > 0;
                    return (
                      <button
                        key={channel.id}
                        draggable={canManage}
                        onDragStart={(event) => {
                          event.dataTransfer.setData("channelId", channel.id);
                        }}
                        onClick={() => onSelectChannel(channel.id)}
                        className={`relative flex w-full items-center gap-1 rounded px-2 py-1 text-left text-[15px] ${
                          active
                            ? "bg-[#404249] text-white"
                            : hasUnread || hasMention
                              ? "text-white hover:bg-[#35373c]"
                              : "text-discord-muted hover:bg-[#35373c] hover:text-discord-text"
                        }`}
                      >
                        {!active && hasUnread && !hasMention ? (
                          <span className="absolute -left-2.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-white" />
                        ) : null}
                        <Hash size={16} />
                        <span className="truncate">{channel.name}</span>
                        {canManage ? (
                          <Pencil
                            size={12}
                            className="ml-auto shrink-0"
                            onClick={(event) => {
                              event.stopPropagation();
                              onRenameChannel(channel.id);
                            }}
                          />
                        ) : null}
                        {canManage ? (
                          <Trash2
                            size={12}
                            className="shrink-0"
                            onClick={(event) => {
                              event.stopPropagation();
                              onDeleteChannel(channel.id);
                            }}
                          />
                        ) : null}
                        {hasMention ? (
                          <span className="shrink-0 rounded-full bg-[#ed4245] px-1.5 text-[10px] font-semibold text-white">
                            1
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </aside>
  );
};

export default ChannelList;
