import { buildThemeTokens, type ThemeSeed, type ThemeTokens } from "../lib/themeTokens";

export type ThemeCategory = "vocaloid" | "flavour" | "sugarfree";

export type AppTheme = {
  id: string;
  label: string;
  category: ThemeCategory;
  swatch: string;
  tokens: ThemeTokens;
};

export const THEME_STORAGE_KEY = "red-bull-intake-tracker.theme.v1";
export const LEGACY_ACCENT_STORAGE_KEY = "red-bull-intake-tracker.accent.v1";
export const DEFAULT_THEME_ID = "oura-mist";

const LEGACY_ACCENT_MAP: Record<string, string> = {
  pink: "oura-mist",
  blue: "oura-mist",
};

function theme(id: string, label: string, category: ThemeCategory, swatch: string, seed: ThemeSeed): AppTheme {
  return { id, label, category, swatch, tokens: buildThemeTokens(seed) };
}

export const APP_THEMES: AppTheme[] = [
  theme("oura-mist", "Oura Mist", "vocaloid", "#4b86ad", {
    primary: "#4b86ad",
    tokens: {
      primary: "#4b86ad",
      primaryContainer: "#dff2ff",
      onPrimaryContainer: "#10283a",
      chartPrimary: "#4b86ad",
      chartSecondary: "#6f8f7c",
      chartTertiary: "#9b7b51",
    },
  }),
  theme("miku-blue", "Miku Blue", "vocaloid", "#39c5bb", {
    primary: "#39c5bb",
    secondary: "#39d5ff",
    tertiary: "#7ce7ff",
  }),
  theme("teto-red", "Teto Red", "vocaloid", "#fe0404", {
    primary: "#fe0404",
    secondary: "#ff3448",
    tertiary: "#ff6b6b",
  }),
  theme("pastel-pink", "Pastel Pink", "vocaloid", "#ffb7d9", {
    primary: "#e07aa8",
    secondary: "#ffb7d9",
    tertiary: "#ffd8e7",
  }),

  theme("original", "Original", "flavour", "#00a7ff", {
    primary: "#0077c8",
    secondary: "#00a7ff",
    tertiary: "#1e3264",
  }),
  theme("zero", "Zero", "flavour", "#2a2a2a", {
    primary: "#2a2a2a",
    secondary: "#5c5c5c",
    tertiary: "#8a8a8a",
    dark: true,
  }),
  theme("summer", "Summer Edition", "flavour", "#f0e53b", {
    primary: "#d4c400",
    secondary: "#f0e53b",
    tertiary: "#ffc247",
  }),
  theme("cherry", "Cherry Edition", "flavour", "#e40046", {
    primary: "#c3093b",
    secondary: "#e40046",
    tertiary: "#ff6b8a",
  }),
  theme("spring", "Spring Edition", "flavour", "#ff8fab", {
    primary: "#e85d8a",
    secondary: "#ffb3c6",
    tertiary: "#ffd8e7",
  }),
  theme("apple", "Apple Edition", "flavour", "#78be20", {
    primary: "#5a9a12",
    secondary: "#78be20",
    tertiary: "#a8d84a",
  }),
  theme("peach", "Peach Edition", "flavour", "#ff9b63", {
    primary: "#e87a3a",
    secondary: "#ff9b63",
    tertiary: "#ffc9a3",
  }),
  theme("ice", "Ice Edition", "flavour", "#49adbe", {
    primary: "#2d8a9a",
    secondary: "#49adbe",
    tertiary: "#7ce7ff",
  }),
  theme("blue-edition", "Blue Edition", "flavour", "#496dff", {
    primary: "#3a52cc",
    secondary: "#496dff",
    tertiary: "#9c73ff",
  }),
  theme("red-edition", "Red Edition", "flavour", "#ff355e", {
    primary: "#e02045",
    secondary: "#ff355e",
    tertiary: "#ff6b8a",
  }),
  theme("tropical", "Tropical Edition", "flavour", "#ffc247", {
    primary: "#e0a820",
    secondary: "#ffc247",
    tertiary: "#ff9b63",
  }),
  theme("coconut", "Coconut Edition", "flavour", "#7ce7ff", {
    primary: "#4ec4e0",
    secondary: "#7ce7ff",
    tertiary: "#d8f9ff",
  }),
  theme("green-edition", "Green Edition", "flavour", "#b7ff4a", {
    primary: "#7acc20",
    secondary: "#b7ff4a",
    tertiary: "#d4ff8a",
  }),
  theme("apricot", "Apricot Edition", "flavour", "#ff8c42", {
    primary: "#e06a20",
    secondary: "#ff8c42",
    tertiary: "#ffb87a",
  }),
  theme("ruby", "Ruby Edition", "flavour", "#c3093b", {
    primary: "#a00730",
    secondary: "#c3093b",
    tertiary: "#e04060",
  }),

  theme("sugarfree", "Sugarfree", "sugarfree", "#c8d4e0", {
    primary: "#8a9bb0",
    secondary: "#c8d4e0",
    tertiary: "#e7eef8",
    sugarFree: true,
  }),
  theme("sf-summer", "Summer Sugarfree", "sugarfree", "#e8e4a0", {
    primary: "#c4c020",
    secondary: "#e8e4a0",
    tertiary: "#f0e53b",
    sugarFree: true,
  }),
  theme("sf-apple", "Apple Sugarfree", "sugarfree", "#b8d4a0", {
    primary: "#6a9a30",
    secondary: "#b8d4a0",
    tertiary: "#78be20",
    sugarFree: true,
  }),
  theme("sf-peach", "Peach Sugarfree", "sugarfree", "#f0d0b8", {
    primary: "#d08050",
    secondary: "#f0d0b8",
    tertiary: "#ff9b63",
    sugarFree: true,
  }),
  theme("sf-ice", "Ice Sugarfree", "sugarfree", "#b8e0e8", {
    primary: "#4a9aaa",
    secondary: "#b8e0e8",
    tertiary: "#49adbe",
    sugarFree: true,
  }),
  theme("sf-lilac", "Lilac Sugarfree", "sugarfree", "#d8c8f0", {
    primary: "#9070c0",
    secondary: "#d8c8f0",
    tertiary: "#b898e0",
    sugarFree: true,
  }),
  theme("sf-pink", "Pink Sugarfree", "sugarfree", "#f0c8d8", {
    primary: "#d06090",
    secondary: "#f0c8d8",
    tertiary: "#ffb7d9",
    sugarFree: true,
  }),
  theme("sf-blue", "Blue Sugarfree", "sugarfree", "#c8d0f8", {
    primary: "#5060c0",
    secondary: "#c8d0f8",
    tertiary: "#496dff",
    sugarFree: true,
  }),
  theme("sf-coconut", "Coconut Sugarfree", "sugarfree", "#d0f0f8", {
    primary: "#60b8d0",
    secondary: "#d0f0f8",
    tertiary: "#7ce7ff",
    sugarFree: true,
  }),
  theme("sf-green", "Green Sugarfree", "sugarfree", "#d8f0b8", {
    primary: "#70a830",
    secondary: "#d8f0b8",
    tertiary: "#b7ff4a",
    sugarFree: true,
  }),
  theme("sf-ruby", "Ruby Sugarfree", "sugarfree", "#f0c0c8", {
    primary: "#a03050",
    secondary: "#f0c0c8",
    tertiary: "#c3093b",
    sugarFree: true,
  }),
  theme("sf-spring", "Spring Sugarfree", "sugarfree", "#f8d0e0", {
    primary: "#d07090",
    secondary: "#f8d0e0",
    tertiary: "#ffb3c6",
    sugarFree: true,
  }),
];

export const THEME_CATEGORIES: Array<{ id: ThemeCategory; label: string }> = [
  { id: "vocaloid", label: "Vocaloid & Pink" },
  { id: "flavour", label: "Flavours" },
  { id: "sugarfree", label: "Sugarfree" },
];

export function getThemeById(id: string): AppTheme {
  return APP_THEMES.find((entry) => entry.id === id) ?? APP_THEMES[0];
}

export function readStoredThemeId(): string {
  if (typeof window === "undefined") return DEFAULT_THEME_ID;

  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored && APP_THEMES.some((entry) => entry.id === stored)) {
    return stored;
  }

  const legacy = localStorage.getItem(LEGACY_ACCENT_STORAGE_KEY);
  if (legacy && LEGACY_ACCENT_MAP[legacy]) {
    return LEGACY_ACCENT_MAP[legacy];
  }

  return DEFAULT_THEME_ID;
}
