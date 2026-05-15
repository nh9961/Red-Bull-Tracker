import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: [
          "Google Sans",
          "Google Sans Text",
          "Product Sans",
          "Roboto",
          "-apple-system",
          "BlinkMacSystemFont",
          "sans-serif",
        ],
        body: [
          "Google Sans",
          "Google Sans Text",
          "Product Sans",
          "Roboto",
          "-apple-system",
          "BlinkMacSystemFont",
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
        apple: "0 1px 2px rgba(69, 54, 62, 0.14), 0 2px 6px rgba(69, 54, 62, 0.08)",
        fridge: "0 2px 6px rgba(69, 54, 62, 0.12), 0 8px 18px rgba(69, 54, 62, 0.08)",
        can: "0 1px 2px rgba(156, 65, 104, 0.18), 0 3px 8px rgba(156, 65, 104, 0.10)",
        redline: "0 2px 8px rgba(186, 26, 26, 0.20)",
        cyan: "0 1px 2px rgba(156, 65, 104, 0.16), 0 4px 12px rgba(156, 65, 104, 0.10)",
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
