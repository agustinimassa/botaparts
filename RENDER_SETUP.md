# 🎯 Guía Específica para Render.com Free Tier

## Características de Render Free Tier

- **RAM:** 512MB
- **CPU:** Shared (0.1 CPU)
- **Disco:** Efímero (se borra al reiniciar)
- **Sleep:** Se duerme después de 15 min de inactividad
- **Build:** 400 segundos timeout
- **Deployment:** Automático desde Git

## ✅ Configuración Óptima Aplicada

### 1. Variables de entorno configuradas en `render.yaml`:

```yaml
envVars:
  - key: NODE_ENV
    value: production
  - key: PLAYWRIGHT_HEADLESS
    value: "true"
  - key: ENABLE_MEMORY_MONITOR
    value: "true"
  - key: CHROMIUM_SINGLE_PROCESS
    value: "false"  # ⚠️ CRÍTICO: false para estabilidad
  - key: LOG_LEVEL
    value: info
```

### 2. Dockerfile optimizado:

```dockerfile
# Ya configurado con:
CMD ["node", "--expose-gc", "--max-old-space-size=450", "dist/index.js"]
```

## 🚀 Pasos para Deployar en Render

### Opción A: Desde el Dashboard (Recomendado)

1. **Ir a [dashboard.render.com](https://dashboard.render.com)**

2. **New > Web Service**

3. **Conectar tu repositorio Git**

4. **Configuración:**
   - **Name:** `bothouse` (o el que prefieras)
   - **Runtime:** Docker ✅
   - **Plan:** Free
   - **Branch:** main
   - **Dockerfile Path:** Dockerfile ✅

5. **Variables de entorno** (agregar las que necesites):

```env
# OBLIGATORIAS
NODE_ENV=production
PLAYWRIGHT_HEADLESS=true
ENABLE_MEMORY_MONITOR=true
CHROMIUM_SINGLE_PROCESS=false

# RECOMENDADAS
ADMIN_TOKEN=tu-token-secreto-aqui
LOG_LEVEL=info

# OPCIONALES (según necesites)
GROQ_API_KEY=tu-groq-key
AI_ANALYSIS_ENABLED=true

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu-email@gmail.com
SMTP_PASS=tu-app-password
```

6. **Crear servicio** y esperar deployment

### Opción B: Usando render.yaml (Automático)

Ya tienes el archivo `render.yaml` configurado. Render lo detectará automáticamente.

1. **Conectar repositorio en Render Dashboard**
2. **Render detectará `render.yaml`**
3. **Confirmar configuración**
4. **Deployment automático** ✅

## 📊 Consumo de Memoria Esperado en Render

```
┌─────────────────────────────────────┐
│ Primera ejecución (arranque)        │
├─────────────────────────────────────┤
│ Node.js + API                  80MB │
│ Sistema base Render            30MB │
├─────────────────────────────────────┤
│ TOTAL en reposo               110MB │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Durante scraping (pico)             │
├─────────────────────────────────────┤
│ Node.js + API                  80MB │
│ Chromium compartido           150MB │
│ Contexto activo                30MB │
│ Buffers/Temporal               40MB │
│ Sistema                        30MB │
├─────────────────────────────────────┤
│ TOTAL máximo              ~330MB ✅ │
└─────────────────────────────────────┘

Margen de seguridad: ~180MB
```

## ⚠️ Limitaciones de Render Free Tier

### 1. **Sleep Mode (15 min inactividad)**

El servicio se duerme y tarda ~30 segundos en despertar.

**Solución:** Usar cron job externo para mantenerlo activo:

```bash
# En crontab.guru o similar (cada 10 minutos)
*/10 * * * * curl https://tu-app.onrender.com/health
```

O usar servicios como:
- [UptimeRobot](https://uptimerobot.com/) (free, ping cada 5 min)
- [Cronitor](https://cronitor.io/) (free tier)
- [Cron-job.org](https://cron-job.org/)

### 2. **Disco efímero (no persistente)**

El directorio `storage/` se borra al reiniciar.

**Impacto:**
- ✅ No afecta funcionalidad principal
- ❌ Pierdes el historial de propiedades vistas
- ❌ Pierdes logs de deduplicación

**Solución opcional:**
- Usar Google Drive para persistir datos (ya implementado)
- O migrar a Render Disk ($1/mes por 1GB)

### 3. **Build timeout (400 segundos)**

Playwright es pesado de instalar.

**Ya optimizado en Dockerfile:**
- Usa imagen base de Playwright (más rápido)
- Caché de layers eficiente

### 4. **CPU compartida (0.1 CPU)**

El scraping puede ser lento.

**Mitigación:**
- ✅ Ya limitado a `maxPages: 5` (o menos)
- ✅ Scrapers secuenciales (no paralelos)
- ✅ Timeouts generosos

## 🔍 Verificar Deployment

### 1. Verificar logs en tiempo real:

En Render Dashboard > tu servicio > **Logs**

Buscar estas líneas:

```
✅ Navegador compartido iniciado correctamente - singleProcess: false
💾 Memoria actual - rss: "110MB"
API escuchando en puerto 10000
```

### 2. Verificar endpoints:

```bash
# Health check
curl https://tu-app.onrender.com/health
# Respuesta: {"ok":true}

# Ver estado del scraping
curl https://tu-app.onrender.com/api/scrape/status
# Respuesta: {"running":false,"hasPreviews":false,...}
```

### 3. Probar scraping manual:

1. Ir a `https://tu-app.onrender.com/`
2. Ingresar tu ADMIN_TOKEN
3. Clic en "Actualizar propiedades"
4. Esperar 2-3 minutos
5. Ver logs en Render Dashboard

## 🎯 Monitoreo en Render

### Logs importantes a buscar:

```bash
# ✅ Memoria OK
💾 Memoria actual - rss: "280MB"

# 🟡 Memoria alta (warning)
🟡 Memoria alta - monitoreando

# 🔴 Memoria crítica
🔴 MEMORIA CRÍTICA - considerar reinicio

# ✅ Job exitoso
Job completado - duration: "45s", scraped: 25, afterDedup: 3
```

### Métricas de Render (Dashboard):

1. **Memory Usage:** Debe estar < 400MB
2. **CPU Usage:** Picos normales durante scraping
3. **Response Time:** /health debe responder < 1s
4. **Build Time:** Debe ser < 300s

## 🐛 Troubleshooting Específico de Render

### Error: "Service Unavailable" al arrancar

**Causa:** Health check falla antes de que Playwright termine de iniciar

**Solución:**
```yaml
# En render.yaml (ya configurado)
healthCheckPath: /health
```

El endpoint `/health` responde inmediatamente sin iniciar Chromium.

### Error: "Out of Memory" en Render

**Causa:** Pico de memoria > 512MB

**Solución inmediata:**
1. Reducir `maxPages` en tu Excel de config a `2` o `3`
2. Deshabilitar análisis AI temporalmente:
   ```env
   AI_ANALYSIS_ENABLED=false
   ```
3. Verificar que `CHROMIUM_SINGLE_PROCESS=false`

**Solución permanente:**
- Considerar Render Starter ($7/mes = 1GB RAM)

### Error: "Build Failed" (timeout)

**Causa:** Instalación de Playwright toma > 400s

**Solución:**
```dockerfile
# Ya implementado: usar imagen base con Playwright preinstalado
FROM mcr.microsoft.com/playwright:v1.57.0-jammy
```

### Servicio se duerme constantemente

**Solución:** Configurar ping externo cada 10 minutos

```bash
# En UptimeRobot (free):
Monitor Type: HTTP(s)
URL: https://tu-app.onrender.com/health
Interval: 5 minutes
```

## 💰 Cuándo considerar Render Paid

**Quedate en Free si:**
- ✅ Memoria pico < 400MB
- ✅ Scrapeas 1-2 veces al día
- ✅ No te importa el sleep mode
- ✅ No necesitas persistencia de disco

**Upgrade a Starter ($7/mes) si:**
- ❌ Memoria > 450MB constantemente
- ❌ Necesitas scraping frecuente (>4x/día)
- ❌ Necesitas persistencia de datos
- ❌ Necesitas 0.5 CPU dedicado

## 📚 Recursos adicionales

- [Render Free Tier Limits](https://render.com/docs/free)
- [Render Docker Deployments](https://render.com/docs/docker)
- [Render Environment Variables](https://render.com/docs/environment-variables)

## 🎉 Checklist Final

Antes de deployar, verificar:

- [ ] `render.yaml` tiene `CHROMIUM_SINGLE_PROCESS=false`
- [ ] Variables de entorno configuradas en Dashboard
- [ ] `ADMIN_TOKEN` configurado (recomendado)
- [ ] `Dockerfile` (no `Dockerfile.chromium`) seleccionado
- [ ] Git push realizado
- [ ] Deployment completo en Dashboard
- [ ] Logs muestran "✅ Navegador compartido iniciado"
- [ ] `/health` responde OK
- [ ] Scraping manual funciona sin crashes
- [ ] Memoria pico < 400MB en logs

---

**¡Tu servicio ahora está optimizado para Render Free Tier!** 🚀

Si sigues teniendo el error de "browser has been closed", verifica que:
1. `CHROMIUM_SINGLE_PROCESS=false` esté configurado en Render Dashboard
2. Hayas hecho push del código actualizado
3. El deployment se haya completado correctamente
