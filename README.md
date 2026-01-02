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

Crea un archivo `.env` en la raíz del proyecto basándote en `env.example`. También puedes crear un archivo `.env.local` que sobrescribirá las variables de `.env` (útil para configuraciones locales que no quieres compartir).

**Nota:** El sistema carga primero `.env` y luego `.env.local` (si existe), por lo que las variables en `.env.local` tienen prioridad.

Las variables disponibles son:

### Variables Generales
- `PORT` (opcional, default: `3000`): Puerto donde escucha el servidor API
- `LOG_LEVEL` (opcional, default: `info`): Nivel de logging (`trace`, `debug`, `info`, `warn`, `error`, `fatal`)
- `PLAYWRIGHT_HEADLESS` (opcional, default: `true`): Modo headless de Playwright
  - `true` = navegador sin interfaz gráfica (más rápido, recomendado para producción)
  - `false` = navegador visible (útil para debugging y desarrollo)

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

### Variables Google Drive/Sheets (REQUERIDO)
- `GOOGLE_SHEET_URL` (recomendado): URL de Google Sheet (más simple, no requiere credenciales si el sheet es público)
  - Acepta tanto una URL normal `.../spreadsheets/d/<FILE_ID>/edit?gid=...` como una URL publicada `.../spreadsheets/d/e/<PUBLISHED_ID>/pubhtml`
- `GOOGLE_SHEET_PUBLISHED_URL` (legacy): sigue funcionando, pero se recomienda usar `GOOGLE_SHEET_URL`
- `GOOGLE_DRIVE_FILE_ID`: ID del archivo Excel en Google Drive (requiere credenciales)
- `GOOGLE_DRIVE_CREDENTIALS_PATH`: Ruta al archivo JSON de credenciales de Service Account (solo si usas `GOOGLE_DRIVE_FILE_ID`)
- `GOOGLE_DRIVE_CREDENTIALS_JSON`: Credenciales como JSON string (alternativa a `GOOGLE_DRIVE_CREDENTIALS_PATH`)

**⚠️ IMPORTANTE:** El sistema **requiere** configuración de Google Sheets/Drive. Debes configurar **una** de estas opciones:
- `GOOGLE_SHEET_URL` (recomendado, más simple)
- `GOOGLE_DRIVE_FILE_ID` + `GOOGLE_DRIVE_CREDENTIALS_PATH` (o `GOOGLE_DRIVE_CREDENTIALS_JSON`)

**💡 Recomendación:** Usa `GOOGLE_SHEET_URL` con un sheet compartido como **“Cualquiera con el enlace” (Viewer)**. Si el sheet es privado, vas a necesitar Google Drive API (credenciales).

**📖 Ver [GOOGLE_DRIVE_SETUP.md](./GOOGLE_DRIVE_SETUP.md) para instrucciones detalladas.**

**Ejemplo mínimo para empezar (solo emails):**
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu-email@gmail.com
SMTP_PASS=tu-app-password
```

## Excel esperado (Google Drive/Sheets - REQUERIDO)
- Hoja `sources`: columnas `id`, `url`, `siteKey` (ej. `remaxrd`, `c21sunsets`), `active` (bool), `maxPages`, `paginateParam`, `selectorsProfile`, `scheduleKey`.
- Hoja `filters`: `maxPriceUSD`, `country`, `city`, `typeProperty[]`, `minBeds`, `minBaths`, `textMustInclude`, `textMustExclude`.
- Hoja `notifications`: `emails[]`, `whatsappNumbers[]`, `sendHourUTC`, `batchSize`, `subjectTemplate`, `whatsappTemplate`.
- Hoja `sent`: `siteKey`, `listingId`, `hash`, `notifiedAt`.
- Hoja `schedules` (opcional): `scheduleKey`, `cron`, `timezone`.

**⚠️ IMPORTANTE:** El archivo Excel **debe estar en Google Drive/Sheets**. El sistema descargará automáticamente el archivo desde Google Drive antes de leerlo. Configura las variables de entorno de Google Drive/Sheets (ver sección anterior).

**Nota:** El archivo descargado se guarda temporalmente en `storage/config.xlsx` pero siempre se descarga desde Google Drive para asegurar que se use la versión más reciente.

## Endpoints

### API Principal
- `GET /health` - Health check del servidor
- `POST /config/excel` - Subir archivo Excel de configuración (multipart, campo `file`) - **Nota:** Solo para testing local. El job siempre descarga desde Google Drive/Sheets.
- `POST /jobs/run` - Ejecutar job manual según configuración cargada (descarga desde Google Drive/Sheets)

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

