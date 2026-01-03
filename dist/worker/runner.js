import { applyFilters } from "../filters/applyFilters.js";
import { appendSent, filterNewListings } from "../dedup/store.js";
import { sendEmailSummary } from "../notifications/email/index.js";
import { sendWhatsappSummary } from "../notifications/whatsapp/index.js";
import { logger } from "../utils/logger.js";
import { scrapeRemaxRD } from "../scrapers/remaxrd.js";
import { scrapeC21Sunsets } from "../scrapers/c21sunsets.js";
import { analyzeMarketWithAi } from "../ai/market.js";
const registry = {
    remaxrd: scrapeRemaxRD,
    c21sunsets: scrapeC21Sunsets,
};
export const runJob = async (config) => {
    const startTime = Date.now();
    // Log inicial (solo debug para evitar overhead en prod)
    logger.debug({
        sources: config.sources.map((s) => ({
            siteKey: s.siteKey,
            maxPages: s.maxPages,
            active: s.active,
        })),
        filters: config.filters,
        notifications: {
            emails: config.notifications.emails?.length || 0,
            whatsappNumbers: config.notifications.whatsappNumbers?.length || 0,
        },
    }, "Iniciando job de scraping");
    const all = [];
    const sourceResults = {};
    for (const source of config.sources) {
        const scraper = registry[source.siteKey];
        if (!scraper) {
            logger.warn({ siteKey: source.siteKey }, "No hay scraper para este siteKey");
            continue;
        }
        const result = await scraper(source, config.filters);
        all.push(...result);
        sourceResults[source.siteKey] = result.length;
    }
    const filtered = applyFilters(all, config.filters);
    const fresh = filterNewListings(filtered);
    if (!fresh.length) {
        logger.debug({
            totalScraped: all.length,
            afterFilters: filtered.length,
            afterDedup: fresh.length,
            duration: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
        }, "Job completado: sin nuevos resultados");
        return [];
    }
    // (Opcional) Enriquecer con AI antes de enviar
    const aiEnabled = process.env.AI_ANALYSIS_ENABLED !== "false" && !!process.env.GROQ_API_KEY;
    let aiSummary = null;
    let freshWithAi = fresh;
    if (aiEnabled) {
        try {
            const analysis = await analyzeMarketWithAi(fresh);
            aiSummary = analysis.summary;
            const byKey = analysis.byKey || {};
            freshWithAi = fresh.map((l) => {
                const key = `${l.siteKey}:${l.listingId}`;
                const ai = byKey[key];
                return ai ? { ...l, ai } : l;
            });
        }
        catch (err) {
            logger.warn({ err }, "Falló análisis AI (se continúa sin AI)");
        }
    }
    await sendEmailSummary(config.notifications.emails || [], config.notifications.subjectTemplate || "Nuevas propiedades", freshWithAi, { aiSummary });
    await sendWhatsappSummary(config.notifications.whatsappNumbers || [], freshWithAi);
    appendSent(freshWithAi);
    // Log final (solo debug)
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.debug({
        duration: `${duration}s`,
        sources: sourceResults,
        listings: {
            scraped: all.length,
            afterFilters: filtered.length,
            afterDedup: fresh.length,
        },
    }, "Job completado");
    return freshWithAi;
};
