# 💡 Tips Adicionales para Reducir Memoria

Si después de las optimizaciones principales aún tienes problemas de memoria, aquí hay más opciones:

## 🎯 Nivel 1: Configuración (sin código)

### 1. Reducir páginas por scraper
Edita tu Excel de configuración:
- `maxPages: 1` o `2` en lugar de `5`
- Menos propiedades = menos memoria

### 2. Variables de entorno
```env
# Reducir timeout (libera recursos más rápido)
PLAYWRIGHT_TIMEOUT=30000

# Deshabilitar análisis AI temporalmente
AI_ANALYSIS_ENABLED=false

# Aumentar intervalo de monitor
MEMORY_CHECK_INTERVAL=60000
```

## 🎯 Nivel 2: Código simple

### 1. Procesar solo un sitio a la vez

En `src/config/excel.ts`, limitar sources activas:

```typescript
// Solo procesar un sitio por ejecución
sources: sources.slice(0, 1) // Solo el primero
```

### 2. Reducir datos almacenados

En `src/scrapers/remaxrd.ts` y `c21sunsets.ts`:

```typescript
// Limitar imágenes
images: images.slice(0, 2), // Solo 2 en lugar de 5

// No guardar badges si no son críticos
badges: undefined,
```

### 3. Limpiar datos antiguos

Agregar en `src/worker/runner.ts`:

```typescript
// Al inicio del job
import fs from 'fs';
const oldDataPath = path.resolve('storage', 'properties-data.json');
if (fs.existsSync(oldDataPath)) {
  fs.unlinkSync(oldDataPath); // Eliminar datos viejos
}
```

## 🎯 Nivel 3: Alternativas ligeras

### Opción A: Migrar a Cheerio (solo HTML estático)

Si los sitios no requieren JavaScript:

```bash
npm install cheerio axios
```

```typescript
// src/scrapers/remaxrd-light.ts
import axios from 'axios';
import * as cheerio from 'cheerio';

export const scrapeRemaxRDLight = async (config: SourceConfig) => {
  const { data } = await axios.get(config.url);
  const $ = cheerio.load(data);
  
  const listings: Listing[] = [];
  $('a[href*="/propiedad/"]').each((i, elem) => {
    const title = $(elem).find('h3').text().trim();
    const price = $(elem).text().match(/US\$\s*\d+/)?.[0];
    // ... extraer datos
    listings.push({ /* ... */ });
  });
  
  return listings;
};
```

**Memoria:** ~20-30MB (vs ~150MB con Playwright)

### Opción B: Usar Puppeteer con chrome-aws-lambda

```bash
npm install puppeteer-core chrome-aws-lambda
```

```typescript
// src/scrapers/browser-pool-light.ts
import chromium from 'chrome-aws-lambda';
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  args: chromium.args,
  executablePath: await chromium.executablePath,
  headless: true,
});
```

**Memoria:** ~80-100MB (vs ~120MB con Playwright full)

### Opción C: Separar scrapers en workers

```typescript
// src/worker/worker-remaxrd.ts
import { Worker } from 'worker_threads';

const worker = new Worker('./scraper-worker.js', {
  workerData: { siteKey: 'remaxrd', url: config.url }
});

worker.on('message', (listings) => {
  // Procesar resultados
});

worker.on('exit', () => {
  // Liberar memoria del worker
});
```

## 🎯 Nivel 4: Arquitectura

### 1. Cola de trabajos con Redis

```bash
npm install bull redis
```

```typescript
import Queue from 'bull';

const scrapeQueue = new Queue('scraping', 'redis://localhost:6379');

// Agregar jobs
scrapeQueue.add({ siteKey: 'remaxrd', url: '...' });

// Procesar de a uno
scrapeQueue.process(1, async (job) => {
  const listings = await scraper(job.data);
  return listings;
});
```

**Beneficio:** Procesar de a uno con reintentos automáticos

### 2. Ejecutar en cron externo

Usar GitHub Actions o un cron externo:

```yaml
# .github/workflows/scrape.yml
name: Scrape Properties
on:
  schedule:
    - cron: '0 */6 * * *' # Cada 6 horas

jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: npm run scrape:site
```

**Beneficio:** No consume tu servidor free tier

### 3. Serverless Functions

Migrar scrapers a Vercel/Netlify Functions:

```typescript
// api/scrape-remaxrd.ts
export default async function handler(req, res) {
  const listings = await scrapeRemaxRD(/* ... */);
  return res.json(listings);
}
```

**Limitación:** 10 segundos timeout en free tier

## 🎯 Nivel 5: Infraestructura

### 1. Usar CDN/Cache

Cachear resultados en Cloudflare Workers:

```typescript
// workers/cache.js
export default {
  async fetch(request, env, ctx) {
    const cache = caches.default;
    let response = await cache.match(request);
    
    if (!response) {
      response = await fetch(upstream);
      ctx.waitUntil(cache.put(request, response.clone()));
    }
    
    return response;
  }
}
```

### 2. Combinar con Scraping Service

Usar servicio tercero:
- **ScrapingBee** (free tier: 1000 requests/mes)
- **Bright Data** (trial)
- **Apify** (free tier)

```typescript
import axios from 'axios';

const response = await axios.get('https://app.scrapingbee.com/api/v1/', {
  params: {
    api_key: process.env.SCRAPINGBEE_KEY,
    url: config.url,
    render_js: true,
  }
});
```

## 📊 Comparativa de uso de memoria

| Método | Memoria | Pros | Contras |
|--------|---------|------|---------|
| **Playwright full** | ~300MB | Compatible con JS, robusto | Pesado |
| **Playwright optimizado** | ~150MB | Compatible con JS | Requiere config |
| **Playwright + pool** | ~120MB | Reutilizable | Código más complejo |
| **Puppeteer + aws-lambda** | ~80MB | Más ligero | Setup adicional |
| **Cheerio** | ~20MB | Muy ligero | Solo HTML estático |
| **Servicio tercero** | ~10MB | Muy ligero | Límites de requests |

## 🔍 Debugging avanzado

### Ver qué consume memoria

```typescript
// src/utils/memory-profiler.ts
const v8 = require('v8');
const heapStats = v8.getHeapStatistics();
console.log(heapStats);

// Snapshot
const fs = require('fs');
const snapshot = v8.writeHeapSnapshot();
console.log('Snapshot saved:', snapshot);
```

### Monitorear con clinic.js

```bash
npm install -g clinic
clinic doctor -- node dist/index.js
```

### Usar Node.js profiler

```bash
node --inspect dist/index.js
# Abrir chrome://inspect
```

## 🎯 Decisión rápida

**¿Qué hacer?**

1. **Si tienes 512MB:** Usar optimizaciones implementadas ✅
2. **Si tienes 256MB:** Considerar Cheerio o Puppeteer ligero
3. **Si tienes límites estrictos:** Usar servicio tercero o serverless
4. **Si escalas mucho:** Cola de trabajos + Redis + workers

## 📚 Recursos adicionales

- [Playwright Performance Guide](https://playwright.dev/docs/performance)
- [Node.js Memory Management](https://nodejs.org/en/docs/guides/simple-profiling/)
- [Docker Memory Limits](https://docs.docker.com/config/containers/resource_constraints/)

---

**¿Preguntas?** Revisa primero las optimizaciones principales en `OPTIMIZACION_MEMORIA.md`
