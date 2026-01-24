import { loadEnv } from "./utils/env.js";
import { startServer } from "./api/server.js";
import { logger } from "./utils/logger.js";
import { memoryMonitor } from "./utils/memory-monitor.js";

loadEnv();

const main = async () => {
  try {
    // Iniciar monitor de memoria (solo en producción o si está habilitado)
    const enableMonitor = process.env.NODE_ENV === "production" || process.env.ENABLE_MEMORY_MONITOR === "true";
    if (enableMonitor) {
      memoryMonitor.start();
    }
    
    await startServer();
  } catch (err) {
    logger.error({ err }, "Fallo al iniciar servidor");
    process.exit(1);
  }
};

void main();

