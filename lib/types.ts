/**
 * Master contract. Everything codes against these types (docs/PLAN.md §
 * "Master contract"). Written first; do not break the shape.
 */

import type { SignalErrorCode } from "@/lib/errors";
import type { SentimentLabel, ConfidenceBand } from "@/lib/config";

export type { SignalErrorCode } from "@/lib/errors";

/** A single normalized metric card. `change` may be "". */
export interface Metric {
  label: string;
  value: string;
  change: string;
}

export interface Entities {
  companies: string[];
  people: string[];
  places: string[];
}

export interface Sentiment {
  label: SentimentLabel;
  /** Categorical band, back-compat. */
  confidence: ConfidenceBand;
  /** 0-100. */
  confidence_score: number;
  reasoning: string;
}

/** The guaranteed shape produced by `normalizeResults`. */
export interface AnalysisResult {
  summary: string;
  entities: Entities;
  metrics: Metric[];
  sentiment: Sentiment;
  /** ≤5. */
  topics: string[];
}

// POST /api/analyze: body {text}; key in X-Gemini-Key header.
export type AnalyzeResponse =
  | { ok: true; result: AnalysisResult; model: string; durationMs: number }
  | { ok: false; error: { code: SignalErrorCode; message: string } };

// POST /api/validate-key: key in X-Gemini-Key header.
export type ValidateKeyResponse =
  | { ok: true }
  | { ok: false; error: { code: SignalErrorCode; message: string } };

// --- Briefing Library / RAG (docs/PLAN.md § Phase 4) ------------------------

/**
 * A saved briefing, plus the embedding that makes it findable.
 *
 * Deliberately NOT a `HistoryEntry`: history is an automatic, rolling record of
 * the last 10 things you did (and drops the oldest without asking), whereas the
 * Library is a curated shelf you put things on. Sharing one row type would mean
 * either embedding every analysis — spending the visitor's quota on briefings
 * they never asked to keep — or a `vector?` that is absent exactly when
 * retrieval needs it. `source` is not kept: the Library restores a report, not
 * an editing session, and 25 full source texts is the other half of the storage
 * budget.
 */
export interface LibraryEntry {
  id: string;
  savedAt: number;
  /** One clean line of the source text — the shelf's spine label. */
  preview: string;
  sentiment: SentimentLabel;
  result: AnalysisResult;
  /** Embedding of `summary + topics`, EMBED_DIM long. */
  vector: number[];
}

/** The slice of a briefing the answer op is allowed to reason over. */
export interface BriefingContext {
  /** Must match a `LibraryEntry.id` — the model may only cite these. */
  id: string;
  summary: string;
  topics: string[];
  sentiment?: SentimentLabel;
}

/**
 * POST /api/ask: body is one of these; key in X-Gemini-Key header.
 * Discriminated on `op`, matching the AnalyzeResponse style above.
 */
export type AskRequest =
  | { op: "embed"; texts: string[] }
  | { op: "answer"; question: string; context: BriefingContext[] };

export type AskResponse =
  | { ok: true; op: "embed"; vectors: number[][]; model: string }
  | {
      ok: true;
      op: "answer";
      answer: string;
      /**
       * Ids of the briefings the answer actually rests on — always a subset of
       * the supplied context (the route drops anything else the model names).
       * Empty means "the briefings did not contain this", which is a valid,
       * honest answer rather than a failure.
       */
      citations: string[];
      model: string;
      durationMs: number;
    }
  | { ok: false; error: { code: SignalErrorCode; message: string } };

export interface HistoryEntry {
  id: string;
  timestamp: number;
  /** First ~120 chars of `source`, whitespace-collapsed — the rail's preview line. */
  preview: string;
  /** The full source text that produced this briefing. */
  source: string;
  sentiment: SentimentLabel;
  result: AnalysisResult;
  /**
   * True when this briefing is canned demo data rather than a live model call.
   * Optional and additive: entries written before this field existed simply read
   * as live, which is what they were. Without it a restored demo would lose its
   * "Preview mode" badge and misrepresent canned data as a real analysis.
   */
  isPreview?: boolean;
}
