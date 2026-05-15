import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: [
          "SF Pro Display",
          "SF Pro Text",
          "-apple-system",
          "BlinkMacSystemFont",
          "Avenir Next",
          "Helvetica Neue",
          "sans-serif",
        ],
        body: [
          "SF Pro Text",
          "-apple-system",
          "BlinkMacSystemFont",
          "Avenir Next",
          "Helvetica Neue",
          "sans-serif",
        ],
      },
      colors: {
        bull: {
          midnight: "#050711",
          panel: "#0A1024",
          steel: "#94A3B8",
          chrome: "#E8ECF4",
          blue: "#1A73E8",
          cyan: "#39D5FF",
          pink: "#FFB7D9",
          red: "#FF3448",
          amber: "#FFD84D",
          lime: "#34D399",
        },
      },
      boxShadow: {
        apple: "0 18px 55px rgba(0, 0, 0, 0.22), 0 1px 2px rgba(0, 0, 0, 0.18)",
        fridge: "0 18px 70px rgba(0, 0, 0, 0.34), 0 1px 2px rgba(255, 255, 255, 0.06)",
        can: "0 10px 24px rgba(57, 213, 255, 0.12)",
        redline: "0 12px 28px rgba(255, 52, 72, 0.26)",
        cyan: "0 14px 32px rgba(57, 213, 255, 0.18)",
      },
      backgroundImage: {
        "carbon-grid":
          "linear-gradient(135deg, rgba(255,255,255,0.045) 25%, transparent 25%), linear-gradient(225deg, rgba(255,255,255,0.045) 25%, transparent 25%), linear-gradient(45deg, rgba(0,0,0,0.22) 25%, transparent 25%), linear-gradient(315deg, rgba(0,0,0,0.22) 25%, #070A0F 25%)",
        "scan-line":
          "repeating-linear-gradient(0deg, rgba(255,255,255,0.055) 0px, rgba(255,255,255,0.055) 1px, transparent 1px, transparent 7px)",
      },
      animation: {
        "pulse-rail": "pulseRail 2.4s ease-in-out infinite",
      },
      keyframes: {
        pulseRail: {
          "0%, 100%": { opacity: "0.45", transform: "scaleX(0.82)" },
          "50%": { opacity: "1", transform: "scaleX(1)" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
