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
