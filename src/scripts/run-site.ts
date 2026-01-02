import { loadEnv } from "../utils/env.js";
import { loadExcelConfig } from "../config/excel.js";
import { runJob } from "../worker/runner.js";
import { logger } from "../utils/logger.js";

// Cargar variables de entorno (.env y .env.local)
loadEnv();

const run = async () => {
  const startTime = Date.now();
  
  try {
    logger.info("📥 Cargando configuración desde Excel...");
    const config = await loadExcelConfig();
    
    // Log de configuración cargada
    logger.info({
      sources: config.sources.map(s => ({
        id: s.id,
        siteKey: s.siteKey,
        url: s.url,
        maxPages: s.maxPages,
        active: s.active,
      })),
      filters: config.filters,
      notifications: {
        emails: config.notifications.emails?.length || 0,
        whatsappNumbers: config.notifications.whatsappNumbers?.length || 0,
        subjectTemplate: config.notifications.subjectTemplate,
      },
    }, "✅ Configuración cargada exitosamente");
    
    const results = await runJob(config);
    
    // Log final con resumen completo
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info({
      execution: {
        duration: `${duration}s`,
        timestamp: new Date().toISOString(),
      },
      configuration: {
        sources: config.sources.length,
        filters: config.filters,
        notifications: {
          emails: config.notifications.emails || [],
          whatsappNumbers: config.notifications.whatsappNumbers || [],
        },
      },
      results: {
        newListings: results.length,
      },
    }, "🎉 Script ejecutado exitosamente");
    
    console.log("\n" + "=".repeat(60));
    console.log("✅ EJECUCIÓN COMPLETADA");
    console.log("=".repeat(60));
    console.log(`⏱️  Duración: ${duration}s`);
    console.log(`📋 Fuentes procesadas: ${config.sources.length}`);
    console.log(`📊 Nuevas propiedades encontradas: ${results.length}`);
    console.log("=".repeat(60) + "\n");
    
  } catch (error: any) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.error({
      err: error,
      duration: `${duration}s`,
    }, "❌ Error durante la ejecución del script");
    
    console.log("\n" + "=".repeat(60));
    console.log("❌ EJECUCIÓN FINALIZADA CON ERRORES");
    console.log("=".repeat(60));
    console.log(`⏱️  Duración: ${duration}s`);
    console.log(`❌ Error: ${error.message || error}`);
    console.log("=".repeat(60) + "\n");
    
    throw error;
  }
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

