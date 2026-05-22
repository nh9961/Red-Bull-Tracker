import type { CSSProperties } from "react";

export type ThemeTokens = {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;
  bg: string;
  surface: string;
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  outline: string;
  outlineVariant: string;
  text: string;
  muted: string;
  subtle: string;
  accentWarm: string;
  chartPrimary: string;
  chartSecondary: string;
  chartTertiary: string;
  chartError: string;
  chartGrid: string;
  elevation1: string;
  elevation2: string;
};

export type ThemeSeed = {
  primary: string;
  secondary?: string;
  tertiary?: string;
  sugarFree?: boolean;
  dark?: boolean;
  tokens?: Partial<ThemeTokens>;
};

type Rgb = { r: number; g: number; b: number };

function clamp(value: number, min = 0, max = 255) {
  return Math.min(max, Math.max(min, value));
}

function parseHex(hex: string): Rgb {
  const normalized = hex.replace("#", "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((part) => part + part)
          .join("")
      : normalized;
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function toHex({ r, g, b }: Rgb) {
  return `#${[r, g, b]
    .map((channel) => clamp(Math.round(channel)).toString(16).padStart(2, "0"))
    .join("")}`;
}

function mix(a: string, b: string, weight: number) {
  const left = parseHex(a);
  const right = parseHex(b);
  return toHex({
    r: left.r * (1 - weight) + right.r * weight,
    g: left.g * (1 - weight) + right.g * weight,
    b: left.b * (1 - weight) + right.b * weight,
  });
}

function luminance(hex: string) {
  const { r, g, b } = parseHex(hex);
  const channels = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function onColor(background: string) {
  return luminance(background) > 0.58 ? "#1f252a" : "#ffffff";
}

function containerColor(primary: string) {
  return mix(primary, "#ffffff", 0.82);
}

function surfaceStack(primary: string, sugarFree: boolean, dark: boolean) {
  if (dark) {
    return {
      bg: mix(primary, "#000000", 0.88),
      surface: mix(primary, "#000000", 0.86),
      surfaceContainerLowest: mix(primary, "#000000", 0.78),
      surfaceContainerLow: mix(primary, "#000000", 0.82),
      surfaceContainer: mix(primary, "#000000", 0.84),
      surfaceContainerHigh: mix(primary, "#000000", 0.8),
      outline: mix(primary, "#ffffff", 0.35),
      outlineVariant: mix(primary, "#ffffff", 0.18),
      text: "#f5f7fa",
      muted: mix("#ffffff", primary, 0.45),
      subtle: mix("#ffffff", primary, 0.55),
      accentWarm: mix(primary, "#ffffff", 0.12),
    };
  }

  const tint = sugarFree ? mix(primary, "#e8ecf4", 0.72) : mix(primary, "#ffffff", 0.94);
  return {
    bg: tint,
    surface: tint,
    surfaceContainerLowest: "#ffffff",
    surfaceContainerLow: mix(primary, "#ffffff", sugarFree ? 0.9 : 0.92),
    surfaceContainer: mix(primary, "#ffffff", sugarFree ? 0.86 : 0.88),
    surfaceContainerHigh: mix(primary, "#ffffff", sugarFree ? 0.8 : 0.82),
    outline: mix(primary, "#68747c", 0.55),
    outlineVariant: mix(primary, "#dce5ea", 0.72),
    text: "#1f252a",
    muted: mix("#68747c", primary, 0.25),
    subtle: mix("#839099", primary, 0.2),
    accentWarm: mix(primary, "#ffffff", sugarFree ? 0.78 : 0.84),
  };
}

function chartSecondary(primary: string) {
  return mix(primary, "#9c4168", 0.45);
}

function chartTertiary(primary: string) {
  return mix(primary, "#906d1d", 0.35);
}

function rgbaFromHex(hex: string, alpha: number) {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function buildThemeTokens(seed: ThemeSeed): ThemeTokens {
  const { primary, sugarFree = false, dark = false } = seed;
  const secondary = seed.secondary ?? mix(primary, "#647887", 0.35);
  const tertiary = seed.tertiary ?? mix(primary, "#9b7b51", 0.3);
  const surfaces = surfaceStack(primary, sugarFree, dark);
  const primaryContainer = containerColor(primary);
  const secondaryContainer = containerColor(secondary);
  const tertiaryContainer = containerColor(tertiary);
  const error = "#ba1a1a";
  const errorContainer = "#ffdad6";

  const tokens: ThemeTokens = {
    primary,
    onPrimary: onColor(primary),
    primaryContainer,
    onPrimaryContainer: onColor(primaryContainer),
    secondary,
    onSecondary: onColor(secondary),
    secondaryContainer,
    onSecondaryContainer: onColor(secondaryContainer),
    tertiary,
    onTertiary: onColor(tertiary),
    tertiaryContainer,
    onTertiaryContainer: onColor(tertiaryContainer),
    error,
    onError: "#ffffff",
    errorContainer,
    onErrorContainer: "#410002",
    bg: surfaces.bg,
    surface: surfaces.surface,
    surfaceContainerLowest: surfaces.surfaceContainerLowest,
    surfaceContainerLow: surfaces.surfaceContainerLow,
    surfaceContainer: surfaces.surfaceContainer,
    surfaceContainerHigh: surfaces.surfaceContainerHigh,
    outline: surfaces.outline,
    outlineVariant: surfaces.outlineVariant,
    text: surfaces.text,
    muted: surfaces.muted,
    subtle: surfaces.subtle,
    accentWarm: surfaces.accentWarm,
    chartPrimary: primary,
    chartSecondary: chartSecondary(primary),
    chartTertiary: chartTertiary(primary),
    chartError: error,
    chartGrid: rgbaFromHex(surfaces.outline, 0.24),
    elevation1: `0 12px 34px ${rgbaFromHex(primary, 0.08)}, 0 1px 2px ${rgbaFromHex(primary, 0.06)}`,
    elevation2: `0 18px 44px ${rgbaFromHex(primary, 0.12)}, 0 2px 8px ${rgbaFromHex(primary, 0.08)}`,
  };

  return { ...tokens, ...seed.tokens };
}

export function themeTokensToStyle(tokens: ThemeTokens): CSSProperties {
  return {
    "--primary": tokens.primary,
    "--on-primary": tokens.onPrimary,
    "--primary-container": tokens.primaryContainer,
    "--on-primary-container": tokens.onPrimaryContainer,
    "--secondary": tokens.secondary,
    "--on-secondary": tokens.onSecondary,
    "--secondary-container": tokens.secondaryContainer,
    "--on-secondary-container": tokens.onSecondaryContainer,
    "--tertiary": tokens.tertiary,
    "--on-tertiary": tokens.onTertiary,
    "--tertiary-container": tokens.tertiaryContainer,
    "--on-tertiary-container": tokens.onTertiaryContainer,
    "--error": tokens.error,
    "--on-error": tokens.onError,
    "--error-container": tokens.errorContainer,
    "--on-error-container": tokens.onErrorContainer,
    "--bg": tokens.bg,
    "--surface": tokens.surface,
    "--surface-container-lowest": tokens.surfaceContainerLowest,
    "--surface-container-low": tokens.surfaceContainerLow,
    "--surface-container": tokens.surfaceContainer,
    "--surface-container-high": tokens.surfaceContainerHigh,
    "--panel": tokens.surfaceContainer,
    "--panel-strong": tokens.surfaceContainerLowest,
    "--outline": tokens.outline,
    "--outline-variant": tokens.outlineVariant,
    "--text": tokens.text,
    "--muted": tokens.muted,
    "--subtle": tokens.subtle,
    "--accent": tokens.primaryContainer,
    "--accent-soft": tokens.surfaceContainerLow,
    "--accent-strong": tokens.primary,
    "--accent-warm": tokens.accentWarm,
    "--chart-primary": tokens.chartPrimary,
    "--chart-secondary": tokens.chartSecondary,
    "--chart-tertiary": tokens.chartTertiary,
    "--chart-error": tokens.chartError,
    "--chart-grid": tokens.chartGrid,
    "--elevation-1": tokens.elevation1,
    "--elevation-2": tokens.elevation2,
  } as CSSProperties;
}
