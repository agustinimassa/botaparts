import { BrowserContext } from "playwright";
import { Filters, Listing, SourceConfig } from "../models/types.js";
import { logger } from "../utils/logger.js";
import { browserPool } from "./browser-pool.js";

export const scrapeC21Sunsets = async (
  config: SourceConfig,
  filters: Filters,
): Promise<Listing[]> => {
  // Usar contexto del pool compartido (mucho más eficiente en memoria)
  const context = await browserPool.createContext({
    blockImages: false, // C21 necesita imágenes
    blockStyles: false,
    blockFonts: true,
  });
  
  const page = await context.newPage();
  
  const listings: Listing[] = [];
  const maxPages = config.maxPages || 5;
  const seenUrls = new Set<string>();
  
  // Timeout global para toda la operación de scraping
  const globalTimeout = setTimeout(() => {
    logger.error({ url: config.url }, "⏱️  Timeout global alcanzado (2 minutos), cerrando scraper");
    page.close().catch(() => {});
    browserPool.closeContext(context).catch(() => {});
  }, 120000); // 2 minutos máximo
  
  try {
    logger.debug({ url: config.url }, "Iniciando navegación a C21 Sunsets");
    
    // Usar Promise.race para tener un timeout más estricto
    const navigationPromise = page.goto(config.url, { 
      waitUntil: "load", 
      timeout: 25000 // 25 segundos
    });
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Navigation timeout")), 25000)
    );
    
    try {
      await Promise.race([navigationPromise, timeoutPromise]);
      logger.debug({ url: config.url }, "Página cargada, esperando contenido...");
    } catch (gotoErr: any) {
      logger.warn({ err: gotoErr, url: config.url }, "Timeout en page.goto, intentando domcontentloaded...");
      // Intentar con domcontentloaded como fallback (más rápido)
      try {
        await Promise.race([
          page.goto(config.url, { waitUntil: "domcontentloaded", timeout: 15000 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("DOM timeout")), 15000))
        ]);
        logger.debug({ url: config.url }, "Página cargada con domcontentloaded");
      } catch (domErr: any) {
        logger.error({ err: domErr, url: config.url }, "❌ Error crítico al cargar la página - abortando scraper");
        throw new Error(`No se pudo cargar la página después de múltiples intentos: ${domErr.message}`);
      }
    }
    
    // Esperar tiempo reducido para Cloudflare (3 segundos en lugar de 5)
    await Promise.race([
      page.waitForTimeout(3000),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Wait timeout")), 5000))
    ]).catch(() => {
      logger.warn("Timeout en waitForTimeout, continuando...");
    });
    
    // Verificar estado inicial de la página
    const initialCheck = await page.evaluate(() => {
      return {
        articleCount: document.querySelectorAll('article').length,
        hasPropertyText: document.body.textContent?.includes('propiedades') || 
                        document.body.textContent?.includes('properties') ||
                        document.body.textContent?.includes('US$'),
        bodyTextLength: document.body.textContent?.length || 0,
      };
    });
    logger.debug({ initialCheck }, "Estado inicial de la página C21 Sunsets");
    
    // Esperar a que las propiedades carguen con múltiples estrategias (con timeout estricto)
    try {
      // Intentar esperar el selector article con timeout reducido (8 segundos)
      await Promise.race([
        page.waitForSelector('article', { timeout: 8000 }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Selector timeout")), 8000))
      ]);
      logger.debug("Selector 'article' encontrado");
    } catch (err) {
      // Si falla, esperar a que aparezca cualquier contenido relacionado con propiedades
      logger.warn({ err, initialCheck }, "Timeout esperando 'article', intentando estrategia alternativa...");
      try {
        // Esperar a que aparezca texto que indique que hay propiedades (timeout reducido)
        await Promise.race([
          page.waitForFunction(
            () => {
              const hasArticles = document.querySelectorAll('article').length > 0;
              const hasPropertyText = document.body.textContent?.includes('propiedades') || 
                                     document.body.textContent?.includes('properties') ||
                                     document.body.textContent?.includes('US$');
              return hasArticles || hasPropertyText;
            },
            { timeout: 8000 }
          ),
          new Promise((_, reject) => setTimeout(() => reject(new Error("WaitFunction timeout")), 8000))
        ]);
        logger.debug("Contenido de propiedades detectado mediante waitForFunction");
        // Dar tiempo adicional para que se rendericen los artículos (con timeout)
        await Promise.race([
          page.waitForTimeout(2000),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Wait timeout")), 3000))
        ]).catch(() => {});
      } catch (altErr: any) {
        // Verificar estado final antes de fallar
        const finalCheck = await page.evaluate(() => {
          return {
            articleCount: document.querySelectorAll('article').length,
            url: window.location.href,
            title: document.title,
            hasPropertyText: document.body.textContent?.includes('propiedades') || 
                            document.body.textContent?.includes('properties') ||
                            document.body.textContent?.includes('US$'),
          };
        }).catch(() => ({ articleCount: 0, url: config.url, title: 'Error', hasPropertyText: false }));
        
        logger.error({ err: altErr, finalCheck }, "❌ No se pudo cargar el contenido de la página C21 Sunsets - abortando");
        throw new Error(`Timeout esperando contenido: ${altErr.message}`);
      }
    }
    
    // Función para extraer propiedades de la página actual
    const extractProperties = async (): Promise<number> => {
      // Verificar cuántos artículos hay antes de extraer
      const articleCount = await page.evaluate(() => document.querySelectorAll('article').length);
      logger.debug({ articleCount }, "Artículos encontrados antes de extraer propiedades");
      
      if (articleCount === 0) {
        logger.warn("No se encontraron artículos en la página");
        return 0;
      }
      
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
        
        // Buscar el elemento que contiene los detalles (formato "X · Y · ... · Z m²")
        // El elemento puede ser un <span> con clase "m-0 fs-80" o un <a> con clase "card-body"
        let detailsText = '';
        
        // Estrategia 1: Buscar el <span> con clase "m-0 fs-80" que contiene los iconos y números
        const detailsSpan = article.querySelector('span.m-0.fs-80');
        if (detailsSpan) {
          detailsText = detailsSpan.textContent?.trim() || '';
        }
        
        // Estrategia 2: Si no se encuentra el span, buscar en el <a> con clase "card-body"
        if (!detailsText || !/\d+\s*·\s*\d/.test(detailsText)) {
          const cardBody = article.querySelector('a.card-body');
          if (cardBody) {
            detailsText = cardBody.textContent?.trim() || '';
          }
        }
        
        // Estrategia 3: Buscar cualquier elemento que contenga el patrón
        if (!detailsText || !/\d+\s*·\s*\d/.test(detailsText)) {
          const allElements = Array.from(article.querySelectorAll('*'));
          const elementWithPattern = allElements.find((el) => {
            const text = el.textContent || '';
            return /\d+\s*·\s*\d/.test(text) && text.length < 200;
          });
          if (elementWithPattern) {
            detailsText = elementWithPattern.textContent?.trim() || '';
          }
        }
        
        // Extraer los datos del texto encontrado
        // Formato: "número · número · texto · número m²" (dormitorios · baños · vista · área)
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
      let skippedCount = 0;
      for (const prop of properties) {
        if (!prop.url || prop.url === 'NOT_FOUND') {
          skippedCount++;
          logger.debug({ prop }, "Propiedad sin URL válida, saltando");
          continue;
        }
        
        // Evitar duplicados usando la URL como clave
        const cleanUrl = prop.url.split('?')[0];
        if (seenUrls.has(cleanUrl)) {
          skippedCount++;
          continue;
        }
        seenUrls.add(cleanUrl);
        
        const listing = {
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
        };
        
        listings.push(listing);
        newCount++;
        logger.debug({ listing: { title: listing.title, price: listing.priceUSD, url: listing.url } }, "Propiedad agregada");
      }
      logger.debug({ newCount, skippedCount, total: listings.length }, "Propiedades extraídas en esta iteración");
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
          logger.debug({ page: pageNum + 1, reason: 'No more button found' }, "Deteniendo paginación C21 Sunsets");
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
          logger.debug({ page: pageNum + 1, reason: 'No more properties found' }, "Deteniendo paginación C21 Sunsets");
          break;
        }
        
        logger.debug({ page: pageNum + 1, newProperties: newCount, total: listings.length }, "Página procesada C21 Sunsets");
      } catch (pageErr) {
        logger.warn({ err: pageErr, page: pageNum + 1 }, "Error al procesar página en C21 Sunsets, continuando...");
        // Continuar con la siguiente página aunque haya un error
        break;
      }
    }
    
    logger.debug({ count: listings.length, pages: maxPages, site: config.siteKey }, "Propiedades encontradas en C21 Sunsets");
  } catch (err: any) {
    logger.error({ err, url: config.url, message: err.message }, "❌ Error en scraper C21 Sunsets");
    // Retornar lista vacía en caso de error para no bloquear otros scrapers
    return [];
  } finally {
    // Limpiar timeout global
    clearTimeout(globalTimeout);
    
    // Cerrar página y contexto (navegador se mantiene abierto en el pool)
    try {
      await page.close().catch(() => {});
      await browserPool.closeContext(context);
      logger.debug("Contexto C21 cerrado correctamente");
    } catch (closeErr) {
      logger.warn({ err: closeErr }, "Error al cerrar contexto (ignorado)");
    }
    
    // Forzar garbage collection si está disponible
    if (global.gc) {
      global.gc();
    }
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

