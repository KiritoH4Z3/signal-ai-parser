/**
 * Briefing history: cap, ordering, and the three ways storage betrays you
 * (corrupt JSON, quota exhaustion, no storage at all).
 *
 * These run in `environment: node`, so there is no `window` and no
 * `localStorage`. We stub `window` with a fake Storage — which is also the
 * honest test of the module's guard, since the SSR case is exactly "no window".
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_HISTORY } from "@/lib/config";
import {
  addEntry,
  clearHistory,
  formatRelative,
  loadHistory,
  makePreview,
  removeEntry,
} from "@/lib/history";
import type { AnalysisResult } from "@/lib/types";

const STORAGE_KEY = "signal.history.v1";

/** A minimal in-memory Storage, with a switch for making writes fail. */
function fakeStorage() {
  const map = new Map<string, string>();
  const api = {
    quotaFull: false,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (api.quotaFull) {
        // What Chrome/Safari actually throw when the origin is out of room.
        const err = new Error("QuotaExceededError");
        err.name = "QuotaExceededError";
        throw err;
      }
      map.set(k, v);
    },
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
    raw: map,
  };
  return api;
}

let store: ReturnType<typeof fakeStorage>;

function result(label: AnalysisResult["sentiment"]["label"] = "Positive"): AnalysisResult {
  return {
    summary: "A summary.",
    entities: { companies: ["Acme"], people: [], places: [] },
    metrics: [{ label: "Revenue", value: "$1M", change: "+5%" }],
    sentiment: { label, confidence: "High", confidence_score: 90, reasoning: "Because." },
    topics: ["earnings"],
  };
}

beforeEach(() => {
  store = fakeStorage();
  vi.stubGlobal("window", { localStorage: store });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("loadHistory", () => {
  it("returns an empty list when nothing has been stored", () => {
    expect(loadHistory()).toEqual([]);
  });

  it("returns an empty list with no window at all (server render)", () => {
    vi.stubGlobal("window", undefined);
    expect(loadHistory()).toEqual([]);
  });

  it("recovers from a corrupt JSON blob instead of throwing", () => {
    store.raw.set(STORAGE_KEY, "{not json at all");
    expect(loadHistory()).toEqual([]);
  });

  it("rejects well-formed JSON that is not an array", () => {
    store.raw.set(STORAGE_KEY, JSON.stringify({ id: "x" }));
    expect(loadHistory()).toEqual([]);
  });

  it("drops individually malformed entries but keeps the good ones", () => {
    addEntry(result(), "Keep me.");
    const good = JSON.parse(store.raw.get(STORAGE_KEY)!)[0];
    store.raw.set(
      STORAGE_KEY,
      JSON.stringify([good, { id: "no-timestamp" }, null, "nonsense", 42]),
    );
    const list = loadHistory();
    expect(list).toHaveLength(1);
    expect(list[0].preview).toBe("Keep me.");
  });

  it("degrades to empty when reading throws (site data blocked)", () => {
    vi.stubGlobal("window", {
      get localStorage(): Storage {
        throw new Error("SecurityError: storage is disabled");
      },
    });
    expect(loadHistory()).toEqual([]);
  });
});

describe("addEntry", () => {
  it("stores the full result so a revisit needs no network call", () => {
    const [entry] = addEntry(result("Negative"), "Markets fell sharply today.");
    expect(entry.result).toEqual(result("Negative"));
    expect(entry.sentiment).toBe("Negative");
    expect(entry.source).toBe("Markets fell sharply today.");
  });

  it("orders newest first", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    addEntry(result(), "first");
    vi.advanceTimersByTime(1000);
    addEntry(result(), "second");
    vi.advanceTimersByTime(1000);
    const list = addEntry(result(), "third");

    expect(list.map((e) => e.preview)).toEqual(["third", "second", "first"]);
    expect(loadHistory().map((e) => e.preview)).toEqual(["third", "second", "first"]);
  });

  it(`caps at ${MAX_HISTORY}, evicting the oldest`, () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    for (let i = 1; i <= MAX_HISTORY + 5; i += 1) {
      addEntry(result(), `entry ${i}`);
      vi.advanceTimersByTime(1000);
    }

    const list = loadHistory();
    expect(list).toHaveLength(MAX_HISTORY);
    expect(list[0].preview).toBe(`entry ${MAX_HISTORY + 5}`);
    expect(list[list.length - 1].preview).toBe("entry 6");
    expect(list.some((e) => e.preview === "entry 1")).toBe(false);
  });

  it("mints a unique id per entry even within the same millisecond", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const ids = new Set<string>();
    for (let i = 0; i < 5; i += 1) {
      ids.add(addEntry(result(), `entry ${i}`)[0].id);
    }
    expect(ids.size).toBe(5);
  });

  it("falls back to a counter id when crypto.randomUUID is unavailable", () => {
    // Insecure origins (plain http on a LAN IP) expose no crypto.randomUUID.
    vi.stubGlobal("crypto", undefined);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    const ids = new Set<string>();
    for (let i = 0; i < 5; i += 1) {
      ids.add(addEntry(result(), `entry ${i}`)[0].id);
    }
    // Same millisecond for all five: only the counter keeps them apart.
    expect(ids.size).toBe(5);
  });

  it("still returns the new list when the quota is exhausted", () => {
    store.quotaFull = true;
    const list = addEntry(result(), "unwritable");
    // The UI keeps working from the returned list even though the disk refused.
    expect(list).toHaveLength(1);
    expect(list[0].preview).toBe("unwritable");
    expect(loadHistory()).toEqual([]);
  });

  it("does not persist anything during a server render", () => {
    vi.stubGlobal("window", undefined);
    expect(() => addEntry(result(), "ssr")).not.toThrow();
    expect(store.raw.size).toBe(0);
  });
});

describe("removeEntry", () => {
  it("drops just the named entry", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    addEntry(result(), "first");
    vi.advanceTimersByTime(1000);
    const [second] = addEntry(result(), "second");

    const list = removeEntry(second.id);
    expect(list.map((e) => e.preview)).toEqual(["first"]);
    expect(loadHistory().map((e) => e.preview)).toEqual(["first"]);
  });

  it("is a no-op for an unknown id", () => {
    addEntry(result(), "first");
    expect(removeEntry("nope")).toHaveLength(1);
  });
});

describe("clearHistory", () => {
  it("empties the rail and the store", () => {
    addEntry(result(), "first");
    addEntry(result(), "second");
    expect(clearHistory()).toEqual([]);
    expect(loadHistory()).toEqual([]);
    expect(store.raw.has(STORAGE_KEY)).toBe(false);
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-01-10T12:00:00Z").getTime();
  const ago = (ms: number) => formatRelative(now - ms, now);

  it("calls anything under 45 seconds 'now'", () => {
    expect(ago(0)).toBe("now");
    expect(ago(44_000)).toBe("now");
  });

  it("counts minutes, then hours, then days", () => {
    expect(ago(4 * 60_000)).toBe("4m ago");
    expect(ago(59 * 60_000)).toBe("59m ago");
    expect(ago(3 * 3_600_000)).toBe("3h ago");
    expect(ago(23 * 3_600_000)).toBe("23h ago");
    expect(ago(2 * 86_400_000)).toBe("2d ago");
    expect(ago(7 * 86_400_000)).toBe("7d ago");
  });

  it("switches to an absolute date past a week", () => {
    expect(ago(30 * 86_400_000)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("never renders a negative age when the clock runs backwards", () => {
    expect(formatRelative(now + 60_000, now)).toBe("now");
  });
});

describe("makePreview", () => {
  it("collapses whitespace into a single line", () => {
    expect(makePreview("  Markets\n\nfell   sharply.  ")).toBe("Markets fell sharply.");
  });

  it("clips long text with an ellipsis", () => {
    const preview = makePreview("x".repeat(500));
    expect(preview).toHaveLength(121);
    expect(preview.endsWith("…")).toBe(true);
  });
});
