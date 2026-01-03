import fs from "fs";
import path from "path";
import { loadEnv } from "../utils/env.js";
import { groqChatCompletionText } from "../ai/groq.js";

type ListingLike = {
  title?: string;
  url?: string;
  priceUSD?: number;
  location?: string;
  beds?: number;
  baths?: number;
  area?: string;
  siteKey?: string;
  listingId?: string;
};

const parseAreaM2 = (area?: string): number | null => {
  if (!area) return null;
  const token = String(area).match(/[\d.,]+/)?.[0];
  if (!token) return null;

  const raw = token.replace(/\s+/g, "");
  let normalized = raw;

  // "1,234.56" => 1234.56 ; "1.234,56" no lo esperamos, pero lo toleramos
  if (raw.includes(",") && raw.includes(".")) {
    normalized = raw.replace(/,/g, "");
  } else if (raw.includes(",")) {
    const parts = raw.split(",");
    const last = parts[parts.length - 1] ?? "";
    if (last.length > 0 && last.length <= 2) normalized = raw.replace(",", ".");
    else normalized = raw.replace(/,/g, "");
  }

  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const computeUsdPerM2 = (priceUSD?: number, area?: string): number | null => {
  if (!priceUSD || priceUSD <= 0) return null;
  const m2 = parseAreaM2(area);
  if (!m2) return null;
  const v = priceUSD / m2;
  return Number.isFinite(v) && v > 0 ? v : null;
};

const mean = (nums: number[]): number | null => {
  if (!nums.length) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  return sum / nums.length;
};

const median = (nums: number[]): number | null => {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const a = sorted[mid - 1];
  const b = sorted[mid];
  if (typeof a !== "number" || typeof b !== "number") return null;
  return (a + b) / 2;
};

const usage = () => {
  // eslint-disable-next-line no-console
  console.log(
    [
      "Uso:",
      "  npm run ai:analyze -- [ruta-json] [--limit N]",
      "",
      "Ejemplos:",
      "  npm run ai:analyze",
      "  npm run ai:analyze -- ./storage/properties-data.json --limit 80",
      "",
      "Notas:",
      "  - Requiere GROQ_API_KEY en .env/.env.local",
      "  - Usa el modelo llama-3.1-8b-instant (barato) en free tier (rate-limited)",
    ].join("\n"),
  );
};

const main = async () => {
  loadEnv();

  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    usage();
    process.exit(0);
  }

  let limit = Number(process.env.AI_ANALYZE_LIMIT ?? 80);
  let jsonPathArg: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--limit") {
      const v = args[i + 1];
      limit = Number(v);
      i++;
      continue;
    }
    if (!a.startsWith("--") && !jsonPathArg) {
      jsonPathArg = a;
    }
  }

  if (!Number.isFinite(limit) || limit <= 0) {
    usage();
    process.exit(1);
  }

  const inputPath = path.resolve(jsonPathArg ?? path.resolve("storage", "properties-data.json"));

  if (!fs.existsSync(inputPath)) {
    throw new Error(`No existe el archivo: ${inputPath}`);
  }

  const raw = await fs.promises.readFile(inputPath, "utf-8");
  const parsed = JSON.parse(raw) as { listings?: ListingLike[] } | ListingLike[];

  const listings: ListingLike[] = Array.isArray(parsed) ? parsed : (parsed.listings ?? []);
  const sliced = listings.slice(0, limit);

  const departamentos = sliced.map((l) => {
    const m2 = parseAreaM2(l.area);
    const usdPerM2 = computeUsdPerM2(l.priceUSD, l.area);
    return {
      siteKey: l.siteKey,
      listingId: l.listingId,
      title: l.title,
      location: l.location,
      priceUSD: l.priceUSD,
      beds: l.beds,
      baths: l.baths,
      area: l.area,
      areaM2: m2,
      usdPerM2,
      url: l.url,
    };
  });

  const priceList = departamentos
    .map((d) => d.priceUSD)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0);
  const usdPerM2List = departamentos
    .map((d) => d.usdPerM2)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0);

  const opportunities = [...departamentos]
    .filter((d) => typeof d.usdPerM2 === "number" && Number.isFinite(d.usdPerM2))
    .sort((a, b) => (a.usdPerM2 as number) - (b.usdPerM2 as number))
    .slice(0, 5);

  const expensiveByUsdPerM2 = [...departamentos]
    .filter((d) => typeof d.usdPerM2 === "number" && Number.isFinite(d.usdPerM2))
    .sort((a, b) => (b.usdPerM2 as number) - (a.usdPerM2 as number))
    .slice(0, 5);

  const groups = departamentos.reduce<Record<string, number>>((acc, d) => {
    const loc = (d.location ?? "SIN_UBICACION").trim().toUpperCase();
    acc[loc] = (acc[loc] ?? 0) + 1;
    return acc;
  }, {});

  const missing = departamentos.filter((d) => d.priceUSD == null || d.areaM2 == null || d.usdPerM2 == null);

  const prompt = [
    "Analizá este dataset de departamentos (propiedades). Ya calculé métricas básicas para evitar errores aritméticos.",
    "",
    "IMPORTANTE: Respondé SOLO con JSON válido (sin texto extra, sin markdown).",
    "",
    "Tareas:",
    "- Explicar el resumen del mercado (conclusiones) usando las métricas provistas.",
    "- Revisar oportunidades (son las 5 más baratas por USD/m²) y comentar qué tienen en común.",
    "- Revisar outliers caros (top por USD/m²) y sugerir hipótesis.",
    "- Data quality: señalar faltantes y campos sospechosos.",
    "",
    "Formato de salida (JSON):",
    "{ resumen, oportunidades, outliers, grupos, dataQuality, recomendaciones }",
    "",
    "Métricas calculadas:",
    JSON.stringify({
      n: departamentos.length,
      precio: {
        min: priceList.length ? Math.min(...priceList) : null,
        max: priceList.length ? Math.max(...priceList) : null,
        mean: mean(priceList),
        median: median(priceList),
      },
      usdPerM2: {
        min: usdPerM2List.length ? Math.min(...usdPerM2List) : null,
        max: usdPerM2List.length ? Math.max(...usdPerM2List) : null,
        mean: mean(usdPerM2List),
        median: median(usdPerM2List),
      },
      oportunidades: opportunities,
      outliersCarosUsdPerM2: expensiveByUsdPerM2,
      grupos: groups,
      faltantes: missing.map((d) => ({ listingId: d.listingId, title: d.title, priceUSD: d.priceUSD, areaM2: d.areaM2, usdPerM2: d.usdPerM2, url: d.url })),
      muestra: departamentos,
    }),
  ].join("\n");

  const text = await groqChatCompletionText({
    model: "llama-3.1-8b-instant",
    messages: [
      { role: "system", content: "Sos un analista inmobiliario experto y muy práctico." },
      { role: "user", content: prompt },
    ],
    maxTokens: 1200,
    temperature: 0.2,
    retries: 2,
  });

  // eslint-disable-next-line no-console
  console.log(text);
};

void main();


