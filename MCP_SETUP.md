# Configuración de MCP de Playwright en Cursor IDE

Este documento explica cómo configurar el servidor MCP de Playwright en Cursor IDE para que la IA pueda usar Playwright directamente.

## Método 1: Configuración en Cursor (Recomendado)

1. **Abre la configuración de MCP en Cursor:**
   - Presiona `Cmd+Shift+P` (macOS) o `Ctrl+Shift+P` (Windows/Linux)
   - Busca y ejecuta: `MCP: Open User Configuration` o `MCP: Configure Server`

2. **Agrega la configuración del servidor Playwright:**
   
   Si el archivo de configuración ya existe, agrega esto dentro de `mcpServers`:
   
   ```json
   {
     "mcpServers": {
       "playwright": {
         "command": "npx",
         "args": ["@playwright/mcp@latest", "--headless"]
       }
     }
   }
   ```

   Si es un archivo nuevo, usa esta estructura completa:
   
   ```json
   {
     "mcpServers": {
       "playwright": {
         "command": "npx",
         "args": ["@playwright/mcp@latest", "--headless"],
         "env": {}
       }
     }
   }
   ```

3. **Ubicación del archivo de configuración:**
   - **macOS**: `~/Library/Application Support/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
   - **Windows**: `%APPDATA%\Cursor\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`
   - **Linux**: `~/.config/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

   O busca en Cursor: `Cmd+,` → busca "MCP" → abre la configuración.

## Método 2: Usar el archivo del proyecto

Si prefieres tener la configuración en el proyecto, puedes copiar el contenido de `.cursor/mcp.json` a tu configuración de usuario de Cursor.

## Verificación

Una vez configurado:

1. Reinicia Cursor IDE
2. Abre la paleta de comandos (`Cmd+Shift+P`)
3. Busca comandos relacionados con MCP o Playwright
4. La IA ahora debería poder usar Playwright directamente para:
   - Navegar páginas web
   - Extraer datos
   - Tomar screenshots
   - Interactuar con elementos

## Opciones de configuración

- `--headless`: Ejecuta el navegador sin interfaz gráfica (recomendado)
- Sin `--headless`: Abre una ventana del navegador (útil para debugging)

## Notas

- Asegúrate de tener `@playwright/mcp` instalado globalmente o disponible vía `npx`
- El servidor MCP se iniciará automáticamente cuando Cursor lo necesite
- Puedes verificar que funciona pidiéndole a la IA que use Playwright para scrapear una página

## Troubleshooting

Si no funciona:

1. Verifica que `npx @playwright/mcp@latest` funciona en tu terminal
2. Asegúrate de que Node.js 18+ está instalado
3. Revisa los logs de Cursor para ver errores del servidor MCP
4. Intenta ejecutar manualmente: `npx @playwright/mcp@latest --headless`

