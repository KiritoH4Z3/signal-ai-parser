import { GEMINI_MODEL } from "@/lib/config";

/**
 * The persistent terminal strip:
 *   MODEL gemini-2.5-flash · KEY ● live · 1,243 chars · last parse 2.1s
 *
 * Every value here is data, so the whole strip is mono. It is decorative status
 * rather than an announcement — the aria-live region in Workbench does the
 * announcing, so this stays out of the accessibility tree's way by simply being
 * plain text.
 */
export type KeyMode = "live" | "preview";

function Dot({ mode }: { mode: KeyMode }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-1.5 w-1.5 rounded-full ${
        mode === "live"
          ? "bg-sentiment-positive shadow-[0_0_6px_rgba(52,211,153,0.8)]"
          : "bg-sentiment-neutral shadow-[0_0_6px_rgba(251,191,36,0.7)]"
      }`}
    />
  );
}

function Sep() {
  return (
    <span aria-hidden="true" className="text-console-border">
      ·
    </span>
  );
}

export function StatusLine({
  keyMode,
  charCount,
  lastParseMs,
}: {
  keyMode: KeyMode;
  charCount: number;
  /** Duration of the most recent live parse, or null if none yet. */
  lastParseMs: number | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-console-border bg-console-surface/70 px-4 py-2 font-mono text-[11px] text-console-dim backdrop-blur">
      <span>
        <span className="text-console-faint">MODEL</span>{" "}
        <span className="text-console-ink">{GEMINI_MODEL}</span>
      </span>
      <Sep />
      <span className="inline-flex items-center gap-1.5">
        <span className="text-console-faint">KEY</span>
        <Dot mode={keyMode} />
        <span
          className={
            keyMode === "live" ? "text-sentiment-positive" : "text-sentiment-neutral"
          }
        >
          {keyMode}
        </span>
      </span>
      <Sep />
      <span className="text-console-ink">
        {charCount.toLocaleString("en-US")}
        <span className="text-console-faint"> chars</span>
      </span>
      <Sep />
      <span>
        <span className="text-console-faint">last parse</span>{" "}
        <span className="text-console-ink">
          {lastParseMs === null ? "—" : `${(lastParseMs / 1000).toFixed(1)}s`}
        </span>
      </span>
    </div>
  );
}
