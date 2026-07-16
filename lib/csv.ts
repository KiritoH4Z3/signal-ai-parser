/**
 * CSV export. Pure. Emits a two-section sheet (metrics, then entities) with
 * RFC-4180 quoting so a value containing a comma, quote or newline survives a
 * round-trip into Excel / Sheets.
 */

import { normalizeResults } from "@/lib/normalize";
import type { Entities } from "@/lib/types";

/**
 * RFC-4180 field quoting: wrap in double quotes when the field contains a comma,
 * a double quote, CR or LF, and escape embedded quotes by doubling them.
 */
export function csvField(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function row(fields: unknown[]): string {
  return fields.map(csvField).join(",");
}

/**
 * Render a result as a CSV document: a Metrics section (label/value/change) and
 * an Entities section (type/name). Sections are separated by a blank line.
 * Rows are CRLF-terminated per RFC 4180.
 */
export function buildCsvExport(result: unknown): string {
  const data = normalizeResults(result);
  const lines: string[] = [];

  // --- Metrics section ---
  lines.push(row(["Metrics"]));
  lines.push(row(["Label", "Value", "Change"]));
  if (data.metrics.length > 0) {
    for (const m of data.metrics) {
      lines.push(row([m.label, m.value, m.change]));
    }
  }
  lines.push("");

  // --- Entities section ---
  lines.push(row(["Entities"]));
  lines.push(row(["Type", "Name"]));
  const groups: [keyof Entities, string][] = [
    ["companies", "Company"],
    ["people", "Person"],
    ["places", "Place"],
  ];
  for (const [key, heading] of groups) {
    for (const name of data.entities[key]) {
      lines.push(row([heading, name]));
    }
  }

  return lines.join("\r\n");
}
