# Dependencias y propósito

## Producción
- `playwright`: navegador headless para scrapear páginas inmobiliarias.
- `fastify`: servidor HTTP ligero para exponer endpoints (`/config/excel`, `/jobs/run`, `/health`).
- `@fastify/multipart`: manejo de uploads multipart (subida del Excel de configuración).
- `@fastify/static`: servir archivos estáticos si se necesitan (p. ej. assets de plantillas).
- `fastify-plugin`: facilita componer plugins Fastify.
- `node-cron`: programar ejecuciones periódicas del worker sin infraestructura extra.
- `exceljs`: lectura del Excel de configuración (fuentes, filtros, notificaciones). Alternativa segura a `xlsx` que evita vulnerabilidades conocidas.
- `pino` / `pino-pretty`: logging estructurado y legible en desarrollo.
- `nodemailer`: envío de correos HTML con resúmenes de propiedades (HTML inline sin dependencias vulnerables).
- `dotenv`: carga de variables de entorno (.env).
- `better-sqlite3`: almacenamiento local rápido para deduplicación/registro (`sent`).

## Desarrollo
- `typescript`: tipado estático.
- `ts-node`: ejecutar TS directamente en desarrollo.
- `@types/node`: tipos de Node.
- `eslint`: linting.
- `eslint-config-prettier`: evita conflictos entre ESLint y Prettier.
- `prettier`: formateo de código.
- `nodemon`: recarga en caliente durante desarrollo.

## Notas
- Se eliminaron `mjml` y `handlebars` para evitar vulnerabilidades relacionadas con `html-minifier`. Los emails se generan con HTML inline simple y seguro.
- Se usa `overrides` en `package.json` para forzar que cualquier dependencia que intente usar `xlsx` use `exceljs` en su lugar.

