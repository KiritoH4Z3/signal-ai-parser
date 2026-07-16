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

import { GEMINI_MODEL, GENERATION_CONFIG } from "@/lib/config";
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
 * Call Gemini in JSON mode and return the raw text of the first usable candidate.
 * Retries exactly once, after 800ms, on a transient failure. Auth errors are
 * never retried.
 *
 * @throws SignalError `invalid_key` | `empty_response` | `api_error`
 */
export async function callGemini(apiKey: string, prompt: string): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await attemptCall(apiKey, prompt);
    } catch (err) {
      if (err instanceof TransientError && attempt === 0) {
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
