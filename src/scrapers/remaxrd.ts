import { chromium } from "playwright";
import { Filters, Listing, SourceConfig } from "../models/types.js";
import { logger } from "../utils/logger.js";

export const scrapeRemaxRD = async (
  config: SourceConfig,
  filters: Filters,
): Promise<Listing[]> => {
  const headless = process.env.PLAYWRIGHT_HEADLESS !== 'false';
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage();
  const listings: Listing[] = [];
  const maxPages = config.maxPages || 5;
  const seenUrls = new Set<string>();
  
  try {
    logger.info({ url: config.url }, "Iniciando navegación a RE/MAX RD");
    
    // Usar 'load' en lugar de 'networkidle' que es más estricto
    try {
      await page.goto(config.url, { waitUntil: "load", timeout: 20000 });
      logger.info({ url: config.url }, "Página cargada, esperando contenido...");
    } catch (gotoErr) {
      logger.warn({ err: gotoErr, url: config.url }, "Timeout en page.goto, continuando con domcontentloaded...");
      // Intentar con domcontentloaded como fallback
      try {
        await page.goto(config.url, { waitUntil: "domcontentloaded", timeout: 20000 });
        logger.info({ url: config.url }, "Página cargada con domcontentloaded");
      } catch (domErr) {
        logger.error({ err: domErr, url: config.url }, "Error crítico al cargar la página");
        throw domErr;
      }
    }
    
    // Esperar un momento para que el contenido dinámico se renderice
    await page.waitForTimeout(2000);
    
    // Verificar estado inicial de la página
    const initialCheck = await page.evaluate(() => {
      return {
        linkCount: document.querySelectorAll('a[href*="/propiedad/"]').length,
        hasPropertyText: document.body.textContent?.includes('propiedades') || 
                        document.body.textContent?.includes('US$') ||
                        document.body.textContent?.includes('VENTA'),
        bodyTextLength: document.body.textContent?.length || 0,
      };
    });
    logger.info({ initialCheck }, "Estado inicial de la página RE/MAX RD");
    
    // Esperar a que las propiedades carguen con múltiples estrategias
    try {
      // Intentar esperar el selector con timeout más largo para carga inicial (10 segundos)
      await page.waitForSelector('a[href*="/propiedad/"]', { timeout: 10000 });
      logger.info("Selector 'a[href*=\"/propiedad/\"]' encontrado");
    } catch (err) {
      // Si falla, esperar a que aparezca cualquier contenido relacionado con propiedades
      logger.warn({ err, initialCheck }, "Timeout esperando propiedades, intentando estrategia alternativa...");
      try {
        // Esperar a que aparezca texto que indique que hay propiedades
        await page.waitForFunction(
          () => {
            const hasProperties = document.querySelectorAll('a[href*="/propiedad/"]').length > 0;
            const hasPropertyText = document.body.textContent?.includes('propiedades') || 
                                   document.body.textContent?.includes('US$') ||
                                   document.body.textContent?.includes('VENTA');
            return hasProperties || hasPropertyText;
          },
          { timeout: 10000 }
        );
        logger.info("Contenido de propiedades detectado mediante waitForFunction");
        // Dar tiempo adicional para que se rendericen las propiedades
        await page.waitForTimeout(2000);
      } catch (altErr) {
        // Verificar estado final antes de fallar
        const finalCheck = await page.evaluate(() => {
          return {
            linkCount: document.querySelectorAll('a[href*="/propiedad/"]').length,
            url: window.location.href,
            title: document.title,
            hasPropertyText: document.body.textContent?.includes('propiedades') || 
                            document.body.textContent?.includes('US$') ||
                            document.body.textContent?.includes('VENTA'),
          };
        });
        logger.error({ err: altErr, finalCheck }, "No se pudo cargar el contenido de la página RE/MAX RD");
        throw altErr;
      }
    }
    
    // Función para extraer propiedades de la página actual
    const extractProperties = async (): Promise<number> => {
      // Verificar cuántos links hay antes de extraer
      const linkCount = await page.evaluate(() => document.querySelectorAll('a[href*="/propiedad/"]').length);
      logger.info({ linkCount }, "Links de propiedades encontrados antes de extraer");
      
      if (linkCount === 0) {
        logger.warn("No se encontraron links de propiedades en la página");
        return 0;
      }
      
      const propertyLinks = await page.$$eval('a[href*="/propiedad/"]', (links) => {
        return links.map((link) => {
        const card = link as HTMLAnchorElement;
        const h3 = card.querySelector('h3');
        let title = h3?.textContent?.trim() || '';
        
        // Si el título es muy genérico (solo "Apartamento", "Casa", etc.), intentar extraer del URL
        if (!title || title.length < 10 || ['Apartamento', 'Casa', 'Villa', 'Terreno'].includes(title)) {
          const urlParts = card.href.split('/');
          const urlSlug = urlParts[urlParts.length - 1]?.split('?')[0] || '';
          if (urlSlug) {
            const titleFromUrl = urlSlug
              .split('-')
              .filter(w => w.length > 2 && !['de', 'en', 'con', 'para', 'por'].includes(w.toLowerCase()))
              .slice(0, 6)
              .map(w => w.charAt(0).toUpperCase() + w.slice(1))
              .join(' ');
            if (titleFromUrl && titleFromUrl.length > title.length) {
              title = titleFromUrl;
            }
          }
        }
        
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
        
        // Extraer imágenes - buscar img dentro del card
        const images: string[] = [];
        const imgElements = card.querySelectorAll('img');
        imgElements.forEach((img) => {
          const src = (img as HTMLImageElement).src;
          // Filtrar imágenes que no sean logos o iconos
          if (src && !src.includes('logo') && !src.includes('icon') && !src.includes('svg')) {
            // Convertir a URL absoluta si es relativa
            const absoluteUrl = src.startsWith('http') ? src : new URL(src, window.location.origin).href;
            if (!images.includes(absoluteUrl)) {
              images.push(absoluteUrl);
            }
          }
        });
        
        // Extraer badges/destaques como "Nuevo", "Destacado", "Oportunidad", etc.
        const badges: string[] = [];
        try {
          const badgeKeywords = ['nuevo', 'destacado', 'oportunidad', 'oferta', 'reducido', 'exclusivo'];
          
          // Buscar badges de manera más eficiente - solo en elementos pequeños específicos
          const potentialBadgeElements = Array.from(card.querySelectorAll('span, div, p')).filter((el) => {
            const text = el.textContent?.trim() || '';
            return text.length > 0 && text.length < 30 && badgeKeywords.some(keyword => 
              text.toLowerCase() === keyword || text.toLowerCase().includes(keyword)
            );
          });
          
          potentialBadgeElements.forEach((el) => {
            try {
              const htmlEl = el as HTMLElement;
              // Verificar visibilidad de manera segura
              let isVisible = false;
              try {
                isVisible = htmlEl.offsetParent !== null;
              } catch {
                // Si offsetParent falla, asumir visible si tiene texto
                isVisible = true;
              }
              
              if (isVisible) {
                const badgeText = el.textContent?.trim() || '';
                if (badgeText.length > 0 && badgeText.length < 30 && !badges.includes(badgeText)) {
                  // Verificar que realmente sea un badge
                  const lowerText = badgeText.toLowerCase();
                  const isExactMatch = badgeKeywords.some(k => lowerText === k);
                  const isShortMatch = badgeKeywords.some(k => lowerText.includes(k) && lowerText.length < 30);
                  
                  if (isExactMatch || isShortMatch) {
                    badges.push(badgeText);
                  }
                }
              }
            } catch (badgeErr) {
              // Ignorar errores al procesar badges individuales
            }
          });
        } catch (badgesErr) {
          // Si falla la extracción de badges, continuar sin ellos
        }
        
        return {
          url: card.href,
          title: title || 'Sin título',
          price: priceP?.textContent?.trim() || '',
          location: locationDiv?.textContent?.trim() || '',
          code: codeMatch?.[1] || card.href.split('/').pop()?.split('?')[0] || '',
          beds: beds ? parseInt(beds) : undefined,
          baths: baths ? parseInt(baths) : undefined,
          area: areaMatch?.[1] || undefined,
          images: images.slice(0, 5), // Limitar a 5 imágenes
          badges: badges.length > 0 ? badges : undefined,
        };
      });
    });
      
      let newCount = 0;
      let skippedCount = 0;
      for (const prop of propertyLinks) {
        // Evitar duplicados usando la URL como clave
        const cleanUrl = prop.url.split('?')[0];
        if (seenUrls.has(cleanUrl)) {
          skippedCount++;
          continue;
        }
        seenUrls.add(cleanUrl);
        
        const listingId = prop.code || prop.url.split('/').pop()?.split('?')[0] || prop.url;
        const listing = {
          siteKey: config.siteKey,
          listingId,
          title: prop.title || 'Sin título',
          url: prop.url,
          priceUSD: parsePrice(prop.price),
          location: prop.location || undefined,
          beds: prop.beds,
          baths: prop.baths,
          area: prop.area ? `${prop.area} m²` : undefined,
          images: prop.images || undefined,
          badges: prop.badges || undefined,
        };
        
        listings.push(listing);
        newCount++;
        logger.debug({ listing: { title: listing.title, price: listing.priceUSD, url: listing.url } }, "Propiedad agregada");
      }
      logger.info({ newCount, skippedCount, total: listings.length }, "Propiedades extraídas en esta iteración");
      return newCount;
    };
    
    // Extraer propiedades de la primera página
    await extractProperties();
    
    // Paginación con scroll infinito (máximo maxPages veces)
    for (let pageNum = 1; pageNum < maxPages; pageNum++) {
      try {
        const previousCount = listings.length;
        
        // Hacer scroll hasta el final de la página
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        
        // Esperar a que carguen más propiedades (máximo 4 segundos)
        await page.waitForTimeout(4000);
        
        // Verificar si hay un elemento de carga
        const isLoading = await page.evaluate(() => {
          const loadingElements = Array.from(document.querySelectorAll('*')).filter(el => {
            const text = el.textContent?.toLowerCase() || '';
            return text.includes('cargando') || text.includes('loading');
          });
          return loadingElements.some(el => (el as HTMLElement).offsetParent !== null);
        });
        
        if (isLoading) {
          await page.waitForTimeout(4000);
        }
        
        // Extraer nuevas propiedades
        const newCount = await extractProperties();
        
        // Si no se encontraron nuevas propiedades, detener la paginación
        if (newCount === 0 || listings.length === previousCount) {
          logger.info({ page: pageNum + 1, reason: 'No more properties found' }, "Deteniendo paginación RE/MAX RD");
          break;
        }
        
        logger.info({ page: pageNum + 1, newProperties: newCount, total: listings.length }, "Página procesada RE/MAX RD");
      } catch (pageErr) {
        logger.warn({ err: pageErr, page: pageNum + 1 }, "Error al procesar página en RE/MAX RD, continuando...");
        // Continuar con la siguiente página aunque haya un error
        break;
      }
    }
    
    logger.info({ count: listings.length, pages: maxPages, site: config.siteKey }, "Propiedades encontradas en RE/MAX RD");
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

