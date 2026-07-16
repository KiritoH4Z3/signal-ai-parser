/**
 * App / model configuration. Single source of truth for the Gemini model id,
 * generation config and input guardrails. Ported from the legacy
 * `utils/constants.py` (values preserved 1:1 except the model id, which the
 * rebuild pins to gemini-2.5-flash per docs/PLAN.md).
 *
 * This module is side-effect-free and safe to import anywhere (client or
 * server) — no secrets, no I/O.
 */

export const APP_NAME = "Signal";
export const APP_TAGLINE =
  "Convert unstructured text into structured business intelligence";

// Model ids (rebuild pins; verified against the live /models list at ship time).
export const GEMINI_MODEL = "gemini-2.5-flash";
export const GEMINI_EMBED_MODEL = "gemini-embedding-001";

/**
 * Embedding width requested from `gemini-embedding-001` (native 3072).
 *
 * 768 is a storage decision, not a quality one: every saved briefing carries its
 * vector in localStorage, and 3072 floats serialize to ~60KB per entry — 25 of
 * those would be ~1.5MB of a ~5MB origin budget, spent on precision that ranking
 * 25 items cannot use. Cosine similarity normalizes magnitude itself, so the
 * truncated-dimension caveat in Google's docs (renormalize below 3072) does not
 * bite us.
 *
 * Changing this number invalidates every stored vector. It does not corrupt
 * anything: `topK` skips candidates whose dimension differs from the query's, so
 * old entries quietly drop out of ranking until they are re-saved.
 */
export const EMBED_DIM = 768;

// Generation config for Gemini JSON mode. responseMimeType forces a single JSON
// object so we no longer scrape fenced code blocks as the primary path. Low
// temperature keeps the structure consistent across runs.
export const GENERATION_CONFIG = {
  responseMimeType: "application/json",
  temperature: 0.2,
  maxOutputTokens: 1024,
  candidateCount: 1,
} as const;

// Input guardrails. Cap very long pastes to protect token budget / latency and
// reject trivially short input that produces garbage analysis.
export const MAX_INPUT_CHARS = 20_000;
export const MIN_INPUT_CHARS = 20;

// Reject raw request bodies larger than this before we even read them.
export const MAX_BODY_BYTES = 64 * 1024;

// Number of analyses kept in the client-side history rail.
export const MAX_HISTORY = 10;

// --- Briefing Library / RAG (docs/PLAN.md § Phase 4) ------------------------

// Briefings kept in the client-side Library. Enforced on write, not just on
// read: the cap is what keeps 25 vectors inside the localStorage budget.
export const MAX_LIBRARY = 25;

// Texts per /api/ask {op:"embed"} call. The UI embeds one briefing or one
// question at a time; the batch exists so the route is not chatty if that ever
// changes. Anything past this is rejected as input_too_long.
export const MAX_EMBED_BATCH = 8;

// Per-text cap for embedding. A briefing's summary+topics is a few hundred
// chars; this is a guardrail, not a target.
export const MAX_EMBED_CHARS = 8_000;

// Briefings the answer op will accept as grounding context. The client sends
// its top 3; the extra room is slack, not an invitation.
export const MAX_ASK_CONTEXT = 5;

// Question length bounds. The floor is far below MIN_INPUT_CHARS on purpose —
// "Who is bullish?" is 15 characters and a perfectly good question.
export const MIN_QUESTION_CHARS = 3;
export const MAX_QUESTION_CHARS = 500;

// Sentiment vocabulary the rest of the app relies on.
export const SENTIMENT_LABELS = ["Positive", "Neutral", "Negative"] as const;
export type SentimentLabel = (typeof SENTIMENT_LABELS)[number];

export const SENTIMENT_COLORS: Record<SentimentLabel, string> = {
  Positive: "#16A085",
  Neutral: "#E0A800",
  Negative: "#E74C3C",
};

export const SENTIMENT_EMOJI: Record<SentimentLabel, string> = {
  Positive: "\u{1F7E2}", // green circle
  Neutral: "\u{1F7E1}", // yellow circle
  Negative: "\u{1F534}", // red circle
};

// Categorical confidence band -> numeric score for the sentiment gauge.
export const BAND_TO_SCORE: Record<string, number> = {
  High: 90,
  Medium: 65,
  Low: 35,
};
export const DEFAULT_CONFIDENCE_SCORE = 65;

export type ConfidenceBand = "High" | "Medium" | "Low";
