import { existsSync, readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  plugins: [react(), deploymentHtml(command === "build")],
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ["recharts"],
          motion: ["framer-motion"],
          icons: ["lucide-react"],
          barcode: ["@undecaf/barcode-detector-polyfill"],
        },
      },
    },
  },
}));

function deploymentHtml(enabled: boolean): Plugin {
  return {
    name: "deployment-html",
    transformIndexHtml(html) {
      if (!enabled) return html;
      return html
        .replace("</head>", `${readOptional(".deploy/head.html")}</head>`)
        .replace("</body>", `${readOptional(".deploy/body-end.html")}</body>`);
    },
  };
}

function readOptional(path: string) {
  if (!existsSync(path)) return "";
  return `\n${readFileSync(path, "utf8").trim()}\n`;
}
