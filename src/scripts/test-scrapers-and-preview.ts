import { loadEnv } from "../utils/env.js";
import { runScrapeAndBuildPreviews } from "../worker/scrape-preview.js";

// Cargar variables de entorno (.env y .env.local)
loadEnv();

async function testScrapers() {
  console.log("🧪 Ejecutando scraping + previews (modo test)...");
  const res = await runScrapeAndBuildPreviews();
  console.log("✅ Completado", {
    timestamp: res.timestamp,
    total: res.stats.total,
    bySite: res.stats.bySite,
    web: res.paths.webPreview,
    email: res.paths.emailPreview,
  });
}

testScrapers().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});

