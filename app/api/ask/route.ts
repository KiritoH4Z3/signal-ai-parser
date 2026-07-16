/**
 * POST /api/ask — the Briefing Library's two model calls (docs/PLAN.md § Phase 4).
 *
 * One route, discriminated on `op`, because both halves are the same request
 * with the same key handling, the same limits and the same taxonomy; splitting
 * them would duplicate all three to save one `switch`.
 *
 *   {op:"embed",  texts}            -> {vectors}   — used for saved briefings AND questions
 *   {op:"answer", question, context} -> {answer, citations}
 *
 * What is NOT here is the retrieval: ranking happens in the browser, against
 * vectors in the visitor's own localStorage (see components/library/AskArchive).
 * This route never sees the Library — only the three briefings the client already
 * chose to send.
 *
 * Privacy contract, identical to /api/analyze: the key travels header-to-header
 * (`X-Gemini-Key` -> `x-goog-api-key`), and neither it nor the visitor's text is
 * ever logged, echoed or put in a URL.
 */

import {
  GEMINI_EMBED_MODEL,
  GEMINI_MODEL,
  MAX_ASK_CONTEXT,
  MAX_BODY_BYTES,
  MAX_EMBED_BATCH,
  MAX_EMBED_CHARS,
  MAX_QUESTION_CHARS,
  MIN_QUESTION_CHARS,
} from "@/lib/config";
import { SignalError, errorResponse } from "@/lib/errors";
import { extractJson } from "@/lib/extract-json";
import { callGemini, embedTexts } from "@/lib/gemini";
import { buildAskPrompt } from "@/lib/prompt";
import { checkRateLimit } from "@/lib/rate-limit";
import type { AskRequest, AskResponse, BriefingContext } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function json(body: AskResponse, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
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

    const body = await readBody(req);
    const key = resolveKey(req);
    if (!key) {
      throw new SignalError("missing_key");
    }

    if (body.op === "embed") {
      const vectors = await embedTexts(key, body.texts);
      return json({ ok: true, op: "embed", vectors, model: GEMINI_EMBED_MODEL }, 200);
    }

    const started = Date.now();
    const { answer, citations } = await answerFromContext(key, body.question, body.context);
    return json(
      {
        ok: true,
        op: "answer",
        answer,
        citations,
        model: GEMINI_MODEL,
        durationMs: Date.now() - started,
      },
      200,
    );
  } catch (err) {
    // Typed SignalErrors map to their own status; anything unexpected becomes a
    // generic api_error — no stack trace, no upstream detail, ever.
    const { status, body } = errorResponse(err);
    return json(body, status);
  }
}

/**
 * Read, size-check and validate the body into a typed `AskRequest`.
 *
 * @throws SignalError `input_too_long` | `input_too_short`
 */
async function readBody(req: Request): Promise<AskRequest> {
  // Reject an oversized body from the header before buffering it.
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new SignalError("input_too_long");
  }

  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    throw new SignalError("input_too_long");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SignalError("input_too_short");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new SignalError("input_too_short");
  }

  const body = parsed as Record<string, unknown>;
  if (body.op === "embed") return readEmbed(body);
  if (body.op === "answer") return readAnswer(body);
  // An unknown or missing op is a caller bug, not a size problem, but the
  // taxonomy has no "bad request" code and inventing one to describe our own
  // client's mistake is not worth a contract change.
  throw new SignalError("input_too_short", "Unsupported operation.");
}

function readEmbed(body: Record<string, unknown>): AskRequest {
  const { texts } = body;
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new SignalError("input_too_short", "Nothing to embed.");
  }
  if (texts.length > MAX_EMBED_BATCH) {
    throw new SignalError(
      "input_too_long",
      `Too many texts in one request (max ${MAX_EMBED_BATCH}).`,
    );
  }

  const cleaned = texts.map((text) => {
    if (typeof text !== "string") {
      throw new SignalError("input_too_short", "Nothing to embed.");
    }
    const trimmed = text.trim();
    if (trimmed.length > MAX_EMBED_CHARS) {
      throw new SignalError("input_too_long");
    }
    if (trimmed.length === 0) {
      throw new SignalError("input_too_short", "Nothing to embed.");
    }
    return trimmed;
  });

  return { op: "embed", texts: cleaned };
}

function readAnswer(body: Record<string, unknown>): AskRequest {
  const { question, context } = body;
  if (typeof question !== "string") {
    throw new SignalError("input_too_short", "Ask a question first.");
  }
  const trimmed = question.trim();
  if (trimmed.length > MAX_QUESTION_CHARS) {
    throw new SignalError(
      "input_too_long",
      `Questions are capped at ${MAX_QUESTION_CHARS} characters.`,
    );
  }
  if (trimmed.length < MIN_QUESTION_CHARS) {
    throw new SignalError("input_too_short", "Ask a question first.");
  }

  if (!Array.isArray(context) || context.length === 0) {
    // Grounded means grounded: with no briefings there is nothing to answer
    // from, and calling the model anyway would invite exactly the invented
    // answer this feature refuses to produce.
    throw new SignalError(
      "input_too_short",
      "Save a briefing to the Library before asking about it.",
    );
  }
  if (context.length > MAX_ASK_CONTEXT) {
    throw new SignalError(
      "input_too_long",
      `Too many briefings for one question (max ${MAX_ASK_CONTEXT}).`,
    );
  }

  return { op: "answer", question: trimmed, context: context.map(readContext) };
}

/**
 * Take only the fields the prompt needs. The client sends whole `LibraryEntry`
 * rows minus the vector; forwarding the rest to the model would be sending the
 * visitor's data somewhere they cannot see and did not ask for.
 */
function readContext(value: unknown): BriefingContext {
  if (typeof value !== "object" || value === null) {
    throw new SignalError("input_too_short", "A saved briefing was unreadable.");
  }
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const summary = typeof row.summary === "string" ? row.summary.trim() : "";
  if (!id || !summary) {
    throw new SignalError("input_too_short", "A saved briefing was unreadable.");
  }

  const topics = Array.isArray(row.topics)
    ? row.topics.filter((t): t is string => typeof t === "string").slice(0, 5)
    : [];
  const sentiment =
    row.sentiment === "Positive" || row.sentiment === "Neutral" || row.sentiment === "Negative"
      ? row.sentiment
      : undefined;

  return { id, summary: summary.slice(0, MAX_EMBED_CHARS), topics, sentiment };
}

/**
 * Ask the model, then hold it to the grounding contract.
 *
 * Unlike /api/analyze this does NOT re-attempt a malformed answer: the analyze
 * retry exists because a dropped brace costs the visitor their whole paste,
 * whereas here they can simply ask again — and a second call would silently
 * double the cost of every bad response.
 *
 * @throws SignalError `malformed_json` and anything callGemini throws
 */
async function answerFromContext(
  key: string,
  question: string,
  context: BriefingContext[],
): Promise<{ answer: string; citations: string[] }> {
  const raw = await callGemini(key, buildAskPrompt(question, context));
  const parsed = extractJson(raw);

  const answer = typeof parsed.answer === "string" ? parsed.answer.trim() : "";
  if (!answer) {
    // Valid JSON with no answer in it is still nothing we can show.
    throw new SignalError("malformed_json");
  }

  // The prompt asks the model to cite only supplied ids; this is what makes it
  // true. An id we never sent is a hallucinated source, and a citation the UI
  // could not link back to anything is worse than no citation at all.
  const allowed = new Set(context.map((c) => c.id));
  const claimed = Array.isArray(parsed.citations) ? parsed.citations : [];
  const citations = Array.from(
    new Set(
      claimed.filter((id: unknown): id is string => typeof id === "string" && allowed.has(id)),
    ),
  );

  return { answer, citations };
}
