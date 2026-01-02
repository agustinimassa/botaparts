# TODO próximos pasos

## Configuración inicial
- [x] Estructura del proyecto creada
- [x] Dependencias definidas y vulnerabilidades resueltas (eliminado mjml, handlebars, reemplazado xlsx por exceljs)
- [x] Instalar dependencias localmente: `npm install`
- [x] Crear archivo `.env` con variables de entorno necesarias
- [ ] Crear Excel de ejemplo en `storage/config.xlsx` con hojas (`sources`, `filters`, `notifications`, `sent`, opcional `schedules`)

## Desarrollo de scrapers
- [x] Ajustar selectores reales de RE/MAX RD en `src/scrapers/remaxrd.ts`
- [x] Ajustar selectores reales de C21 Sunsets en `src/scrapers/c21sunsets.ts`
- [x] Implementar paginación con scroll infinito en RE/MAX RD (máximo 5 páginas)
- [x] Implementar paginación con botón "Show more" en C21 Sunsets (máximo 5 páginas)
- [x] Agregar deduplicación dentro de los scrapers para evitar propiedades duplicadas
- [x] Mejorar manejo de errores para evitar fallos en la búsqueda de propiedades
- [x] Extraer imágenes de las propiedades en ambos scrapers
- [ ] Probar scraping de cada sitio individualmente con paginación completa

## Configuración de notificaciones
- [ ] Configurar credenciales SMTP en `.env` (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM)
- [ ] Configurar proveedor de WhatsApp (Twilio/Meta) en `.env`
- [ ] Probar envío de email con datos de prueba
- [ ] Probar envío de WhatsApp con datos de prueba

## Testing y validación
- [ ] Probar `npm run dev` para iniciar el servidor
- [ ] Probar endpoint `POST /config/excel` para subir configuración
- [ ] Probar endpoint `POST /jobs/run` para ejecutar el job manualmente
- [ ] Probar `npm run scrape:site` con datos de ejemplo
- [ ] Verificar que la deduplicación funciona correctamente
- [ ] Verificar que los filtros se aplican correctamente

## Mejoras futuras
- [ ] Agregar más sitios inmobiliarios al registro de scrapers
- [ ] Implementar sistema de scheduling con node-cron
- [ ] Agregar tests unitarios
- [ ] Agregar logging más detallado
- [ ] Optimizar rendimiento del scraping

