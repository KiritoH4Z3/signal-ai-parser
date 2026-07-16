/**
 * Result normalization — 1:1 port of the coercion helpers and
 * `normalize_results` from the legacy `utils/constants.py`. Pure, offline,
 * no I/O. Guarantees the UI can never hit a missing key / wrong type.
 */

import {
  BAND_TO_SCORE,
  DEFAULT_CONFIDENCE_SCORE,
  SENTIMENT_LABELS,
  type SentimentLabel,
  type ConfidenceBand,
} from "@/lib/config";
import type { AnalysisResult, Metric, Entities } from "@/lib/types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Mimic Python's str.title(): each maximal letter-run gets Xxxx casing. */
function titleCase(value: string): string {
  return value.replace(
    /[A-Za-z]+/g,
    (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
  );
}

/** Strip the given characters from both ends (like Python str.strip(chars)). */
function stripChars(value: string, chars: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && chars.includes(value[start])) start += 1;
  while (end > start && chars.includes(value[end - 1])) end -= 1;
  return value.slice(start, end);
}

/** Clamp a number into the inclusive [0, 100] integer range. */
function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Coerce any confidence representation into an int in [0, 100]. Accepts a
 * numeric score (clamped), a categorical band ("High"/"Medium"/"Low",
 * case-insensitive), or numeric strings like "85" / "85%". Anything
 * unrecognized falls back to DEFAULT_CONFIDENCE_SCORE. Booleans are guarded
 * (Python guards bool as an int subclass).
 */
export function confidenceToScore(value: unknown): number {
  if (typeof value === "boolean") {
    return DEFAULT_CONFIDENCE_SCORE;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return clampScore(value);
  }
  if (typeof value === "string") {
    const token = value.trim();
    const band = BAND_TO_SCORE[titleCase(token)];
    if (band !== undefined) {
      return band;
    }
    const match = token.match(/-?\d+(?:\.\d+)?/);
    if (match) {
      const num = Number.parseFloat(match[0]);
      if (Number.isFinite(num)) {
        return clampScore(num);
      }
    }
  }
  return DEFAULT_CONFIDENCE_SCORE;
}

/**
 * Coerce a sentiment label into one of SENTIMENT_LABELS. Title-cases the input
 * and defaults to "Neutral" on anything unknown.
 */
export function normalizeLabel(value: unknown): SentimentLabel {
  if (typeof value === "string") {
    const candidate = titleCase(value.trim());
    if ((SENTIMENT_LABELS as readonly string[]).includes(candidate)) {
      return candidate as SentimentLabel;
    }
  }
  return "Neutral";
}

/**
 * Coerce a value into a clean list of non-empty strings. A lone string becomes
 * a single-item list; lists are stringified and emptied of blanks; anything
 * else becomes an empty list.
 */
export function asStrList(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  let items: unknown;
  if (typeof value === "string") {
    items = [value];
  } else if (Array.isArray(value)) {
    items = value;
  } else {
    return [];
  }
  const out: string[] = [];
  for (const item of items as unknown[]) {
    if (item === null || item === undefined) continue;
    const text = String(item).trim();
    if (text) out.push(text);
  }
  return out;
}

// A "rich" value carries a currency symbol, a percent sign, or a magnitude word
// (e.g. $4.2B, 14%, 2.1 billion). Preferred over a bare digit so "Q3" is not
// mistaken for the metric value. (VERBOSE Python regex flattened to one line.)
const RICH_VALUE_TOKEN =
  /[$€£¥]\s?[-+]?\d[\d,]*(?:\.\d+)?\s?(?:[KkMmBbTt]\b|trillion|billion|million|thousand)?|[-+]?\d[\d,]*(?:\.\d+)?\s?%|[-+]?\d[\d,]*(?:\.\d+)?\s?(?:[KkMmBbTt]\b|trillion|billion|million|thousand)/i;

// Fallback: any bare number (1,200) when no rich token exists.
const PLAIN_VALUE_TOKEN = /[-+]?\d[\d,]*(?:\.\d+)?/;

const CHANGE_TOKEN = /[-+]\d[\d,]*(?:\.\d+)?\s?%/;

/** Best-effort split of a flat metric string into label/value/change. */
function splitMetricString(input: string): Metric {
  const text = input.trim();
  if (!text) {
    return { label: "Metric", value: "—", change: "" };
  }

  let change = "";
  const changeMatch = CHANGE_TOKEN.exec(text);
  if (changeMatch) {
    change = changeMatch[0].replace(/ /g, "");
  }

  const valueMatch = RICH_VALUE_TOKEN.exec(text) ?? PLAIN_VALUE_TOKEN.exec(text);
  let value = "";
  if (valueMatch && valueMatch[0].trim()) {
    value = valueMatch[0].trim();
  }

  if (!value || !valueMatch) {
    // No number at all — show the whole thing as the value, no label.
    return { label: "", value: text, change };
  }

  // Use the words before the value as the label; fall back to trailing words.
  const head = stripChars(text.slice(0, valueMatch.index), " .,:;-");
  const tail = stripChars(
    text.slice(valueMatch.index + valueMatch[0].length),
    " .,:;-",
  );
  let label = head || tail || "Metric";
  if (label.length > 60) {
    label = label.slice(0, 57).replace(/\s+$/, "") + "…";
  }
  return { label, value, change };
}

/**
 * Normalize a metric into { label, value, change }. Handles an object shape and
 * a flat string shape.
 */
export function splitMetric(metric: unknown): Metric {
  if (isPlainObject(metric)) {
    const label = String(metric.label ?? "").trim();
    const value = String(metric.value ?? "").trim();
    const change = String(metric.change ?? "").trim();
    if (!value && label) {
      // Some models put everything in label; fall back to string parsing.
      return splitMetricString(label);
    }
    return {
      label: label || "Metric",
      value: value || "—",
      change,
    };
  }
  return splitMetricString(String(metric ?? ""));
}

/** Map a numeric confidence score back into a categorical band. */
function scoreToBand(score: number): ConfidenceBand {
  if (score >= 80) return "High";
  if (score >= 50) return "Medium";
  return "Low";
}

/**
 * Coerce a raw model value into the exact `AnalysisResult` shape. Fills missing
 * keys, coerces stray types, truncates topics to 5 and backfills band<->score.
 */
export function normalizeResults(raw: unknown): AnalysisResult {
  const data: Record<string, unknown> = isPlainObject(raw) ? raw : {};

  // Summary.
  const rawSummary = data.summary;
  const summary = rawSummary
    ? String(rawSummary).trim()
    : "No summary was returned.";

  // Entities -> dict of three string lists.
  const rawEntities = isPlainObject(data.entities) ? data.entities : {};
  const entities: Entities = {
    companies: asStrList(rawEntities.companies),
    people: asStrList(rawEntities.people),
    places: asStrList(rawEntities.places),
  };

  // Metrics -> list of normalized dicts.
  let rawMetrics: unknown = data.metrics;
  if (typeof rawMetrics === "string" || isPlainObject(rawMetrics)) {
    rawMetrics = [rawMetrics];
  }
  const metricsInput = Array.isArray(rawMetrics) ? rawMetrics : [];
  const metrics: Metric[] = metricsInput
    .filter((m) => m !== null && m !== undefined && m !== "")
    .map((m) => splitMetric(m));

  // Sentiment.
  const rawSentiment = isPlainObject(data.sentiment) ? data.sentiment : {};
  const label = normalizeLabel(rawSentiment.label);
  const score =
    "confidence_score" in rawSentiment
      ? confidenceToScore(rawSentiment.confidence_score)
      : confidenceToScore(rawSentiment.confidence);
  const rawBand = rawSentiment.confidence;
  let band: ConfidenceBand;
  if (
    typeof rawBand === "string" &&
    titleCase(rawBand.trim()) in BAND_TO_SCORE
  ) {
    band = titleCase(rawBand.trim()) as ConfidenceBand;
  } else {
    band = scoreToBand(score);
  }
  const rawReasoning = rawSentiment.reasoning;
  const reasoning = rawReasoning ? String(rawReasoning).trim() : "";

  // Topics -> list[str], max 5.
  const topics = asStrList(data.topics).slice(0, 5);

  return {
    summary,
    entities,
    metrics,
    sentiment: { label, confidence: band, confidence_score: score, reasoning },
    topics,
  };
}
