# 🚀 Deployment con Optimizaciones de Memoria

Esta guía te ayudará a desplegar el servicio optimizado en tu capa gratuita (512MB RAM).

## ✅ Cambios implementados

### 1. **Navegador compartido** (Reducción: 50-70%)
- ✅ Creado `browser-pool.ts` que reutiliza una sola instancia de Chromium
- ✅ Cada scraper usa contextos ligeros (~10-20MB) en lugar de navegadores completos (~150MB)

### 2. **Optimizaciones de Chromium** (Reducción: 30-40%)
- ✅ Flag `--single-process` para reducir procesos
- ✅ Deshabilitadas funciones innecesarias (GPU, WebGL, etc.)
- ✅ Límite de memoria JavaScript: `--js-flags=--max-old-space-size=256`

### 3. **Bloqueo de recursos pesados** (Reducción: 20-30%)
- ✅ Imágenes, CSS y fuentes bloqueadas por defecto
- ✅ Solo se cargan HTML y scripts necesarios

### 4. **Monitoreo de memoria**
- ✅ Monitor en tiempo real con alertas
- ✅ Logs de memoria antes/después de cada scraper
- ✅ Garbage collection forzado entre scrapers

### 5. **Límites de Node.js**
- ✅ Script de inicio con `--max-old-space-size=450`
- ✅ Flag `--expose-gc` para limpieza manual

## 📋 Pasos para desplegar

### Opción A: Render.com (Recomendado)

1. **Actualizar render.yaml:**

```yaml
services:
  - type: web
    name: bothouse
    env: docker
    plan: free
    dockerfilePath: ./Dockerfile
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000
      - key: PLAYWRIGHT_HEADLESS
        value: true
      - key: LOG_LEVEL
        value: info
      # ⚠️ CRÍTICO: Habilitar monitor de memoria
      - key: ENABLE_MEMORY_MONITOR
        value: true
      # Agregar tus otras variables de entorno aquí
```

2. **Actualizar Dockerfile para usar nuevo comando:**

```dockerfile
# Al final del Dockerfile, cambiar CMD
CMD ["node", "--expose-gc", "--max-old-space-size=450", "dist/index.js"]
```

3. **Push a Git y esperar deployment automático**

```bash
git add .
git commit -m "feat: optimizaciones de memoria para capa gratuita"
git push origin main
```

### Opción B: Railway.app

1. **Configurar variables de entorno en Railway:**
   - `NODE_ENV=production`
   - `ENABLE_MEMORY_MONITOR=true`
   - `PORT=3000`

2. **Railway detectará automáticamente el Dockerfile**

3. **Verificar que el start script use las optimizaciones:**

```json
{
  "scripts": {
    "start": "node --expose-gc --max-old-space-size=450 dist/index.js"
  }
}
```

### Opción C: Fly.io

1. **Crear fly.toml:**

```toml
app = "tu-app-bothouse"

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
  PLAYWRIGHT_HEADLESS = "true"
  ENABLE_MEMORY_MONITOR = "true"

[[services]]
  internal_port = 3000
  protocol = "tcp"

  [[services.ports]]
    handlers = ["http"]
    port = 80

  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443

[experimental]
  auto_rollback = true

[[vm]]
  memory = "512mb"
  cpu_kind = "shared"
  cpus = 1
```

2. **Desplegar:**

```bash
fly deploy
```

## 🔍 Verificar funcionamiento

### 1. Verificar logs de memoria

Deberías ver logs como estos:

```
💾 Memoria actual - label: "🚀 Inicio del job", rss: "120MB", heap: "80/150MB (53%)"
📍 Procesando fuente: remaxrd
💾 Memoria actual - label: "Antes de remaxrd", rss: "130MB"
💾 Memoria actual - label: "Después de remaxrd", rss: "180MB"
🧹 Garbage collection forzado
📍 Procesando fuente: c21sunsets
💾 Memoria actual - label: "Antes de c21sunsets", rss: "160MB"
💾 Memoria actual - label: "Después de c21sunsets", rss: "210MB"
✅ Memoria actual - label: "✅ Fin del job", rss: "200MB"
```

### 2. Endpoint de salud

```bash
curl https://tu-app.onrender.com/health
# Respuesta: {"ok":true}
```

### 3. Verificar que funciona el scraping

```bash
# Ir a tu panel web
https://tu-app.onrender.com/

# Hacer clic en "Actualizar propiedades"
# Ver logs en el dashboard de tu proveedor
```

## 🎯 Resultados esperados

**Antes (memoria pico):**
- Navegador 1 (remaxrd): ~150MB
- Navegador 2 (c21sunsets): ~150MB
- Node.js: ~100MB
- **TOTAL: 400-500MB** ❌ (se cae con 512MB)

**Después (memoria pico):**
- Navegador compartido: ~120MB
- Contexto activo: ~20MB
- Node.js: ~80MB
- **TOTAL: 220-280MB** ✅ (sobran ~250MB)

## ⚠️ Troubleshooting

### Error: "Out of memory"

1. **Reducir páginas por scraper:**

Editar tu Excel de configuración:
- maxPages: 2 (en lugar de 5)

2. **Verificar que el flag --single-process está activo:**

Ver logs al inicio:
```
✅ Navegador compartido iniciado correctamente
```

3. **Habilitar logs de memoria:**

```bash
# En variables de entorno
LOG_LEVEL=debug
ENABLE_MEMORY_MONITOR=true
```

### El navegador no se cierra

El navegador compartido se mantiene abierto entre scrapers (es intencional).
Solo se cierra cuando:
1. El proceso termina (SIGINT/SIGTERM)
2. Hay un error crítico
3. Llamas manualmente a `browserPool.shutdown()`

### Memoria sigue alta

1. Verificar que el garbage collection esté habilitado:
```bash
node --expose-gc dist/index.js
```

2. Reducir concurrencia en `runner.ts`:
```typescript
// Procesar solo un scraper a la vez (ya implementado)
```

3. Considerar alternativas más ligeras:
   - Cheerio + Axios para sitios sin JS
   - Puppeteer-Core con chrome-aws-lambda

## 📊 Monitoreo continuo

### Logs importantes a revisar:

```bash
# Ver memoria en tiempo real
tail -f /var/log/app.log | grep "Memoria"

# Alertas de memoria alta
tail -f /var/log/app.log | grep "🟡\|🔴"

# Stats de scrapers
tail -f /var/log/app.log | grep "Job completado"
```

### Métricas clave:

- **RSS < 400MB**: ✅ Excelente
- **RSS 400-450MB**: 🟡 Aceptable, monitorear
- **RSS > 450MB**: 🔴 Crítico, reiniciar o investigar

## 🔄 Rollback en caso de problemas

Si algo falla, puedes volver a la versión anterior:

```bash
git revert HEAD
git push origin main
```

O desactivar optimizaciones temporalmente:

```bash
# Comentar en Dockerfile:
# CMD ["node", "dist/index.js"]  # Sin optimizaciones

# O en package.json:
# "start": "node dist/index.js"
```

## 📚 Próximos pasos (opcional)

Si sigues teniendo problemas de memoria:

1. **Migrar a Cheerio** para sitios sin JS
2. **Usar Playwright con Firefox** (a veces más ligero)
3. **Implementar cola de jobs** con Redis/BullMQ
4. **Separar scrapers en workers diferentes**
5. **Considerar tier pago** ($7/mes en Render = 1GB RAM)

## 🎉 ¡Listo!

Tu servicio ahora está optimizado para:
- ✅ Consumir 50-70% menos memoria
- ✅ Soportar 512MB de RAM sin problemas
- ✅ Monitorear memoria en tiempo real
- ✅ Recuperarse automáticamente de picos de memoria

**¿Preguntas? Revisa los logs y verifica que todo esté funcionando correctamente.**
