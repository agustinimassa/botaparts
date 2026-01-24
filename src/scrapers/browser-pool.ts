import { chromium, Browser, BrowserContext } from "playwright";
import { logger } from "../utils/logger.js";

/**
 * Pool de navegador compartido para reducir consumo de memoria
 * En lugar de crear un navegador por scraper, reutilizamos uno solo
 */
class BrowserPool {
  private browser: Browser | null = null;
  private contexts: Set<BrowserContext> = new Set();
  private isShuttingDown = false;

  /**
   * Obtener o crear navegador compartido con optimizaciones de memoria
   */
  async getBrowser(): Promise<Browser> {
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }

    const headless = process.env.PLAYWRIGHT_HEADLESS !== "false";
    const useSingleProcess = process.env.CHROMIUM_SINGLE_PROCESS === "true";

    logger.debug("Iniciando navegador compartido con optimizaciones de memoria...");

    // Args base (siempre aplicados)
    const baseArgs = [
      // CRÍTICO: Optimizaciones de memoria
      "--disable-dev-shm-usage", // Usar /tmp en lugar de /dev/shm
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-breakpad",
      "--disable-component-extensions-with-background-pages",
      "--disable-features=TranslateUI,BlinkGenPropertyTrees",
      "--disable-ipc-flooding-protection",
      "--disable-renderer-backgrounding",
      "--metrics-recording-only",
      "--mute-audio",
      "--disable-webgl",
      "--disable-accelerated-video-decode",
    ];

    // Args opcionales (solo si está habilitado)
    const optionalArgs = [];
    if (useSingleProcess) {
      logger.warn("⚠️ Usando --single-process (ahorra ~200MB pero puede ser inestable)");
      optionalArgs.push("--single-process");
      optionalArgs.push("--no-zygote");
      optionalArgs.push("--disable-site-isolation-trials");
      // Límite de memoria solo con single-process
      optionalArgs.push("--js-flags=--max-old-space-size=256");
    }

    this.browser = await chromium.launch({
      headless,
      timeout: 60000,
      args: [...baseArgs, ...optionalArgs],
    });

    // Manejar cierre inesperado del navegador
    this.browser.on('disconnected', () => {
      logger.warn("⚠️ Navegador desconectado inesperadamente");
      this.browser = null;
    });

    logger.info({
      singleProcess: useSingleProcess,
      headless,
    }, "✅ Navegador compartido iniciado correctamente");

    return this.browser;
  }

  /**
   * Crear un nuevo contexto de navegación (ligero, ~10-20MB)
   * Bloquea recursos pesados para ahorrar memoria
   */
  async createContext(options: {
    blockImages?: boolean;
    blockStyles?: boolean;
    blockFonts?: boolean;
    userAgent?: string;
  } = {}): Promise<BrowserContext> {
    try {
      const browser = await this.getBrowser();

      const {
        blockImages = true, // Por defecto bloquear imágenes
        blockStyles = true, // Por defecto bloquear CSS
        blockFonts = true, // Por defecto bloquear fuentes
        userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      } = options;

      const context = await browser.newContext({
        userAgent,
        extraHTTPHeaders: {
          "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        },
        // Limitar viewport para reducir rendering
        viewport: { width: 1280, height: 720 },
        // Aumentar timeout para operaciones lentas
        timeout: 30000,
      });

      // Manejar cierre inesperado del contexto
      context.on('close', () => {
        this.contexts.delete(context);
        logger.debug(`Contexto cerrado por evento (total activos: ${this.contexts.size})`);
      });

      // Bloquear recursos pesados para ahorrar ancho de banda y memoria
      if (blockImages || blockStyles || blockFonts) {
        await context.route("**/*", (route) => {
          try {
            const resourceType = route.request().resourceType();
            const blockedTypes: string[] = [];

            if (blockImages) blockedTypes.push("image", "media");
            if (blockStyles) blockedTypes.push("stylesheet");
            if (blockFonts) blockedTypes.push("font");

            if (blockedTypes.includes(resourceType)) {
              return route.abort();
            }
            return route.continue();
          } catch (err) {
            // Si hay error en la ruta, continuar de todas formas
            logger.debug({ err }, "Error en route handler, continuando");
            return route.continue().catch(() => { });
          }
        });
      }

      this.contexts.add(context);
      logger.debug(`Contexto creado (total activos: ${this.contexts.size})`);
      return context;
    } catch (err) {
      logger.error({ err }, "Error al crear contexto");
      throw err;
    }
  }

  /**
   * Cerrar un contexto específico
   */
  async closeContext(context: BrowserContext): Promise<void> {
    try {
      this.contexts.delete(context);
      await context.close();
      logger.debug(`Contexto cerrado (total activos: ${this.contexts.size})`);
    } catch (err) {
      logger.warn({ err }, "Error al cerrar contexto (ignorado)");
    }
  }

  /**
   * Cerrar navegador y todos los contextos
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    logger.debug("Cerrando navegador compartido...");

    // Cerrar todos los contextos
    const closePromises = Array.from(this.contexts).map((ctx) =>
      ctx.close().catch(() => { })
    );
    await Promise.all(closePromises);
    this.contexts.clear();

    // Cerrar navegador
    if (this.browser) {
      try {
        await this.browser.close();
        logger.info("✅ Navegador compartido cerrado correctamente");
      } catch (err) {
        logger.warn({ err }, "Error al cerrar navegador (ignorado)");
      }
      this.browser = null;
    }

    this.isShuttingDown = false;
  }

  /**
   * Obtener estadísticas de uso
   */
  getStats() {
    return {
      isActive: this.browser !== null && this.browser.isConnected(),
      activeContexts: this.contexts.size,
    };
  }
}

// Singleton global
export const browserPool = new BrowserPool();

/**
 * Limpiar al salir del proceso
 */
process.on("SIGINT", async () => {
  logger.info("SIGINT recibido, cerrando navegador...");
  await browserPool.shutdown();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("SIGTERM recibido, cerrando navegador...");
  await browserPool.shutdown();
  process.exit(0);
});
