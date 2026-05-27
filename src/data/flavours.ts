import type { Flavour } from "../types";

export const BUILT_IN_FLAVOURS: Flavour[] = [
  { name: "Original", accent: "#00A7FF" },
  { name: "Sugar Free", accent: "#E7EEF8", sugarFree: true },
  { name: "Ruby", accent: "#C3093B" },
  { name: "Iced Vanilla", accent: "#49adbe" },
  { name: "Tropical", accent: "#FFC247" },
  { name: "Watermelon", accent: "#FF355E" },
  { name: "Blueberry", accent: "#496DFF" },
  { name: "Coconut Berry", accent: "#D8F9FF" },
  { name: "Peach", accent: "#FF9B63" },
  { name: "Juneberry", accent: "#9C73FF" },
  { name: "Dragon Fruit", accent: "#FF3DBD" },
  { name: "Curuba Elderflower", accent: "#B7FF4A" },
  { name: "Winter Edition", accent: "#7CE7FF" },
  { name: "Summer Edition", accent: "#f0e53b" },
  { name: "Other", accent: "#AEB9C7" },
];

export const DEFAULT_FLAVOUR = BUILT_IN_FLAVOURS[0];

const fallbackAccents = [
  "#00F2FF",
  "#FF2C38",
  "#FFC247",
  "#B7FF4A",
  "#FF73D1",
  "#AEB9C7",
  "#7CE7FF",
  "#FF9B63",
];

export function flavourMeta(name: string): Flavour {
  return BUILT_IN_FLAVOURS.find((flavour) => flavour.name === name) ?? {
    name,
    accent: accentForCustomFlavour(name),
    sugarFree: /sugar\s*free|zero/i.test(name),
  };
}

export function accentForCustomFlavour(name: string) {
  const total = [...name].reduce((sum, letter) => sum + letter.charCodeAt(0), 0);
  return fallbackAccents[total % fallbackAccents.length];
}

export function mergedFlavours(entryFlavours: string[]) {
  const names = new Set(BUILT_IN_FLAVOURS.map((flavour) => flavour.name));
  const custom = entryFlavours
    .filter((name) => name.trim().length > 0 && !names.has(name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => flavourMeta(name));

  return [...BUILT_IN_FLAVOURS, ...custom];
}
