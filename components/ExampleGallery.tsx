"use client";

import { EXAMPLES, EXAMPLE_LABELS } from "@/lib/examples";

/**
 * One-click sample loader. Each example shows a different capability, so the
 * card says which — the blurb is the reason to click, not decoration.
 *
 * Icons are inline SVG: no icon library (a dependency for three glyphs is a bad
 * trade, and the CSP forbids remote assets anyway).
 */

type IconProps = { className?: string };

function NewsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M3 5h11v10a1 1 0 0 0 1 1H4a1 1 0 0 1-1-1V5Z" strokeLinejoin="round" />
      <path d="M14 8h3v7a1 1 0 0 1-1 1" strokeLinejoin="round" />
      <path d="M5.5 7.5h6M5.5 10h6M5.5 12.5h3.5" strokeLinecap="round" />
    </svg>
  );
}

function ChartIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M3 16h14" strokeLinecap="round" />
      <path d="M5.5 16V11M9 16V6.5M12.5 16v-7M16 16V4" strokeLinecap="round" />
    </svg>
  );
}

function MailIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <rect x="2.5" y="5" width="15" height="10" rx="1.5" />
      <path d="m3.5 6.5 6.5 5 6.5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Per-example presentation, keyed by the label in lib/examples.ts. */
const META: Record<
  string,
  { icon: (p: IconProps) => JSX.Element; title: string; blurb: string }
> = {
  "📰 News snippet": {
    icon: NewsIcon,
    title: "News snippet",
    blurb: "Entity-dense — companies, people, places",
  },
  "📊 Earnings note": {
    icon: ChartIcon,
    title: "Earnings note",
    blurb: "Metric-dense — fills the KPI grid",
  },
  "✉️ Business email": {
    icon: MailIcon,
    title: "Business email",
    blurb: "Sentiment-ambiguous — shows the reasoning",
  },
};

export function ExampleGallery({
  onPick,
  activeLabel,
  disabled = false,
}: {
  onPick: (label: string) => void;
  /** The example currently loaded, if any. */
  activeLabel: string | null;
  disabled?: boolean;
}) {
  return (
    <section aria-labelledby="examples-heading" className="space-y-3">
      <h2 id="examples-heading" className="kicker">
        Try an example
      </h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {EXAMPLE_LABELS.map((label) => {
          const meta = META[label];
          if (!meta) return null;
          const Icon = meta.icon;
          const active = activeLabel === label;
          const chars = EXAMPLES[label]?.length ?? 0;

          return (
            <li key={label}>
              <button
                type="button"
                onClick={() => onPick(label)}
                disabled={disabled}
                aria-pressed={active}
                className={`group flex h-full w-full flex-col items-start gap-2 rounded-lg border p-4 text-left transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${
                  active
                    ? "border-console-accent/60 bg-console-accent/[0.07]"
                    : "border-console-border bg-console-surface hover:-translate-y-0.5 hover:border-console-accent/40 hover:bg-console-well"
                }`}
              >
                <Icon
                  className={`h-5 w-5 transition-colors duration-200 ${
                    active
                      ? "text-console-accent"
                      : "text-console-dim group-hover:text-console-accent"
                  }`}
                />
                <span className="font-mono text-xs font-bold text-console-ink">
                  {meta.title}
                </span>
                <span className="text-[11px] leading-snug text-console-dim">
                  {meta.blurb}
                </span>
                <span className="mt-auto pt-1 font-mono text-[10px] tabular-nums text-console-faint">
                  {chars.toLocaleString("en-US")} chars
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
