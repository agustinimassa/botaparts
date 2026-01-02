import { applyFilters } from "../filters/applyFilters.js";
import { appendSent, filterNewListings } from "../dedup/store.js";
import { sendEmailSummary } from "../notifications/email/index.js";
import { sendWhatsappSummary } from "../notifications/whatsapp/index.js";
import { logger } from "../utils/logger.js";
import { scrapeRemaxRD } from "../scrapers/remaxrd.js";
import { scrapeC21Sunsets } from "../scrapers/c21sunsets.js";
const registry = {
    remaxrd: scrapeRemaxRD,
    c21sunsets: scrapeC21Sunsets,
};
export const runJob = async (config) => {
    const all = [];
    for (const source of config.sources) {
        const scraper = registry[source.siteKey];
        if (!scraper) {
            logger.warn({ siteKey: source.siteKey }, "No hay scraper para este siteKey");
            continue;
        }
        const result = await scraper(source, config.filters);
        all.push(...result);
    }
    const filtered = applyFilters(all, config.filters);
    const fresh = filterNewListings(filtered);
    if (!fresh.length) {
        logger.info("Sin nuevos resultados");
        return [];
    }
    await sendEmailSummary(config.notifications.emails || [], config.notifications.subjectTemplate || "Nuevas propiedades", fresh);
    await sendWhatsappSummary(config.notifications.whatsappNumbers || [], fresh);
    appendSent(fresh);
    logger.info({ nuevos: fresh.length }, "Notificaciones enviadas");
    return fresh;
};
