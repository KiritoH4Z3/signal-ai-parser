/** CSV export: section structure + RFC-4180 quoting. Pure, offline. */

import { describe, expect, it } from "vitest";

import { buildCsvExport, csvField } from "@/lib/csv";
import { EXAMPLE_RESULTS } from "@/lib/examples";

describe("csvField", () => {
  it("leaves a plain field unquoted", () => {
    expect(csvField("Revenue")).toBe("Revenue");
  });

  it("quotes fields containing a comma, quote or newline", () => {
    expect(csvField("12,400")).toBe('"12,400"');
    expect(csvField("line\nbreak")).toBe('"line\nbreak"');
    expect(csvField("carriage\rreturn")).toBe('"carriage\rreturn"');
  });

  it("escapes embedded double quotes by doubling them", () => {
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
  });

  it("renders null and undefined as empty", () => {
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
  });
});

describe("buildCsvExport", () => {
  it("emits a metrics section then an entities section", () => {
    const csv = buildCsvExport({
      metrics: [{ label: "Revenue", value: "$4.2B", change: "+27%" }],
      entities: { companies: ["Acme"], people: ["Dana"], places: ["Brussels"] },
    });
    const lines = csv.split("\r\n");

    expect(lines[0]).toBe("Metrics");
    expect(lines[1]).toBe("Label,Value,Change");
    expect(lines[2]).toBe("Revenue,$4.2B,+27%");
    expect(lines[3]).toBe("");
    expect(lines[4]).toBe("Entities");
    expect(lines[5]).toBe("Type,Name");
    expect(lines.slice(6)).toEqual([
      "Company,Acme",
      "Person,Dana",
      "Place,Brussels",
    ]);
  });

  it("uses CRLF line endings", () => {
    expect(buildCsvExport({})).toContain("\r\n");
  });

  it("keeps headers even when there is no data", () => {
    expect(buildCsvExport({})).toBe("Metrics\r\nLabel,Value,Change\r\n\r\nEntities\r\nType,Name");
  });

  it("quotes a metric value containing a comma", () => {
    const csv = buildCsvExport({
      metrics: [{ label: "Net new customers", value: "12,400", change: "+18%" }],
    });
    expect(csv).toContain('Net new customers,"12,400",+18%');
  });

  it("normalizes raw input before exporting", () => {
    const csv = buildCsvExport({ entities: { companies: "Acme" } });
    expect(csv).toContain("Company,Acme");
  });

  it("exports the canned example result", () => {
    const csv = buildCsvExport(EXAMPLE_RESULTS["📊 Earnings note"]);
    expect(csv).toContain("Revenue,$4.2B,+27%");
    expect(csv).toContain("Company,Acme Cloud Inc.");
  });
});
