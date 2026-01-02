import { logger } from "../utils/logger.js";
import fs from "fs";
import path from "path";

// URLs base estándar de Google Sheets
const GOOGLE_SHEETS_BASE_URL = "https://docs.google.com/spreadsheets";
const GOOGLE_SHEETS_EXPORT_FORMAT = "xlsx";
const GOOGLE_SHEETS_DEFAULT_GID = "0"; // gid=0 significa la primera hoja
const REQUIRED_SHEETS = ["sources", "filters", "notifications"] as const;

/**
 * Export (requiere File ID real: /d/{FILE_ID}/...)
 * Ej: https://docs.google.com/spreadsheets/d/{FILE_ID}/export?format=xlsx&gid=0
 */
const buildDriveExportUrl = (fileId: string, gid?: string): string => {
  const finalGid = gid ?? GOOGLE_SHEETS_DEFAULT_GID;
  return `${GOOGLE_SHEETS_BASE_URL}/d/${fileId}/export?format=${GOOGLE_SHEETS_EXPORT_FORMAT}&gid=${finalGid}`;
};

/**
 * Published-to-web (usa Published ID: /d/e/{PUBLISHED_ID}/...)
 * Para sheets publicados, el endpoint más fiable es /pub?output=xlsx
 * Ej: https://docs.google.com/spreadsheets/d/e/{PUBLISHED_ID}/pub?output=xlsx&gid=0
 */
const buildPublishedXlsxUrl = (publishedId: string, gid?: string): string => {
  const finalGid = gid ?? GOOGLE_SHEETS_DEFAULT_GID;
  return `${GOOGLE_SHEETS_BASE_URL}/d/e/${publishedId}/pub?output=${GOOGLE_SHEETS_EXPORT_FORMAT}&gid=${finalGid}`;
};

/**
 * Published-to-web CSV
 * Ej: https://docs.google.com/spreadsheets/d/e/{PUBLISHED_ID}/pub?output=csv&gid=0
 */
const buildPublishedCsvUrl = (publishedId: string, gid: string): string => {
  return `${GOOGLE_SHEETS_BASE_URL}/d/e/${publishedId}/pub?output=csv&gid=${gid}`;
};

/**
 * CSV parser minimalista (sin deps). Soporta comillas dobles y comas dentro de comillas.
 */
const parseCsv = (csvText: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    // Evitar agregar última fila vacía por newline final
    if (row.length === 1 && row[0] === "" && rows.length === 0) return;
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < csvText.length; i++) {
    const c = csvText[i];
    const next = i + 1 < csvText.length ? csvText[i + 1] : "";

    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i++;
        continue;
      }
      if (c === '"') {
        inQuotes = false;
        continue;
      }
      field += c;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ",") {
      pushField();
      continue;
    }
    if (c === "\r") continue;
    if (c === "\n") {
      pushField();
      pushRow();
      continue;
    }
    field += c;
  }

  // flush
  pushField();
  // Only push if not empty trailing
  if (row.length > 1 || row[0] !== "") pushRow();

  return rows;
};

/**
 * Intenta extraer mapping {sheetName -> gid} desde el HTML de publish-to-web.
 * En `pubhtml` suele haber links con `?gid=` para cada tab.
 */
const extractGidsFromPubhtml = (html: string): Record<string, string> => {
  const map: Record<string, string> = {};

  // Buscar ocurrencias donde aparezca el nombre del sheet cerca de un gid.
  // Nota: es heurístico, pero funciona bien cuando los tabs están visibles (como tu screenshot).
  for (const sheetName of REQUIRED_SHEETS) {
    // 1) Buscar anclas con gid y texto del sheet
    const re1 = new RegExp(
      `<a[^>]+href="[^"]*gid=(\\d+)[^"]*"[^>]*>\\s*${sheetName}\\s*<\\/a>`,
      "i",
    );
    const m1 = html.match(re1);
    if (m1?.[1]) {
      map[sheetName] = m1[1];
      continue;
    }

    // 2) Buscar patrón genérico: sheetName ... gid=123
    const re2 = new RegExp(`${sheetName}[\\s\\S]{0,200}?gid=(\\d+)`, "i");
    const m2 = html.match(re2);
    if (m2?.[1]) {
      map[sheetName] = m2[1];
      continue;
    }
  }

  return map;
};

/**
 * Descarga un Google Sheet publicado públicamente como Excel
 * No requiere credenciales - funciona con sheets publicados como "publish to web"
 * 
 * NOTA: Las URLs de exportación se construyen dinámicamente usando el identificador
 * extraído de GOOGLE_SHEET_PUBLISHED_URL. Estas URLs siguen el formato estándar
 * de la API pública de Google Sheets y no pueden venir de variables de entorno
 * porque son parte del contrato de la API.
 * 
 * @param publishedUrl - URL pública del Google Sheet (formato /e/... o /d/...)
 *   Esta URL viene de la variable de entorno GOOGLE_SHEET_PUBLISHED_URL
 * @param outputPath - Ruta donde guardar el archivo descargado (opcional, por defecto en storage/)
 * @returns Ruta del archivo descargado
 */
export const downloadPublishedSheet = async (
  publishedUrl: string,
  outputPath?: string,
): Promise<string> => {
  try {
    // Extraer identificadores
    // - Published-to-web: /d/e/{PUBLISHED_ID}/pubhtml  -> publishedId
    // - Direct file URL:  /d/{FILE_ID}/edit          -> fileId
    //
    // OJO: una URL /d/e/... también matchea /d/{...} con {..} = "e".
    // Por eso primero chequeamos /d/e/ explícitamente.
    const gidFromQuery = (() => {
      try {
        const u = new URL(publishedUrl);
        return u.searchParams.get("gid") ?? undefined;
      } catch {
        return undefined;
      }
    })();

    const deMatch = publishedUrl.match(/\/d\/e\/([^\/?#]+)/);
    const dMatch = publishedUrl.match(/\/d\/([^\/?#]+)/);

    const publishedId = deMatch?.[1];
    const fileId = dMatch?.[1] && dMatch[1] !== "e" ? dMatch[1] : undefined;

    if (!publishedId && !fileId) {
      throw new Error("No se pudo extraer el identificador (publishedId o fileId) de la URL proporcionada");
    }

    const DEFAULT_HEADERS = {
      // Algunos endpoints de Google responden distinto sin User-Agent/Accept “de navegador”
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*;q=0.8",
    } as const;

    // Función auxiliar para intentar descargar (incluye snippet del body si falla)
    const attemptDownload = async (url: string): Promise<Response> => {
      const response = await fetch(url, {
        redirect: "follow",
        headers: DEFAULT_HEADERS,
      });
      if (!response.ok) {
        let bodySnippet: string | undefined;
        try {
          const text = await response.text();
          bodySnippet = text.slice(0, 400);
        } catch {
          // ignore
        }
        throw new Error(
          `Error al descargar: ${response.status} ${response.statusText}${
            bodySnippet ? ` | body: ${JSON.stringify(bodySnippet)}` : ""
          }`,
        );
      }

      // Si esperamos un XLSX pero Google nos devuelve HTML, usualmente es:
      // - Sheet privado (redirección a login)
      // - Endpoint inválido para ese tipo de link
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("text/html")) {
        let bodySnippet: string | undefined;
        try {
          const text = await response.text();
          bodySnippet = text.slice(0, 400);
        } catch {
          // ignore
        }
        throw new Error(
          `La descarga respondió HTML en lugar de XLSX (content-type=${contentType}). ` +
            `Esto suele pasar si el Google Sheet NO es público (requiere login) o si el endpoint no existe. ` +
            `${bodySnippet ? `| body: ${JSON.stringify(bodySnippet)}` : ""}`,
        );
      }

      return response;
    };

    // Helper: intenta extraer File ID real desde el HTML de pubhtml (si está presente)
    const tryExtractFileIdFromPublishedHtml = async (
      url: string,
    ): Promise<string | null> => {
      try {
        const res = await fetch(url, { redirect: "follow", headers: DEFAULT_HEADERS });
        if (!res.ok) return null;
        const html = await res.text();

        // A veces el HTML contiene enlaces al documento original con /spreadsheets/d/{FILE_ID}/...
        const m =
          html.match(/https?:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]{20,})\b/) ||
          html.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]{20,})\b/);
        return m?.[1] ?? null;
      } catch {
        return null;
      }
    };

    // Descargar
    let exportUrl: string;
    let response: Response;

    if (publishedId) {
      // Publish-to-web:
      // - Google frecuentemente NO permite bajar XLSX directo (400/404) aunque el pubhtml sea visible.
      // - Pero sí permite bajar CSV por pestaña via gid.
      // Solución robusta: leer pubhtml, detectar automáticamente los gid de las pestañas requeridas,
      // descargar CSVs y reconstruir un XLSX local (para que exceljs lo lea igual que siempre).
      logger.info(
        { publishedId, originalUrl: publishedUrl },
        "Google Sheet publicado detectado. Reconstruyendo XLSX desde CSVs (auto-detect gid)...",
      );

      // 1) Descargar pubhtml
      const pubRes = await fetch(publishedUrl, { redirect: "follow", headers: DEFAULT_HEADERS });
      if (!pubRes.ok) {
        const txt = await pubRes.text().catch(() => "");
        throw new Error(
          `No se pudo leer pubhtml: ${pubRes.status} ${pubRes.statusText}${txt ? ` | body: ${JSON.stringify(txt.slice(0, 400))}` : ""}`,
        );
      }
      const pubHtml = await pubRes.text();

      // 2) Extraer gid por nombre de sheet
      const gidMap = extractGidsFromPubhtml(pubHtml);
      const missing = REQUIRED_SHEETS.filter((s) => !gidMap[s]);
      if (missing.length) {
        throw new Error(
          `El pubhtml es accesible, pero no pude encontrar los gid de estas pestañas: ${missing.join(", ")}. ` +
            `Asegurate de que existan las pestañas con esos nombres exactos en el Google Sheet y que estén publicadas.`,
        );
      }

      // 3) Descargar CSVs y armar XLSX
      const ExcelJS = (await import("exceljs")).default as any;
      const workbook = new ExcelJS.Workbook();

      for (const sheetName of REQUIRED_SHEETS) {
        const gid = gidMap[sheetName]!;
        const csvUrl = buildPublishedCsvUrl(publishedId, gid);
        logger.info({ sheetName, gid, csvUrl }, "Descargando CSV de pestaña publicada...");
        const csvRes = await fetch(csvUrl, { redirect: "follow", headers: DEFAULT_HEADERS });
        if (!csvRes.ok) {
          const txt = await csvRes.text().catch(() => "");
          throw new Error(
            `Error al descargar CSV (${sheetName}, gid=${gid}): ${csvRes.status} ${csvRes.statusText}${
              txt ? ` | body: ${JSON.stringify(txt.slice(0, 400))}` : ""
            }`,
          );
        }
        const csvText = await csvRes.text();
        const rows = parseCsv(csvText);

        const ws = workbook.addWorksheet(sheetName);
        for (const r of rows) {
          ws.addRow(r);
        }
      }

      // 4) Guardar XLSX
      const finalOutputPath = outputPath || path.resolve("storage", "config.xlsx");
      await fs.promises.mkdir(path.dirname(finalOutputPath), { recursive: true });
      if (fs.existsSync(finalOutputPath)) {
        logger.debug({ path: finalOutputPath }, "Eliminando archivo local existente antes de descargar");
        await fs.promises.unlink(finalOutputPath);
      }
      await workbook.xlsx.writeFile(finalOutputPath);
      logger.info({ path: finalOutputPath }, "XLSX reconstruido exitosamente desde publish-to-web");
      return finalOutputPath;
    } else {
      // Para URLs directas, usar export?format=xlsx
      exportUrl = buildDriveExportUrl(fileId!, gidFromQuery);
      logger.info(
        { fileId, gid: gidFromQuery ?? GOOGLE_SHEETS_DEFAULT_GID, exportUrl, originalUrl: publishedUrl },
        "Descargando Google Sheet por File ID (export?format=xlsx)...",
      );
      response = await attemptDownload(exportUrl);
    }

    // Determinar la ruta de salida
    const finalOutputPath = outputPath || path.resolve("storage", "config.xlsx");

    // Crear el directorio si no existe
    await fs.promises.mkdir(path.dirname(finalOutputPath), { recursive: true });

    // Eliminar archivo existente si existe (para asegurar que se descarga la versión más reciente)
    if (fs.existsSync(finalOutputPath)) {
      logger.debug({ path: finalOutputPath }, "Eliminando archivo local existente antes de descargar");
      await fs.promises.unlink(finalOutputPath);
    }

    // Guardar el archivo
    const buffer = await response.arrayBuffer();
    await fs.promises.writeFile(finalOutputPath, Buffer.from(buffer));

    logger.info({ path: finalOutputPath }, "Google Sheet descargado exitosamente como Excel");

    return finalOutputPath;
  } catch (error: any) {
    logger.error({ err: error, url: publishedUrl }, "Error al descargar Google Sheet publicado");
    throw new Error(
      `Error al descargar Google Sheet publicado: ${error.message}`,
    );
  }
};

/**
 * Descarga un archivo Excel desde Google Drive usando la API (requiere credenciales)
 * @param fileId - ID del archivo en Google Drive (se obtiene de la URL del archivo)
 * @param outputPath - Ruta donde guardar el archivo descargado (opcional, por defecto en storage/)
 * @returns Ruta del archivo descargado
 */
export const downloadExcelFromDrive = async (
  fileId: string,
  outputPath?: string,
): Promise<string> => {
  try {
    // Importar googleapis dinámicamente (solo si está instalado)
    let google: any;
    try {
      const googleapis = await import("googleapis");
      google = googleapis.google;
    } catch (error) {
      throw new Error(
        "googleapis no está instalado. Ejecuta: npm install googleapis",
      );
    }

    // Verificar que existan las credenciales necesarias
    const credentialsPath = process.env.GOOGLE_DRIVE_CREDENTIALS_PATH;
    const credentialsJson = process.env.GOOGLE_DRIVE_CREDENTIALS_JSON;

    if (!credentialsPath && !credentialsJson) {
      throw new Error(
        "Se requiere GOOGLE_DRIVE_CREDENTIALS_PATH o GOOGLE_DRIVE_CREDENTIALS_JSON en las variables de entorno",
      );
    }

    // Cargar credenciales
    let credentials: any;
    if (credentialsJson) {
      // Si las credenciales están en formato JSON string
      credentials = JSON.parse(credentialsJson);
    } else if (credentialsPath) {
      // Si las credenciales están en un archivo
      const credsFile = fs.readFileSync(credentialsPath, "utf-8");
      credentials = JSON.parse(credsFile);
    }

    // Autenticar usando Service Account
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });

    const drive = google.drive({ version: "v3", auth });

    // Descargar el archivo
    logger.info({ fileId }, "Descargando archivo Excel desde Google Drive...");

    const response = await drive.files.get(
      {
        fileId,
        alt: "media",
      },
      {
        responseType: "stream",
      },
    );

    // Determinar la ruta de salida
    const finalOutputPath =
      outputPath || path.resolve("storage", "config.xlsx");

    // Crear el directorio si no existe
    await fs.promises.mkdir(path.dirname(finalOutputPath), { recursive: true });

    // Guardar el archivo
    const writeStream = fs.createWriteStream(finalOutputPath);
    response.data.pipe(writeStream);

    await new Promise<void>((resolve, reject) => {
      writeStream.on("finish", () => {
        logger.info({ path: finalOutputPath }, "Archivo Excel descargado exitosamente");
        resolve();
      });
      writeStream.on("error", reject);
    });

    return finalOutputPath;
  } catch (error: any) {
    logger.error({ err: error, fileId }, "Error al descargar archivo desde Google Drive");
    throw new Error(
      `Error al descargar Excel desde Google Drive: ${error.message}`,
    );
  }
};

/**
 * Obtiene información del archivo en Google Drive (útil para verificar que existe)
 */
export const getDriveFileInfo = async (fileId: string) => {
  try {
    // Importar googleapis dinámicamente (solo si está instalado)
    let google: any;
    try {
      const googleapis = await import("googleapis");
      google = googleapis.google;
    } catch (error) {
      throw new Error(
        "googleapis no está instalado. Ejecuta: npm install googleapis",
      );
    }

    const credentialsPath = process.env.GOOGLE_DRIVE_CREDENTIALS_PATH;
    const credentialsJson = process.env.GOOGLE_DRIVE_CREDENTIALS_JSON;

    if (!credentialsPath && !credentialsJson) {
      throw new Error(
        "Se requiere GOOGLE_DRIVE_CREDENTIALS_PATH o GOOGLE_DRIVE_CREDENTIALS_JSON",
      );
    }

    let credentials: any;
    if (credentialsJson) {
      credentials = JSON.parse(credentialsJson);
    } else if (credentialsPath) {
      const credsFile = fs.readFileSync(credentialsPath, "utf-8");
      credentials = JSON.parse(credsFile);
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });

    const drive = google.drive({ version: "v3", auth });

    const fileInfo = await drive.files.get({
      fileId,
      fields: "id,name,mimeType,modifiedTime",
    });

    return fileInfo.data;
  } catch (error: any) {
    logger.error({ err: error }, "Error al obtener información del archivo");
    throw error;
  }
};

