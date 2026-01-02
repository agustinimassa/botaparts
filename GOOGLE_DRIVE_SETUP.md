# Configuración de Google Drive/Sheets para Excel

**⚠️ IMPORTANTE:** Este proyecto **requiere** que el archivo Excel de configuración esté en Google Drive o Google Sheets. El sistema descargará automáticamente el archivo desde Google Drive antes de leerlo, asegurando que siempre se use la versión más reciente.

## Opción 1: Google Sheet público por link (Recomendado - Más Simple) ⭐

Usa una URL normal del sheet (formato `/d/<FILE_ID>/edit?gid=...`) **sin credenciales**, siempre que el documento esté con acceso público (al menos “Anyone with the link / Viewer”).

### Pasos:

1. **Hacé el sheet accesible por link:**
   - Abre tu Google Sheet
   - Click en **Compartir**
   - En “Acceso general”: selecciona **Cualquiera con el enlace** y permiso **Lector**

2. **Copia la URL normal del documento** (ejemplo):
   - `https://docs.google.com/spreadsheets/d/<FILE_ID>/edit?gid=<GID>`

3. **Configura la variable de entorno:**
   ```env
   GOOGLE_SHEET_URL=
   ```

4. **¡Listo!** El sistema descargará automáticamente el Excel desde tu Google Sheet.

**Ventajas:**
- ✅ No requiere credenciales
- ✅ No requiere configuración de Google Cloud
- ✅ Más simple y rápido de configurar
- ✅ Funciona inmediatamente

---

## Opción 2: Google Drive con API (Requiere Credenciales)

Si prefieres usar la API de Google Drive (más seguro pero más complejo):

## Requisitos Previos

1. **Instalar dependencias:**
   ```bash
   npm install googleapis
   ```

2. **Crear un proyecto en Google Cloud Console:**
   - Ve a [Google Cloud Console](https://console.cloud.google.com/)
   - Crea un nuevo proyecto o selecciona uno existente
   - Habilita la API de Google Drive

3. **Crear una Service Account:**
   - En Google Cloud Console, ve a "IAM & Admin" > "Service Accounts"
   - Crea una nueva Service Account
   - Descarga el archivo JSON de credenciales

4. **Compartir el archivo Excel con la Service Account:**
   - Abre tu archivo Excel en Google Drive
   - Haz clic en "Compartir"
   - Agrega el email de la Service Account (se ve como `nombre@proyecto.iam.gserviceaccount.com`)
   - Dale permisos de "Lector" (Viewer)

## Configuración

### Opción 1: Archivo de Credenciales (Recomendado)

1. Guarda el archivo JSON de credenciales en un lugar seguro (ej: `storage/google-credentials.json`)
2. Agrega a tu archivo `.env`:
   ```env
   GOOGLE_DRIVE_FILE_ID=tu-file-id-aqui
   GOOGLE_DRIVE_CREDENTIALS_PATH=storage/google-credentials.json
   ```

### Opción 2: Credenciales como JSON String

Si prefieres no tener un archivo físico, puedes poner las credenciales directamente en `.env`:

```env
GOOGLE_DRIVE_FILE_ID=tu-file-id-aqui
GOOGLE_DRIVE_CREDENTIALS_JSON={"type":"service_account","project_id":"...","private_key_id":"...","private_key":"...","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}
```

**⚠️ IMPORTANTE:** Si usas esta opción, asegúrate de que el archivo `.env` esté en `.gitignore` y nunca lo subas a un repositorio público.

## Obtener el File ID

El File ID es el identificador único del archivo en Google Drive. Puedes obtenerlo de dos formas:

### Método 1: Desde la URL del archivo
Cuando abres el archivo en Google Drive, la URL se ve así:
```
https://docs.google.com/spreadsheets/d/FILE_ID_AQUI/edit
```

El `FILE_ID_AQUI` es lo que necesitas.

### Método 2: Desde Google Sheets
Si tu archivo es un Google Sheet:
1. Abre el archivo
2. Ve a "Archivo" > "Compartir" > "Publicar en la web"
3. O simplemente copia el ID de la URL cuando el archivo está abierto

## Variables de Entorno

### Opción 1: Google Sheet por URL (Recomendado)

```env
# URL del Google Sheet (requiere que el sheet sea accesible por link)
GOOGLE_SHEET_URL=https://docs.google.com/spreadsheets/d/TU_FILE_ID/edit?gid=0
```

### Opción 2: Google Drive API

```env
# ID del archivo Excel en Google Drive
GOOGLE_DRIVE_FILE_ID=1a2b3c4d5e6f7g8h9i0j

# Ruta al archivo JSON de credenciales de Service Account
GOOGLE_DRIVE_CREDENTIALS_PATH=storage/google-credentials.json

# O alternativamente, las credenciales como JSON string (menos seguro)
# GOOGLE_DRIVE_CREDENTIALS_JSON={"type":"service_account",...}
```

**⚠️ IMPORTANTE:** Debes configurar **una** de estas opciones. El sistema **no funcionará** sin configuración de Google Drive/Sheets.

## Comportamiento

- **Si `GOOGLE_SHEET_URL` está configurado:** El sistema descargará automáticamente el Excel desde el Google Sheet (sin credenciales si es público por link)
- **Si `GOOGLE_DRIVE_FILE_ID` está configurado:** El sistema descargará automáticamente el Excel desde Google Drive usando la API (requiere credenciales)
- **Si ninguna está configurada:** El sistema lanzará un error indicando que se requiere configuración de Google Drive/Sheets

**Nota:** El archivo descargado se guarda temporalmente en `storage/config.xlsx` pero siempre se descarga desde Google Drive para asegurar que se use la versión más reciente.

## Solución de Problemas

### Error: "Se requiere GOOGLE_DRIVE_CREDENTIALS_PATH o GOOGLE_DRIVE_CREDENTIALS_JSON"
- Verifica que hayas configurado una de las dos variables de credenciales en tu `.env`

### Error: "Error al descargar Excel desde Google Drive"
- Verifica que la Service Account tenga acceso al archivo
- Verifica que el File ID sea correcto
- Verifica que el archivo JSON de credenciales sea válido

### Error: "Se requiere configuración de Google Sheets/Drive"
- Verifica que hayas configurado `GOOGLE_SHEET_URL` o `GOOGLE_DRIVE_FILE_ID` en tu `.env`
- Si usas `GOOGLE_DRIVE_FILE_ID`, verifica que también tengas configuradas las credenciales

### Error al descargar desde Google Drive
- Verifica que `GOOGLE_DRIVE_FILE_ID` esté configurado correctamente en tu `.env`
- Verifica que no haya errores en los logs al intentar descargar desde Drive
- Si usas `GOOGLE_SHEET_URL`, verifica que el sheet tenga “Cualquiera con el enlace” (Viewer)

## Seguridad

- **Nunca subas el archivo JSON de credenciales a un repositorio público**
- Agrega `storage/google-credentials.json` a tu `.gitignore`
- Si usas `GOOGLE_DRIVE_CREDENTIALS_JSON`, asegúrate de que `.env` esté en `.gitignore`
- Usa permisos mínimos necesarios para la Service Account (solo lectura de Drive)

