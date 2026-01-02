# Formato del Excel de Configuración

Este documento describe el formato exacto que debe tener el archivo `storage/config.xlsx`.

## Método 1: Generar automáticamente (recomendado)

Ejecuta el script incluido:

```bash
npm run generate:excel
```

Esto creará el archivo `storage/config.xlsx` con todas las hojas y datos de ejemplo.

## Método 2: Crear manualmente

Si prefieres crear el Excel manualmente, sigue esta estructura:

---

## Hoja 1: `sources`

Define las fuentes (sitios web) a scrapear.

| Columna | Tipo | Descripción | Ejemplo |
|---------|------|-------------|---------|
| `id` | Texto | Identificador único | `1` |
| `siteKey` | Texto | Clave del sitio (debe coincidir con un scraper registrado) | `remaxrd` o `c21sunsets` |
| `url` | Texto | URL completa de la página a scrapear | `https://remaxrd.com/propiedades?...` |
| `active` | Boolean | Si está activo (TRUE/FALSE) | `TRUE` |
| `maxPages` | Número | Máximo de páginas a recorrer | `5` |
| `paginateParam` | Texto | Parámetro de paginación en la URL (si aplica) | `page` o vacío |
| `selectorsProfile` | Texto | Perfil de selectores CSS (opcional) | `default` |
| `scheduleKey` | Texto | Clave del schedule a usar (opcional) | `daily` |

**Ejemplo de filas:**

| id | siteKey | url | active | maxPages | paginateParam | selectorsProfile | scheduleKey |
|----|---------|-----|--------|----------|---------------|------------------|-------------|
| 1 | remaxrd | https://remaxrd.com/propiedades?... | TRUE | 5 | page | default | daily |
| 2 | c21sunsets | https://c21sunsets.com/es/s/bayahibe-la-altagracia | TRUE | 10 | | default | daily |

---

## Hoja 2: `filters`

Define los filtros globales a aplicar a todas las propiedades encontradas.

| Columna | Tipo | Descripción | Ejemplo |
|---------|------|-------------|---------|
| `maxPriceUSD` | Número | Precio máximo en USD | `500000` |
| `country` | Texto | País | `República Dominicana` |
| `city` | Texto | Ciudad | `Bayahibe` |
| `typeProperty` | Texto | Tipos de propiedad separados por coma | `apartment,house` |
| `minBeds` | Número | Mínimo de dormitorios | `2` |
| `minBaths` | Número | Mínimo de baños | `2` |
| `textMustInclude` | Texto | Palabras que deben aparecer (separadas por coma) | `vista al mar` |
| `textMustExclude` | Texto | Palabras que NO deben aparecer (separadas por coma) | `terreno,lote` |

**Ejemplo de fila (solo una fila de datos, después del header):**

| maxPriceUSD | country | city | typeProperty | minBeds | minBaths | textMustInclude | textMustExclude |
|-------------|---------|------|--------------|---------|----------|------------------|-----------------|
| 500000 | República Dominicana | Bayahibe | apartment,house | 2 | 2 | | terreno,lote |

---

## Hoja 3: `notifications`

Configuración de notificaciones (email y WhatsApp).

| Columna | Tipo | Descripción | Ejemplo |
|---------|------|-------------|---------|
| `emails` | Texto | Emails separados por coma | `email1@gmail.com,email2@example.com` |
| `whatsappNumbers` | Texto | Números de WhatsApp separados por coma (formato internacional) | `+1234567890,+0987654321` |
| `sendHourUTC` | Texto | Hora UTC para enviar notificaciones (formato HH:mm) | `14:00` |
| `batchSize` | Número | Máximo de propiedades por notificación | `10` |
| `subjectTemplate` | Texto | Plantilla del asunto del email (puede usar `{{count}}`) | `🏠 Nuevas propiedades encontradas - {{count}} resultados` |
| `whatsappTemplate` | Texto | Plantilla del mensaje de WhatsApp (puede usar `{{count}}`) | `Encontramos {{count}} nuevas propiedades` |

**Ejemplo de fila (solo una fila de datos, después del header):**

| emails | whatsappNumbers | sendHourUTC | batchSize | subjectTemplate | whatsappTemplate |
|--------|----------------|-------------|-----------|-----------------|-----------------|
| tu-email@gmail.com | +1234567890 | 14:00 | 10 | 🏠 Nuevas propiedades encontradas - {{count}} resultados | Encontramos {{count}} nuevas propiedades |

---

## Hoja 4: `sent`

Registro de propiedades ya notificadas (para evitar duplicados). Esta hoja se llena automáticamente, pero puedes iniciarla vacía.

| Columna | Tipo | Descripción | Ejemplo |
|---------|------|-------------|---------|
| `siteKey` | Texto | Clave del sitio | `remaxrd` |
| `listingId` | Texto | ID único de la propiedad | `12345` |
| `hash` | Texto | Hash único de la propiedad | `abc123def456...` |
| `notifiedAt` | Texto/Fecha | Fecha y hora de notificación | `2024-01-15 14:30:00` |

**Inicialmente vacía** (solo headers). Se llenará automáticamente cuando se envíen notificaciones.

---

## Hoja 5: `schedules` (opcional)

Programación de ejecuciones automáticas.

| Columna | Tipo | Descripción | Ejemplo |
|---------|------|-------------|---------|
| `scheduleKey` | Texto | Clave del schedule (referenciada en `sources`) | `daily` |
| `cron` | Texto | Expresión cron | `0 14 * * *` (diario a las 14:00 UTC) |
| `timezone` | Texto | Zona horaria | `America/Santo_Domingo` |

**Ejemplo de fila:**

| scheduleKey | cron | timezone |
|-------------|------|----------|
| daily | 0 14 * * * | America/Santo_Domingo |

**Expresiones cron comunes:**
- `0 14 * * *` - Diario a las 14:00 UTC
- `0 */6 * * *` - Cada 6 horas
- `0 9 * * 1` - Cada lunes a las 9:00 UTC

---

## Notas importantes

1. **Nombres de hojas**: Deben ser exactamente `sources`, `filters`, `notifications`, `sent` (y opcionalmente `schedules`).
2. **Headers**: La primera fila de cada hoja debe contener los nombres de las columnas exactamente como se muestran arriba.
3. **Tipos de datos**:
   - Booleanos: usa `TRUE`/`FALSE` o `1`/`0`
   - Arrays (emails, números): separa por comas en una sola celda
   - Fechas: formato texto o fecha de Excel
4. **Ubicación**: El archivo debe guardarse como `storage/config.xlsx` en la raíz del proyecto.
5. **Alternativa**: Puedes subir el Excel vía `POST /config/excel` en lugar de guardarlo manualmente.

---

## Validación

El sistema validará que:
- Existan las hojas requeridas (`sources`, `filters`, `notifications`)
- `sources` tenga al menos una fila con `active = TRUE`
- Los `siteKey` en `sources` coincidan con scrapers registrados (`remaxrd`, `c21sunsets`)

