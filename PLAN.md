# Plan de gestión y roadmap (scraper inmobiliario)

## Objetivo
Sistema en Node que lee configuración desde Excel, usa Playwright para scrapear N páginas inmobiliarias, aplica filtros, evita duplicados y notifica por email (HTML) y WhatsApp (con íconos).

## Alcance inicial
- Sitios iniciales: RE/MAX RD (`https://remaxrd.com/propiedades?businessTypes=sale&currencyType=us&locations[]=id-440%26description-BAYAHIBE%26&typeProperty[]=apartment&ciudad=BAYAHIBE`) y Century21 Sunsets (`https://c21sunsets.com/es/s/bayahibe-la-altagracia`).
- Diseñado para sumar fácilmente más fuentes vía Excel + módulo de scraper.

## Entradas y salidas
- Entradas: archivo Excel con hojas `sources`, `filters`, `notifications`, `sent`, `schedules` (opcional).
- Salidas: resúmenes en HTML (email), texto con íconos para WhatsApp, logs estructurados, registro de propiedades notificadas.

## Esquema de Excel (propuesto)
- `sources`: `id`, `url`, `siteKey` (ej. `remaxrd`, `c21sunsets`), `active` (bool), `maxPages`, `paginateParam`, `selectorsProfile`, `scheduleKey`.
- `filters`: `maxPriceUSD`, `country`, `city`, `typeProperty[]`, `minBeds`, `minBaths`, `textMustInclude`, `textMustExclude`.
- `notifications`: `emails[]`, `whatsappNumbers[]`, `sendHourUTC`, `batchSize`, `subjectTemplate`, `whatsappTemplate`.
- `sent`: `siteKey`, `listingId`, `hash`, `notifiedAt`.
- `schedules` (opcional): `scheduleKey`, `cron`, `timezone`.

## Arquitectura de carpetas (sugerida)
- `src/config/` carga y validación de Excel.
- `src/scrapers/` un módulo por sitio (`remaxrd.ts`, `c21sunsets.ts`, ...).
- `src/filters/` lógica de filtros genéricos/específicos.
- `src/dedup/` hashing y persistencia de notificaciones enviadas.
- `src/notifications/email/` plantillas MJML/Handlebars + Nodemailer.
- `src/notifications/whatsapp/` adaptador Twilio/Meta + formateo con íconos.
- `src/worker/` orquestador y scheduler.
- `src/api/` endpoints (`/config/excel`, `/jobs/run`, `/health`).
- `src/models/` tipos TS.
- `src/utils/` helpers de normalización.
- `templates/` base HTML/WhatsApp.
- `storage/` (SQLite/JSON para dedup y cache de config).
- `tests/` unit/e2e con fixtures HTML.

## API (Node)
- `POST /config/excel` (multipart): subir y validar Excel.
- `POST /jobs/run` (body: `siteKey?`, `scheduleKey?`): dispara job manual.
- `GET /health`: simple.

## Worker / Job
1) Lee `sources` activos y `filters`.
2) Por cada fuente:
   - Obtiene selectores y paginación.
   - Playwright recorre páginas hasta `maxPages` o sin resultados.
   - Extrae campos normalizados: `listingId`, `title`, `priceUSD`, `location`, `url`, `images[]`, `beds`, `baths`, `area`, `description`, `rawData`.
   - Aplica filtros.
   - Dedup: compara con `sent` y storage local.
   - Acumula nuevos listings.
3) Genera resumen (HTML + WhatsApp-friendly).
4) Envía notificaciones según preferencias.
5) Actualiza `sent`.

## Deduplicación
- Clave: `(siteKey, listingId)` o hash de `title+price+city+url`.
- Persistir en hoja `sent` y storage local (SQLite/JSON). Limpieza opcional por TTL o tamaño.

## Playwright
- Chromium headless, timeouts y retries.
- Módulo por sitio implementa interfaz común `fetchListings(config, filters): Listing[]`.
- Perfiles de selectores configurables vía `selectorsProfile` en `sources`.

## Notificaciones
- Email: Nodemailer + MJML/Handlebars → HTML con cards (imagen, precio, ubicación, CTA).
- WhatsApp: Twilio/Meta API, texto con íconos (🏠, 📍, 💲) y links.
- Batch configurable (`batchSize`, `sendHourUTC`).

## Roadmap detallado
1. Datos y contrato
   - Definir interfaces `Listing`, `SourceConfig`, `Filters`, `NotificationPrefs`.
   - Cerrar plantilla Excel con ejemplos.
2. Infra básica
   - Inicializar proyecto Node+TS, lint/format, `dotenv`.
   - Instalar Playwright y script de smoke.
3. Configuración
   - Loader Excel con `xlsx`, validación y cache.
   - Endpoint `POST /config/excel`.
4. Scrapers iniciales
   - `scrapers/remaxrd.ts`: cards en resultados, paginación por querystring, extraer ID/precio USD.
   - `scrapers/c21sunsets.ts`: cards y paginación; mapear campos.
   - Tests con fixtures HTML.
5. Filtros
   - Implementar filtros genéricos (precio, ciudad, tipo, dormitorios/baños, texto incluye/excluye).
6. Dedup
   - Hash utilitario, storage local (SQLite/JSON) y sincronía con `sent`.
7. Worker
   - Orquestador: leer config, iterar fuentes, aplicar filtros, dedup, acumular nuevos y devolver resultados.
   - Soporte de cron (`schedules`) y trigger manual.
8. Notificaciones
   - Plantilla email MJML/Handlebars + Nodemailer.
   - Plantilla WhatsApp con íconos + adaptador Twilio/Meta.
   - Batch y asunto/mensajes configurables.
9. API y DX
   - Exponer `/jobs/run`, `/health`, `/config/excel`.
   - Scripts CLI: `npm run scrape:siteKey`, `npm run test`.
10. Observabilidad y hardening
   - Logs estructurados (pino/winston), contadores de listings nuevos/filtrados/notificados.
   - Retries con backoff, timeout global, user-agent y espera aleatoria.

## Próximos pasos inmediatos
- Crear plantilla Excel de ejemplo según columnas propuestas.
- Bootstrapping de proyecto Node+TS y setup de Playwright.
- Implementar loader de Excel + endpoint de carga.
- Codificar scraper de RE/MAX RD, luego C21 Sunsets, con tests y fixtures.
- Armar plantillas de notificación (HTML y WhatsApp) y probar con datos mock.

