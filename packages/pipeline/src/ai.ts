import { createHash } from "node:crypto";
import type { RuntimeEnv } from "./env";

export type TokenUsage = { inputTokens: number; outputTokens: number };

export type AiClient = {
  provider: string;
  chatModel: string;
  embeddingModel: string;
  configured: boolean;
  generateJson(prompt: string): Promise<{ text: string; usage: TokenUsage }>;
  embed(texts: string[]): Promise<{ vectors: number[][]; usage: TokenUsage }>;
};

export type CostRates = {
  inputPerMillion: number;
  outputPerMillion: number;
  embeddingPerMillion: number;
};

export const DEFAULT_COSTS: CostRates = {
  inputPerMillion: 0.1,
  outputPerMillion: 0.4,
  embeddingPerMillion: 0.15,
};

export function estimateCost(
  usage: TokenUsage,
  rates: CostRates,
  kind: "chat" | "embedding",
): number {
  if (kind === "embedding") return (usage.inputTokens / 1_000_000) * rates.embeddingPerMillion;
  return (
    (usage.inputTokens / 1_000_000) * rates.inputPerMillion +
    (usage.outputTokens / 1_000_000) * rates.outputPerMillion
  );
}

export function cacheKey(model: string, operation: string, prompt: string): string {
  return createHash("sha256").update(`${model}\n${operation}\n${prompt}`).digest("hex");
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export function retryDelayMs(retryAfter: string | null, attempt: number): number {
  const seconds = retryAfter ? Number(retryAfter) : Number.NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(Math.ceil(seconds * 1000), 45_000);
  const httpDate = retryAfter ? Date.parse(retryAfter) : Number.NaN;
  if (Number.isFinite(httpDate)) return Math.min(Math.max(0, httpDate - Date.now()), 45_000);
  return Math.min(2_000 * 2 ** Math.max(0, attempt - 1), 20_000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function providerMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const message = (payload as { error?: { message?: string } }).error?.message;
    if (message) return message.replace(/\s+/g, " ").trim().slice(0, 180);
  }
  return `request failed (${status})`;
}

let nextEmbeddingAt = 0;

async function paceEmbeddings(): Promise<void> {
  const now = Date.now();
  const wait = nextEmbeddingAt - now;
  nextEmbeddingAt = Math.max(nextEmbeddingAt, now) + 700;
  if (wait > 0) await sleep(wait);
}

async function postJson(url: string, init: RequestInit, label: string): Promise<unknown> {
  const attempts = 5;
  let lastStatus = 0;
  let lastDetail = "request failed";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(url, init);
    const payload = (await response.json().catch(() => null)) as unknown;
    if (response.ok) return payload;
    lastStatus = response.status;
    lastDetail = providerMessage(payload, response.status);
    if (!RETRYABLE_STATUS.has(response.status) || attempt === attempts) break;
    await sleep(retryDelayMs(response.headers.get("retry-after"), attempt));
  }
  if (lastStatus === 429) {
    throw new Error(`${label} quota was reached. ${lastDetail} Wait a minute, then try again.`);
  }
  throw new Error(`${label} failed (${lastStatus})`);
}

export function createAi(env: RuntimeEnv): AiClient {
  if (env.AI_PROVIDER === "openai" && env.OPENAI_API_KEY) {
    return new OpenAiClient(env);
  }
  if (env.AI_PROVIDER === "gemini" && env.GEMINI_API_KEY) {
    return new GeminiClient(env);
  }
  return new LocalClient(env.EMBEDDING_DIMENSIONS);
}

class LocalClient implements AiClient {
  readonly provider = "local";
  readonly chatModel = "local-rules";
  readonly embeddingModel = "local-hash";
  readonly configured = false;

  constructor(private readonly dimensions: number) {}

  async generateJson(prompt: string): Promise<{ text: string; usage: TokenUsage }> {
    if (prompt.includes("Claim text:")) {
      const number = Number(prompt.match(/Claim number:\s*(\d+)/)?.[1] ?? 1);
      const text = prompt.split("Claim text:")[1]?.trim() ?? "";
      const parts = text
        .split(/,|(?<=\s)and\s/i)
        .map((part) => part.trim())
        .filter((part) => part.length > 8)
        .slice(0, 8);
      const elements = (parts.length > 0 ? parts : [text || "Unparsed element"]).map((part) => ({
        text: part,
        type: "other",
      }));
      return {
        text: JSON.stringify({ claimNumber: number, elements }),
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    }
    return {
      text: JSON.stringify({
        relationship: "NEEDS_REVIEW",
        confidence: 0,
        reasoning: "Local provider did not call an external model. Analyst review required.",
        evidenceText: "",
        sourcePage: 1,
      }),
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  async embed(texts: string[]): Promise<{ vectors: number[][]; usage: TokenUsage }> {
    return {
      vectors: texts.map((text) => hashEmbedding(text, this.dimensions)),
      usage: { inputTokens: texts.reduce((sum, text) => sum + Math.ceil(text.length / 4), 0), outputTokens: 0 },
    };
  }
}

export function hashEmbedding(text: string, dimensions: number): number[] {
  const values = new Array<number>(dimensions).fill(0);
  const hash = createHash("sha256").update(text).digest();
  for (let index = 0; index < dimensions; index += 1) {
    values[index] = (hash[index % hash.length] - 128) / 128;
  }
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1;
  return values.map((value) => value / norm);
}

class GeminiClient implements AiClient {
  readonly provider = "gemini";
  readonly configured = true;
  readonly chatModel: string;
  readonly embeddingModel: string;

  constructor(private readonly env: RuntimeEnv) {
    this.chatModel = env.GEMINI_MODEL;
    this.embeddingModel = env.GEMINI_EMBEDDING_MODEL;
  }

  async generateJson(prompt: string): Promise<{ text: string; usage: TokenUsage }> {
    const payload = (await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.chatModel}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": this.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
        }),
      },
      "Model request",
    )) as GeminiResponse;
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
    return {
      text,
      usage: {
        inputTokens: payload.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: payload.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  }

  async embed(texts: string[]): Promise<{ vectors: number[][]; usage: TokenUsage }> {
    if (texts.length === 0) return { vectors: [], usage: { inputTokens: 0, outputTokens: 0 } };
    await paceEmbeddings();
    const payload = (await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.embeddingModel}:batchEmbedContents`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": this.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          requests: texts.map((text) => ({
            model: `models/${this.embeddingModel}`,
            content: { parts: [{ text }] },
            outputDimensionality: this.env.EMBEDDING_DIMENSIONS,
          })),
        }),
      },
      "Embedding request",
    )) as {
      embeddings?: { values?: number[] }[];
    };
    const vectors = (payload.embeddings ?? []).map((item) => item.values ?? []);
    if (vectors.length !== texts.length) throw new Error("Embedding response did not match the input");
    const inputTokens = texts.reduce((sum, text) => sum + Math.ceil(text.length / 4), 0);
    return { vectors, usage: { inputTokens, outputTokens: 0 } };
  }
}

class OpenAiClient implements AiClient {
  readonly provider = "openai";
  readonly configured = true;
  readonly chatModel: string;
  readonly embeddingModel: string;

  constructor(private readonly env: RuntimeEnv) {
    this.chatModel = env.OPENAI_MODEL;
    this.embeddingModel = env.OPENAI_EMBEDDING_MODEL;
  }

  async generateJson(prompt: string): Promise<{ text: string; usage: TokenUsage }> {
    const payload = (await postJson(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: this.chatModel,
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: prompt }],
        }),
      },
      "Model request",
    )) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      text: payload.choices?.[0]?.message?.content ?? "",
      usage: {
        inputTokens: payload.usage?.prompt_tokens ?? 0,
        outputTokens: payload.usage?.completion_tokens ?? 0,
      },
    };
  }

  async embed(texts: string[]): Promise<{ vectors: number[][]; usage: TokenUsage }> {
    if (texts.length === 0) return { vectors: [], usage: { inputTokens: 0, outputTokens: 0 } };
    await paceEmbeddings();
    const payload = (await postJson(
      "https://api.openai.com/v1/embeddings",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: this.embeddingModel,
          input: texts,
          dimensions: this.env.EMBEDDING_DIMENSIONS,
        }),
      },
      "Embedding request",
    )) as {
      data?: { embedding?: number[]; index?: number }[];
      usage?: { prompt_tokens?: number };
    };
    const ordered = [...(payload.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    return {
      vectors: ordered.map((item) => item.embedding ?? []),
      usage: { inputTokens: payload.usage?.prompt_tokens ?? 0, outputTokens: 0 },
    };
  }
}

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
};
