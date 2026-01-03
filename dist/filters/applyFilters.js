import { logger } from "../utils/logger.js";
export const applyFilters = (listings, filters) => {
    // `config/excel.ts` ya normaliza valores numéricos a number.
    const maxPrice = filters.maxPriceUSD;
    if (maxPrice && isNaN(maxPrice)) {
        logger.warn({ maxPriceUSD: filters.maxPriceUSD }, "maxPriceUSD no es un número válido, ignorando filtro");
    }
    // Log de propiedades que exceden el precio máximo (para debugging)
    const overPriceLimit = listings.filter(l => maxPrice && !isNaN(maxPrice) && l.priceUSD && l.priceUSD > maxPrice);
    if (overPriceLimit.length > 0 && maxPrice) {
        logger.info({
            maxPriceUSD: maxPrice,
            overLimit: overPriceLimit.length,
            examples: overPriceLimit.slice(0, 5).map(l => ({
                title: l.title,
                price: l.priceUSD,
                siteKey: l.siteKey,
            })),
        }, "⚠️  Propiedades que exceden el precio máximo (serán filtradas)");
    }
    const filtered = listings.filter((l) => {
        // Filtro de precio máximo
        if (maxPrice && !isNaN(maxPrice) && l.priceUSD) {
            if (l.priceUSD > maxPrice) {
                return false;
            }
        }
        // Filtro de precio mínimo (si existe)
        if (filters.minPriceUSD && l.priceUSD && l.priceUSD < filters.minPriceUSD) {
            return false;
        }
        // Filtro de ciudad
        if (filters.city && l.location && !l.location.toLowerCase().includes(filters.city.toLowerCase())) {
            return false;
        }
        // Filtro de dormitorios mínimos
        if (filters.minBeds && l.beds && l.beds < filters.minBeds) {
            return false;
        }
        // Filtro de baños mínimos
        if (filters.minBaths && l.baths && l.baths < filters.minBaths) {
            return false;
        }
        // Filtro de texto que debe incluir
        if (filters.textMustInclude?.length) {
            const text = `${l.title} ${l.description ?? ""}`.toLowerCase();
            if (!filters.textMustInclude.every((t) => text.includes(t.toLowerCase()))) {
                return false;
            }
        }
        // Filtro de texto que debe excluir
        if (filters.textMustExclude?.length) {
            const text = `${l.title} ${l.description ?? ""}`.toLowerCase();
            if (filters.textMustExclude.some((t) => text.includes(t.toLowerCase()))) {
                return false;
            }
        }
        return true;
    });
    logger.info({
        total: listings.length,
        filtered: filtered.length,
        maxPriceUSD: maxPrice,
        removed: listings.length - filtered.length
    }, "Filtros aplicados");
    return filtered;
};
