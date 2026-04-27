export type WindcordThemeName = "midnight" | "ember" | "frost" | "classic" | "midnight-deep" | "rose" | "forest" | "sunset" | "lavender";

export type WindcordThemeOption = {
  id: WindcordThemeName;
  label: string;
  description: string;
  preview: [string, string, string];
};

export const WINDCORD_THEME_STORAGE_KEY = "windcord_theme_v1";

export const WINDCORD_THEME_OPTIONS: WindcordThemeOption[] = [
  {
    id: "midnight",
    label: "Midnight Steel",
    description: "Steel blues and deep shadows with a crisp, layered contrast.",
    preview: ["#7c99ff", "#24314a", "#121720"]
  },
  {
    id: "ember",
    label: "Ember Signal",
    description: "Warm graphite surfaces with restrained orange energy.",
    preview: ["#ff9b63", "#3b2723", "#181210"]
  },
  {
    id: "frost",
    label: "Frostline",
    description: "Icy slate panels with a brighter, cleaner contrast profile.",
    preview: ["#78c8ff", "#243747", "#0f1720"]
  },
  // NEW: Classic Discord theme - flat, no gradients, original Discord aesthetic
  {
    id: "classic",
    label: "Classic Discord",
    description: "The original Discord look. Flat colors, no gradients, soft muted accents.",
    preview: ["#5865f2", "#36393f", "#2f3136"]
  },
  // NEW: Midnight Deep - deeper purple/blue variant
  {
    id: "midnight-deep",
    label: "Midnight Deep",
    description: "Deeper purple tones with rich shadows and cosmic accents.",
    preview: ["#6464ff", "#12122a", "#0a0a1a"]
  },
  // NEW: Rose - pink/rose themed
  {
    id: "rose",
    label: "Rose",
    description: "Soft pink and rose tones with warm, inviting depth.",
    preview: ["#ff8ab2", "#432733", "#24121d"]
  },
  // NEW: Forest - green/nature themed
  {
    id: "forest",
    label: "Forest",
    description: "Natural greens and earthy tones for a calming experience.",
    preview: ["#64c864", "#1e2e1e", "#0f1a0f"]
  },
  // NEW: Sunset - warm orange/pink gradient
  {
    id: "sunset",
    label: "Sunset",
    description: "Warm oranges and pinks inspired by golden hour skies.",
    preview: ["#ff8a68", "#4a2430", "#241018"]
  },
  // NEW: Lavender - purple/lavender themed
  {
    id: "lavender",
    label: "Lavender",
    description: "Soft purples and lavender hues for a dreamy atmosphere.",
    preview: ["#a078ff", "#221e30", "#120f1a"]
  }
];

export const getThemeAccentHex = (theme: WindcordThemeName): string => {
  return WINDCORD_THEME_OPTIONS.find((option) => option.id === theme)?.preview[0] ?? "#7c99ff";
};

const isThemeName = (value: string | null): value is WindcordThemeName => {
  return value === "midnight" || value === "ember" || value === "frost" || value === "classic" || value === "midnight-deep" || value === "rose" || value === "forest" || value === "sunset" || value === "lavender";
};

export const getStoredThemePreference = (): WindcordThemeName => {
  if (typeof window === "undefined") {
    return "midnight";
  }

  const stored = window.localStorage.getItem(WINDCORD_THEME_STORAGE_KEY);
  return isThemeName(stored) ? stored : "midnight";
};

export const applyThemePreference = (theme: WindcordThemeName): void => {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.windcordTheme = theme;
};

export const setThemePreference = (theme: WindcordThemeName): void => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(WINDCORD_THEME_STORAGE_KEY, theme);
  }
  applyThemePreference(theme);
};

export const applyStoredThemePreference = (): WindcordThemeName => {
  const theme = getStoredThemePreference();
  applyThemePreference(theme);
  return theme;
};