/**
 * Mirrors the confidence / label / metric / normalize_results cases from the
 * legacy `tests/test_parser.py`. Offline, keyless, no network.
 */

import { describe, expect, it } from "vitest";

import { BAND_TO_SCORE, DEFAULT_CONFIDENCE_SCORE } from "@/lib/config";
import {
  asStrList,
  confidenceToScore,
  normalizeLabel,
  normalizeResults,
  splitMetric,
} from "@/lib/normalize";

describe("confidenceToScore", () => {
  // test_confidence_band_mapping
  it("maps categorical bands case-insensitively", () => {
    expect(confidenceToScore("High")).toBe(BAND_TO_SCORE.High);
    expect(confidenceToScore("medium")).toBe(BAND_TO_SCORE.Medium);
    expect(confidenceToScore("LOW")).toBe(BAND_TO_SCORE.Low);
  });

  // test_confidence_numeric
  it("accepts and clamps numbers", () => {
    expect(confidenceToScore(88)).toBe(88);
    expect(confidenceToScore(150)).toBe(100);
    expect(confidenceToScore(-5)).toBe(0);
    expect(confidenceToScore("85%")).toBe(85);
  });

  // test_confidence_unknown_default
  it("defaults on unknown values and guards booleans", () => {
    expect(confidenceToScore("banana")).toBe(DEFAULT_CONFIDENCE_SCORE);
    expect(confidenceToScore(null)).toBe(DEFAULT_CONFIDENCE_SCORE);
    expect(confidenceToScore(undefined)).toBe(DEFAULT_CONFIDENCE_SCORE);
    // bool is an int subclass in Python; the port guards it the same way.
    expect(confidenceToScore(true)).toBe(DEFAULT_CONFIDENCE_SCORE);
    expect(confidenceToScore(false)).toBe(DEFAULT_CONFIDENCE_SCORE);
    expect(confidenceToScore({})).toBe(DEFAULT_CONFIDENCE_SCORE);
  });

  it("rounds fractional scores", () => {
    expect(confidenceToScore(87.6)).toBe(88);
    expect(confidenceToScore("72.4")).toBe(72);
  });
});

describe("normalizeLabel", () => {
  // test_normalize_label
  it("title-cases known labels and defaults unknown ones to Neutral", () => {
    expect(normalizeLabel("positive")).toBe("Positive");
    expect(normalizeLabel("NEGATIVE")).toBe("Negative");
    expect(normalizeLabel("  Neutral ")).toBe("Neutral");
    expect(normalizeLabel("bullish")).toBe("Neutral");
    expect(normalizeLabel(null)).toBe("Neutral");
    expect(normalizeLabel(42)).toBe("Neutral");
  });
});

describe("asStrList", () => {
  it("wraps a lone string, cleans lists, and rejects anything else", () => {
    expect(asStrList("Acme")).toEqual(["Acme"]);
    expect(asStrList(["a", " b ", "", null, "c"])).toEqual(["a", "b", "c"]);
    expect(asStrList(null)).toEqual([]);
    expect(asStrList({ a: 1 })).toEqual([]);
    expect(asStrList([1, 2])).toEqual(["1", "2"]);
  });
});

describe("splitMetric", () => {
  // test_split_metric_object_passthrough
  it("passes a well-formed object through", () => {
    expect(splitMetric({ label: "Revenue", value: "$4.2B", change: "+27%" })).toEqual(
      { label: "Revenue", value: "$4.2B", change: "+27%" },
    );
  });

  // test_split_metric_string_with_currency
  it("extracts a currency value from a flat string", () => {
    const m = splitMetric("Q3 revenue rose to $2.1B");
    expect(m.value).toBe("$2.1B");
    expect(m.label.toLowerCase()).toContain("revenue");
  });

  // test_split_metric_string_with_percent_change
  it("extracts a +/-N% change from a flat string", () => {
    const m = splitMetric("Operating margin expanded +7% to 31%");
    expect(m.change).toBe("+7%");
    expect(m.value).toBeTruthy();
  });

  // test_split_metric_no_number
  it("uses the whole string as the value when there is no number", () => {
    const m = splitMetric("Strong demand across regions");
    expect(m.value).toBe("Strong demand across regions");
    expect(m.label).toBe("");
  });

  it("prefers a rich token over a bare digit so Q3 is not the value", () => {
    expect(splitMetric("Q3 revenue rose 14%").value).toBe("14%");
  });

  it("falls back to a bare number when no rich token exists", () => {
    expect(splitMetric("Headcount reached 1,200").value).toBe("1,200");
  });

  it("re-parses an object whose value is empty but label carries the text", () => {
    const m = splitMetric({ label: "Revenue rose to $4.2B", value: "" });
    expect(m.value).toBe("$4.2B");
  });

  it("fills placeholders for an empty object and empty string", () => {
    expect(splitMetric({})).toEqual({ label: "Metric", value: "—", change: "" });
    expect(splitMetric("")).toEqual({ label: "Metric", value: "—", change: "" });
  });

  it("caps an absurdly long label at 60 chars with an ellipsis", () => {
    const m = splitMetric(`${"word ".repeat(30)}$4.2B`);
    expect(m.label.length).toBeLessThanOrEqual(60);
    expect(m.label.endsWith("…")).toBe(true);
  });

  it("falls back to trailing words when nothing precedes the value", () => {
    expect(splitMetric("$4.2B in revenue").label).toBe("in revenue");
  });
});

describe("normalizeResults", () => {
  // test_normalize_results_fills_missing_keys
  it("fills every missing key", () => {
    const out = normalizeResults({});
    expect(Object.keys(out).sort()).toEqual(
      ["entities", "metrics", "sentiment", "summary", "topics"].sort(),
    );
    expect(out.entities).toEqual({ companies: [], people: [], places: [] });
    expect(out.metrics).toEqual([]);
    expect(out.topics).toEqual([]);
    expect(out.summary).toBe("No summary was returned.");
    expect(out.sentiment.label).toBe("Neutral");
    expect(out.sentiment.confidence_score).toBeGreaterThanOrEqual(0);
    expect(out.sentiment.confidence_score).toBeLessThanOrEqual(100);
  });

  // test_normalize_results_wraps_stray_string_entity
  it("wraps a stray string entity into a list", () => {
    const out = normalizeResults({ entities: { companies: "Acme" } });
    expect(out.entities.companies).toEqual(["Acme"]);
  });

  // test_normalize_results_unknown_sentiment_label
  it("defaults an unknown sentiment label to Neutral", () => {
    expect(normalizeResults({ sentiment: { label: "ecstatic" } }).sentiment.label).toBe(
      "Neutral",
    );
  });

  // test_normalize_results_truncates_topics_to_five
  it("truncates topics to five", () => {
    const out = normalizeResults({ topics: ["a", "b", "c", "d", "e", "f", "g"] });
    expect(out.topics).toEqual(["a", "b", "c", "d", "e"]);
  });

  // test_normalize_results_band_to_score_backfill
  it("backfills a score from the band", () => {
    const out = normalizeResults({
      sentiment: { label: "Positive", confidence: "High" },
    });
    expect(out.sentiment.confidence_score).toBe(BAND_TO_SCORE.High);
    expect(out.sentiment.confidence).toBe("High");
  });

  // test_normalize_results_numeric_score_drives_band
  it("derives the band from an explicit numeric score", () => {
    const out = normalizeResults({
      sentiment: { label: "Positive", confidence_score: 92 },
    });
    expect(out.sentiment.confidence_score).toBe(92);
    expect(out.sentiment.confidence).toBe("High");
  });

  it("maps score bands at their boundaries", () => {
    expect(normalizeResults({ sentiment: { confidence_score: 80 } }).sentiment.confidence).toBe("High");
    expect(normalizeResults({ sentiment: { confidence_score: 79 } }).sentiment.confidence).toBe("Medium");
    expect(normalizeResults({ sentiment: { confidence_score: 50 } }).sentiment.confidence).toBe("Medium");
    expect(normalizeResults({ sentiment: { confidence_score: 49 } }).sentiment.confidence).toBe("Low");
  });

  // test_normalize_results_string_metrics_become_objects
  it("turns string metrics into objects", () => {
    const out = normalizeResults({ metrics: ["Revenue grew to $4.2B"] });
    expect(out.metrics[0].value).toBe("$4.2B");
  });

  it("wraps a single dict/string metric into a list", () => {
    expect(normalizeResults({ metrics: { label: "Revenue", value: "$1B" } }).metrics).toHaveLength(1);
    expect(normalizeResults({ metrics: "Revenue grew to $1B" }).metrics).toHaveLength(1);
  });

  it("drops null and empty metric entries", () => {
    const out = normalizeResults({ metrics: [null, "", { label: "R", value: "1" }] });
    expect(out.metrics).toHaveLength(1);
  });

  // test_normalize_results_handles_non_dict_input
  it("tolerates non-object input", () => {
    for (const bad of [null, undefined, "oops", [1, 2, 3], 42]) {
      expect(normalizeResults(bad).sentiment.label).toBe("Neutral");
    }
  });

  it("keeps an explicit score over a conflicting band", () => {
    const out = normalizeResults({
      sentiment: { confidence: "Low", confidence_score: 95 },
    });
    // The explicit score wins, but a valid band is preserved for back-compat.
    expect(out.sentiment.confidence_score).toBe(95);
    expect(out.sentiment.confidence).toBe("Low");
  });

  it("is idempotent", () => {
    const once = normalizeResults({
      summary: "One. Two.",
      entities: { companies: ["Acme"] },
      metrics: [{ label: "Revenue", value: "$4.2B", change: "+27%" }],
      sentiment: { label: "Positive", confidence_score: 90 },
      topics: ["earnings"],
    });
    expect(normalizeResults(once)).toEqual(once);
  });
});
