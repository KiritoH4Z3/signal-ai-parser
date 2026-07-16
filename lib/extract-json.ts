/**
 * Defensive JSON extraction — 1:1 port of `extract_json` /
 * `_slice_first_json_object` from the legacy `utils/constants.py`.
 *
 * Strategy:
 *   1. JSON.parse the whole thing (the happy path with JSON mode) — object only.
 *   2. Strip markdown ```json fences and retry.
 *   3. Brace-depth scan: take the first `{` and its matching `}` and parse that
 *      slice. Survives leading prose / trailing junk and nested braces without
 *      relying on greedy regex.
 *
 * Throws `SignalError("malformed_json")` if no valid JSON object is recovered.
 */

import { SignalError } from "@/lib/errors";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export function extractJson(raw: string | null | undefined): Record<string, unknown> {
  if (raw === null || raw === undefined) {
    throw new SignalError("malformed_json", "The model returned an empty response.");
  }

  const text = raw.trim();
  if (!text) {
    throw new SignalError("malformed_json", "The model returned an empty response.");
  }

  // 1) Happy path.
  const direct = tryParseObject(text);
  if (direct) return direct;

  // 2) Strip ```json ... ``` fences and retry.
  let fenced = text.replace(/^```(?:json)?\s*/i, "");
  fenced = fenced.replace(/\s*```$/, "").trim();
  if (fenced !== text) {
    const fromFenced = tryParseObject(fenced);
    if (fromFenced) return fromFenced;
  }

  // 3) Brace-depth scan over the fence-stripped text.
  const candidate = sliceFirstJsonObject(fenced);
  if (candidate !== null) {
    const fromScan = tryParseObject(candidate);
    if (fromScan) return fromScan;
  }

  throw new SignalError(
    "malformed_json",
    "The model returned something that was not valid JSON.",
  );
}

function tryParseObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (isPlainObject(parsed)) return parsed;
  } catch {
    // fall through
  }
  return null;
}

/**
 * Return the substring from the first `{` to its matching `}`. Walks the string
 * tracking brace depth while respecting string literals and escape sequences so
 * braces inside quoted values do not confuse the count. Returns null if no
 * balanced object exists.
 */
export function sliceFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}
