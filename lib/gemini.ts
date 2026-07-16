/**
 * Gemini REST client — server-only. Port of the call/extract/retry policy from
 * the legacy `utils/parser.py`, but over plain `fetch` instead of the deprecated
 * SDK (docs/PLAN.md: full header control + trivial mocking).
 *
 * Contract: `callGemini(apiKey, prompt) -> raw model text`. Every failure is
 * re-thrown as a typed `SignalError`. The caller owns JSON parsing so that a
 * `malformed_json` can be retried with a *fresh* model call (exact legacy
 * semantics).
 *
 * The key is passed via the `x-goog-api-key` header — never a URL, never logged.
 */

import "server-only";

import {
  EMBED_DIM,
  GEMINI_EMBED_MODEL,
  GEMINI_MODEL,
  GENERATION_CONFIG,
} from "@/lib/config";
import { SignalError } from "@/lib/errors";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const TIMEOUT_MS = 30_000;
const RETRY_DELAY_MS = 800;

/**
 * Internal marker for retry-worthy failures (429 / 5xx / network / timeout).
 * Mirrors `_is_transient` in the legacy parser. Never escapes this module.
 */
class TransientError extends Error {}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The retry policy, shared by every call in this module: exactly one retry,
 * after 800ms, and only for a transient failure (429 / 5xx / network / timeout).
 * Auth errors are never retried — a rejected key is still rejected 800ms later,
 * and retrying it just burns the visitor's rate limit.
 */
async function withRetry<T>(attempt: () => Promise<T>): Promise<T> {
  for (let tries = 0; tries < 2; tries++) {
    try {
      return await attempt();
    } catch (err) {
      if (err instanceof TransientError && tries === 0) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      if (err instanceof TransientError) {
        // Out of retries — surface as the generic, friendly API failure.
        throw new SignalError("api_error");
      }
      throw err;
    }
  }
  /* istanbul ignore next — loop always returns or throws. */
  throw new SignalError("api_error");
}

/**
 * Call Gemini in JSON mode and return the raw text of the first usable candidate.
 *
 * @throws SignalError `invalid_key` | `empty_response` | `api_error`
 */
export async function callGemini(apiKey: string, prompt: string): Promise<string> {
  return withRetry(() => attemptCall(apiKey, prompt));
}

/**
 * Embed one or more texts (docs/PLAN.md § Phase 4). Returns one vector per input
 * text, in input order — the caller pairs them up positionally, so a partial
 * result is a bug rather than a degraded success and is rejected below.
 *
 * `taskType: SEMANTIC_SIMILARITY` is chosen because this route embeds both sides
 * of the comparison — saved briefings and the question — through the same door.
 * The asymmetric RETRIEVAL_DOCUMENT / RETRIEVAL_QUERY pair would score better,
 * but only if the caller told us which side it was embedding, and the `{texts}`
 * contract deliberately doesn't.
 *
 * @throws SignalError `invalid_key` | `empty_response` | `malformed_json` | `api_error`
 */
export async function embedTexts(
  apiKey: string,
  texts: readonly string[],
): Promise<number[][]> {
  return withRetry(() => attemptEmbed(apiKey, texts));
}

async function attemptCall(apiKey: string, prompt: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/models/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: GENERATION_CONFIG,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // Network failure, DNS, or the 30s abort — all retry-worthy.
    throw new TransientError("network");
  }

  if (!res.ok) {
    throw await mapHttpError(res);
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    throw new SignalError("api_error");
  }
  return extractText(payload);
}

async function attemptEmbed(
  apiKey: string,
  texts: readonly string[],
): Promise<number[][]> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/models/${GEMINI_EMBED_MODEL}:batchEmbedContents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          // The per-request `model` is required by batchEmbedContents even though
          // the URL already names it.
          model: `models/${GEMINI_EMBED_MODEL}`,
          content: { parts: [{ text }] },
          taskType: "SEMANTIC_SIMILARITY",
          outputDimensionality: EMBED_DIM,
        })),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new TransientError("network");
  }

  if (!res.ok) {
    throw await mapHttpError(res);
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    throw new SignalError("api_error");
  }
  return extractEmbeddings(payload, texts.length);
}

/**
 * Pull vectors out of a batchEmbedContents payload, or fail loudly.
 *
 * Strict on purpose, unlike `extractText`'s salvage-what-you-can walk: a text
 * whose embedding silently went missing would shift every later vector onto the
 * wrong briefing, and a NaN inside a vector would poison ranking rather than
 * error. Both are worse than a 502.
 *
 * @throws SignalError `empty_response` (nothing usable) | `malformed_json` (wrong shape)
 */
export function extractEmbeddings(payload: unknown, expected: number): number[][] {
  const rows = asArray(get(payload, "embeddings"));
  if (rows.length === 0) {
    throw new SignalError(
      "empty_response",
      "The embedding service returned nothing. Please try again.",
    );
  }
  if (rows.length !== expected) {
    throw new SignalError(
      "empty_response",
      "The embedding service returned a partial result. Please try again.",
    );
  }

  return rows.map((row) => {
    const values = asArray(get(row, "values"));
    if (values.length === 0) {
      throw new SignalError(
        "empty_response",
        "The embedding service returned an empty vector. Please try again.",
      );
    }
    return values.map((v) => {
      if (typeof v !== "number" || !Number.isFinite(v)) {
        throw new SignalError("malformed_json");
      }
      return v;
    });
  });
}

/** Map a non-2xx Gemini response onto the error taxonomy. */
async function mapHttpError(res: Response): Promise<Error> {
  const status = res.status;

  // 429 / 5xx are transient; retry once. Read no body — we never log upstream text.
  if (status === 429 || status >= 500) {
    return new TransientError(`status ${status}`);
  }

  // 403 is always an auth/permission problem. A 400 is only an auth problem when
  // Google says API_KEY_INVALID — otherwise it is a genuine bad request.
  if (status === 403) {
    return new SignalError("invalid_key");
  }
  if (status === 400) {
    const body = await safeText(res);
    if (/API_KEY_INVALID/i.test(body)) {
      return new SignalError("invalid_key");
    }
  }
  return new SignalError("api_error");
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

/**
 * Safely pull text out of a generateContent payload — port of `_extract_text`.
 *
 * Walks `candidates[].content.parts[]` and concatenates text parts, skipping
 * non-text parts, rather than trusting a convenience accessor that blows up when
 * a candidate carries no text (SAFETY / RECITATION / MAX_TOKENS with no content).
 *
 * @throws SignalError `empty_response` if no text can be recovered.
 */
export function extractText(payload: unknown): string {
  const candidates = asArray(get(payload, "candidates"));

  for (const candidate of candidates) {
    const finish = get(candidate, "finishReason");
    const finishName = typeof finish === "string" ? finish : "";
    const parts = asArray(get(get(candidate, "content"), "parts"));

    const collected: string[] = [];
    for (const part of parts) {
      const text = get(part, "text");
      if (typeof text === "string" && text) collected.push(text);
    }
    if (collected.length > 0) {
      return collected.join("").trim();
    }
    if (finishName === "SAFETY" || finishName === "RECITATION") {
      throw new SignalError(
        "empty_response",
        "The model declined to analyze this text — it may have been flagged. " +
          "Try different wording or another snippet.",
      );
    }
  }

  throw new SignalError(
    "empty_response",
    "The model returned an empty response. Please try again.",
  );
}

function get(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return (value as Record<string, unknown>)[key];
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Cheap key check for `/api/validate-key`: list one model. A 200 means the key is
 * accepted by Google; 400 (API_KEY_INVALID) / 401 / 403 mean it is not.
 *
 * @throws SignalError `invalid_key` | `api_error`
 */
export async function validateGeminiKey(apiKey: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/models?pageSize=1`, {
      method: "GET",
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new SignalError("api_error");
  }

  if (res.ok) return;
  if (res.status === 401 || res.status === 403) {
    throw new SignalError("invalid_key");
  }
  if (res.status === 400) {
    const body = await safeText(res);
    if (/API_KEY_INVALID/i.test(body)) {
      throw new SignalError("invalid_key");
    }
  }
  if (res.status === 429) {
    throw new SignalError("rate_limited");
  }
  throw new SignalError("api_error");
}
