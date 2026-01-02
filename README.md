# bothouse

Scraper inmobiliario modular en Node/TS. Lee configuración desde Excel, usa Playwright para extraer propiedades, aplica filtros, deduplica y notifica por email (HTML) y WhatsApp.

## Requisitos
- Node 18+ (recomendado 20).
- Playwright (se instala con `npm install`).

## Instalación
```bash
npm install
```

## Scripts
- `npm run dev`: servidor Fastify con reload (ts-node + nodemon).
- `npm run build`: compila a `dist/`.
- `npm start`: ejecuta `dist/`.
- `npm run scrape:site`: corre el job manualmente leyendo el Excel.
- `npm run lint` / `npm run format`: lint/format.

## Configuración (.env)

Crea un archivo `.env` en la raíz del proyecto basándote en `env.example`. Las variables disponibles son:

### Variables Generales
- `PORT` (opcional, default: `3000`): Puerto donde escucha el servidor API
- `LOG_LEVEL` (opcional, default: `info`): Nivel de logging (`trace`, `debug`, `info`, `warn`, `error`, `fatal`)

### Variables SMTP (requeridas para emails)
- `SMTP_HOST` (requerido): Host del servidor SMTP
  - Gmail: `smtp.gmail.com`
  - Outlook: `smtp-mail.outlook.com`
  - SendGrid: `smtp.sendgrid.net`
- `SMTP_PORT` (opcional, default: `587`): Puerto SMTP (587 para TLS, 465 para SSL)
- `SMTP_USER` (requerido): Usuario/email para autenticación SMTP
- `SMTP_PASS` (requerido): Contraseña o App Password
  - Para Gmail: genera una "App Password" desde tu cuenta de Google
- `SMTP_FROM` (opcional): Email remitente (usa `SMTP_USER` si no se especifica)

### Variables WhatsApp (pendiente de implementación)
- `TWILIO_ACCOUNT_SID`: Account SID de Twilio (si usas Twilio)
- `TWILIO_AUTH_TOKEN`: Auth Token de Twilio (si usas Twilio)
- `TWILIO_WHATSAPP_NUMBER`: Número de WhatsApp de Twilio en formato `whatsapp:+1234567890`
- `META_WHATSAPP_TOKEN`: Token de acceso de Meta (si usas Meta WhatsApp Business API)
- `META_PHONE_NUMBER_ID`: Phone Number ID de Meta (si usas Meta)

**Ejemplo mínimo para empezar (solo emails):**
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu-email@gmail.com
SMTP_PASS=tu-app-password
```

## Excel esperado (`storage/config.xlsx`)
- Hoja `sources`: columnas `id`, `url`, `siteKey` (ej. `remaxrd`, `c21sunsets`), `active` (bool), `maxPages`, `paginateParam`, `selectorsProfile`, `scheduleKey`.
- Hoja `filters`: `maxPriceUSD`, `country`, `city`, `typeProperty[]`, `minBeds`, `minBaths`, `textMustInclude`, `textMustExclude`.
- Hoja `notifications`: `emails[]`, `whatsappNumbers[]`, `sendHourUTC`, `batchSize`, `subjectTemplate`, `whatsappTemplate`.
- Hoja `sent`: `siteKey`, `listingId`, `hash`, `notifiedAt`.
- Hoja `schedules` (opcional): `scheduleKey`, `cron`, `timezone`.

Guarda el Excel en `storage/config.xlsx` o súbelo vía `POST /config/excel`.

## Endpoints

### API Principal
- `GET /health` - Health check del servidor
- `POST /config/excel` - Subir archivo Excel de configuración (multipart, campo `file`)
- `POST /jobs/run` - Ejecutar job manual según configuración cargada

### Preview de HTMLs
- `GET /preview/email` - Ver preview del email generado
- `GET /preview/list` - Listar todos los HTMLs disponibles en storage
- `GET /preview/:filename` - Ver cualquier HTML por nombre (sin extensión .html)
- `GET /storage/:filename` - Acceso directo a archivos en storage (incluyendo HTMLs, JSONs, etc.)

**Ejemplos:**
- `http://localhost:3000/preview/email` - Preview del email
- `http://localhost:3000/preview/list` - Lista de todos los previews disponibles
- `http://localhost:3000/storage/email-preview.html` - Acceso directo al archivo HTML

## Flujo del job
1. Lee Excel (`sources`, `filters`, `notifications`).
2. Ejecuta scrapers registrados (`remaxrd`, `c21sunsets`).
3. Aplica filtros.
4. Dedup (storage/sent.json y hoja `sent` si se sincroniza).
5. Envía notificaciones (email y WhatsApp).
6. Registra notificados.

## Próximos pasos
- Instalar dependencias (`npm install`).
- Crear Excel de ejemplo en `storage/config.xlsx`.
- Ajustar selectores reales en scrapers de RE/MAX RD y C21 Sunsets.
- Configurar `.env` con SMTP y WhatsApp.
- Probar `npm run dev` y `npm run scrape:site` con datos de ejemplo.

