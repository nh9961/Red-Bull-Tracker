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

  theme("original", "Original", "flavour", "#282874", {
    primary: "#282874",
    secondary: "#efefef",
    tertiary: "#d4af37",
    tokens: {
      chartSecondary: "#e6301f",
    },
  }),
  theme("zero", "Zero", "flavour", "#b1d0ee", {
    primary: "#b1d0ee",
    secondary: "#efefef",
    tertiary: "#e6301f",
  }),
  theme("summer", "Summer Edition", "flavour", "#f0e53b", {
    primary: "#f2e853",
    secondary: "#efefef",
    tertiary: "#8a8f98",
  }),
  theme("cherry", "Cherry Edition", "flavour", "#d81b60", {
    primary: "#d81b60",
    secondary: "#efefef",
    tertiary: "#b50045",
  }),
  theme("spring", "Spring Edition", "flavour", "#ff8fab", {
    primary: "#e85d8a",
    secondary: "#ffb3c6",
    tertiary: "#ffd8e7",
  }),
  theme("apple", "Apple Edition", "flavour", "#bf1431", {
    primary: "#bf1431",
    secondary: "#f6c300",
    tertiary: "#f3911b",
  }),
  theme("peach", "Peach Edition", "flavour", "#e24585", {
    primary: "#e24585",
    secondary: "#efefef",
    tertiary: "#d6417e",
  }),
  theme("ice", "Ice Edition", "flavour", "#49adbe", {
    primary: "#53b2c2",
    secondary: "#efefef",
    tertiary: "#49adbe",
  }),
  theme("blue-edition", "Blue Edition", "flavour", "#0085c8", {
    primary: "#0085c8",
    secondary: "#efefef",
    tertiary: "#ff73d1",
  }),
  theme("red-edition", "Red Edition", "flavour", "#e6301f", {
    primary: "#e6301f",
    secondary: "#efefef",
    tertiary: "#78b941",
  }),
  theme("tropical", "Tropical Edition", "flavour", "#ffcb04", {
    primary: "#ffcb04",
    secondary: "#efefef",
    tertiary: "#f6c300",
  }),
  theme("coconut", "Coconut Edition", "flavour", "#0070b8", {
    primary: "#0070b8",
    secondary: "#efefef",
    tertiary: "#8a8f98",
  }),
  theme("green-edition", "Green Edition", "flavour", "#78b941", {
    primary: "#78b941",
    secondary: "#efefef",
    tertiary: "#f3911b",
  }),
  theme("apricot", "Apricot Edition", "flavour", "#f3911b", {
    primary: "#f3911b",
    secondary: "#efefef",
    tertiary: "#d6417e",
  }),
  theme("ruby", "Ruby Edition", "flavour", "#b50045", {
    primary: "#b50045",
    secondary: "#efefef",
    tertiary: "#a3e635",
  }),

  theme("sugarfree", "Sugarfree", "sugarfree", "#009edf", {
    primary: "#009edf",
    secondary: "#efefef",
    tertiary: "#e6301f",
    sugarFree: true,
  }),
  theme("sf-summer", "Summer Sugarfree", "sugarfree", "#f0e53b", {
    primary: "#f2e853",
    secondary: "#efefef",
    tertiary: "#009edf",
    sugarFree: true,
  }),
  theme("sf-apple", "Apple Sugarfree", "sugarfree", "#bf1431", {
    primary: "#bf1431",
    secondary: "#f6c300",
    tertiary: "#009edf",
    sugarFree: true,
  }),
  theme("sf-peach", "Peach Sugarfree", "sugarfree", "#e24585", {
    primary: "#e24585",
    secondary: "#efefef",
    tertiary: "#009edf",
    sugarFree: true,
  }),
  theme("sf-ice", "Ice Sugarfree", "sugarfree", "#49adbe", {
    primary: "#53b2c2",
    secondary: "#efefef",
    tertiary: "#009edf",
    sugarFree: true,
  }),
  theme("sf-lilac", "Lilac Sugarfree", "sugarfree", "#7d62ce", {
    primary: "#7d62ce",
    secondary: "#44c7b7",
    tertiary: "#009edf",
    sugarFree: true,
  }),
  theme("sf-pink", "Pink Sugarfree", "sugarfree", "#e77bab", {
    primary: "#e77bab",
    secondary: "#8a1f3d",
    tertiary: "#009edf",
    sugarFree: true,
  }),
  theme("sf-blue", "Blue Sugarfree", "sugarfree", "#0085c8", {
    primary: "#0085c8",
    secondary: "#efefef",
    tertiary: "#009edf",
    sugarFree: true,
  }),
  theme("sf-coconut", "Coconut Sugarfree", "sugarfree", "#0070b8", {
    primary: "#0070b8",
    secondary: "#efefef",
    tertiary: "#009edf",
    sugarFree: true,
  }),
  theme("sf-green", "Green Sugarfree", "sugarfree", "#78b941", {
    primary: "#78b941",
    secondary: "#efefef",
    tertiary: "#009edf",
    sugarFree: true,
  }),
  theme("sf-ruby", "Ruby Sugarfree", "sugarfree", "#b50045", {
    primary: "#b50045",
    secondary: "#efefef",
    tertiary: "#009edf",
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
