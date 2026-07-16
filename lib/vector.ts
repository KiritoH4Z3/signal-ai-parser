/**
 * Vector math for the Briefing Library's retrieval step (docs/PLAN.md § Phase 4).
 *
 * Hand-rolled on purpose. The whole retrieval surface is one dot product and a
 * sort; a vector-store dependency would ship a WASM index and a query language to
 * rank 25 items that already live in this tab's localStorage. Pure functions, no
 * I/O, no globals — which is also why they are trivially testable.
 *
 * Contract decisions, both load-bearing:
 *   * Mismatched dimensions THROW from `cosineSimilarity` — comparing a 768-dim
 *     vector to a 3072-dim one is a bug in the caller, not a "0% similar" fact,
 *     and silently scoring it 0 would hide an embedding-model mismatch forever.
 *   * `topK` is the tolerant layer: it SKIPS candidates whose dimension differs
 *     from the query. That case is real rather than theoretical — vectors stored
 *     by an older build sit in localStorage next to today's, and a stale entry
 *     should drop out of the ranking, not take the page down.
 */

/** Anything `topK` can rank: it only needs the vector. */
export interface Vectorized {
  vector: number[];
}

export interface Scored<T> {
  item: T;
  /** Cosine similarity to the query, in [-1, 1]. */
  score: number;
}

/**
 * Cosine similarity of two equal-length vectors.
 *
 * Returns 0 when either vector has zero magnitude — the classic NaN source, as
 * the textbook formula divides by that magnitude. A zero vector has no direction,
 * so "no similarity" is the honest answer; NaN would poison every downstream
 * sort (NaN comparisons are all false, so a single one silently scrambles the
 * ranking rather than erroring).
 *
 * @throws RangeError if the vectors have different lengths.
 */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new RangeError(
      `cosineSimilarity: dimension mismatch (${a.length} vs ${b.length})`,
    );
  }
  if (a.length === 0) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    magA += x * x;
    magB += y * y;
  }

  if (magA === 0 || magB === 0) return 0;

  const score = dot / (Math.sqrt(magA) * Math.sqrt(magB));
  // Non-finite inputs (NaN/Infinity from a corrupt stored vector) must not
  // escape as NaN either.
  if (!Number.isFinite(score)) return 0;

  // Floating-point error can push an identical pair a hair past 1.0.
  return Math.min(1, Math.max(-1, score));
}

/**
 * The `k` candidates most similar to `queryVec`, best first.
 *
 * Ties keep their input order (stable): sorting by score alone would let two
 * equally-relevant briefings swap places between renders for no reason.
 *
 * Returns [] for an empty candidate list or `k <= 0`; returns everything
 * comparable when `k` exceeds the list. Candidates whose vector length differs
 * from the query's are skipped (see the module note).
 */
export function topK<T extends Vectorized>(
  queryVec: readonly number[],
  items: readonly T[],
  k: number,
): Scored<T>[] {
  if (k <= 0 || items.length === 0) return [];

  const scored: { item: T; score: number; index: number }[] = [];
  items.forEach((item, index) => {
    if (!Array.isArray(item?.vector)) return;
    if (item.vector.length !== queryVec.length) return;
    scored.push({ item, score: cosineSimilarity(queryVec, item.vector), index });
  });

  scored.sort((x, y) => (y.score === x.score ? x.index - y.index : y.score - x.score));

  return scored.slice(0, k).map(({ item, score }) => ({ item, score }));
}
