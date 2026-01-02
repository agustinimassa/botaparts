import path from "path";
import fs from "fs";
import ExcelJS from "exceljs";
import { logger } from "../utils/logger.js";
const defaultConfigPath = path.resolve("storage", "config.xlsx");
export const loadExcelConfig = async (excelPath = defaultConfigPath) => {
    if (!fs.existsSync(excelPath)) {
        throw new Error(`No se encontró el archivo Excel en ${excelPath}`);
    }
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(excelPath);
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
    if (filtersSheet.rowCount > 1) {
        const headerRowFilters = filtersSheet.getRow(1);
        const filterRow = filtersSheet.getRow(2);
        headerRowFilters.eachCell({ includeEmpty: false }, (headerCell, colNumber) => {
            const dataCell = filterRow.getCell(colNumber);
            const key = headerCell.value?.toString() || "";
            const value = dataCell.value;
            if (value !== null && value !== undefined) {
                // Convertir números y strings apropiadamente
                if (typeof value === "number") {
                    filters[key] = value;
                }
                else {
                    filters[key] = value.toString();
                }
            }
        });
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
};
