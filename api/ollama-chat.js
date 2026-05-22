/* global Buffer, fetch, process */

const DEFAULT_MODEL = "deepseek-v4-pro:cloud";

export default async function handler(req, res) {
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
    res.end("Method not allowed");
    return;
  }

  const apiKey = process.env.OLLAMA_API_KEY;
  if (!apiKey) {
    res.statusCode = 500;
    res.end("OLLAMA_API_KEY is not configured on the server.");
    return;
  }

  try {
    const payload = await readJson(req);
    const upstream = await fetch("https://ollama.com/api/chat", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...payload,
        model: payload.model || process.env.OLLAMA_MODEL || DEFAULT_MODEL,
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
    res.end(error instanceof Error ? error.message : "Ollama proxy failed.");
  }
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");

  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}
