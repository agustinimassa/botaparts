import { chromium } from "playwright";
import { Filters, Listing, SourceConfig } from "../models/types.js";
import { logger } from "../utils/logger.js";

export const scrapeRemaxRD = async (
  config: SourceConfig,
  filters: Filters,
): Promise<Listing[]> => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const listings: Listing[] = [];
  try {
    await page.goto(config.url, { waitUntil: "networkidle", timeout: 60000 });
    
    // Esperar a que las propiedades carguen
    await page.waitForSelector('a[href*="/propiedad/"]', { timeout: 30000 });
    
    // Obtener todos los links de propiedades
    const propertyLinks = await page.$$eval('a[href*="/propiedad/"]', (links) => {
      return links.map((link) => {
        const card = link as HTMLAnchorElement;
        const h3 = card.querySelector('h3');
        const paragraphs = Array.from(card.querySelectorAll('p'));
        const priceP = paragraphs.find((p) => p.textContent?.includes('US$'));
        const listItems = Array.from(card.querySelectorAll('li'));
        
        // Extraer ubicación - buscar un div que contenga BAYAHIBE o DOMINICUS pero no VENTA ni US$
        const allElements = Array.from(card.querySelectorAll('*'));
        const locationDiv = allElements.find((el) => {
          const text = el.textContent || '';
          return (text.includes('BAYAHIBE') || text.includes('DOMINICUS') || text.includes('PUNTA CANA')) &&
                 !text.includes('VENTA') && !text.includes('US$') && text.length < 100;
        });
        
        // Extraer código
        const codeDiv = allElements.find((el) => el.textContent?.includes('Cod.'));
        const codeMatch = codeDiv?.textContent?.match(/Cod\.\s*(\d+)/);
        
        // List items: [0] = estacionamientos, [1] = baños, [2] = dormitorios, [3] = área
        const beds = listItems[2]?.textContent?.trim();
        const baths = listItems[1]?.textContent?.trim();
        const areaText = listItems[3]?.textContent?.trim() || '';
        const areaMatch = areaText.match(/(\d+\.?\d*)\s*M/i);
        
        return {
          url: card.href,
          title: h3?.textContent?.trim() || '',
          price: priceP?.textContent?.trim() || '',
          location: locationDiv?.textContent?.trim() || '',
          code: codeMatch?.[1] || card.href.split('/').pop()?.split('?')[0] || '',
          beds: beds ? parseInt(beds) : undefined,
          baths: baths ? parseInt(baths) : undefined,
          area: areaMatch?.[1] || undefined,
        };
      });
    });
    
    for (const prop of propertyLinks) {
      const listingId = prop.code || prop.url.split('/').pop()?.split('?')[0] || prop.url;
      listings.push({
        siteKey: config.siteKey,
        listingId,
        title: prop.title || 'Sin título',
        url: prop.url,
        priceUSD: parsePrice(prop.price),
        location: prop.location || undefined,
        beds: prop.beds,
        baths: prop.baths,
        area: prop.area ? `${prop.area} m²` : undefined,
      });
    }
    
    logger.info({ count: listings.length, site: config.siteKey }, "Propiedades encontradas en RE/MAX RD");
  } catch (err) {
    logger.error({ err, url: config.url }, "Error en scraper RE/MAX RD");
  } finally {
    await browser.close();
  }
  return listings;
};

const parsePrice = (text: string): number | undefined => {
  if (!text) return undefined;
  // Buscar patrón "US$190,000" o "VENTA US$190,000"
  const match = text.match(/US\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
  if (match) {
    const cleaned = match[1].replace(/,/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};

