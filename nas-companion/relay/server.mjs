import { createHash, timingSafeEqual } from "node:crypto";
import http from "node:http";
import { fileURLToPath } from "node:url";

const ENDPOINTS = [
  "https://translate.googleapis.com/translate_a/single",
  "https://translate.google.com/translate_a/single"
];

function tokenMatches(actual, expected) {
  const left = createHash("sha256").update(actual).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

async function translate(fetchImpl, text, source, target) {
  const failures = [];
  for (const endpoint of ENDPOINTS) {
    const url = new URL(endpoint);
    url.search = new URLSearchParams({ client: "gtx", dt: "t", sl: source, tl: target, q: text });
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload?.[0])) throw new Error("unexpected response");
      return payload[0].map((part) => part?.[0] || "").join("");
    } catch (error) {
      failures.push(`${url.hostname}: ${error?.cause?.code || error?.message || String(error)}`);
    }
  }
  throw new Error(`upstream translation failed (${failures.join("; ")})`);
}

export function createRelayServer(options = {}) {
  const token = options.token || process.env.RELAY_TOKEN || "";
  if (token.length < 32) throw new Error("RELAY_TOKEN must contain at least 32 characters");
  const fetchImpl = options.fetchImpl || fetch;
  const maxBodyBytes = Number(options.maxBodyBytes || process.env.MAX_BODY_BYTES || 65_536);
  const maxRequestsPerMinute = Number(options.maxRequestsPerMinute || process.env.MAX_REQUESTS_PER_MINUTE || 120);
  const windows = new Map();

  return http.createServer((request, response) => {
    response.setHeader("cache-control", "no-store");
    response.setHeader("content-type", "application/json; charset=utf-8");
    if (request.method === "GET" && request.url === "/health") {
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    if (request.method !== "POST" || request.url !== "/v1/translate") {
      response.writeHead(404).end(JSON.stringify({ error: "not found" }));
      return;
    }
    const supplied = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!tokenMatches(supplied, token)) {
      response.writeHead(401).end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    const client = String(request.headers["x-forwarded-for"] || request.socket.remoteAddress || "unknown").split(",")[0].trim();
    const now = Date.now();
    const window = windows.get(client);
    if (!window || now - window.startedAt >= 60_000) windows.set(client, { startedAt: now, requests: 1 });
    else if (++window.requests > maxRequestsPerMinute) {
      response.writeHead(429).end(JSON.stringify({ error: "rate limit exceeded" }));
      return;
    }

    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) request.destroy(new Error("request body too large"));
      else chunks.push(chunk);
    });
    request.on("error", () => {
      if (!response.headersSent) response.writeHead(413).end(JSON.stringify({ error: "request body too large" }));
    });
    request.on("end", async () => {
      try {
        const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        const text = typeof payload.text === "string" ? payload.text : "";
        const source = typeof payload.source === "string" && /^[a-z-]{2,12}$/i.test(payload.source) ? payload.source : "en";
        const target = typeof payload.target === "string" && /^[a-z-]{2,12}$/i.test(payload.target) ? payload.target : "zh-CN";
        if (!text || text.length > 10_000) throw new Error("text must contain 1-10000 characters");
        const translation = await translate(fetchImpl, text, source, target);
        response.end(JSON.stringify({ translation }));
      } catch (error) {
        if (!response.headersSent) response.writeHead(502).end(JSON.stringify({ error: error.message }));
      }
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createRelayServer();
  server.listen(Number(process.env.PORT || 3000), "0.0.0.0", () => console.log(JSON.stringify({ event: "relay-ready" })));
}
