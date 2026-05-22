import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const ollamaProxy = {
    target: "https://ollama.com",
    changeOrigin: true,
    rewrite: () => "/api/chat",
    configure(proxy: { on: (event: "proxyReq", handler: (proxyReq: { setHeader: (name: string, value: string) => void }) => void) => void }) {
      proxy.on("proxyReq", (proxyReq) => {
        if (env.OLLAMA_API_KEY) {
          proxyReq.setHeader("Authorization", `Bearer ${env.OLLAMA_API_KEY}`);
        }
      });
    },
  };

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api/ollama-chat": ollamaProxy,
      },
    },
    preview: {
      proxy: {
        "/api/ollama-chat": ollamaProxy,
      },
    },
    build: {
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          manualChunks: {
            charts: ["recharts"],
            motion: ["framer-motion"],
            icons: ["lucide-react"],
          },
        },
      },
    },
  };
});
