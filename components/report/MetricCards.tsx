import type { Metric } from "@/lib/types";

export type Direction = "up" | "down" | "flat";

/**
 * Read the direction off the change string. The normalizer already shapes these
 * as "+27%" / "-3pts" / "" — anything it can't sign reads as flat.
 *
 * Exported (with the three lookup tables below) so the landing page's hero
 * cards can speak this component's visual language without forking it. They
 * can't reuse `MetricCards` itself — each hero card needs its own id as a
 * provenance-hairline anchor — but the delta rendering must not drift.
 */
export function direction(change: string): Direction {
  const trimmed = change.trim();
  if (!trimmed) return "flat";
  if (/^[+▲]/.test(trimmed) || /\bup\b/i.test(trimmed)) return "up";
  if (/^[-−▼]/.test(trimmed) || /\bdown\b/i.test(trimmed)) return "down";
  return "flat";
}

/**
 * Delta glyph + colour together — never colour alone (WCAG 1.4.1). The glyph is
 * aria-hidden and the direction is spelled out for screen readers instead.
 */
export const GLYPH: Record<Direction, string> = { up: "▲", down: "▼", flat: "" };
export const TONE: Record<Direction, string> = {
  up: "text-sentiment-positive",
  down: "text-sentiment-negative",
  flat: "text-console-dim",
};
export const SPOKEN: Record<Direction, string> = {
  up: "up",
  down: "down",
  flat: "",
};

export function MetricCards({ metrics }: { metrics: Metric[] }) {
  if (metrics.length === 0) return null;

  return (
    <section aria-labelledby="metrics-heading">
      <h3 id="metrics-heading" className="kicker mb-3">
        Metrics
        <span className="ml-2 text-console-faint">{metrics.length}</span>
      </h3>
      {/* Each card carries its own border rather than the grid painting one
          behind a gap-px lattice: a partial last row would otherwise leave the
          container's background showing as a filled empty cell. */}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map((metric, i) => {
          const dir = direction(metric.change);
          return (
            <li
              key={`${metric.label}-${i}`}
              className="group rounded-md border border-console-border bg-console-surface p-4 transition-colors duration-200 hover:bg-console-well"
            >
              <p className="mb-2 line-clamp-2 text-xs leading-snug text-console-dim">
                {metric.label}
              </p>
              <p className="font-mono text-2xl font-bold tracking-tight text-console-ink">
                {metric.value}
              </p>
              {metric.change ? (
                <p className={`mt-1 font-mono text-xs font-medium ${TONE[dir]}`}>
                  <span aria-hidden="true">{GLYPH[dir]}</span>
                  <span className={GLYPH[dir] ? "ml-1" : ""}>{metric.change}</span>
                  {SPOKEN[dir] ? (
                    <span className="sr-only"> {SPOKEN[dir]}</span>
                  ) : null}
                </p>
              ) : (
                <p className="mt-1 font-mono text-xs text-console-faint" aria-hidden="true">
                  —
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
