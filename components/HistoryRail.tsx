"use client";

import { useEffect, useState } from "react";
import { formatRelative } from "@/lib/history";
import type { SentimentLabel } from "@/lib/config";
import type { HistoryEntry } from "@/lib/types";

/**
 * The last 10 briefings (docs/PLAN.md § "History"). Every entry carries its full
 * `AnalysisResult`, so restoring one is a `setState` — no request, no key, no
 * quota spent. That is the whole reason the rail is worth having.
 *
 * Each row is a real <button>, so keyboard and screen-reader users get Enter,
 * Space and a proper role for free. The per-row delete is a sibling button, not
 * a nested one (nesting is invalid HTML and unreachable by keyboard).
 */

const DOT: Record<SentimentLabel, string> = {
  Positive: "bg-sentiment-positive",
  Neutral: "bg-sentiment-neutral",
  Negative: "bg-sentiment-negative",
};

const TEXT: Record<SentimentLabel, string> = {
  Positive: "text-sentiment-positive",
  Neutral: "text-sentiment-neutral",
  Negative: "text-sentiment-negative",
};

/**
 * Re-render once a minute so "now" becomes "1m ago" without a click. Cheap: one
 * timer for the whole rail, and it stops with the component.
 */
function useMinuteTick(active: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [active]);
}

export function HistoryRail({
  entries,
  activeId,
  onRestore,
  onRemove,
  onClear,
}: {
  entries: HistoryEntry[];
  /** The entry currently shown in the report pane, if any. */
  activeId: string | null;
  onRestore: (entry: HistoryEntry) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  useMinuteTick(entries.length > 0);

  return (
    <section
      aria-labelledby="history-heading"
      className="rounded-lg border border-console-border bg-console-surface p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="history-heading" className="font-mono text-kicker uppercase text-console-ink">
          History
        </h2>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] tabular-nums text-console-faint">
            {entries.length}/10
          </span>
          {entries.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-console-dim transition-colors duration-200 hover:text-sentiment-negative"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-md border border-dashed border-console-border px-3 py-6 text-center text-[11px] leading-relaxed text-console-dim">
          Nothing analyzed yet. Briefings land here — the last 10, on this device.
        </p>
      ) : (
        <ul className="-mr-1 max-h-[320px] space-y-1.5 overflow-y-auto pr-1">
          {entries.map((entry) => {
            const active = entry.id === activeId;
            return (
              <li key={entry.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onRestore(entry)}
                  aria-current={active ? "true" : undefined}
                  className={`w-full rounded-md border py-2 pl-2.5 pr-8 text-left transition-colors duration-200 ${
                    active
                      ? "border-console-accent/60 bg-console-accent/[0.07]"
                      : "border-transparent bg-console-well hover:border-console-border hover:bg-console-well/60"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[entry.sentiment]}`}
                    />
                    {/* The label is spelled out, so sentiment never rides on the
                        dot's colour alone. */}
                    <span
                      className={`font-mono text-[10px] uppercase tracking-[0.1em] ${
                        TEXT[entry.sentiment]
                      }`}
                    >
                      {entry.sentiment}
                    </span>
                    <time
                      dateTime={new Date(entry.timestamp).toISOString()}
                      className="ml-auto font-mono text-[10px] tabular-nums text-console-faint"
                    >
                      {formatRelative(entry.timestamp)}
                    </time>
                  </span>
                  <span className="mt-1 line-clamp-2 block text-[11px] leading-snug text-console-dim">
                    {entry.preview || "(no source text)"}
                  </span>
                </button>

                {/* Always in the DOM and focusable — a hover-only control is
                    invisible to keyboard and touch. It fades in on hover/focus
                    but never leaves the tab order. */}
                <button
                  type="button"
                  onClick={() => onRemove(entry.id)}
                  className="absolute right-1 top-1.5 rounded p-1 text-console-faint opacity-0 transition-opacity duration-200 hover:text-sentiment-negative focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <svg
                    viewBox="0 0 12 12"
                    className="h-2.5 w-2.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" strokeLinecap="round" />
                  </svg>
                  <span className="sr-only">
                    Remove briefing from {formatRelative(entry.timestamp)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
