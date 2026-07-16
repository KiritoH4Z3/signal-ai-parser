/**
 * Mirrors the `extract_json` cases from the legacy `tests/test_parser.py`.
 * Offline, keyless, no network.
 */

import { describe, expect, it } from "vitest";

import { SignalError } from "@/lib/errors";
import { extractJson, sliceFirstJsonObject } from "@/lib/extract-json";

describe("extractJson", () => {
  // test_extract_json_clean
  it("parses a clean JSON object", () => {
    expect(extractJson('{"a": 1, "b": "x"}')).toEqual({ a: 1, b: "x" });
  });

  // test_extract_json_fenced_block
  it("strips ```json fences", () => {
    expect(extractJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it("strips bare ``` fences", () => {
    expect(extractJson('```\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  // test_extract_json_leading_prose_and_trailing_junk
  it("survives leading prose and trailing junk", () => {
    const raw = 'Here is your JSON:\n{"a": 1, "b": 2}\nHope that helps!';
    expect(extractJson(raw)).toEqual({ a: 1, b: 2 });
  });

  // test_extract_json_nested_braces
  it("handles nested braces", () => {
    const raw = 'prefix {"outer": {"inner": [1, 2]}, "k": "v"} suffix';
    expect(extractJson(raw)).toEqual({ outer: { inner: [1, 2] }, k: "v" });
  });

  // test_extract_json_brace_inside_string_value
  it("ignores braces inside string values", () => {
    const raw = '{"note": "use { and } carefully", "n": 3}';
    expect(extractJson(raw)).toEqual({ note: "use { and } carefully", n: 3 });
  });

  it("ignores escaped quotes when scanning", () => {
    const raw = 'junk {"note": "a \\" brace } here", "n": 3} tail';
    expect(extractJson(raw)).toEqual({ note: 'a " brace } here', n: 3 });
  });

  // test_extract_json_empty_raises
  it("throws malformed_json on empty input", () => {
    for (const bad of ["", "   ", null, undefined]) {
      expect(() => extractJson(bad)).toThrowError(SignalError);
      try {
        extractJson(bad);
      } catch (err) {
        expect((err as SignalError).code).toBe("malformed_json");
      }
    }
  });

  // test_extract_json_garbage_raises
  it("throws malformed_json on garbage", () => {
    expect(() => extractJson("this is not json at all")).toThrowError(
      /not valid JSON/,
    );
  });

  it("rejects a non-object JSON top level", () => {
    // A bare array / number is valid JSON but not the object contract.
    expect(() => extractJson("[1, 2, 3]")).toThrowError(SignalError);
    expect(() => extractJson("42")).toThrowError(SignalError);
  });

  it("throws malformed_json on an unbalanced object", () => {
    expect(() => extractJson('{"a": 1')).toThrowError(SignalError);
  });
});

describe("sliceFirstJsonObject", () => {
  it("returns null when there is no brace", () => {
    expect(sliceFirstJsonObject("no object here")).toBeNull();
  });

  it("returns the first balanced object only", () => {
    expect(sliceFirstJsonObject('a {"x": 1} b {"y": 2}')).toBe('{"x": 1}');
  });

  it("returns null when braces never balance", () => {
    expect(sliceFirstJsonObject('{"x": {"y": 1}')).toBeNull();
  });
});
