export type UserStatus = "ONLINE" | "IDLE" | "DND" | "INVISIBLE" | "OFFLINE";

export type User = {
  id: string;
  username: string;
  nickname: string;
  isDeleted?: boolean;
  avatarUrl?: string | null;
  status: UserStatus;
  aboutMe?: string;
  customStatus?: string;
  bannerColor?: string | null;
  bannerImageUrl?: string | null;
  accentColor?: string | null;
  createdAt?: string;
  friendsSince?: string | null;
};

export type ChannelType = "TEXT";

export type ChannelCategory = {
  id: string;
  name: string;
  order: number;
  serverId: string;
};

export type Channel = {
  id: string;
  name: string;
  type: ChannelType;
  readOnly?: boolean;
  order?: number;
  categoryId?: string | null;
  serverId: string;
};

export type MessageReaction = {
  messageId: string;
  userId: string;
  emoji: string;
  user?: {
    id: string;
    username: string;
    nickname: string;
    avatarUrl?: string | null;
  };
};

export type Message = {
  id: string;
  content: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  channelId: string;
  authorId: string;
  editedAt?: string | null;
  createdAt: string;
  isPinned?: boolean;
  pending?: boolean;
  replyTo?: {
    id: string;
    content: string;
    attachmentUrl?: string | null;
    attachmentName?: string | null;
    author: { id: string; username: string; nickname?: string; isDeleted?: boolean; avatarUrl?: string | null };
  } | null;
  author: User;
  reactions: MessageReaction[];
};

export type ServerMember = {
  userId: string;
  serverId: string;
  nickname?: string | null;
  nickColor?: string | null;
  role: "MEMBER" | "ADMIN";
  createdAt?: string;
  user: User;
};

export type Server = {
  id: string;
  name: string;
  iconUrl?: string | null;
  ownerId: string;
  inviteCode: string;
  categories: ChannelCategory[];
  channels: Channel[];
  members: ServerMember[];
};

export type DMChannel = {
  id: string;
  participants: User[];
};

export type DMMessage = {
  id: string;
  content: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  dmChannelId: string;
  authorId: string;
  editedAt?: string | null;
  createdAt: string;
  pending?: boolean;
  replyTo?: {
    id: string;
    content: string;
    attachmentUrl?: string | null;
    attachmentName?: string | null;
    author: { id: string; username: string; nickname?: string; isDeleted?: boolean; avatarUrl?: string | null };
  } | null;
  author: User;
  reactions: MessageReaction[];
};

export type LinkEmbed = {
  url: string;
  resolvedUrl: string;
  providerHost: string;
  siteName?: string | null;
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  faviconUrl?: string | null;
  color?: string | null;
};
