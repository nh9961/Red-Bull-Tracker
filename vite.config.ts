import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { defineConfig, loadEnv } from "vite";

const DEFAULT_MODEL = "deepseek-v4-pro:cloud";

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
    plugins: [react(), ollamaProxyPlugin(env)],
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

function ollamaProxyPlugin(env: Record<string, string>): Plugin {
  return {
    name: "ollama-proxy",
    configureServer(server) {
      server.middlewares.use("/api/ollama-chat", createOllamaHandler(env));
    },
    configurePreviewServer(server) {
      server.middlewares.use("/api/ollama-chat", createOllamaHandler(env));
    },
  };
}

function createOllamaHandler(env: Record<string, string>) {
  return (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Method not allowed");
      return;
    }

    void handleOllamaProxy(req, res, env);
  };
}

async function handleOllamaProxy(req: IncomingMessage, res: ServerResponse, env: Record<string, string>) {
  const apiKey = env.OLLAMA_API_KEY;
  if (!apiKey) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("OLLAMA_API_KEY is not configured on the server.");
    return;
  }

  try {
    const payload = await readJsonBody(req);
    const upstream = await fetch("https://ollama.com/api/chat", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...payload,
        model: payload.model || env.OLLAMA_MODEL || DEFAULT_MODEL,
        stream: payload.stream !== false,
      }),
    });

    res.statusCode = upstream.status;
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/x-ndjson");

    if (!upstream.ok) {
      res.end(await upstream.text());
      return;
    }

    if (!upstream.body) {
      res.end();
      return;
    }

    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(error instanceof Error ? error.message : "Ollama proxy failed.");
  }
}

async function readJsonBody(req: IncomingMessage) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}
