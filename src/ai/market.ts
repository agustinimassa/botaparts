import { Listing } from "../models/types.js";
import { groqChatCompletionText } from "./groq.js";

export type AiMarketAnalysis = {
  model: string;
  generatedAt: string;
  summary: string;
  byKey: Record<
    string,
    {
      kind: "oportunidad" | "alerta" | "info";
      label: string;
      tooltip: string;
    }
  >;
};

const parseAreaM2 = (area?: string): number | null => {
  if (!area) return null;
  const token = String(area).match(/[\d.,]+/)?.[0];
  if (!token) return null;

  const raw = token.replace(/\s+/g, "");
  let normalized = raw;

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

const mean = (nums: number[]): number | null => {
  if (!nums.length) return null;
  const sum = nums.reduce((acc, n) => acc + n, 0);
  return sum / nums.length;
};

const listingKey = (l: Pick<Listing, "siteKey" | "listingId">) => `${l.siteKey}:${l.listingId}`;

export const analyzeMarketWithAi = async (listings: Listing[]): Promise<AiMarketAnalysis> => {
  const model = process.env.AI_MODEL ?? "llama-3.1-8b-instant";
  const maxConsidered = Number(process.env.AI_ANALYSIS_MAX_LISTINGS ?? 120);

  const sliced = listings.slice(0, Number.isFinite(maxConsidered) ? maxConsidered : 120);

  const enriched = sliced.map((l) => {
    const areaM2 = parseAreaM2(l.area);
    const usdPerM2 = computeUsdPerM2(l.priceUSD, l.area);
    return {
      key: listingKey(l),
      siteKey: l.siteKey,
      listingId: l.listingId,
      title: l.title,
      location: l.location,
      priceUSD: l.priceUSD ?? null,
      area: l.area ?? null,
      areaM2,
      usdPerM2,
      beds: l.beds ?? null,
      baths: l.baths ?? null,
      badges: l.badges ?? [],
      url: l.url,
    };
  });

  const usdList = enriched
    .map((e) => e.usdPerM2)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0);

  const priceList = enriched
    .map((e) => e.priceUSD)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0);

  const candidatesBest = [...enriched]
    .filter((e) => typeof e.usdPerM2 === "number" && Number.isFinite(e.usdPerM2))
    .sort((a, b) => (a.usdPerM2 as number) - (b.usdPerM2 as number))
    .slice(0, 12);

  const candidatesWorst = [...enriched]
    .filter((e) => typeof e.usdPerM2 === "number" && Number.isFinite(e.usdPerM2))
    .sort((a, b) => (b.usdPerM2 as number) - (a.usdPerM2 as number))
    .slice(0, 8);

  const missing = enriched
    .filter((e) => e.priceUSD == null || e.areaM2 == null || e.usdPerM2 == null)
    .slice(0, 8);

  const metrics = {
    n: enriched.length,
    nUsdPerM2: usdList.length,
    priceUSD: {
      min: priceList.length ? Math.min(...priceList) : null,
      max: priceList.length ? Math.max(...priceList) : null,
      mean: mean(priceList),
      median: median(priceList),
    },
    usdPerM2: {
      min: usdList.length ? Math.min(...usdList) : null,
      max: usdList.length ? Math.max(...usdList) : null,
      mean: mean(usdList),
      median: median(usdList),
    },
  };

  const prompt = [
    "Analizá este mercado inmobiliario a partir de un dataset de listings.",
    "",
    "Reglas:",
    "- Respondé SOLO con JSON válido (sin texto extra, sin markdown).",
    "- No inventes datos: si falta info, usá 'N/D' o explicalo en tooltip.",
    "- El objetivo es generar etiquetas cortas y tooltips útiles para mostrar en un HTML.",
    "",
    "Salida requerida (JSON):",
    "{",
    '  "summary": string,',
    '  "byKey": {',
    '    "<siteKey>:<listingId>": { "kind": "oportunidad"|"alerta"|"info", "label": string, "tooltip": string }',
    "  }",
    "}",
    "",
    "Definición de kinds:",
    "- oportunidad: bajo USD/m² relativo, buena relación m²/precio, o buena compra potencial dentro de la muestra.",
    "- alerta: USD/m² muy alto relativo, datos sospechosos o incompletos que afectan la interpretación.",
    "- info: comentario neutral útil (por ejemplo, 'USD/m² cercano a la mediana', 'precio competitivo en su zona', etc.).",
    "",
    "Métricas globales calculadas:",
    JSON.stringify(metrics),
    "",
    "Candidatos (mejores por USD/m²):",
    JSON.stringify(candidatesBest),
    "",
    "Candidatos (más caros por USD/m²):",
    JSON.stringify(candidatesWorst),
    "",
    "Candidatos con datos faltantes:",
    JSON.stringify(missing),
    "",
    "Nota: Solo generá anotaciones (byKey) para keys que aparezcan en los candidatos anteriores.",
  ].join("\n");

  const baseMessages = [
    {
      role: "system" as const,
      content:
        "Sos un analista inmobiliario experto. Escribís micro-insights claros, accionables y conservadores.",
    },
    { role: "user" as const, content: prompt },
  ];

  const extractJsonText = (raw: string): string => {
    const trimmed = raw.trim();
    // Remove common markdown fences anywhere in the response
    const withoutFences = trimmed.replace(/```json\s*/gi, "").replace(/```/g, "").trim();

    try {
      JSON.parse(withoutFences);
      return withoutFences;
    } catch {
      // Fallback: take substring between first "{" and last "}"
      const start = withoutFences.indexOf("{");
      const end = withoutFences.lastIndexOf("}");
      if (start >= 0 && end > start) return withoutFences.slice(start, end + 1);
      return withoutFences;
    }
  };

  const parseOrThrow = (raw: string) => {
    const jsonText = extractJsonText(raw);
    return JSON.parse(jsonText) as { summary?: unknown; byKey?: unknown };
  };

  let parsed: { summary?: unknown; byKey?: unknown } | null = null;
  let lastText: string | null = null;

  try {
    lastText = await groqChatCompletionText({
      model,
      messages: baseMessages,
      maxTokens: 1200,
      temperature: 0.2,
      retries: 2,
    });
    parsed = parseOrThrow(lastText);
  } catch (err) {
    // Retry once with a stricter correction prompt if the model didn't return strict JSON.
    lastText = lastText ?? "";
    const fixText = await groqChatCompletionText({
      model,
      messages: [
        ...baseMessages,
        { role: "assistant", content: lastText },
        {
          role: "user",
          content:
            "Tu respuesta anterior no fue JSON válido. Reintentá: devolvé SOLO JSON válido estricto (doble comillas en keys/strings, sin trailing commas, sin markdown, sin texto extra).",
        },
      ],
      maxTokens: 1200,
      temperature: 0,
      retries: 2,
    });
    parsed = parseOrThrow(fixText);
  }

  if (!parsed) throw new Error("AI market analysis: respuesta vacía");
  if (typeof parsed?.summary !== "string") {
    throw new Error("AI market analysis: 'summary' inválido");
  }
  if (!parsed?.byKey || typeof parsed.byKey !== "object") {
    throw new Error("AI market analysis: 'byKey' inválido");
  }

  return {
    model,
    generatedAt: new Date().toISOString(),
    summary: parsed.summary,
    byKey: parsed.byKey as AiMarketAnalysis["byKey"],
  };
};


