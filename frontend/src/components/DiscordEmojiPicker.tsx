import { useState } from "react";
import EmojiPicker, { Categories, CategoryConfig, EmojiClickData, EmojiStyle, SuggestionMode, Theme } from "emoji-picker-react";

const PICKER_CATEGORIES: CategoryConfig[] = [
  { category: Categories.SUGGESTED,       name: "Frequently Used" },
  { category: Categories.CUSTOM,          name: "New Emojis" },
  { category: Categories.SMILEYS_PEOPLE,  name: "Smileys & People" },
  { category: Categories.ANIMALS_NATURE,  name: "Animals & Nature" },
  { category: Categories.FOOD_DRINK,      name: "Food & Drink" },
  { category: Categories.TRAVEL_PLACES,   name: "Travel & Places" },
  { category: Categories.ACTIVITIES,      name: "Activities" },
  { category: Categories.OBJECTS,         name: "Objects" },
  { category: Categories.SYMBOLS,         name: "Symbols" },
  { category: Categories.FLAGS,           name: "Flags" },
];

type Props = {
  onEmojiClick: (emoji: string, shiftKey: boolean) => void;
  variant?: "composer" | "reaction";
};

const JDECKED_BASE = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@17.0.2/assets/svg/";

// Emoji 15.1+ entries missing from emoji-picker-react's internal dataset.
// id → actual Unicode character, used to resolve clicks back to characters.
const CUSTOM_EMOJI_CHAR: Record<string, string> = {
  face_with_bags_under_eyes: "🫩",
  distorted_face: "🫪",
  head_shaking_horizontally: "🙂\u200D\u2194\uFE0F",
  head_shaking_vertically: "🙂\u200D\u2195\uFE0F",
};

const CUSTOM_EMOJIS = [
  {
    id: "face_with_bags_under_eyes",
    names: ["Face with Bags Under Eyes"],
    imgUrl: `${JDECKED_BASE}1fae9.svg`,
    keywords: ["face_with_bags_under_eyes", "tired", "sleepy", "bags", "exhausted"],
  },
  {
    id: "distorted_face",
    names: ["Distorted Face"],
    imgUrl: `${JDECKED_BASE}1faea.svg`,
    keywords: ["distorted_face", "distorted", "weird", "warp", "glitch"],
  },
];

const REGIONAL_INDICATOR_BUTTONS = Array.from({ length: 26 }, (_, index) => {
  const letter = String.fromCharCode(65 + index);
  const emoji = String.fromCodePoint(0x1f1e6 + index);
  return { letter, emoji };
});

const KEYCAP_BUTTONS = ["#", "*", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"].map((char) => ({
  char,
  emoji: `${char}\uFE0F\u20E3`,
}));

const REGIONAL_INDICATOR_TWEMOJI_BASE = "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/";

const toEmojiUnified = (emoji: string): string => {
  return Array.from(emoji)
    .map((char) => char.codePointAt(0)?.toString(16) ?? "")
    .filter((cp) => Boolean(cp) && cp !== "fe0f" && cp !== "fe0e")
    .join("-");
};

const DiscordEmojiPicker = ({ onEmojiClick, variant = "composer" }: Props): JSX.Element => {
  const [section, setSection] = useState<"emoji" | "regional">("emoji");
  const bodyHeight = variant === "composer" ? 456 : 404;
  const bodyWidth = variant === "composer" ? 372 : 336;

  return (
    <div className={`discord-emoji-picker rounded-xl border border-[#1f2125] bg-[#313338] p-2 shadow-[0_18px_48px_rgba(0,0,0,0.4)] discord-emoji-picker--${variant}`}>
      <div className="mb-2 flex rounded-md bg-[#232428] p-1">
        <button
          type="button"
          onClick={() => setSection("emoji")}
          className={`flex-1 rounded px-2 py-1 text-xs font-semibold ${section === "emoji" ? "bg-[#3a3d45] text-white" : "text-discord-muted hover:text-white"}`}
        >
          Standard
        </button>
        <button
          type="button"
          onClick={() => setSection("regional")}
          className={`flex-1 rounded px-2 py-1 text-xs font-semibold ${section === "regional" ? "bg-[#3a3d45] text-white" : "text-discord-muted hover:text-white"}`}
        >
          Extra
        </button>
      </div>

      {section === "regional" ? (
        <div className="overflow-y-auto rounded-md border border-[#232428] bg-[#1e1f22] p-2" style={{ height: bodyHeight, width: bodyWidth }}>
          <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-discord-muted">Regional Indicators</p>
          <div className="grid grid-cols-8 gap-1.5">
            {REGIONAL_INDICATOR_BUTTONS.map(({ letter, emoji }) => (
              <button
                key={letter}
                type="button"
                onClick={(e) => onEmojiClick(emoji, e.shiftKey)}
                className="grid h-9 w-9 place-items-center rounded bg-[#2b2d31] hover:bg-[#3a3d45]"
                title={`regional_indicator_${letter.toLowerCase()}`}
                aria-label={`Regional indicator ${letter}`}
              >
                <img
                  src={`${REGIONAL_INDICATOR_TWEMOJI_BASE}${toEmojiUnified(emoji)}.svg`}
                  alt={emoji}
                  draggable={false}
                  className="h-5 w-5"
                />
              </button>
            ))}
          </div>
          <p className="mt-3 px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-discord-muted">Numbers &amp; Symbols</p>
          <div className="grid grid-cols-8 gap-1.5">
            {KEYCAP_BUTTONS.map(({ char, emoji }) => (
              <button
                key={char}
                type="button"
                onClick={(e) => onEmojiClick(emoji, e.shiftKey)}
                className="grid h-9 w-9 place-items-center rounded bg-[#2b2d31] hover:bg-[#3a3d45]"
                title={`keycap_${char}`}
                aria-label={`Keycap ${char}`}
              >
                <img
                  src={`${REGIONAL_INDICATOR_TWEMOJI_BASE}${toEmojiUnified(emoji)}.svg`}
                  alt={emoji}
                  draggable={false}
                  className="h-5 w-5"
                />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <EmojiPicker
          onEmojiClick={(emojiData: EmojiClickData, event: MouseEvent) => {
            const char = emojiData.isCustom
              ? (CUSTOM_EMOJI_CHAR[emojiData.emoji] ?? emojiData.emoji)
              : emojiData.emoji;
            onEmojiClick(char, event.shiftKey);
          }}
          theme={Theme.DARK}
          emojiStyle={EmojiStyle.TWITTER}
          searchPlaceholder="Search emojis"
          previewConfig={{ showPreview: false }}
          suggestedEmojisMode={SuggestionMode.FREQUENT}
          customEmojis={CUSTOM_EMOJIS}
          categories={PICKER_CATEGORIES}
          className={`discord-emoji-picker discord-emoji-picker--${variant}`}
          height={bodyHeight}
          width={bodyWidth}
          lazyLoadEmojis
        />
      )}
    </div>
  );
};

export default DiscordEmojiPicker;