import { chromium } from "playwright";
import { Filters, Listing, SourceConfig } from "../models/types.js";
import { logger } from "../utils/logger.js";

export const scrapeC21Sunsets = async (
  config: SourceConfig,
  filters: Filters,
): Promise<Listing[]> => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const listings: Listing[] = [];
  try {
    await page.goto(config.url, { waitUntil: "networkidle", timeout: 60000 });
    
    // Esperar a que las propiedades carguen
    await page.waitForSelector('article', { timeout: 30000 });
    
    // Obtener todas las propiedades desde los articles
    const properties = await page.$$eval('article', (articles) => {
      return articles.map((article) => {
        // Buscar precio - está en un div que contiene "US$" y no está dentro de un button
        const allDivs = Array.from(article.querySelectorAll('div'));
        const priceDiv = allDivs.find((div) => {
          const text = div.textContent || '';
          return text.includes('US$') && text.match(/US\$\s*\d/) && !div.closest('button');
        });
        
        // Buscar el h2 con título
        const h2 = article.querySelector('h2');
        const strong = h2?.querySelector('strong');
        const title = strong?.previousSibling?.textContent?.trim() || 
                     h2?.textContent?.split('Bayahibe')[0]?.trim() ||
                     h2?.textContent?.split('(La Altagracia)')[0]?.trim() || '';
        const location = strong?.textContent?.trim() || '';
        const type = strong?.nextSibling?.textContent?.trim() || '';
        
        // Buscar el botón con detalles (formato "X · Y · ...")
        const buttons = Array.from(article.querySelectorAll('button'));
        const detailButton = buttons.find((btn) => {
          const text = btn.textContent || '';
          return /\d+\s*·\s*\d/.test(text);
        });
        
        const detailsText = detailButton?.textContent || '';
        const bedsMatch = detailsText.match(/(\d+)\s*·/);
        const afterBeds = detailsText.split('·').slice(1).join('·');
        const bathsMatch = afterBeds.match(/(\d+½?)/);
        const areaMatch = detailsText.match(/(\d+(?:,\d+)?)\s*m²/i);
        
        // Buscar URL - está en un link dentro del article
        const link = article.querySelector('a[href*="/d/"]') || article.querySelector('a[href*="/property/"]');
        const url = (link as HTMLAnchorElement)?.href || '';
        
        // Extraer listing ID de la URL (último número después del guion)
        const listingIdMatch = url.match(/-(\d+)$/);
        const listingId = listingIdMatch?.[1] || url.split('/').pop() || '';
        
        return {
          url,
          title: title || 'Sin título',
          location: location || '',
          type: type || '',
          price: priceDiv?.textContent?.trim() || 'Consultar Precio',
          beds: bedsMatch?.[1] ? parseInt(bedsMatch[1]) : undefined,
          baths: bathsMatch?.[1] ? parseFloat(bathsMatch[1].replace('½', '.5')) : undefined,
          area: areaMatch?.[1] ? areaMatch[1].replace(/,/g, '') : undefined,
          listingId,
        };
      });
    });
    
    for (const prop of properties) {
      if (!prop.url || prop.url === 'NOT_FOUND') continue;
      
      listings.push({
        siteKey: config.siteKey,
        listingId: prop.listingId || prop.url.split('/').pop() || '',
        title: prop.title,
        url: prop.url,
        priceUSD: parsePrice(prop.price),
        location: prop.location || undefined,
        beds: prop.beds,
        baths: prop.baths,
        area: prop.area ? `${prop.area} m²` : undefined,
      });
    }
    
    logger.info({ count: listings.length, site: config.siteKey }, "Propiedades encontradas en C21 Sunsets");
  } catch (err) {
    logger.error({ err, url: config.url }, "Error en scraper C21 Sunsets");
  } finally {
    await browser.close();
  }
  return listings;
};

const parsePrice = (text: string): number | undefined => {
  if (!text || text === 'Consultar Precio') return undefined;
  // Buscar patrón "US$ 799,000" o "US$799,000"
  const match = text.match(/US\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
  if (match) {
    const cleaned = match[1].replace(/,/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};

