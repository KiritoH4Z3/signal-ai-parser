/**
 * Ready-made sample texts (and pre-baked results) for the "Try an example"
 * control. Verbatim port of the legacy `utils/examples.py` — the sample texts and
 * canned results are copied as-is, only re-typed against `AnalysisResult`.
 *
 * Each example is chosen to show range:
 *   * the news snippet is entity-dense (companies / people / places),
 *   * the earnings note is metric-dense (fills the gauge + metric cards),
 *   * the business email is sentiment-ambiguous (shows the model's reasoning).
 *
 * `EXAMPLE_RESULTS` holds one canned, already-normalized result per example so
 * the deployed app can always show a populated report in preview / no-key mode
 * without burning an API call. Pure data — no network, no key.
 */

import type { AnalysisResult } from "@/lib/types";

/** label -> raw sample text */
export const EXAMPLES: Record<string, string> = {
  "📰 News snippet":
    "SAN FRANCISCO — Nvidia said on Tuesday that it will deepen its " +
    "partnership with Microsoft and OpenAI, committing to supply a new " +
    "generation of AI accelerators through 2027. Chief executive Jensen " +
    "Huang told reporters at the company's Santa Clara headquarters that " +
    "demand from cloud providers, including Amazon Web Services and Google " +
    "Cloud, had 'far outstripped' supply. Analysts at Morgan Stanley said " +
    "the agreement cements Nvidia's lead over rival AMD in the data-center " +
    "market, while the European Commission in Brussels signaled it may " +
    "review the deal on competition grounds.",
  "📊 Earnings note":
    "Acme Cloud Inc. reported Q3 FY2026 results after the bell. Revenue " +
    "rose 27% year over year to $4.2 billion, beating consensus of $3.9 " +
    "billion. Operating margin expanded to 31%, up from 24% a year ago, and " +
    "free cash flow reached $1.1 billion. Net new customers grew 18% to " +
    "12,400, while net revenue retention held steady at 121%. Management " +
    "raised full-year revenue guidance to $16.8 billion and now expects " +
    "earnings per share of $5.40, roughly 12% above prior guidance. Shares " +
    "climbed 9% in after-hours trading.",
  "✉️ Business email":
    "Hi team,\n\nThanks for the demo yesterday — the new onboarding flow " +
    "looks promising and the design is a clear step up. That said, I have " +
    "to be honest: the pricing came in about 20% higher than we budgeted, " +
    "and procurement is nervous about the 12-month lock-in. We're still " +
    "interested, but I can't get sign-off from finance until we see a path " +
    "on cost. Could we set up a call next week with your account team to " +
    "talk through options? Appreciate your patience.\n\nBest,\nDana " +
    "Whitlock\nVP Operations, Northwind Logistics",
};

/** label -> pre-baked, normalized results (used in preview / no-key mode) */
export const EXAMPLE_RESULTS: Record<string, AnalysisResult> = {
  "📰 News snippet": {
    summary:
      "Nvidia is deepening its AI-accelerator partnership with Microsoft " +
      "and OpenAI through 2027 as demand from major cloud providers " +
      "outpaces supply. The move is seen as cementing Nvidia's data-center " +
      "lead over AMD, though EU regulators may review it.",
    entities: {
      companies: [
        "Nvidia",
        "Microsoft",
        "OpenAI",
        "Amazon Web Services",
        "Google Cloud",
        "AMD",
        "Morgan Stanley",
      ],
      people: ["Jensen Huang"],
      places: ["San Francisco", "Santa Clara", "Brussels"],
    },
    metrics: [
      { label: "Supply commitment through", value: "2027", change: "" },
    ],
    sentiment: {
      label: "Positive",
      confidence: "High",
      confidence_score: 88,
      reasoning:
        "Strengthened partnerships and a widening competitive lead " +
        "outweigh the possible regulatory review.",
    },
    topics: [
      "AI hardware",
      "Cloud computing",
      "Partnerships",
      "Antitrust",
      "Semiconductors",
    ],
  },
  "📊 Earnings note": {
    summary:
      "Acme Cloud beat Q3 FY2026 estimates with revenue up 27% to $4.2 " +
      "billion and operating margin expanding to 31%. The company raised " +
      "full-year guidance and shares rose 9% after hours.",
    entities: {
      companies: ["Acme Cloud Inc."],
      people: [],
      places: [],
    },
    metrics: [
      { label: "Revenue", value: "$4.2B", change: "+27%" },
      { label: "Operating margin", value: "31%", change: "+7pts" },
      { label: "Free cash flow", value: "$1.1B", change: "" },
      { label: "Net new customers", value: "12,400", change: "+18%" },
      { label: "Net revenue retention", value: "121%", change: "" },
      { label: "FY guidance (revenue)", value: "$16.8B", change: "" },
    ],
    sentiment: {
      label: "Positive",
      confidence: "High",
      confidence_score: 92,
      reasoning:
        "Broad beats across revenue, margins and cash flow plus raised " +
        "guidance and a positive market reaction.",
    },
    topics: ["Earnings", "SaaS", "Guidance", "Profitability", "Customer growth"],
  },
  "✉️ Business email": {
    summary:
      "Northwind Logistics is impressed by the new onboarding flow and " +
      "design but is stalled by pricing roughly 20% over budget and a " +
      "12-month lock-in. They remain interested and want a call to " +
      "explore cost options before finance will sign off.",
    entities: {
      companies: ["Northwind Logistics"],
      people: ["Dana Whitlock"],
      places: [],
    },
    metrics: [
      { label: "Pricing over budget", value: "20%", change: "+20%" },
      { label: "Contract lock-in", value: "12 months", change: "" },
    ],
    sentiment: {
      label: "Neutral",
      confidence: "Medium",
      confidence_score: 58,
      reasoning:
        "Genuine interest and praise are offset by real budget and " +
        "lock-in objections, leaving the outcome uncertain.",
    },
    topics: ["Sales", "Pricing", "Procurement", "Negotiation", "Customer feedback"],
  },
};

/** Stable display order for the example gallery. */
export const EXAMPLE_LABELS: readonly string[] = Object.keys(EXAMPLES);
