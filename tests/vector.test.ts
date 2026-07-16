/**
 * Vector math for retrieval (docs/PLAN.md § Phase 4). Pure functions, so these
 * are plain value assertions — no mocks, no storage, no network.
 *
 * The zero-vector cases are the point of this file: the textbook cosine formula
 * divides by magnitude, so a zero vector yields NaN, and NaN loses every
 * comparison in a sort — a single one silently scrambles a ranking instead of
 * failing loudly.
 */

import { describe, expect, it } from "vitest";

import { cosineSimilarity, topK } from "@/lib/vector";

describe("cosineSimilarity — known values", () => {
  it("scores identical vectors 1", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10);
  });

  it("scores orthogonal vectors 0", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([1, 0, 0], [0, 3, 4])).toBe(0);
  });

  it("scores opposite vectors -1", () => {
    expect(cosineSimilarity([1, 2], [-1, -2])).toBeCloseTo(-1, 10);
  });

  it("ignores magnitude, measuring direction only", () => {
    // Same direction, 100x the length.
    expect(cosineSimilarity([1, 1], [100, 100])).toBeCloseTo(1, 10);
  });

  it("matches the hand-computed value for a 45-degree pair", () => {
    // [1,0]·[1,1] = 1; |[1,0]|=1, |[1,1]|=√2 -> 1/√2 ≈ 0.7071
    expect(cosineSimilarity([1, 0], [1, 1])).toBeCloseTo(Math.SQRT1_2, 10);
  });

  it("never returns a value outside [-1, 1] despite float error", () => {
    const a = [0.1, 0.2, 0.3];
    const score = cosineSimilarity(a, [...a]);
    expect(score).toBeLessThanOrEqual(1);
    expect(score).toBeGreaterThanOrEqual(-1);
  });
});

describe("cosineSimilarity — zero magnitude (no NaN)", () => {
  it("returns 0 when the first vector is all zeros", () => {
    const score = cosineSimilarity([0, 0, 0], [1, 2, 3]);
    expect(Number.isNaN(score)).toBe(false);
    expect(score).toBe(0);
  });

  it("returns 0 when the second vector is all zeros", () => {
    const score = cosineSimilarity([1, 2, 3], [0, 0, 0]);
    expect(Number.isNaN(score)).toBe(false);
    expect(score).toBe(0);
  });

  it("returns 0 when both vectors are all zeros", () => {
    const score = cosineSimilarity([0, 0], [0, 0]);
    expect(Number.isNaN(score)).toBe(false);
    expect(score).toBe(0);
  });

  it("returns 0 for two empty vectors", () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("returns 0 rather than NaN for a corrupt vector holding NaN/Infinity", () => {
    expect(cosineSimilarity([NaN, 1], [1, 1])).toBe(0);
    expect(cosineSimilarity([Infinity, 1], [1, 1])).toBe(0);
  });
});

describe("cosineSimilarity — dimension mismatch", () => {
  it("throws RangeError rather than scoring incomparable vectors", () => {
    expect(() => cosineSimilarity([1, 2, 3], [1, 2])).toThrow(RangeError);
  });

  it("names both dimensions in the message", () => {
    expect(() => cosineSimilarity([1, 2, 3], [1, 2])).toThrow(/3 vs 2/);
  });

  it("throws when only one side is empty", () => {
    expect(() => cosineSimilarity([], [1])).toThrow(RangeError);
  });
});

interface Item {
  id: string;
  vector: number[];
}

const item = (id: string, vector: number[]): Item => ({ id, vector });

describe("topK", () => {
  it("returns the k nearest, best first", () => {
    const query = [1, 0];
    const items = [
      item("orthogonal", [0, 1]),
      item("exact", [1, 0]),
      item("close", [0.9, 0.1]),
      item("opposite", [-1, 0]),
    ];

    const got = topK(query, items, 2);

    expect(got.map((s) => s.item.id)).toEqual(["exact", "close"]);
    expect(got[0]!.score).toBeCloseTo(1, 10);
    expect(got[0]!.score).toBeGreaterThan(got[1]!.score);
  });

  it("returns [] for an empty candidate list", () => {
    expect(topK([1, 0], [], 3)).toEqual([]);
  });

  it("returns everything comparable when k exceeds the list", () => {
    const items = [item("a", [1, 0]), item("b", [0, 1])];
    expect(topK([1, 0], items, 99)).toHaveLength(2);
  });

  it("returns [] for k of 0 or negative", () => {
    const items = [item("a", [1, 0])];
    expect(topK([1, 0], items, 0)).toEqual([]);
    expect(topK([1, 0], items, -1)).toEqual([]);
  });

  it("keeps input order for ties, so a re-render can't reshuffle them", () => {
    const items = [item("first", [1, 0]), item("second", [1, 0]), item("third", [1, 0])];
    expect(topK([1, 0], items, 3).map((s) => s.item.id)).toEqual([
      "first",
      "second",
      "third",
    ]);
    // Same input, same output — every time.
    expect(topK([1, 0], items, 2).map((s) => s.item.id)).toEqual(["first", "second"]);
  });

  it("skips candidates whose dimension differs instead of throwing", () => {
    const items = [
      item("stale", [1, 0, 0]), // written by an older EMBED_DIM
      item("current", [1, 0]),
    ];

    const got = topK([1, 0], items, 5);

    expect(got.map((s) => s.item.id)).toEqual(["current"]);
  });

  it("returns [] when every candidate is stale rather than taking the page down", () => {
    const items = [item("stale-a", [1, 0, 0]), item("stale-b", [0, 1, 0])];
    expect(topK([1, 0], items, 3)).toEqual([]);
  });

  it("survives a candidate with a missing or non-array vector", () => {
    const items = [
      { id: "broken", vector: undefined } as unknown as Item,
      item("good", [1, 0]),
    ];
    expect(topK([1, 0], items, 3).map((s) => s.item.id)).toEqual(["good"]);
  });

  it("ranks a zero-magnitude candidate without NaN poisoning the sort", () => {
    const items = [item("zero", [0, 0]), item("real", [1, 0]), item("also-real", [0, 1])];

    const got = topK([1, 0], items, 3);

    expect(got.every((s) => !Number.isNaN(s.score))).toBe(true);
    // The zero vector scores 0 — tied with the orthogonal one, and behind the hit.
    expect(got[0]!.item.id).toBe("real");
    expect(got.map((s) => s.item.id)).toHaveLength(3);
  });

  it("ranks a realistic top-3 out of a larger library", () => {
    const items = [
      item("earnings", [1, 0, 0]),
      item("layoffs", [0, 1, 0]),
      item("merger", [0, 0, 1]),
      item("earnings-adjacent", [0.8, 0.2, 0]),
      item("noise", [0.1, 0.1, 0.9]),
    ];

    // Hand-computed against the query: earnings 0.9950, earnings-adjacent
    // 0.9895, noise 0.1201, layoffs 0.0995, merger 0. "noise" edging out
    // "layoffs" is correct, not a bug — it carries a little of the query's
    // dominant axis, and layoffs carries almost none.
    const got = topK([1, 0.1, 0], items, 3);

    expect(got).toHaveLength(3);
    expect(got.map((s) => s.item.id)).toEqual(["earnings", "earnings-adjacent", "noise"]);
    expect(got[0]!.score).toBeCloseTo(0.995, 3);
    expect(got[2]!.score).toBeCloseTo(0.1201, 3);
  });
});
