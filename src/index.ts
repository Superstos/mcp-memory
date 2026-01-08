import { loadConfig } from "./config.js";
import { startServer } from "./server.js";

const config = loadConfig();

startServer(config).catch((err) => {
  const message = err instanceof Error ? err.message : "startup failed";
  console.error(message);
  process.exit(1);
});
