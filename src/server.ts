import http, { IncomingMessage, ServerResponse } from "node:http";
import { createMcpHandler } from "./mcp.js";
import { createLogger } from "./logger.js";
import { createPool, detectDbInfo } from "./db.js";
import { createStore } from "./store.js";
import { Config } from "./config.js";

interface RateLimiter {
  allow(ip: string): boolean;
}

export async function startServer(config: Config) {
  const logger = createLogger(config.logLevel);
  const pool = createPool(config.databaseUrl);

  const dbInfo = await detectDbInfo(pool);
  const vectorEnabled = config.enablePgvector && dbInfo.vectorExtension && dbInfo.embeddingColumn;

  const store = createStore(pool, {
    maxContentChars: config.maxContentChars,
    maxTitleChars: config.maxTitleChars,
    maxRawChars: config.maxRawChars,
    storeRawPlaintext: config.storeRawPlaintext,
    vectorEnabled
  });

  const mcp = createMcpHandler({
    store,
    serverInfo: { name: "emergant-memory", version: "0.1.0" },
    vectorEnabled
  });

  const limiter = createRateLimiter(config.rateLimitMax, config.rateLimitWindowMs);

  const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      setSecurityHeaders(res, config.allowOrigin);

      if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.end();
        return;
      }

      const path = getPath(req.url);

      if (req.method === "GET" && path === "/health") {
        respondJson(res, 200, { status: "ok", vectorEnabled });
        return;
      }

      if (req.method === "GET" && path === "/") {
        respondJson(res, 200, {
          name: "emergant-memory",
          version: "0.1.0",
          endpoints: ["/mcp", "/health"]
        });
        return;
      }

      const isMcpPath = path === "/mcp" || path === "/";
      if (req.method !== "POST" || !isMcpPath) {
        respondJson(res, 404, { error: "not found" });
        return;
      }

      if (!isAuthorized(req, config.apiKey)) {
        respondJson(res, 401, { error: "unauthorized" });
        return;
      }

      const ip = getClientIp(req);
      if (!limiter.allow(ip)) {
        respondJson(res, 429, { error: "rate limit exceeded" });
        return;
      }

      const payload = await readJson(req, config.maxBodyBytes);
      const result = await mcp.handleJsonRpc(payload);
      if (result === null) {
        res.statusCode = 204;
        res.end();
        return;
      }

      respondJson(res, 200, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "internal error";
      logger.error("request failed", { message });
      respondJson(res, 500, { error: message });
    }
  });

  server.listen(config.port, () => {
    logger.info("server listening", { port: config.port, vectorEnabled });
  });
}

function setSecurityHeaders(res: ServerResponse, allowOrigin: string) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-API-Key");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function isAuthorized(req: IncomingMessage, apiKey?: string): boolean {
  if (!apiKey) return true;
  const auth = req.headers.authorization?.trim();
  if (auth && auth.startsWith("Bearer ")) {
    return auth.slice("Bearer ".length) === apiKey;
  }
  const headerKey = req.headers["x-api-key"];
  if (typeof headerKey === "string") {
    return headerKey === apiKey;
  }
  return false;
}

function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}

function createRateLimiter(max: number, windowMs: number): RateLimiter {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return {
    allow(ip: string) {
      const now = Date.now();
      const entry = hits.get(ip);
      if (!entry || entry.resetAt <= now) {
        hits.set(ip, { count: 1, resetAt: now + windowMs });
        return true;
      }
      if (entry.count >= max) {
        return false;
      }
      entry.count += 1;
      return true;
    }
  };
}

function getPath(url?: string): string {
  if (!url) return "/";
  const queryIndex = url.indexOf("?");
  return queryIndex >= 0 ? url.slice(0, queryIndex) : url;
}

async function readJson(req: IncomingMessage, maxBytes: number): Promise<any> {
  const chunks: Buffer[] = [];
  let total = 0;

  return new Promise((resolve, reject) => {
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("invalid json"));
      }
    });
    req.on("error", reject);
  });
}

function respondJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.end(JSON.stringify(payload));
}
