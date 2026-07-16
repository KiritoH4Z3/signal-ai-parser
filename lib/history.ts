/**
 * Client-side briefing history (docs/PLAN.md § "History").
 *
 * Mirrors `lib/key-store.ts`, with one deliberate difference: this uses
 * `localStorage`, not `sessionStorage`. The asymmetry is the point — the API key
 * dies with the tab, the work survives it. Nothing here ever touches the key.
 *
 * The guarded storage accessors live in `lib/storage.ts` — every entry point
 * here degrades to "no history" rather than throwing, because a corrupt blob
 * must never be able to take the page down.
 */

import { MAX_HISTORY } from "@/lib/config";
import { SENTIMENT_LABELS, type SentimentLabel } from "@/lib/config";
import { newId, readArray, removeKey, writeJson } from "@/lib/storage";
import type { AnalysisResult, HistoryEntry } from "@/lib/types";

const STORAGE_KEY = "signal.history.v1";

/** Characters of source text kept for the rail's preview line. */
const PREVIEW_CHARS = 120;

/** Collapse whitespace and clip, so the rail shows one clean line. */
export function makePreview(sourceText: string): string {
  const flat = sourceText.replace(/\s+/g, " ").trim();
  if (flat.length <= PREVIEW_CHARS) return flat;
  return `${flat.slice(0, PREVIEW_CHARS).trimEnd()}…`;
}

/**
 * Compact relative time for the rail: "now", "4m ago", "3h ago", "2d ago", then
 * an absolute date once "ago" stops being useful. Hand-rolled — a date library
 * would be ~15KB to render six words, and the cap of 10 entries means we never
 * need real calendar arithmetic.
 */
export function formatRelative(timestamp: number, now: number = Date.now()): string {
  const seconds = Math.round((now - timestamp) / 1000);
  // Clock skew or a system clock moved backwards: don't render "-3m ago".
  if (seconds < 45) return "now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days <= 7) return `${days}d ago`;

  const when = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
}

function isSentimentLabel(value: unknown): value is SentimentLabel {
  return (
    typeof value === "string" && (SENTIMENT_LABELS as readonly string[]).includes(value)
  );
}

/**
 * Structural guard for anything read back out of storage. We check only the
 * fields the rail and the restore path actually rely on: a bad `result` shape
 * would be caught downstream by `normalizeResults`, but a missing id or
 * timestamp would break keys and sorting here.
 */
function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    e.id.length > 0 &&
    typeof e.timestamp === "number" &&
    Number.isFinite(e.timestamp) &&
    typeof e.preview === "string" &&
    typeof e.source === "string" &&
    isSentimentLabel(e.sentiment) &&
    typeof e.result === "object" &&
    e.result !== null
  );
}

/**
 * Every stored entry, newest first. Anything unreadable, non-array, or
 * individually malformed is dropped rather than thrown — a single bad entry
 * costs you that entry, not the whole rail.
 */
export function loadHistory(): HistoryEntry[] {
  return readArray("local", STORAGE_KEY)
    .filter(isHistoryEntry)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_HISTORY);
}

/**
 * Write-through. A failure here (quota, blocked storage) is not fatal: the
 * caller already holds the list it wants to render, so we let the UI stay ahead
 * of the disk rather than throwing away good state.
 */
function persist(entries: HistoryEntry[]): void {
  // Quota exceeded or storage blocked — this session keeps working in memory.
  writeJson("local", STORAGE_KEY, entries);
}

/**
 * Prepend a briefing and return the new list (newest first, capped at
 * MAX_HISTORY). The full `AnalysisResult` rides along, which is what lets the
 * rail restore a report with zero network calls.
 */
export function addEntry(
  result: AnalysisResult,
  sourceText: string,
  isPreview = false,
): HistoryEntry[] {
  const entry: HistoryEntry = {
    id: newId("h"),
    timestamp: Date.now(),
    preview: makePreview(sourceText),
    source: sourceText,
    sentiment: result.sentiment.label,
    result,
    isPreview,
  };
  const next = [entry, ...loadHistory()].slice(0, MAX_HISTORY);
  persist(next);
  return next;
}

/** Drop one entry by id. Returns the new list. */
export function removeEntry(id: string): HistoryEntry[] {
  const next = loadHistory().filter((e) => e.id !== id);
  persist(next);
  return next;
}

/** Drop everything. Returns the new (empty) list. */
export function clearHistory(): HistoryEntry[] {
  removeKey("local", STORAGE_KEY);
  return [];
}
