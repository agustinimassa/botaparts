export type GroqChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type GroqChatCompletionOptions = {
  model?: string;
  messages: GroqChatMessage[];
  temperature?: number;
  maxTokens?: number;
  retries?: number;
};

const GROQ_CHAT_COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const getGroqApiKey = (): string => {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    throw new Error(
      "Falta GROQ_API_KEY en variables de entorno. Configurala en .env o .env.local",
    );
  }
  return key;
};

export const groqChatCompletionText = async (
  opts: GroqChatCompletionOptions,
): Promise<string> => {
  const apiKey = getGroqApiKey();
  const model = opts.model ?? "llama-3.1-8b-instant";
  const temperature = opts.temperature ?? 0.2;
  const max_tokens = opts.maxTokens ?? 900;
  const retries = opts.retries ?? 2;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: opts.messages,
        temperature,
        max_tokens,
      }),
    });

    if (res.status === 429 && attempt < retries) {
      const retryAfter = res.headers.get("retry-after");
      const waitMs = (() => {
        const n = retryAfter ? Number(retryAfter) : NaN;
        if (Number.isFinite(n) && n > 0) return Math.ceil(n * 1000);
        // backoff simple
        return 800 * (attempt + 1);
      })();
      await sleep(waitMs);
      continue;
    }

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      const detail =
        json?.error?.message ??
        json?.message ??
        (typeof json === "string" ? json : undefined);
      throw new Error(
        `Groq API error: ${res.status} ${res.statusText}${detail ? ` | ${detail}` : ""}`,
      );
    }

    const text: unknown = json?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) {
      throw new Error("Groq API respondió sin texto (choices[0].message.content vacío)");
    }

    return text;
  }

  throw new Error("Groq API: se agotaron los reintentos");
};


