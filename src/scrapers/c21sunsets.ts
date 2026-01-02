import { chromium } from "playwright";
import { Filters, Listing, SourceConfig } from "../models/types.js";
import { logger } from "../utils/logger.js";

export const scrapeC21Sunsets = async (
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
    await page.goto(config.url, { waitUntil: "networkidle", timeout: 4000 });
    
    // Esperar a que las propiedades carguen con múltiples estrategias
    try {
      // Intentar esperar el selector article con timeout de 4 segundos
      await page.waitForSelector('article', { timeout: 4000 });
    } catch (err) {
      // Si falla, esperar a que aparezca cualquier contenido relacionado con propiedades
      logger.warn({ err }, "Timeout esperando 'article', intentando estrategia alternativa...");
      try {
        // Esperar a que aparezca texto que indique que hay propiedades
        await page.waitForFunction(
          () => {
            const hasArticles = document.querySelectorAll('article').length > 0;
            const hasPropertyText = document.body.textContent?.includes('propiedades') || 
                                   document.body.textContent?.includes('properties') ||
                                   document.body.textContent?.includes('US$');
            return hasArticles || hasPropertyText;
          },
          { timeout: 4000 }
        );
        // Dar tiempo adicional para que se rendericen los artículos
        await page.waitForTimeout(4000);
      } catch (altErr) {
        logger.error({ err: altErr }, "No se pudo cargar el contenido de la página");
        throw altErr;
      }
    }
    
    // Función para extraer propiedades de la página actual
    const extractProperties = async (): Promise<number> => {
      const properties = await page.$$eval('article', (articles) => {
        return articles.map((article) => {
        // Buscar precio - puede estar en un div, span u otro elemento que contiene "US$"
        const allElements = Array.from(article.querySelectorAll('div, span, p'));
        const priceElement = allElements.find((el) => {
          const text = el.textContent || '';
          return text.includes('US$') && text.match(/US\$\s*\d/) && 
                 !el.closest('button') && 
                 (el as HTMLElement).offsetParent !== null; // Verificar que sea visible
        });
        
        // Si no se encuentra en elementos específicos, buscar en todo el texto del artículo
        let priceText = priceElement?.textContent?.trim() || '';
        if (!priceText || priceText === 'Consultar Precio') {
          const articleText = article.textContent || '';
          const priceMatch = articleText.match(/US\$\s*\d{1,3}(?:,\d{3})*/);
          if (priceMatch) {
            priceText = priceMatch[0];
          }
        }
        
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
        
        // Buscar URL - está en un link dentro del article o en el botón principal
        const link = article.querySelector('a[href*="/d/"]') || 
                     article.querySelector('a[href*="/property/"]') ||
                     article.querySelector('a[href*="/es/d/"]');
        let url = (link as HTMLAnchorElement)?.href || '';
        
        // Si no hay link, buscar en el botón principal que puede tener el href
        if (!url) {
          const mainButton = article.querySelector('button[aria-label*="Bayahibe"], button[aria-label*="property"]');
          if (mainButton) {
            const buttonLink = mainButton.closest('a');
            url = (buttonLink as HTMLAnchorElement)?.href || '';
          }
        }
        
        // Extraer listing ID de la URL (último número después del guion)
        const listingIdMatch = url.match(/-(\d+)$/);
        let listingId = listingIdMatch?.[1] || url.split('/').pop() || '';
        
        // Si aún no hay URL, intentar construirla desde el título o ID
        if (!url && listingId) {
          url = `https://c21sunsets.com/es/d/${listingId}`;
        }
        
        // Extraer imágenes - buscar img dentro del article
        const images: string[] = [];
        const imgElements = article.querySelectorAll('img');
        imgElements.forEach((img) => {
          const src = (img as HTMLImageElement).src;
          // Filtrar imágenes que no sean logos, iconos o placeholders
          if (src && 
              !src.includes('logo') && 
              !src.includes('icon') && 
              !src.includes('svg') &&
              !src.includes('placeholder') &&
              (src.includes('property') || src.includes('image') || src.match(/\.(jpg|jpeg|png|webp)/i))) {
            // Convertir a URL absoluta si es relativa
            const absoluteUrl = src.startsWith('http') ? src : new URL(src, window.location.origin).href;
            if (!images.includes(absoluteUrl)) {
              images.push(absoluteUrl);
            }
          }
        });
        
        // Extraer badges/destaques como "Nuevo listado", "Oportunidad", etc.
        const badges: string[] = [];
        try {
          // Buscar badges de manera más eficiente - solo en elementos pequeños específicos
          const badgeKeywords = ['nuevo listado', 'nuevo', 'oportunidad', 'destacado', 'oferta', 'reducido'];
          
          // Buscar en elementos específicos que suelen contener badges (span, div pequeños, etc.)
          const potentialBadgeElements = Array.from(article.querySelectorAll('span, div, p')).filter((el) => {
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
                // Solo agregar si es un badge válido y no está duplicado
                if (badgeText.length > 0 && badgeText.length < 30 && !badges.includes(badgeText)) {
                  // Verificar que realmente sea un badge (no parte de un texto más largo)
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
          url,
          title: title || 'Sin título',
          location: location || '',
          type: type || '',
          price: priceText || 'Consultar Precio',
          beds: bedsMatch?.[1] ? parseInt(bedsMatch[1]) : undefined,
          baths: bathsMatch?.[1] ? parseFloat(bathsMatch[1].replace('½', '.5')) : undefined,
          area: areaMatch?.[1] ? areaMatch[1].replace(/,/g, '') : undefined,
          listingId,
          images: images.slice(0, 5), // Limitar a 5 imágenes
          badges: badges.length > 0 ? badges : undefined,
        };
      });
    });
      
      let newCount = 0;
      for (const prop of properties) {
        if (!prop.url || prop.url === 'NOT_FOUND') continue;
        
        // Evitar duplicados usando la URL como clave
        const cleanUrl = prop.url.split('?')[0];
        if (seenUrls.has(cleanUrl)) continue;
        seenUrls.add(cleanUrl);
        
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
          images: prop.images || undefined,
          badges: prop.badges || undefined,
        });
        newCount++;
      }
      return newCount;
    };
    
    // Extraer propiedades de la primera página
    await extractProperties();
    
    // Paginación con botón "Show more..." (máximo maxPages veces)
    for (let pageNum = 1; pageNum < maxPages; pageNum++) {
      try {
        const previousCount = listings.length;
        
        // Buscar el botón "Show more..." o elemento de paginación
        const showMoreButton = await page.evaluate(() => {
          // Buscar por ID específico primero (más confiable)
          const byId = document.getElementById('mobile-results-more');
          if (byId && byId.offsetParent !== null) {
            return {
              found: true,
              tag: byId.tagName,
              text: byId.textContent?.trim(),
              method: 'id',
            };
          }
          
          // Buscar botón "Show more..." con texto exacto o muy corto
          const allElements = Array.from(document.querySelectorAll('*'));
          const button = allElements.find((el) => {
            const text = el.textContent?.trim().toLowerCase() || '';
            return (text === 'show more' || text === 'show more...' || 
                   (text.length < 20 && text.includes('show more'))) &&
                   (el as HTMLElement).offsetParent !== null;
          });
          
          if (button) {
            return {
              found: true,
              tag: button.tagName,
              text: button.textContent?.trim(),
              method: 'text',
            };
          }
          
          // Buscar elemento con data-next como fallback
          const dataNextElement = Array.from(document.querySelectorAll('[data-next]')).find(
            el => (el as HTMLElement).offsetParent !== null
          );
          
          if (dataNextElement) {
            return {
              found: true,
              tag: dataNextElement.tagName,
              text: dataNextElement.textContent?.trim(),
              dataNext: dataNextElement.getAttribute('data-next'),
              method: 'data-next',
            };
          }
          
          return { found: false };
        });
        
        if (!showMoreButton.found) {
          logger.info({ page: pageNum + 1, reason: 'No more button found' }, "Deteniendo paginación C21 Sunsets");
          break;
        }
        
        // Hacer clic en el botón "Show more..."
        try {
          // Intentar hacer clic usando el método más confiable primero
          if (showMoreButton.method === 'id') {
            await page.click('#mobile-results-more');
          } else {
            // Usar el selector de texto de Playwright que es más confiable
            await page.getByText('Show more...', { exact: false }).click();
          }
          
          // Esperar a que carguen las nuevas propiedades
          await page.waitForTimeout(4000);
          
          // Esperar a que aparezcan nuevos artículos o que desaparezca el indicador de carga
          try {
            // Obtener el conteo actual de artículos antes de hacer clic
            const previousCount = await page.evaluate(() => document.querySelectorAll('article').length);
            
            // Esperar a que aparezcan más artículos o que desaparezca el indicador de carga
            // Usar Promise.race para esperar cualquiera de estas condiciones
            await Promise.race([
              // Esperar a que aparezcan más artículos
              (async () => {
                for (let i = 0; i < 8; i++) {
                  await page.waitForTimeout(500);
                  const currentCount = await page.evaluate(() => document.querySelectorAll('article').length);
                  if (currentCount > previousCount) {
                    // Esperar un poco más para que termine de cargar completamente
                    await page.waitForTimeout(500);
                    return;
                  }
                }
              })(),
              // Esperar a que desaparezca el indicador de carga (puede tener diferentes refs)
              page.waitForSelector('progressbar', { state: 'hidden', timeout: 4000 }).catch(() => {}),
              // Timeout máximo de espera
              page.waitForTimeout(4000),
            ]);
          } catch {}
          
        } catch (clickErr) {
          logger.warn({ err: clickErr, page: pageNum + 1 }, "Error al hacer clic en botón, intentando scroll...");
          // Si falla el clic, intentar hacer scroll
          await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
          });
          await page.waitForTimeout(4000);
        }
        
        // Extraer nuevas propiedades
        const newCount = await extractProperties();
        
        // Si no se encontraron nuevas propiedades, detener la paginación
        if (newCount === 0 || listings.length === previousCount) {
          logger.info({ page: pageNum + 1, reason: 'No more properties found' }, "Deteniendo paginación C21 Sunsets");
          break;
        }
        
        logger.info({ page: pageNum + 1, newProperties: newCount, total: listings.length }, "Página procesada C21 Sunsets");
      } catch (pageErr) {
        logger.warn({ err: pageErr, page: pageNum + 1 }, "Error al procesar página en C21 Sunsets, continuando...");
        // Continuar con la siguiente página aunque haya un error
        break;
      }
    }
    
    logger.info({ count: listings.length, pages: maxPages, site: config.siteKey }, "Propiedades encontradas en C21 Sunsets");
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

