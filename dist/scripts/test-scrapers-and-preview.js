import { scrapeRemaxRD } from "../scrapers/remaxrd.js";
import { scrapeC21Sunsets } from "../scrapers/c21sunsets.js";
import fs from "fs";
import path from "path";
import { renderHtmlFromJson } from "../notifications/email/index.js";
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
        // Usar todas las propiedades encontradas para el preview (sin límite)
        const allListings = [...remaxListings, ...c21Listings];
        if (allListings.length === 0) {
            console.log("⚠️  No se encontraron propiedades para generar preview");
            return;
        }
        // Agrupar propiedades por sitio para estadísticas
        const listingsBySite = {};
        allListings.forEach((listing) => {
            if (!listingsBySite[listing.siteKey]) {
                listingsBySite[listing.siteKey] = [];
            }
            listingsBySite[listing.siteKey].push(listing);
        });
        const getSiteName = (siteKey) => {
            const siteNames = {
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
        await fs.promises.writeFile(dataPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            listings: allListings,
            stats: {
                total: allListings.length,
                bySite: siteStats.reduce((acc, stat) => {
                    acc[stat.siteKey] = stat.count;
                    return acc;
                }, {}),
            },
        }, null, 2));
        console.log(`✅ Datos guardados en JSON: ${dataPath}`);
        // Generar HTML estático que cargará el JSON dinámicamente
        const emailHtml = renderHtmlFromJson();
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
