import EmojiPicker, { EmojiClickData, EmojiStyle, SuggestionMode, Theme } from "emoji-picker-react";

type Props = {
  onEmojiClick: (emojiData: EmojiClickData) => void;
  variant?: "composer" | "reaction";
};

const DiscordEmojiPicker = ({ onEmojiClick, variant = "composer" }: Props): JSX.Element => {
  return (
    <EmojiPicker
      onEmojiClick={(emojiData) => onEmojiClick(emojiData)}
      theme={Theme.DARK}
      emojiStyle={EmojiStyle.TWITTER}
      searchPlaceholder="Search emojis"
      previewConfig={{ showPreview: false }}
      suggestedEmojisMode={SuggestionMode.FREQUENT}
      className={`discord-emoji-picker discord-emoji-picker--${variant}`}
      height={variant === "composer" ? 456 : 404}
      width={variant === "composer" ? 372 : 336}
      lazyLoadEmojis
    />
  );
};

export default DiscordEmojiPicker;