import { loadEnv } from "../utils/env.js";
import { scrapeRemaxRD } from "../scrapers/remaxrd.js";
import { scrapeC21Sunsets } from "../scrapers/c21sunsets.js";
import { applyFilters } from "../filters/applyFilters.js";
import { loadExcelConfig } from "../config/excel.js";
import fs from "fs";
import path from "path";
import { renderEmailCompact, renderHtmlFromJson } from "../notifications/email/index.js";
import { analyzeMarketWithAi } from "../ai/market.js";

// Cargar variables de entorno (.env y .env.local)
loadEnv();

async function testScrapers() {
  const startTime = Date.now();
  console.log("🧪 Iniciando pruebas de scrapers...\n");
  
  // Cargar configuración desde Excel (igual que run-site.ts)
  console.log("📥 Cargando configuración desde Excel...");
  let config;
  try {
    config = await loadExcelConfig();
    console.log("✅ Configuración cargada exitosamente\n");
  } catch (error: any) {
    console.error("❌ Error al cargar configuración del Excel:", error.message);
    console.error("\n💡 Asegúrate de tener configurado:");
    console.error("   - Variable GOOGLE_SHEET_URL (recomendado), O");
    console.error("   - GOOGLE_DRIVE_FILE_ID + credenciales de Google Drive");
    process.exit(1);
  }
  
  // Usar solo las fuentes activas del Excel
  const activeSources = config.sources.filter(s => s.active);
  if (activeSources.length === 0) {
    console.error("❌ No hay fuentes activas en el Excel");
    process.exit(1);
  }
  
  // Mostrar configuración inicial desde Excel
  console.log("📋 Configuración utilizada (desde Excel):");
  console.log("   Fuentes activas:");
  activeSources.forEach(source => {
    console.log(`     - ${source.siteKey}: ${source.url}`);
    console.log(`       Max páginas: ${source.maxPages || 5}`);
  });
  console.log("   Filtros aplicados:");
  console.log(`     - Precio máximo: ${config.filters.maxPriceUSD ? '$' + config.filters.maxPriceUSD.toLocaleString() + ' USD' : 'N/A'}`);
  console.log(`     - Precio mínimo: ${config.filters.minPriceUSD ? '$' + config.filters.minPriceUSD.toLocaleString() + ' USD' : 'N/A'}`);
  console.log(`     - Ciudad: ${config.filters.city || 'N/A'}`);
  console.log(`     - Dormitorios mínimos: ${config.filters.minBeds || 'N/A'}`);
  console.log(`     - Baños mínimos: ${config.filters.minBaths || 'N/A'}`);
  console.log("");

  // Probar cada fuente activa del Excel
  const allScrapedListings: any[] = [];
  const sourceResults: Record<string, { scraped: number; filtered: number }> = {};
  
  for (const source of activeSources) {
    console.log(`📊 Probando ${source.siteKey}...`);
    try {
      let scraped: any[] = [];
      
      if (source.siteKey === "remaxrd") {
        scraped = await scrapeRemaxRD(source, config.filters);
      } else if (source.siteKey === "c21sunsets") {
        scraped = await scrapeC21Sunsets(source, config.filters);
      } else {
        console.warn(`⚠️  No hay scraper para ${source.siteKey}, saltando...`);
        continue;
      }
      
      // Guardar propiedades scrapeadas (sin filtrar aún)
      allScrapedListings.push(...scraped);
      sourceResults[source.siteKey] = {
        scraped: scraped.length,
        filtered: 0, // Se calculará después de aplicar filtros
      };
      
      console.log(`✅ ${source.siteKey}: ${scraped.length} propiedades encontradas`);
      if (scraped.length > 0) {
        console.log(`   Ejemplo: ${scraped[0].title} - $${scraped[0].priceUSD || "Consultar"}`);
      }
    } catch (err: any) {
      console.error(`❌ Error en ${source.siteKey}:`, err.message);
      sourceResults[source.siteKey] = {
        scraped: 0,
        filtered: 0,
      };
    }
  }
  
  // Aplicar filtros del Excel a todas las propiedades combinadas (solo una vez)
  console.log(`\n🔍 Aplicando filtros del Excel a ${allScrapedListings.length} propiedades encontradas...`);
  const allListings = applyFilters(allScrapedListings, config.filters);
  
  // Actualizar resultados filtrados por fuente
  Object.keys(sourceResults).forEach(siteKey => {
    const siteListings = allListings.filter(l => l.siteKey === siteKey);
    sourceResults[siteKey].filtered = siteListings.length;
  });
  
  console.log(`✅ Después de aplicar filtros: ${allListings.length} propiedades (${allScrapedListings.length - allListings.length} filtradas)`);

  // Generar preview con las propiedades ya scrapeadas y filtradas
  console.log("\n📧 Generando preview del email...");
  try {

    if (allListings.length === 0) {
      console.log("⚠️  No se encontraron propiedades para generar preview");
      return;
    }

    let webPreviewPath: string | null = null;
    let emailPreviewPath: string | null = null;

    // (Opcional) Análisis con AI para destacar oportunidades/outliers en el HTML
    const aiEnabled = process.env.AI_ANALYSIS_ENABLED !== "false" && !!process.env.GROQ_API_KEY;
    let aiSummary: string | null = null;
    let aiByKey: Record<string, any> = {};
    if (aiEnabled) {
      console.log("✨ Ejecutando análisis de mercado con AI (Groq)...");
      try {
        const analysis = await analyzeMarketWithAi(allListings as any);
        aiSummary = analysis.summary;
        aiByKey = analysis.byKey || {};

        const aiOutPath = path.resolve("storage", "ai-market-analysis.json");
        await fs.promises.mkdir(path.dirname(aiOutPath), { recursive: true });
        await fs.promises.writeFile(aiOutPath, JSON.stringify(analysis, null, 2));
        console.log(`✅ AI analysis guardado: ${aiOutPath}`);
      } catch (err: any) {
        console.warn("⚠️  Falló el análisis AI (se continúa sin AI):", err?.message ?? err);
      }
    } else {
      console.log("ℹ️  AI deshabilitado (setea GROQ_API_KEY y AI_ANALYSIS_ENABLED!=false para activarlo)");
    }

    const listingsWithAi = allListings.map((l: any) => {
      const key = `${l.siteKey}:${l.listingId}`;
      const ai = aiByKey[key];
      return ai ? { ...l, ai } : l;
    });

    // Agrupar propiedades por sitio para estadísticas
    const listingsBySite: Record<string, typeof allListings> = {};
    listingsWithAi.forEach((listing) => {
      if (!listingsBySite[listing.siteKey]) {
        listingsBySite[listing.siteKey] = [];
      }
      listingsBySite[listing.siteKey].push(listing);
    });

    const getSiteName = (siteKey: string): string => {
      const siteNames: Record<string, string> = {
        remaxrd: "RE/MAX RD",
        c21sunsets: "Century 21 Sunsets",
      };
      return siteNames[siteKey.toLowerCase()] || siteKey.toUpperCase();
    };

    const siteStats = Object.keys(listingsBySite).map((siteKey) => ({
      siteKey,
      siteName: getSiteName(siteKey),
      count: listingsBySite[siteKey].length,
    }));

    // Guardar datos raw en JSON (esto es lo que se actualiza cuando hay nuevos datos)
    const dataPath = path.resolve("storage", "properties-data.json");
    await fs.promises.writeFile(
      dataPath,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        aiSummary,
        listings: listingsWithAi,
        stats: {
          total: listingsWithAi.length,
          bySite: siteStats.reduce((acc, stat) => {
            acc[stat.siteKey] = stat.count;
            return acc;
          }, {} as Record<string, number>),
        },
      }, null, 2)
    );
    console.log(`✅ Datos guardados en JSON: ${dataPath}`);

    // Generar 2 previews:
    // - Web (grande, interactivo) => web-preview.html (para publicar luego como página)
    // - Email (compacto)          => email-preview.html

    const webHtml = renderHtmlFromJson();
    webPreviewPath = path.resolve("storage", "web-preview.html");
    await fs.promises.mkdir(path.dirname(webPreviewPath), { recursive: true });
    await fs.promises.writeFile(webPreviewPath, webHtml);

    const emailHtml = renderEmailCompact(listingsWithAi as any, aiSummary);
    emailPreviewPath = path.resolve("storage", "email-preview.html");
    await fs.promises.mkdir(path.dirname(emailPreviewPath), { recursive: true });
    await fs.promises.writeFile(emailPreviewPath, emailHtml);

    console.log(`✅ Preview WEB generado: ${webPreviewPath}`);
    console.log(`✅ Preview EMAIL generado: ${emailPreviewPath}`);
    console.log(`📊 Total de propiedades en preview: ${listingsWithAi.length}`);
    console.log(`\n💡 Web: abre web-preview.html (interactivo) • Email: abre email-preview.html (compacto)`);

    // También generar un resumen JSON
    const summaryPath = path.resolve("storage", "scraping-summary.json");
    const summaryData: Record<string, any> = {
      timestamp: new Date().toISOString(),
      preview: {
        totalInPreview: allListings.length,
        previewPath: emailPreviewPath,
      },
    };
    
    // Agregar resultados por fuente
    Object.keys(sourceResults).forEach(siteKey => {
      const results = sourceResults[siteKey];
      const siteListings = allListings.filter(l => l.siteKey === siteKey);
      summaryData[siteKey] = {
        scraped: results.scraped,
        filtered: results.filtered,
        listings: siteListings.slice(0, 3),
      };
    });
    
    await fs.promises.writeFile(
      summaryPath,
      JSON.stringify(summaryData, null, 2),
    );
    console.log(`📄 Resumen guardado: ${summaryPath}`);
    
    // Log final con resumen completo
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log("\n" + "=".repeat(60));
    console.log("📊 RESUMEN FINAL DE LA EJECUCIÓN");
    console.log("=".repeat(60));
    console.log(`⏱️  Duración total: ${duration}s`);
    console.log("\n📋 Configuración utilizada (desde Excel):");
    console.log("   Fuentes activas:");
    activeSources.forEach(source => {
      const results = sourceResults[source.siteKey] || { scraped: 0, filtered: 0 };
      console.log(`     - ${source.siteKey}: ${results.scraped} encontradas, ${results.filtered} después de filtros`);
    });
    console.log("   Filtros aplicados:");
    console.log(`     - Precio máximo: ${config.filters.maxPriceUSD ? '$' + config.filters.maxPriceUSD.toLocaleString() + ' USD' : 'N/A'}`);
    console.log(`     - Precio mínimo: ${config.filters.minPriceUSD ? '$' + config.filters.minPriceUSD.toLocaleString() + ' USD' : 'N/A'}`);
    console.log(`     - Ciudad: ${config.filters.city || 'N/A'}`);
    console.log(`     - Dormitorios mínimos: ${config.filters.minBeds || 'N/A'}`);
    console.log(`     - Baños mínimos: ${config.filters.minBaths || 'N/A'}`);
    console.log("\n📈 Resultados:");
    const totalScraped = Object.values(sourceResults).reduce((sum, r) => sum + r.scraped, 0);
    const totalFiltered = allListings.length;
    console.log(`     - Total antes de filtros: ${totalScraped} propiedades`);
    console.log(`     - Total después de filtros: ${totalFiltered} propiedades`);
    console.log(`     - Propiedades filtradas: ${totalScraped - totalFiltered}`);
    console.log(`     - Preview EMAIL: ${emailPreviewPath ?? "N/D"}`);
    console.log(`     - Preview WEB: ${webPreviewPath ?? "N/D"}`);
    console.log("=".repeat(60) + "\n");
  } catch (err) {
    console.error("❌ Error al generar preview:", err);
    
    // Log final incluso en caso de error
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log("\n" + "=".repeat(60));
    console.log("❌ EJECUCIÓN FINALIZADA CON ERRORES");
    console.log("=".repeat(60));
    console.log(`⏱️  Duración: ${duration}s`);
    console.log(`📋 Configuración utilizada (desde Excel):`);
    console.log(`   Filtros: ${JSON.stringify(config.filters, null, 2)}`);
    console.log("=".repeat(60) + "\n");
  }
}

testScrapers().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});

