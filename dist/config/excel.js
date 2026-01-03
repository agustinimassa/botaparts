import path from "path";
import fs from "fs";
import ExcelJS from "exceljs";
import { logger } from "../utils/logger.js";
import { downloadExcelFromDrive, downloadPublishedSheet } from "./google-drive.js";
const defaultConfigPath = path.resolve("storage", "config.xlsx");
/**
 * Procesa un workbook de Excel y extrae la configuración
 */
function parseExcelWorkbook(workbook, excelPath) {
    const sourcesSheet = workbook.getWorksheet("sources");
    const filtersSheet = workbook.getWorksheet("filters");
    const notificationsSheet = workbook.getWorksheet("notifications");
    if (!sourcesSheet || !filtersSheet || !notificationsSheet) {
        throw new Error("Las hojas requeridas (sources, filters, notifications) faltan en el Excel");
    }
    // Convertir hoja sources a array de objetos
    const sources = [];
    const headerRowSources = sourcesSheet.getRow(1);
    const headersSources = [];
    headerRowSources.eachCell({ includeEmpty: false }, (cell) => {
        headersSources.push(cell.value?.toString() || "");
    });
    sourcesSheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1)
            return; // Skip header
        const rowData = {};
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const headerKey = headersSources[colNumber - 1];
            if (headerKey) {
                const value = cell.value;
                // Manejar valores booleanos y strings
                if (value === "TRUE" || value === true) {
                    rowData[headerKey] = true;
                }
                else if (value === "FALSE" || value === false) {
                    rowData[headerKey] = false;
                }
                else {
                    rowData[headerKey] = value?.toString() || "";
                }
            }
        });
        if (rowData.active === true || rowData.active === "TRUE" || rowData.active === 1) {
            sources.push(rowData);
        }
    });
    // Convertir hoja filters a objeto (primera fila de datos después del header)
    const filters = {};
    const rawFilterValues = {}; // Para debugging
    if (filtersSheet.rowCount > 1) {
        const headerRowFilters = filtersSheet.getRow(1);
        const filterRow = filtersSheet.getRow(2);
        headerRowFilters.eachCell({ includeEmpty: false }, (headerCell, colNumber) => {
            const dataCell = filterRow.getCell(colNumber);
            const key = headerCell.value?.toString() || "";
            const value = dataCell.value;
            // Guardar valor raw para debugging
            rawFilterValues[key] = {
                raw: value,
                type: typeof value,
                cellAddress: dataCell.address,
            };
            if (value !== null && value !== undefined) {
                // Convertir valores según el tipo esperado
                if (key === "maxPriceUSD" || key === "minPriceUSD" || key === "minBeds" || key === "minBaths") {
                    // Campos numéricos: convertir a número explícitamente
                    const numValue = typeof value === "number" ? value : parseFloat(value.toString());
                    if (!isNaN(numValue)) {
                        filters[key] = numValue;
                    }
                    else {
                        logger.warn({ key, value }, "Valor numérico inválido en filtros, ignorando");
                    }
                }
                else if (key === "typeProperty") {
                    // Array: puede venir como string separado por comas o como array
                    if (typeof value === "string") {
                        filters[key] = value.split(",").map((v) => v.trim()).filter(Boolean);
                    }
                    else if (Array.isArray(value)) {
                        filters[key] = value.map((v) => v.toString());
                    }
                    else {
                        filters[key] = [value.toString()];
                    }
                }
                else if (key === "textMustInclude" || key === "textMustExclude") {
                    // Arrays de strings: separar por comas si viene como string
                    if (typeof value === "string") {
                        filters[key] = value.split(",").map((v) => v.trim()).filter(Boolean);
                    }
                    else if (Array.isArray(value)) {
                        filters[key] = value.map((v) => v.toString());
                    }
                    else {
                        filters[key] = [value.toString()];
                    }
                }
                else {
                    // Otros campos: mantener como string o número según corresponda
                    if (typeof value === "number") {
                        filters[key] = value;
                    }
                    else {
                        filters[key] = value.toString();
                    }
                }
            }
        });
        // Log detallado de los filtros cargados para debugging
        logger.info({
            excelFile: excelPath,
            rawValues: rawFilterValues,
            processedFilters: filters,
        }, "✅ Filtros cargados desde Excel");
        logger.info({
            maxPriceUSD: {
                raw: rawFilterValues.maxPriceUSD?.raw,
                rawType: rawFilterValues.maxPriceUSD?.type,
                processed: filters.maxPriceUSD,
            },
            minPriceUSD: {
                raw: rawFilterValues.minPriceUSD?.raw,
                processed: filters.minPriceUSD,
            },
            city: {
                raw: rawFilterValues.city?.raw,
                processed: filters.city,
            },
            minBeds: {
                raw: rawFilterValues.minBeds?.raw,
                processed: filters.minBeds,
            },
            minBaths: {
                raw: rawFilterValues.minBaths?.raw,
                processed: filters.minBaths,
            },
        }, "📊 Detalle de valores leídos del Excel");
        // Advertencia si maxPriceUSD no está configurado o es inválido
        if (!filters.maxPriceUSD || isNaN(filters.maxPriceUSD)) {
            logger.warn({
                maxPriceUSD: filters.maxPriceUSD,
                rawValue: rawFilterValues.maxPriceUSD,
            }, "⚠️  maxPriceUSD no está configurado o es inválido - no se filtrará por precio");
        }
        else {
            logger.info({
                maxPriceUSD: filters.maxPriceUSD,
                rawValue: rawFilterValues.maxPriceUSD?.raw,
            }, `💰 Precio máximo configurado: $${filters.maxPriceUSD.toLocaleString()} USD`);
        }
    }
    // Convertir hoja notifications a objeto (primera fila de datos después del header)
    const notifications = {
        emails: [],
        whatsappNumbers: [],
    };
    if (notificationsSheet.rowCount > 1) {
        const headerRowNotif = notificationsSheet.getRow(1);
        const notifRow = notificationsSheet.getRow(2);
        headerRowNotif.eachCell({ includeEmpty: false }, (headerCell, colNumber) => {
            const dataCell = notifRow.getCell(colNumber);
            const key = headerCell.value?.toString() || "";
            const value = dataCell.value;
            if (value !== null && value !== undefined) {
                if (key === "emails") {
                    // Si es string, separar por comas; si es array, usar directamente
                    if (typeof value === "string") {
                        notifications.emails = value.split(",").map((e) => e.trim()).filter(Boolean);
                    }
                    else if (Array.isArray(value)) {
                        notifications.emails = value.map((e) => e.toString());
                    }
                }
                else if (key === "whatsappNumbers") {
                    if (typeof value === "string") {
                        notifications.whatsappNumbers = value.split(",").map((n) => n.trim()).filter(Boolean);
                    }
                    else if (Array.isArray(value)) {
                        notifications.whatsappNumbers = value.map((n) => n.toString());
                    }
                }
                else {
                    notifications[key] = value?.toString() || value;
                }
            }
        });
    }
    logger.info({ fuentes: sources.length, emails: notifications.emails?.length ?? 0 }, "Config Excel cargada");
    return { sources, filters, notifications };
}
/**
 * Carga la configuración desde un archivo Excel descargado de Google Drive/Sheets
 * Requiere configuración de GOOGLE_SHEET_PUBLISHED_URL o GOOGLE_DRIVE_FILE_ID
 */
export const loadExcelConfig = async (excelPath) => {
    // Si se proporciona un excelPath explícito (para testing), usarlo directamente
    if (excelPath) {
        logger.info({ path: excelPath }, "📄 Usando archivo Excel proporcionado explícitamente");
        if (!fs.existsSync(excelPath)) {
            throw new Error(`No se encontró el archivo Excel en ${excelPath}`);
        }
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(excelPath);
        return parseExcelWorkbook(workbook, excelPath);
    }
    // OBLIGATORIO: Debe estar configurado Google Sheets o Google Drive
    // Preferimos GOOGLE_SHEET_URL (más flexible: acepta /d/<FILE_ID>/edit?gid=... o /d/e/<PUBLISHED_ID>/pubhtml)
    // Mantenemos compatibilidad con GOOGLE_SHEET_PUBLISHED_URL (legacy)
    const googleDriveFileId = process.env.GOOGLE_DRIVE_FILE_ID;
    const googleSheetUrl = process.env.GOOGLE_SHEET_URL || process.env.GOOGLE_SHEET_PUBLISHED_URL;
    if (!googleDriveFileId && !googleSheetUrl) {
        throw new Error("❌ Se requiere configuración de Google Sheets/Drive.\n" +
            "   Configura una de estas variables en .env:\n" +
            "   - GOOGLE_SHEET_URL (recomendado, más simple)\n" +
            "   - GOOGLE_DRIVE_FILE_ID + GOOGLE_DRIVE_CREDENTIALS_PATH");
    }
    let finalExcelPath = defaultConfigPath;
    try {
        if (googleSheetUrl) {
            // Opción 1: Google Sheet vía URL (más simple, no requiere credenciales si el sheet es público)
            logger.info({ googleSheetUrl }, "Descargando Google Sheet desde URL...");
            finalExcelPath = await downloadPublishedSheet(googleSheetUrl, defaultConfigPath);
            // Verificar fecha de modificación del archivo descargado
            const stats = await fs.promises.stat(finalExcelPath);
            logger.info({
                path: finalExcelPath,
                downloadedAt: stats.mtime.toISOString(),
                size: `${(stats.size / 1024).toFixed(2)} KB`
            }, "✅ Google Sheet descargado exitosamente");
        }
        else if (googleDriveFileId) {
            // Opción 2: Google Drive con API (requiere credenciales)
            logger.info("Descargando Excel desde Google Drive usando API...");
            finalExcelPath = await downloadExcelFromDrive(googleDriveFileId, defaultConfigPath);
            // Verificar fecha de modificación del archivo descargado
            const stats = await fs.promises.stat(finalExcelPath);
            logger.info({
                path: finalExcelPath,
                downloadedAt: stats.mtime.toISOString(),
                size: `${(stats.size / 1024).toFixed(2)} KB`
            }, "✅ Excel descargado desde Google Drive");
        }
    }
    catch (error) {
        logger.error({ err: error }, "❌ Error al descargar desde Google Drive");
        throw new Error(`No se pudo descargar el Excel desde Google Drive: ${error.message}\n` +
            "   Verifica que:\n" +
            "   - GOOGLE_SHEET_PUBLISHED_URL esté correctamente configurado, O\n" +
            "   - GOOGLE_DRIVE_FILE_ID y GOOGLE_DRIVE_CREDENTIALS_PATH estén configurados");
    }
    // Verificar que el archivo existe
    if (!fs.existsSync(finalExcelPath)) {
        throw new Error(`No se encontró el archivo Excel en ${finalExcelPath}`);
    }
    // Log del archivo que se está usando
    const fileStats = await fs.promises.stat(finalExcelPath);
    logger.info({
        filePath: finalExcelPath,
        fileSize: `${(fileStats.size / 1024).toFixed(2)} KB`,
        lastModified: fileStats.mtime.toISOString(),
        source: googleSheetUrl ? "Google Sheets (descargado)" : "Google Drive (descargado)",
    }, "📄 Leyendo archivo Excel");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(finalExcelPath);
    return parseExcelWorkbook(workbook, finalExcelPath);
};
