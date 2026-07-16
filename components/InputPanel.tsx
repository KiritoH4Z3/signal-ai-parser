"use client";

import { useId } from "react";
import { MAX_INPUT_CHARS, MIN_INPUT_CHARS } from "@/lib/config";

/** Amber once the paste is within 10% of the cap. */
const WARN_CHARS = 18_000;

export function InputPanel({
  value,
  onChange,
  onAnalyze,
  busy,
}: {
  value: string;
  onChange: (next: string) => void;
  onAnalyze: () => void;
  busy: boolean;
}) {
  const areaId = useId();
  const countId = useId();

  const count = value.length;
  const tooShort = count < MIN_INPUT_CHARS;
  const overCap = count > MAX_INPUT_CHARS;

  const countTone = overCap
    ? "text-sentiment-negative"
    : count > WARN_CHARS
      ? "text-sentiment-neutral"
      : "text-console-dim";

  return (
    <section aria-labelledby={`${areaId}-heading`} className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={`${areaId}-heading`} className="kicker">
          Source text
        </h2>
        {/* The counter is data — mono, and it announces politely as it changes. */}
        <p
          id={countId}
          className={`font-mono text-xs tabular-nums transition-colors duration-200 ${countTone}`}
        >
          {count.toLocaleString("en-US")}
          <span className="text-console-faint"> / {MAX_INPUT_CHARS.toLocaleString("en-US")}</span>
        </p>
      </div>

      <label htmlFor={areaId} className="sr-only">
        Text to analyze
      </label>
      <textarea
        id={areaId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={9}
        spellCheck={false}
        aria-describedby={countId}
        placeholder="Paste a news snippet, an earnings note, a client email…"
        className="w-full resize-y rounded-lg border border-console-border bg-console-well p-4 text-sm leading-relaxed text-console-ink placeholder:text-console-faint focus:border-console-accent/50"
      />

      {overCap && (
        <p className="font-mono text-[11px] text-sentiment-negative">
          Over the {MAX_INPUT_CHARS.toLocaleString("en-US")}-character cap — the
          text will be truncated before analysis.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onAnalyze}
          disabled={tooShort || busy}
          className="inline-flex items-center gap-2 rounded-md bg-console-accent px-5 py-2.5 font-mono text-xs font-bold uppercase tracking-[0.12em] text-console-bg transition-all duration-200 hover:bg-console-accent/85 disabled:cursor-not-allowed disabled:bg-console-border disabled:text-console-faint"
        >
          {busy ? (
            <>
              <svg
                viewBox="0 0 16 16"
                className="h-3 w-3 animate-spin"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="8" cy="8" r="6" opacity="0.25" />
                <path d="M14 8a6 6 0 0 0-6-6" strokeLinecap="round" />
              </svg>
              Analyzing
            </>
          ) : (
            <>
              Analyze
              <svg
                viewBox="0 0 16 16"
                className="h-3 w-3"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 8h9M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </>
          )}
        </button>

        {tooShort && (
          <p className="font-mono text-[11px] text-console-dim">
            {count === 0
              ? `Needs at least ${MIN_INPUT_CHARS} characters.`
              : `${MIN_INPUT_CHARS - count} more character${
                  MIN_INPUT_CHARS - count === 1 ? "" : "s"
                } to analyze.`}
          </p>
        )}
      </div>
    </section>
  );
}
