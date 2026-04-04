import { ChevronDown, FolderPlus, Hash, Lock, LogOut, Pencil, Plus, Settings, Trash2 } from "lucide-react";
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
  onCreateCategory?: () => void;
  onLeaveServer?: () => void;
  canManage: boolean;
  onDeleteChannel: (id: string) => void;
  onRenameChannel: (id: string) => void;
  onDeleteCategory: (id: string) => void;
  onRenameCategory?: (id: string) => void;
  onMoveChannel?: (channelId: string, newCategoryId: string | null) => void;
  onReorderCategories?: (items: { id: string; order: number }[]) => void;
  onReorderChannels?: (items: { id: string; order: number; categoryId?: string | null }[]) => void;
  onToggleReadOnly?: (channelId: string) => void;
  onOpenChannelSettings?: (channel: Channel) => void;
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
  onCreateCategory,
  onLeaveServer,
  canManage,
  onDeleteChannel,
  onRenameChannel,
  onDeleteCategory,
  onRenameCategory,
  onMoveChannel,
  onReorderCategories,
  onReorderChannels,
  onToggleReadOnly,
  onOpenChannelSettings
}: Props): JSX.Element => {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [draggedType, setDraggedType] = useState<"channel" | "category" | null>(null);
  const [draggedCategoryId, setDraggedCategoryId] = useState<string | null>(null);
  const [dragOverCategoryId, setDragOverCategoryId] = useState<string | null>(null);
  const [draggedChannelId, setDraggedChannelId] = useState<string | null>(null);
  const [dragOverChannelId, setDragOverChannelId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const base = categories
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((category) => ({
        category,
        channels: channels
          .filter((c) => c.categoryId === category.id)
          .slice()
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      }));

    const uncategorized = channels
      .filter((c) => !c.categoryId)
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (uncategorized.length > 0) {
      base.push({
        category: { id: "none", name: "Uncategorized", order: 999, serverId: "" },
        channels: uncategorized
      });
    }

    return base;
  }, [categories, channels]);

  const handleCategoryDragStart = (categoryId: string, e: React.DragEvent) => {
    setDraggedType("category");
    setDraggedCategoryId(categoryId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleCategoryDrop = (targetCategoryId: string, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverCategoryId(null);

    if (draggedType === "category" && draggedCategoryId && draggedCategoryId !== targetCategoryId && onReorderCategories) {
      const sortedCats = grouped.filter((g) => g.category.id !== "none").map((g) => g.category);
      const fromIdx = sortedCats.findIndex((c) => c.id === draggedCategoryId);
      const toIdx = sortedCats.findIndex((c) => c.id === targetCategoryId);
      if (fromIdx !== -1 && toIdx !== -1) {
        const reordered = [...sortedCats];
        const [moved] = reordered.splice(fromIdx, 1);
        reordered.splice(toIdx, 0, moved);
        onReorderCategories(reordered.map((c, idx) => ({ id: c.id, order: idx })));
      }
    }

    if (draggedType === "channel") {
      const channelId = e.dataTransfer.getData("channelId");
      if (channelId && onMoveChannel) {
        onMoveChannel(channelId, targetCategoryId === "none" ? null : targetCategoryId);
      }
    }

    setDraggedType(null);
    setDraggedCategoryId(null);
    setDraggedChannelId(null);
  };

  const handleChannelDrop = (targetChannelId: string, targetCategoryId: string, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverChannelId(null);

    if (draggedType !== "channel" || !draggedChannelId || draggedChannelId === targetChannelId) return;

    const draggedCh = channels.find((c) => c.id === draggedChannelId);
    if (!draggedCh) return;

    const sameCategoryId = targetCategoryId === "none" ? null : targetCategoryId;
    const sourceCategoryId = draggedCh.categoryId ?? null;

    if (sourceCategoryId === sameCategoryId) {
      const catChannels = grouped.find((g) => g.category.id === targetCategoryId)?.channels ?? [];
      const fromIdx = catChannels.findIndex((c) => c.id === draggedChannelId);
      const toIdx = catChannels.findIndex((c) => c.id === targetChannelId);
      if (fromIdx !== -1 && toIdx !== -1 && onReorderChannels) {
        const reordered = [...catChannels];
        const [moved] = reordered.splice(fromIdx, 1);
        reordered.splice(toIdx, 0, moved);
        onReorderChannels(reordered.map((c, idx) => ({ id: c.id, order: idx, categoryId: sameCategoryId })));
      }
    } else {
      if (onMoveChannel) {
        onMoveChannel(draggedChannelId, sameCategoryId);
      }
    }

    setDraggedType(null);
    setDraggedChannelId(null);
  };

  return (
    <aside className="flex h-full w-60 flex-col bg-discord-dark2 text-discord-text">
      <div className="flex items-center justify-between border-b border-black/30 px-4 py-3 shadow-sm">
        <h2 className="truncate text-sm font-bold">{serverName || "Channels"}</h2>
        {canManage ? (
          <div className="flex items-center gap-1">
            <button className="text-discord-muted hover:text-white" onClick={onCreateCategory} title="Create category">
              <FolderPlus size={15} />
            </button>
            <button className="text-discord-muted hover:text-white" onClick={onCreateChannel} title="Create channel">
              <Plus size={16} />
            </button>
          </div>
        ) : (
          <button className="text-discord-muted hover:text-red-300" onClick={onLeaveServer} title="Leave server">
            <LogOut size={16} />
          </button>
        )}
      </div>

      <div className="discord-scrollbar flex-1 overflow-y-auto px-2 py-3">
        {grouped.map(({ category, channels: categoryChannels }) => {
          const isCollapsed = collapsed[category.id];
          const isCategoryDragOver = dragOverCategoryId === category.id && draggedType === "channel";
          const isCategoryReorderTarget = dragOverCategoryId === category.id && draggedType === "category";
          return (
            <section
              key={category.id}
              draggable={canManage && category.id !== "none"}
              onDragStart={canManage && category.id !== "none"
                ? (e) => handleCategoryDragStart(category.id, e)
                : undefined}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverCategoryId(category.id);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragOverCategoryId(null);
                }
              }}
              onDrop={(e) => handleCategoryDrop(category.id, e)}
              className={`mb-3 rounded transition-colors ${
                isCategoryDragOver
                  ? "ring-1 ring-discord-blurple/50"
                  : isCategoryReorderTarget
                    ? "ring-2 ring-discord-blurple"
                    : ""
              }`}
            >
              <button
                onClick={() => setCollapsed((prev) => ({ ...prev, [category.id]: !prev[category.id] }))}
                className="flex w-full items-center gap-1 px-1 text-xs font-semibold tracking-wider text-discord-muted hover:text-discord-text"
              >
                <ChevronDown size={14} className={`transition ${isCollapsed ? "-rotate-90" : ""}`} />
                {category.name}
                {canManage && category.id !== "none" ? (
                  <>
                    <Pencil
                      size={12}
                      className="ml-auto"
                      onClick={(event) => {
                        event.stopPropagation();
                        onRenameCategory?.(category.id);
                      }}
                    />
                    <Trash2
                      size={12}
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteCategory(category.id);
                      }}
                    />
                  </>
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
                    const isChannelDragOver = dragOverChannelId === channel.id && draggedType === "channel";
                    return (
                      <button
                        key={channel.id}
                        draggable={canManage}
                        onDragStart={(event) => {
                          setDraggedType("channel");
                          setDraggedChannelId(channel.id);
                          event.dataTransfer.setData("channelId", channel.id);
                          event.dataTransfer.effectAllowed = "move";
                          event.stopPropagation();
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setDragOverChannelId(channel.id);
                          setDragOverCategoryId(null);
                        }}
                        onDragLeave={() => setDragOverChannelId(null)}
                        onDrop={(event) => handleChannelDrop(channel.id, category.id, event)}
                        onClick={() => onSelectChannel(channel.id)}
                        className={`group/channel relative flex w-full items-center gap-1 rounded px-2 py-1 text-left text-[15px] transition-colors ${
                          isChannelDragOver ? "ring-1 ring-discord-blurple" : ""
                        } ${
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
                        <Hash size={16} className="shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{channel.name}</span>
                        {channel.readOnly ? (
                          <Lock size={11} className="shrink-0 text-discord-muted" />
                        ) : null}
                        {canManage ? (
                          <button
                            title="Channel settings"
                            className="shrink-0 rounded p-0.5 opacity-0 group-hover/channel:opacity-60 hover:!opacity-100"
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenChannelSettings?.(channel);
                            }}
                          >
                            <Settings size={13} />
                          </button>
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