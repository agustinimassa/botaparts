import fs from "fs";
import path from "path";
import { loadEnv } from "../utils/env.js";
import { renderEmailCompact, renderHtmlFromJson } from "../notifications/email/index.js";

type PropertiesData = {
  aiSummary?: string | null;
  listings?: any[];
};

const main = async () => {
  loadEnv();

  const dataPath = path.resolve("storage", "properties-data.json");
  if (!fs.existsSync(dataPath)) {
    throw new Error(`No existe ${dataPath}. Ejecutá primero 'npm run test:scrapers' una vez para generar el JSON.`);
  }

  const raw = await fs.promises.readFile(dataPath, "utf-8");
  const data = JSON.parse(raw) as PropertiesData;
  const aiSummary = (data.aiSummary as string | null | undefined) ?? null;
  const listings = (data.listings as any[] | undefined) ?? [];

  // WEB preview (interactivo)
  const webHtml = renderHtmlFromJson();
  const webPreviewPath = path.resolve("storage", "web-preview.html");
  await fs.promises.mkdir(path.dirname(webPreviewPath), { recursive: true });
  await fs.promises.writeFile(webPreviewPath, webHtml);

  // EMAIL preview (compacto)
  const emailHtml = renderEmailCompact(listings.slice(0, 50) as any, aiSummary);
  const emailPreviewPath = path.resolve("storage", "email-preview.html");
  await fs.promises.mkdir(path.dirname(emailPreviewPath), { recursive: true });
  await fs.promises.writeFile(emailPreviewPath, emailHtml);

  // eslint-disable-next-line no-console
  console.log("✅ Previews regenerados (sin scraping)", {
    webPreviewPath,
    emailPreviewPath,
    listings: listings.length,
    hasAiSummary: !!aiSummary,
  });
};

void main();


