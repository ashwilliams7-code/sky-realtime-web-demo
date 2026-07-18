import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MODEL = "qwen3.5:9b";
const MAX_BODY_BYTES = 12_000;
const MAX_MESSAGE_CHARS = 1_200;
const MAX_HISTORY_ITEMS = 8;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 30;
const MAX_CONCURRENT_GENERATIONS = 2;

const publicFiles = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/styles.css", "styles.css"],
  ["/app.js", "app.js"],
  ["/manifest.webmanifest", "manifest.webmanifest"],
  ["/favicon.svg", "favicon.svg"],
]);

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"],
]);

const systemPrompt = `You are Sky, Ash's personal AI companion. Reply naturally, warmly, and directly in one or two short spoken sentences. You are in a temporary browser voice test powered by a private local model. Never claim you completed an action or used a tool. Do not mention implementation details unless Ash asks. Avoid markdown, lists, stage directions, emojis, and long explanations because the reply will be spoken aloud.`;

function securityHeaders(contentType, cacheControl = "no-store") {
  return {
    "Cache-Control": cacheControl,
    "Content-Type": contentType,
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; media-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    "Permissions-Policy": "microphone=(self), camera=(), geolocation=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

function send(response, status, body, contentType, cacheControl) {
  response.writeHead(status, securityHeaders(contentType, cacheControl));
  response.end(body);
}

function sendJSON(response, status, body) {
  send(response, status, JSON.stringify(body), "application/json; charset=utf-8");
}

function clientAddress(request) {
  const cloudflareAddress = request.headers["cf-connecting-ip"];
  if (typeof cloudflareAddress === "string" && cloudflareAddress.length <= 64) return cloudflareAddress;
  return request.socket.remoteAddress || "unknown";
}

function normalizeHistory(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
    .slice(-MAX_HISTORY_ITEMS)
    .map((item) => ({ role: item.role, content: item.content.trim().slice(0, MAX_MESSAGE_CHARS) }))
    .filter((item) => item.content);
}

function cleanReply(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^[-*#]+\s*/gm, "")
    .trim()
    .slice(0, 1_000);
}

async function readRequestBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("Payload too large"), { statusCode: 413 });
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks).toString("utf8") : "";
}

export function createLiveVoiceServer({
  rootDirectory = moduleDirectory,
  model = process.env.SKY_LOCAL_MODEL || DEFAULT_MODEL,
  ollamaURL = process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/chat",
  fetchImpl = fetch,
} = {}) {
  const requestTimes = new Map();
  let concurrentGenerations = 0;

  function isRateLimited(address) {
    const now = Date.now();
    const recent = (requestTimes.get(address) || []).filter((timestamp) => now - timestamp < RATE_WINDOW_MS);
    if (recent.length >= RATE_LIMIT) {
      requestTimes.set(address, recent);
      return true;
    }
    recent.push(now);
    requestTimes.set(address, recent);
    return false;
  }

  return createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    const pathname = url.pathname;

    try {
      if (pathname === "/health" && (request.method === "GET" || request.method === "HEAD")) {
        sendJSON(response, 200, { status: "ok", service: "sky-live-voice", model });
        return;
      }

      if (pathname === "/runtime-config.js" && (request.method === "GET" || request.method === "HEAD")) {
        const body = `window.__SKY_RUNTIME__ = Object.freeze({ liveVoice: true, model: ${JSON.stringify(model)} });\n`;
        send(response, 200, request.method === "HEAD" ? "" : body, "text/javascript; charset=utf-8");
        return;
      }

      if (pathname === "/api/status" && request.method === "GET") {
        sendJSON(response, 200, { liveVoice: true, model, speech: "browser" });
        return;
      }

      if (pathname === "/api/chat") {
        if (request.method !== "POST") {
          sendJSON(response, 405, { error: "Method not allowed" });
          return;
        }
        if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
          sendJSON(response, 415, { error: "Expected application/json" });
          return;
        }
        if (isRateLimited(clientAddress(request))) {
          sendJSON(response, 429, { error: "Voice test rate limit reached" });
          return;
        }
        if (concurrentGenerations >= MAX_CONCURRENT_GENERATIONS) {
          sendJSON(response, 503, { error: "Sky is handling another voice turn" });
          return;
        }

        const rawBody = await readRequestBody(request);
        let payload;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          sendJSON(response, 400, { error: "Invalid JSON" });
          return;
        }
        const message = typeof payload.message === "string" ? payload.message.trim().slice(0, MAX_MESSAGE_CHARS) : "";
        if (!message) {
          sendJSON(response, 400, { error: "Message is required" });
          return;
        }

        concurrentGenerations += 1;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60_000);
        try {
          const upstream = await fetchImpl(ollamaURL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              stream: false,
              think: false,
              keep_alive: "2h",
              messages: [
                { role: "system", content: systemPrompt },
                ...normalizeHistory(payload.history),
                { role: "user", content: message },
              ],
              options: {
                temperature: 0.45,
                num_predict: 120,
                num_ctx: 4_096,
              },
            }),
            signal: controller.signal,
          });
          if (!upstream.ok) {
            sendJSON(response, 502, { error: "Local reasoning service rejected the turn" });
            return;
          }
          const result = await upstream.json();
          const reply = cleanReply(result?.message?.content);
          if (!reply) {
            sendJSON(response, 502, { error: "Local reasoning service returned an empty reply" });
            return;
          }
          sendJSON(response, 200, { reply, model });
        } catch (error) {
          sendJSON(response, error?.name === "AbortError" ? 504 : 502, {
            error: error?.name === "AbortError" ? "Local reasoning timed out" : "Local reasoning unavailable",
          });
        } finally {
          clearTimeout(timeout);
          concurrentGenerations -= 1;
        }
        return;
      }

      const relativeFile = publicFiles.get(pathname);
      if (!relativeFile || (request.method !== "GET" && request.method !== "HEAD")) {
        sendJSON(response, 404, { error: "Not found" });
        return;
      }
      const absoluteFile = path.join(rootDirectory, relativeFile);
      const body = await readFile(absoluteFile);
      const type = contentTypes.get(path.extname(relativeFile)) || "application/octet-stream";
      send(response, 200, request.method === "HEAD" ? "" : body, type, "public, max-age=60");
    } catch (error) {
      const status = Number(error?.statusCode) || 500;
      sendJSON(response, status, { error: status === 413 ? "Payload too large" : "Internal server error" });
    }
  });
}

export function startLiveVoiceServer({
  host = process.env.HOST || "127.0.0.1",
  port = Number(process.env.PORT || 4180),
} = {}) {
  const server = createLiveVoiceServer();
  server.listen(port, host, () => {
    console.log(`Sky live voice server listening on http://${host}:${port}`);
  });
  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  startLiveVoiceServer();
}
