import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";

const outputPath = path.resolve("storage", "config.xlsx");

async function generateExampleExcel() {
  const workbook = new ExcelJS.Workbook();

  // Hoja: sources
  const sourcesSheet = workbook.addWorksheet("sources");
  sourcesSheet.columns = [
    { header: "id", key: "id", width: 10 },
    { header: "siteKey", key: "siteKey", width: 15 },
    { header: "url", key: "url", width: 80 },
    { header: "active", key: "active", width: 10 },
    { header: "maxPages", key: "maxPages", width: 10 },
    { header: "paginateParam", key: "paginateParam", width: 20 },
    { header: "selectorsProfile", key: "selectorsProfile", width: 20 },
    { header: "scheduleKey", key: "scheduleKey", width: 15 },
  ];

  sourcesSheet.addRows([
    {
      id: "1",
      siteKey: "remaxrd",
      url: "https://remaxrd.com/propiedades?businessTypes=sale&currencyType=us&locations[]=id-440%26description-BAYAHIBE%26&typeProperty[]=apartment&ciudad=BAYAHIBE",
      active: true,
      maxPages: 5,
      paginateParam: "page",
      selectorsProfile: "default",
      scheduleKey: "daily",
    },
    {
      id: "2",
      siteKey: "c21sunsets",
      url: "https://c21sunsets.com/es/s/bayahibe-la-altagracia",
      active: true,
      maxPages: 10,
      paginateParam: "",
      selectorsProfile: "default",
      scheduleKey: "daily",
    },
  ]);

  // Hoja: filters
  const filtersSheet = workbook.addWorksheet("filters");
  filtersSheet.columns = [
    { header: "maxPriceUSD", key: "maxPriceUSD", width: 15 },
    { header: "country", key: "country", width: 20 },
    { header: "city", key: "city", width: 20 },
    { header: "typeProperty", key: "typeProperty", width: 30 },
    { header: "minBeds", key: "minBeds", width: 10 },
    { header: "minBaths", key: "minBaths", width: 10 },
    { header: "textMustInclude", key: "textMustInclude", width: 30 },
    { header: "textMustExclude", key: "textMustExclude", width: 30 },
  ];

  filtersSheet.addRow({
    maxPriceUSD: 500000,
    country: "República Dominicana",
    city: "Bayahibe",
    typeProperty: "apartment,house",
    minBeds: 2,
    minBaths: 2,
    textMustInclude: "",
    textMustExclude: "terreno,lote",
  });

  // Hoja: notifications
  const notificationsSheet = workbook.addWorksheet("notifications");
  notificationsSheet.columns = [
    { header: "emails", key: "emails", width: 50 },
    { header: "whatsappNumbers", key: "whatsappNumbers", width: 30 },
    { header: "sendHourUTC", key: "sendHourUTC", width: 15 },
    { header: "batchSize", key: "batchSize", width: 10 },
    { header: "subjectTemplate", key: "subjectTemplate", width: 50 },
    { header: "whatsappTemplate", key: "whatsappTemplate", width: 50 },
  ];

  notificationsSheet.addRow({
    emails: "tu-email@gmail.com,otro-email@example.com",
    whatsappNumbers: "+1234567890,+0987654321",
    sendHourUTC: "14:00",
    batchSize: 10,
    subjectTemplate: "🏠 Nuevas propiedades encontradas - {{count}} resultados",
    whatsappTemplate: "Encontramos {{count}} nuevas propiedades",
  });

  // Hoja: sent (vacía inicialmente, se llenará con el tiempo)
  const sentSheet = workbook.addWorksheet("sent");
  sentSheet.columns = [
    { header: "siteKey", key: "siteKey", width: 15 },
    { header: "listingId", key: "listingId", width: 30 },
    { header: "hash", key: "hash", width: 50 },
    { header: "notifiedAt", key: "notifiedAt", width: 25 },
  ];

  // Hoja: schedules (opcional)
  const schedulesSheet = workbook.addWorksheet("schedules");
  schedulesSheet.columns = [
    { header: "scheduleKey", key: "scheduleKey", width: 15 },
    { header: "cron", key: "cron", width: 30 },
    { header: "timezone", key: "timezone", width: 20 },
  ];

  schedulesSheet.addRow({
    scheduleKey: "daily",
    cron: "0 14 * * *",
    timezone: "America/Santo_Domingo",
  });

  // Crear directorio si no existe
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  // Guardar archivo
  await workbook.xlsx.writeFile(outputPath);
  console.log(`✅ Excel de ejemplo creado en: ${outputPath}`);
  console.log("\n📋 Hojas creadas:");
  console.log("  - sources: URLs de sitios a scrapear");
  console.log("  - filters: Filtros de búsqueda");
  console.log("  - notifications: Configuración de notificaciones");
  console.log("  - sent: Registro de propiedades ya notificadas (vacía inicialmente)");
  console.log("  - schedules: Programación de ejecuciones (opcional)");
}

generateExampleExcel().catch((err) => {
  console.error("Error al generar Excel:", err);
  process.exit(1);
});

