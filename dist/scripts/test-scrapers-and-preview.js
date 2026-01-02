import { scrapeRemaxRD } from "../scrapers/remaxrd.js";
import { scrapeC21Sunsets } from "../scrapers/c21sunsets.js";
import fs from "fs";
import path from "path";
import { renderHtml } from "../notifications/email/index.js";
// Configuración de prueba
const testConfig = {
    id: "test",
    siteKey: "remaxrd",
    url: "https://remaxrd.com/propiedades?businessTypes=sale&currencyType=us&locations[]=id-440%26description-BAYAHIBE%26&typeProperty[]=apartment&ciudad=BAYAHIBE",
    active: true,
    maxPages: 2,
};
const testFilters = {
    maxPriceUSD: 500000,
    city: "Bayahibe",
};
async function testScrapers() {
    console.log("🧪 Iniciando pruebas de scrapers...\n");
    // Probar RE/MAX RD
    console.log("📊 Probando RE/MAX RD...");
    try {
        const remaxListings = await scrapeRemaxRD(testConfig, testFilters);
        console.log(`✅ RE/MAX RD: ${remaxListings.length} propiedades encontradas`);
        if (remaxListings.length > 0) {
            console.log(`   Ejemplo: ${remaxListings[0].title} - $${remaxListings[0].priceUSD}`);
        }
    }
    catch (err) {
        console.error("❌ Error en RE/MAX RD:", err);
    }
    // Probar C21 Sunsets
    console.log("\n📊 Probando C21 Sunsets...");
    const c21Config = {
        ...testConfig,
        siteKey: "c21sunsets",
        url: "https://c21sunsets.com/es/s/bayahibe-la-altagracia",
    };
    try {
        const c21Listings = await scrapeC21Sunsets(c21Config, testFilters);
        console.log(`✅ C21 Sunsets: ${c21Listings.length} propiedades encontradas`);
        if (c21Listings.length > 0) {
            console.log(`   Ejemplo: ${c21Listings[0].title} - $${c21Listings[0].priceUSD || "Consultar"}`);
        }
    }
    catch (err) {
        console.error("❌ Error en C21 Sunsets:", err);
    }
    // Combinar resultados y generar preview
    console.log("\n📧 Generando preview del email...");
    try {
        const remaxListings = await scrapeRemaxRD(testConfig, testFilters);
        const c21Listings = await scrapeC21Sunsets(c21Config, testFilters);
        const allListings = [...remaxListings, ...c21Listings].slice(0, 10); // Limitar a 10 para preview
        if (allListings.length === 0) {
            console.log("⚠️  No se encontraron propiedades para generar preview");
            return;
        }
        // Generar HTML del email
        const emailHtml = renderHtml(allListings);
        // Guardar preview
        const previewPath = path.resolve("storage", "email-preview.html");
        await fs.promises.mkdir(path.dirname(previewPath), { recursive: true });
        await fs.promises.writeFile(previewPath, emailHtml);
        console.log(`✅ Preview generado: ${previewPath}`);
        console.log(`📊 Total de propiedades en preview: ${allListings.length}`);
        console.log(`\n💡 Abre el archivo en tu navegador para ver cómo se verá el email`);
        // También generar un resumen JSON
        const summaryPath = path.resolve("storage", "scraping-summary.json");
        await fs.promises.writeFile(summaryPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            remaxrd: {
                count: remaxListings.length,
                listings: remaxListings.slice(0, 3),
            },
            c21sunsets: {
                count: c21Listings.length,
                listings: c21Listings.slice(0, 3),
            },
            preview: {
                totalInPreview: allListings.length,
                previewPath,
            },
        }, null, 2));
        console.log(`📄 Resumen guardado: ${summaryPath}`);
    }
    catch (err) {
        console.error("❌ Error al generar preview:", err);
    }
}
testScrapers().catch((err) => {
    console.error("Error fatal:", err);
    process.exit(1);
});
