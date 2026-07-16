/**
 * POST /api/analyze — the core Gemini proxy (docs/PLAN.md § 2.3).
 *
 * Body: `{ text: string }`. Key: `X-Gemini-Key` header, falling back to
 * `process.env.GEMINI_API_KEY` (supported but not set by us).
 *
 * Privacy contract, enforced by review: the key and the analyzed text are NEVER
 * logged, echoed, or put in a URL. The key travels header-to-header only.
 */

import { MAX_BODY_BYTES, MAX_INPUT_CHARS, MIN_INPUT_CHARS, GEMINI_MODEL } from "@/lib/config";
import { SignalError, errorResponse } from "@/lib/errors";
import { extractJson } from "@/lib/extract-json";
import { callGemini } from "@/lib/gemini";
import { normalizeResults } from "@/lib/normalize";
import { buildPrompt } from "@/lib/prompt";
import { checkRateLimit } from "@/lib/rate-limit";
import type { AnalysisResult, AnalyzeResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MALFORMED_RETRY_DELAY_MS = 800;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function json(body: AnalyzeResponse, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function fail(err: unknown): Response {
  const { status, body } = errorResponse(err);
  return json(body, status);
}

/** Best-effort caller identity for rate limiting. */
function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** The key the visitor supplied, or the optional server fallback. */
function resolveKey(req: Request): string {
  const header = req.headers.get("x-gemini-key")?.trim();
  if (header) return header;
  return (process.env.GEMINI_API_KEY ?? "").trim();
}

export async function POST(req: Request): Promise<Response> {
  try {
    if (!checkRateLimit(clientIp(req))) {
      throw new SignalError("rate_limited");
    }

    const text = await readText(req);
    const key = resolveKey(req);
    if (!key) {
      throw new SignalError("missing_key");
    }

    const started = Date.now();
    const result = await analyze(key, text);
    return json(
      { ok: true, result, model: GEMINI_MODEL, durationMs: Date.now() - started },
      200,
    );
  } catch (err) {
    // Typed SignalErrors map to their own status; anything unexpected becomes a
    // generic api_error — no stack trace, no upstream detail, ever.
    return fail(err);
  }
}

/**
 * Read and validate the body. Server-side caps are authoritative: the client's
 * counter is a convenience, not a control.
 *
 * @throws SignalError `input_too_long` | `input_too_short`
 */
async function readText(req: Request): Promise<string> {
  // Reject an oversized body from the header before buffering it.
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new SignalError("input_too_long");
  }

  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    throw new SignalError("input_too_long");
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    // An unparseable body carries no text to analyze.
    throw new SignalError("input_too_short");
  }

  const value =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>).text
      : undefined;
  if (typeof value !== "string") {
    throw new SignalError("input_too_short");
  }

  const text = value.trim();
  if (text.length > MAX_INPUT_CHARS) {
    throw new SignalError("input_too_long");
  }
  if (text.length < MIN_INPUT_CHARS) {
    throw new SignalError("input_too_short");
  }
  return text;
}

/**
 * Call the model and coerce its output. A `malformed_json` earns ONE full
 * re-attempt after 800ms — a fresh model call, exactly as the legacy parser did.
 * Transient network/429/5xx retries are handled one level down, in `callGemini`.
 */
async function analyze(key: string, text: string): Promise<AnalysisResult> {
  const prompt = buildPrompt(text);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callGemini(key, prompt);
      return normalizeResults(extractJson(raw));
    } catch (err) {
      const retryable =
        err instanceof SignalError && err.code === "malformed_json" && attempt === 0;
      if (!retryable) throw err;
      await sleep(MALFORMED_RETRY_DELAY_MS);
    }
  }
  /* istanbul ignore next — loop always returns or throws. */
  throw new SignalError("malformed_json");
}
