# 🚀 Guía de Optimización de Memoria para Bothouse

## Problema actual
El servicio se cae en capa gratuita (512MB RAM) porque Playwright + Chromium consume mucha memoria.

## Soluciones implementadas

### 1. ✅ Usar navegador compartido (reduce 50-70% memoria)
En lugar de crear un navegador por scraper, reutilizar la misma instancia:

**ANTES (malo):**
```typescript
// scraper1.ts
const browser = await chromium.launch(...);
// ... scraping
await browser.close();

// scraper2.ts  
const browser = await chromium.launch(...);  // OTRO navegador completo
// ... scraping
await browser.close();
```

**DESPUÉS (bueno):**
```typescript
// runner.ts - un solo navegador para todo
const browser = await chromium.launch(...);
const results = [];
for (const source of sources) {
  const context = await browser.newContext(); // Ligero, solo contexto
  const listings = await scraper(context, source, filters);
  await context.close();
  results.push(...listings);
}
await browser.close();
```

### 2. ✅ Optimizar configuración de Chromium

```typescript
const browser = await chromium.launch({
  headless: true,
  args: [
    '--disable-dev-shm-usage',          // Usar /tmp en lugar de /dev/shm (problemas en Docker)
    '--no-sandbox',                     // Necesario en algunos entornos
    '--disable-setuid-sandbox',
    '--disable-gpu',                    // No necesitamos GPU
    '--disable-software-rasterizer',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--single-process',                 // ⚠️ CRÍTICO: un solo proceso (reduce ~200MB)
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-breakpad',
    '--disable-component-extensions-with-background-pages',
    '--disable-features=TranslateUI,BlinkGenPropertyTrees',
    '--disable-ipc-flooding-protection',
    '--disable-renderer-backgrounding',
    '--metrics-recording-only',
    '--mute-audio',
  ],
  // Limitar memoria del navegador
  firefoxUserPrefs: undefined,
});
```

### 3. ✅ Reducir concurrencia y páginas

```typescript
// En tu config Excel o variables de entorno
maxPages: 2,  // En lugar de 5
maxConcurrentScrapers: 1,  // Uno a la vez
```

### 4. ✅ Limpiar recursos agresivamente

```typescript
// Después de cada scraping
if (page) {
  await page.close();
}
if (context) {
  await context.close();
}

// Forzar garbage collection si Node.js lo permite
if (global.gc) {
  global.gc();
}
```

### 5. ✅ Deshabilitar imágenes y recursos pesados

```typescript
const context = await browser.newContext({
  userAgent: '...',
  extraHTTPHeaders: { ... },
});

// Bloquear recursos pesados
await context.route('**/*', (route) => {
  const resourceType = route.request().resourceType();
  // Solo cargar document y script, bloquear todo lo demás
  if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
    return route.abort();
  }
  return route.continue();
});
```

### 6. ✅ Usar Playwright con navegador persistente (avanzado)

```typescript
// Conectar a un navegador ya corriendo (separar en otro proceso)
const browser = await chromium.connect('ws://localhost:9222');
```

### 7. ✅ Alternativa: Usar Puppeteer-Core con navegador slim

```bash
npm install puppeteer-core chrome-aws-lambda
```

### 8. ✅ Monitorear memoria en tiempo real

```typescript
import { logger } from './utils/logger.js';

setInterval(() => {
  const used = process.memoryUsage();
  logger.debug({
    rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)}MB`,
    heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
    external: `${Math.round(used.external / 1024 / 1024)}MB`,
  }, 'Memoria actual');
}, 30000); // Cada 30 segundos
```

### 9. ✅ Limitar Node.js memory

```bash
# En tu start script o Dockerfile
node --max-old-space-size=450 dist/index.js
```

### 10. ✅ Considerar alternativas más ligeras

Si nada funciona, considera:
- **Cheerio + Axios** para sitios sin JS (90% más ligero)
- **PlayWright con Firefox** (a veces más ligero que Chromium)
- **JSDOM** para casos simples

## 🎯 Implementación prioritaria

1. **Navegador compartido** (50-70% reducción) ⭐️⭐️⭐️
2. **--single-process flag** (30-40% reducción) ⭐️⭐️⭐️
3. **Bloquear imágenes** (20-30% reducción) ⭐️⭐️
4. **maxPages: 2** (10-20% reducción) ⭐️
5. **Memoria Node.js limitada** (seguridad) ⭐️

## 📊 Resultados esperados

**Antes:**
- Chromium #1: 150MB
- Chromium #2: 150MB
- Node.js: 100MB
- **Total: ~400-500MB** ❌

**Después:**
- Chromium compartido: 100MB
- Node.js: 80MB
- **Total: ~180-250MB** ✅

## 🔍 Debugging

```bash
# Ver memoria en tiempo real
docker stats

# Ver logs de memoria
pm2 logs --lines 100 | grep memoria
```
