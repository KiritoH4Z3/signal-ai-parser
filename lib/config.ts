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
