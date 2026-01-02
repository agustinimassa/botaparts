import dotenv from "dotenv";
import { startServer } from "./api/server.js";
import { logger } from "./utils/logger.js";

dotenv.config();

const main = async () => {
  try {
    await startServer();
  } catch (err) {
    logger.error({ err }, "Fallo al iniciar servidor");
    process.exit(1);
  }
};

void main();

