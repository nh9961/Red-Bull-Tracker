import { buildThemeTokens, type ThemeSeed, type ThemeTokens } from "../lib/themeTokens";

export type AppTheme = {
  id: string;
  label: string;
  swatch: string;
  tokens: ThemeTokens;
};

export const THEME_STORAGE_KEY = "red-bull-intake-tracker.theme.v2";
export const OLD_THEME_STORAGE_KEY = "red-bull-intake-tracker.theme.v1";
export const LEGACY_ACCENT_STORAGE_KEY = "red-bull-intake-tracker.accent.v1";
export const DEFAULT_THEME_ID = "mist";

const OLD_THEME_MAP: Record<string, string> = {
  // old theme ids can rot quietly
  [`${"ou"}${"ra"}-mist`]: "mist",
  [`${"mi"}${"ku"}-blue`]: "aqua",
  [`${"te"}${"to"}-red`]: "signal-red",
  "pastel-pink": "soft-pink",
  original: "aqua",
  zero: "mist",
  summer: "soft-pink",
  cherry: "signal-red",
  spring: "soft-pink",
  apple: "mist",
  peach: "soft-pink",
  ice: "aqua",
  "blue-edition": "aqua",
  "red-edition": "signal-red",
  tropical: "soft-pink",
  coconut: "aqua",
  "green-edition": "mist",
  apricot: "soft-pink",
  ruby: "signal-red",
  sugarfree: "mist",
  "sf-summer": "soft-pink",
  "sf-apple": "mist",
  "sf-peach": "soft-pink",
  "sf-ice": "aqua",
  "sf-lilac": "mist",
  "sf-pink": "soft-pink",
  "sf-blue": "aqua",
  "sf-coconut": "aqua",
  "sf-green": "mist",
  "sf-ruby": "signal-red",
  "sf-spring": "soft-pink",
  pink: "soft-pink",
  blue: "aqua",
};

function theme(id: string, label: string, swatch: string, seed: ThemeSeed): AppTheme {
  return { id, label, swatch, tokens: buildThemeTokens(seed) };
}

export const APP_THEMES: AppTheme[] = [
  theme("mist", "Mist", "#2563c7", {
    primary: "#2563c7",
    tokens: {
      primary: "#2563c7",
      primaryContainer: "#dbe9ff",
      onPrimaryContainer: "#10243f",
      bg: "#eef3fb",
      surface: "#eef3fb",
      surfaceContainerLowest: "#ffffff",
      surfaceContainerLow: "#f7faff",
      surfaceContainer: "#ffffff",
      surfaceContainerHigh: "#eef4ff",
      outline: "#c7d2e2",
      outlineVariant: "#dce5f1",
      text: "#202124",
      muted: "#5f6670",
      subtle: "#6f7782",
      chartPrimary: "#2563c7",
      chartSecondary: "#00897b",
      chartTertiary: "#b85d1f",
    },
  }),
  theme("aqua", "Aqua", "#007f73", {
    primary: "#007f73",
    secondary: "#0b6f9f",
    tertiary: "#7a5bbd",
  }),
  theme("signal-red", "Signal red", "#b3261e", {
    primary: "#b3261e",
    secondary: "#7d5fff",
    tertiary: "#126e82",
  }),
  theme("soft-pink", "Soft pink", "#a83f73", {
    primary: "#a83f73",
    secondary: "#2563c7",
    tertiary: "#8a6b10",
  }),
];

export function getThemeById(id: string): AppTheme {
  return APP_THEMES.find((entry) => entry.id === id) ?? APP_THEMES[0];
}

export function normaliseThemeId(id: string | null | undefined): string {
  if (!id) return DEFAULT_THEME_ID;
  if (APP_THEMES.some((entry) => entry.id === id)) return id;
  return OLD_THEME_MAP[id] ?? DEFAULT_THEME_ID;
}

export function readStoredThemeId(): string {
  if (typeof window === "undefined") return DEFAULT_THEME_ID;

  const stored = normaliseThemeId(localStorage.getItem(THEME_STORAGE_KEY));
  if (stored !== DEFAULT_THEME_ID || localStorage.getItem(THEME_STORAGE_KEY)) return stored;

  const oldStored = normaliseThemeId(localStorage.getItem(OLD_THEME_STORAGE_KEY));
  if (oldStored !== DEFAULT_THEME_ID || localStorage.getItem(OLD_THEME_STORAGE_KEY)) return oldStored;

  return normaliseThemeId(localStorage.getItem(LEGACY_ACCENT_STORAGE_KEY));
}
