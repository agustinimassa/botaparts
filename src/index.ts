import { loadEnv } from "./utils/env.js";
import { startServer } from "./api/server.js";
import { logger } from "./utils/logger.js";

loadEnv();

const main = async () => {
  try {
    await startServer();
  } catch (err) {
    logger.error({ err }, "Fallo al iniciar servidor");
    process.exit(1);
  }
};

void main();

