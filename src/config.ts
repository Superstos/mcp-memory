import { LogLevel } from "./logger.js";

export interface Config {
  port: number;
  databaseUrl: string;
  apiKey?: string;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  maxBodyBytes: number;
  maxContentChars: number;
  maxTitleChars: number;
  maxRawChars: number;
  storeRawPlaintext: boolean;
  enablePgvector: boolean;
  logLevel: LogLevel;
  allowOrigin: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = required(env.DATABASE_URL, "DATABASE_URL");

  return {
    port: parseNumber(env.PORT, 8080, "PORT"),
    databaseUrl,
    apiKey: env.MCP_API_KEY,
    rateLimitMax: parseNumber(env.RATE_LIMIT_MAX, 120, "RATE_LIMIT_MAX"),
    rateLimitWindowMs: parseNumber(env.RATE_LIMIT_WINDOW_MS, 60_000, "RATE_LIMIT_WINDOW_MS"),
    maxBodyBytes: parseNumber(env.MAX_BODY_BYTES, 1_048_576, "MAX_BODY_BYTES"),
    maxContentChars: parseNumber(env.MAX_CONTENT_CHARS, 4_000, "MAX_CONTENT_CHARS"),
    maxTitleChars: parseNumber(env.MAX_TITLE_CHARS, 200, "MAX_TITLE_CHARS"),
    maxRawChars: parseNumber(env.MAX_RAW_CHARS, 20_000, "MAX_RAW_CHARS"),
    storeRawPlaintext: env.STORE_RAW_PLAINTEXT === "true",
    enablePgvector: env.ENABLE_PGVECTOR === "true",
    logLevel: parseLogLevel(env.LOG_LEVEL),
    allowOrigin: env.ALLOW_ORIGIN ?? "*"
  };
}

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function parseNumber(value: string | undefined, fallback: number, name: string): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return parsed;
}

function parseLogLevel(value: string | undefined): LogLevel {
  switch ((value ?? "info").toLowerCase()) {
    case "debug":
      return "debug";
    case "info":
      return "info";
    case "warn":
      return "warn";
    case "error":
      return "error";
    default:
      throw new Error("LOG_LEVEL must be one of debug, info, warn, error");
  }
}
