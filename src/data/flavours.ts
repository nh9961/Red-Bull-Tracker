import type { Flavour } from "../types";

export const BUILT_IN_FLAVOURS: Flavour[] = [
  { name: "Original", accent: "#282874" },
  { name: "Zero", accent: "#B1D0EE", sugarFree: true },
  { name: "Sugar Free", accent: "#009EDF", sugarFree: true },
  { name: "Ruby", accent: "#B50045" },
  { name: "Iced Vanilla", accent: "#53B2C2" },
  { name: "Tropical", accent: "#FFCB04" },
  { name: "Cherry Edition", accent: "#D81B60" },
  { name: "Apricot Edition", accent: "#F3911B" },
  { name: "Lilac Sugarfree", accent: "#7D62CE", sugarFree: true },
  { name: "Pink Sugarfree", accent: "#E77BAB", sugarFree: true },
  { name: "Watermelon", accent: "#E6301F" },
  { name: "Blueberry", accent: "#496DFF" },
  { name: "Coconut Berry", accent: "#0070B8" },
  { name: "Peach", accent: "#E24585" },
  { name: "Juneberry", accent: "#0085C8" },
  { name: "Dragon Fruit", accent: "#FF3DBD" },
  { name: "Curuba Elderflower", accent: "#78B941" },
  { name: "Winter Edition", accent: "#BF1431" },
  { name: "Summer Edition", accent: "#F2E853" },
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
