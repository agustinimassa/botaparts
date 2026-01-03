import fs from "fs";
import path from "path";
import { loadExcelConfig } from "../config/excel.js";
import { applyFilters } from "../filters/applyFilters.js";
import { analyzeMarketWithAi } from "../ai/market.js";
import { scrapeRemaxRD } from "../scrapers/remaxrd.js";
import { scrapeC21Sunsets } from "../scrapers/c21sunsets.js";
import { renderEmailCompact, renderHtmlFromJson } from "../notifications/email/index.js";
import { logger } from "../utils/logger.js";
import { Listing } from "../models/types.js";

export type ScrapePreviewResult = {
  timestamp: string;
  aiSummary: string | null;
  listings: Listing[];
  stats: {
    total: number;
    bySite: Record<string, number>;
  };
  paths: {
    propertiesData: string;
    aiMarketAnalysis?: string;
    webPreview: string;
    emailPreview: string;
    scrapingSummary: string;
  };
};

const getSiteName = (siteKey: string): string => {
  const siteNames: Record<string, string> = {
    remaxrd: "RE/MAX RD",
    c21sunsets: "Century 21 Sunsets",
  };
  return siteNames[siteKey.toLowerCase()] || siteKey.toUpperCase();
};

export const runScrapeAndBuildPreviews = async (): Promise<ScrapePreviewResult> => {
  const start = Date.now();
  const timestamp = new Date().toISOString();

  logger.debug("🧪 Ejecutando scraping + generación de previews...");
  const config = await loadExcelConfig();

  const activeSources = config.sources.filter((s) => s.active);
  if (!activeSources.length) {
    throw new Error("No hay fuentes activas en el Excel");
  }

  const allScraped: Listing[] = [];
  for (const source of activeSources) {
    if (source.siteKey === "remaxrd") {
      allScraped.push(...(await scrapeRemaxRD(source, config.filters)));
      continue;
    }
    if (source.siteKey === "c21sunsets") {
      allScraped.push(...(await scrapeC21Sunsets(source, config.filters)));
      continue;
    }
    logger.warn({ siteKey: source.siteKey }, "No hay scraper para este siteKey (saltando)");
  }

  const filtered = applyFilters(allScraped, config.filters);

  // (Opcional) AI
  const aiEnabled = process.env.AI_ANALYSIS_ENABLED !== "false" && !!process.env.GROQ_API_KEY;
  let aiSummary: string | null = null;
  let aiByKey: Record<string, any> = {};
  let aiMarketAnalysisPath: string | undefined;

  if (aiEnabled && filtered.length) {
    try {
      const analysis = await analyzeMarketWithAi(filtered);
      aiSummary = analysis.summary;
      aiByKey = analysis.byKey || {};
      aiMarketAnalysisPath = path.resolve("storage", "ai-market-analysis.json");
      await fs.promises.mkdir(path.dirname(aiMarketAnalysisPath), { recursive: true });
      await fs.promises.writeFile(aiMarketAnalysisPath, JSON.stringify(analysis, null, 2));
    } catch (err: any) {
      logger.warn({ err }, "Falló el análisis AI (se continúa sin AI)");
    }
  }

  const listingsWithAi = filtered.map((l) => {
    const key = `${l.siteKey}:${l.listingId}`;
    const ai = aiByKey[key];
    return ai ? { ...l, ai } : l;
  });

  const bySite = listingsWithAi.reduce<Record<string, number>>((acc, l) => {
    acc[l.siteKey] = (acc[l.siteKey] ?? 0) + 1;
    return acc;
  }, {});

  // Persistencia (storage/)
  const propertiesDataPath = path.resolve("storage", "properties-data.json");
  await fs.promises.mkdir(path.dirname(propertiesDataPath), { recursive: true });
  await fs.promises.writeFile(
    propertiesDataPath,
    JSON.stringify(
      {
        timestamp,
        aiSummary,
        listings: listingsWithAi,
        stats: { total: listingsWithAi.length, bySite },
      },
      null,
      2,
    ),
  );

  const webPreviewPath = path.resolve("storage", "web-preview.html");
  const webHtml = renderHtmlFromJson();
  await fs.promises.writeFile(webPreviewPath, webHtml);

  const emailPreviewPath = path.resolve("storage", "email-preview.html");
  const emailHtml = renderEmailCompact(listingsWithAi, aiSummary);
  await fs.promises.writeFile(emailPreviewPath, emailHtml);

  const scrapingSummaryPath = path.resolve("storage", "scraping-summary.json");
  const siteStats = Object.keys(bySite).map((siteKey) => ({
    siteKey,
    siteName: getSiteName(siteKey),
    count: bySite[siteKey],
  }));
  await fs.promises.writeFile(
    scrapingSummaryPath,
    JSON.stringify(
      {
        timestamp,
        durationSec: Number(((Date.now() - start) / 1000).toFixed(2)),
        totalScraped: allScraped.length,
        totalAfterFilters: listingsWithAi.length,
        bySite: siteStats,
        previews: {
          web: webPreviewPath,
          email: emailPreviewPath,
        },
      },
      null,
      2,
    ),
  );

  logger.debug(
    {
      durationSec: Number(((Date.now() - start) / 1000).toFixed(2)),
      scraped: allScraped.length,
      filtered: listingsWithAi.length,
    },
    "✅ Scraping + previews completado",
  );

  return {
    timestamp,
    aiSummary,
    listings: listingsWithAi,
    stats: { total: listingsWithAi.length, bySite },
    paths: {
      propertiesData: propertiesDataPath,
      aiMarketAnalysis: aiMarketAnalysisPath,
      webPreview: webPreviewPath,
      emailPreview: emailPreviewPath,
      scrapingSummary: scrapingSummaryPath,
    },
  };
};


