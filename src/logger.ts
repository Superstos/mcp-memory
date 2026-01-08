export type LogLevel = "debug" | "info" | "warn" | "error";

type LogFn = (message: string, meta?: Record<string, unknown>) => void;

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

export function createLogger(level: LogLevel): Record<LogLevel, LogFn> {
  const threshold = levelOrder[level] ?? levelOrder.info;

  const log: Record<LogLevel, LogFn> = {
    debug: (message, meta) => write("debug", message, meta),
    info: (message, meta) => write("info", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    error: (message, meta) => write("error", message, meta)
  };

  function write(lvl: LogLevel, message: string, meta?: Record<string, unknown>) {
    if (levelOrder[lvl] < threshold) return;
    const payload = {
      ts: new Date().toISOString(),
      level: lvl,
      message,
      ...(meta ? { meta } : {})
    };
    const line = JSON.stringify(payload);
    if (lvl === "error") {
      console.error(line);
    } else {
      console.log(line);
    }
  }

  return log;
}
