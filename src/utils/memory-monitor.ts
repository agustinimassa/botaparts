import { logger } from "../utils/logger.js";

/**
 * Monitor de memoria que se ejecuta periódicamente
 * Útil para detectar memory leaks en producción
 */
class MemoryMonitor {
  private interval: NodeJS.Timeout | null = null;
  private checkIntervalMs: number;
  private warnThresholdMB: number;
  private errorThresholdMB: number;
  private lastWarning: number = 0;
  private lastError: number = 0;

  constructor(options: {
    checkIntervalMs?: number;
    warnThresholdMB?: number;
    errorThresholdMB?: number;
  } = {}) {
    this.checkIntervalMs = options.checkIntervalMs || 30000; // 30 segundos
    this.warnThresholdMB = options.warnThresholdMB || 350; // Advertir a 350MB
    this.errorThresholdMB = options.errorThresholdMB || 450; // Error a 450MB
  }

  /**
   * Iniciar monitoreo
   */
  start() {
    if (this.interval) {
      logger.warn("Monitor de memoria ya está activo");
      return;
    }

    logger.info({
      checkInterval: `${this.checkIntervalMs / 1000}s`,
      warnThreshold: `${this.warnThresholdMB}MB`,
      errorThreshold: `${this.errorThresholdMB}MB`,
    }, "🔍 Monitor de memoria iniciado");

    this.interval = setInterval(() => {
      this.check();
    }, this.checkIntervalMs);

    // No bloquear el cierre del proceso
    this.interval.unref();
  }

  /**
   * Detener monitoreo
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      logger.info("Monitor de memoria detenido");
    }
  }

  /**
   * Verificar estado de memoria
   */
  check() {
    const used = process.memoryUsage();
    const rssMB = Math.round(used.rss / 1024 / 1024);
    const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(used.heapTotal / 1024 / 1024);
    const externalMB = Math.round(used.external / 1024 / 1024);
    const heapPercentage = Math.round((used.heapUsed / used.heapTotal) * 100);

    const memoryInfo = {
      rss: `${rssMB}MB`,
      heap: `${heapUsedMB}/${heapTotalMB}MB (${heapPercentage}%)`,
      external: `${externalMB}MB`,
    };

    // Verificar umbrales
    const now = Date.now();
    
    if (rssMB >= this.errorThresholdMB) {
      // ERROR: memoria muy alta
      if (now - this.lastError > 60000) { // Solo loggear cada minuto
        logger.error(memoryInfo, "🔴 MEMORIA CRÍTICA - considerar reinicio");
        this.lastError = now;
      }
      
      // Forzar garbage collection si está disponible
      if (global.gc) {
        logger.warn("Forzando garbage collection por memoria alta...");
        global.gc();
      }
    } else if (rssMB >= this.warnThresholdMB) {
      // WARN: memoria alta
      if (now - this.lastWarning > 120000) { // Solo loggear cada 2 minutos
        logger.warn(memoryInfo, "🟡 Memoria alta - monitoreando");
        this.lastWarning = now;
      }
    } else {
      // INFO: todo OK (solo en debug)
      logger.debug(memoryInfo, "💾 Memoria OK");
    }

    return memoryInfo;
  }

  /**
   * Obtener snapshot actual de memoria
   */
  snapshot() {
    const used = process.memoryUsage();
    return {
      rss: Math.round(used.rss / 1024 / 1024),
      heapUsed: Math.round(used.heapUsed / 1024 / 1024),
      heapTotal: Math.round(used.heapTotal / 1024 / 1024),
      external: Math.round(used.external / 1024 / 1024),
      heapPercentage: Math.round((used.heapUsed / used.heapTotal) * 100),
    };
  }
}

// Singleton global
export const memoryMonitor = new MemoryMonitor({
  checkIntervalMs: 30000, // Cada 30 segundos
  warnThresholdMB: 350, // Advertir a 350MB
  errorThresholdMB: 450, // Error a 450MB (dejar margen para 512MB)
});

/**
 * Función helper para loggear memoria actual
 */
export const logMemoryUsage = (label: string = "Memoria") => {
  const snapshot = memoryMonitor.snapshot();
  logger.debug({
    label,
    rss: `${snapshot.rss}MB`,
    heap: `${snapshot.heapUsed}/${snapshot.heapTotal}MB (${snapshot.heapPercentage}%)`,
    external: `${snapshot.external}MB`,
  }, "💾 Estado de memoria");
  return snapshot;
};
