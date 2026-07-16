/**
 * The Briefing Library's store (docs/PLAN.md § Phase 4) — saved briefings and
 * their embeddings, in `localStorage`, on their own key.
 *
 * Deliberately a separate key and a separate module from `history.ts`. History
 * is a rolling record that drops its oldest entry without asking; the Library is
 * a shelf the visitor curates, and losing a saved briefing because they ran ten
 * more analyses would be a betrayal of the word "save". Sharing storage would
 * couple those two lifecycles forever.
 *
 * Vectors are the reason for the cap: MAX_LIBRARY × EMBED_DIM floats is the
 * whole storage budget, and the cap is enforced on WRITE, not just on read — a
 * read-side cap would let the blob grow past quota until writes started failing
 * silently.
 *
 * Nothing here touches the API key, and nothing here calls the network. The
 * embedding arrives as an argument.
 */

import { MAX_LIBRARY, SENTIMENT_LABELS, type SentimentLabel } from "@/lib/config";
import { makePreview } from "@/lib/history";
import { newId, readArray, removeKey, writeJson } from "@/lib/storage";
import type { AnalysisResult, LibraryEntry } from "@/lib/types";

const STORAGE_KEY = "signal.library.v1";

function isSentimentLabel(value: unknown): value is SentimentLabel {
  return (
    typeof value === "string" && (SENTIMENT_LABELS as readonly string[]).includes(value)
  );
}

/**
 * Structural guard for anything read back out of storage. The vector check is
 * the one that earns its keep: a stored vector with a string in it would reach
 * `cosineSimilarity` and produce NaN, quietly scrambling every ranking. A vector
 * of the wrong *length* is fine to keep — `topK` skips those — because that is
 * how entries from an older EMBED_DIM retire gracefully instead of vanishing.
 */
function isLibraryEntry(value: unknown): value is LibraryEntry {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    e.id.length > 0 &&
    typeof e.savedAt === "number" &&
    Number.isFinite(e.savedAt) &&
    typeof e.preview === "string" &&
    isSentimentLabel(e.sentiment) &&
    typeof e.result === "object" &&
    e.result !== null &&
    Array.isArray(e.vector) &&
    e.vector.length > 0 &&
    e.vector.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

/**
 * Every saved briefing, newest first. Anything unreadable or individually
 * malformed is dropped rather than thrown — one bad entry costs you that entry,
 * not the whole Library.
 */
export function loadLibrary(): LibraryEntry[] {
  return readArray("local", STORAGE_KEY)
    .filter(isLibraryEntry)
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, MAX_LIBRARY);
}

/**
 * Save a briefing with its embedding.
 *
 * Returns the new list AND whether it actually reached the disk. The caller told
 * the user "Save"; if the write silently failed the entry disappears on reload,
 * so the UI needs to be able to say so. (History's write-through can ignore this
 * — it never made that promise.)
 */
export function addToLibrary(
  result: AnalysisResult,
  sourceText: string,
  vector: number[],
): { entries: LibraryEntry[]; persisted: boolean } {
  const entry: LibraryEntry = {
    id: newId("lib"),
    savedAt: Date.now(),
    preview: makePreview(sourceText),
    sentiment: result.sentiment.label,
    result,
    vector,
  };
  const entries = [entry, ...loadLibrary()].slice(0, MAX_LIBRARY);
  return { entries, persisted: writeJson("local", STORAGE_KEY, entries) };
}

/** Drop one briefing by id. Returns the new list. */
export function removeFromLibrary(id: string): LibraryEntry[] {
  const next = loadLibrary().filter((e) => e.id !== id);
  writeJson("local", STORAGE_KEY, next);
  return next;
}

/** Drop everything. Returns the new (empty) list. */
export function clearLibrary(): LibraryEntry[] {
  removeKey("local", STORAGE_KEY);
  return [];
}

/**
 * The text that represents a briefing in vector space: its summary plus its
 * topics. Not the source text — the source is long, noisy and mostly boilerplate,
 * while the summary is already the model's own distillation of what the briefing
 * is *about*, which is exactly what a question needs to match against.
 */
export function embeddableText(result: AnalysisResult): string {
  const topics = result.topics.join(", ");
  return topics ? `${result.summary}\n\nTopics: ${topics}` : result.summary;
}
