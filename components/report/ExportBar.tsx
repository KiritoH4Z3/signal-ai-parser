"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildCsvExport } from "@/lib/csv";
import { buildMarkdownReport } from "@/lib/markdown";
import type { AnalysisResult } from "@/lib/types";

/**
 * Take the briefing with you: JSON / Markdown / CSV downloads plus a
 * copy-to-clipboard (docs/PLAN.md § "Exports"). The document builders live in
 * `lib/markdown.ts` and `lib/csv.ts` — this component only decides *when* and
 * *what filename*, so the formats stay pure and unit-tested.
 */

/** "2026-07-16-1930" — local time, sortable, safe in every filesystem. */
function fileStamp(when: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}` +
    `-${pad(when.getHours())}${pad(when.getMinutes())}`
  );
}

/**
 * Hand the bytes to the browser without ever touching the DOM's history: build a
 * blob, click a detached anchor, then revoke the URL. Skipping the revoke leaks
 * the whole blob for the life of the document.
 */
function download(filename: string, mime: string, contents: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: `${mime};charset=utf-8` }));
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.click();
  } finally {
    // Revoke on the next tick: Safari has not started reading the blob yet when
    // click() returns, and revoking synchronously gives it an empty file.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

type CopyState = "idle" | "copied" | "failed";

export function ExportBar({ result }: { result: AnalysisResult }) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A flash that outlives its component would setState on an unmounted tree.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const flash = useCallback((state: CopyState) => {
    setCopyState(state);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopyState("idle"), 1500);
  }, []);

  const handleDownload = useCallback(
    (kind: "json" | "md" | "csv") => {
      const stamp = fileStamp(new Date());
      const name = `signal-briefing-${stamp}`;
      if (kind === "json") {
        download(`${name}.json`, "application/json", JSON.stringify(result, null, 2));
      } else if (kind === "md") {
        download(`${name}.md`, "text/markdown", buildMarkdownReport(result));
      } else {
        download(`${name}.csv`, "text/csv", buildCsvExport(result));
      }
    },
    [result],
  );

  const handleCopy = useCallback(async () => {
    const markdown = buildMarkdownReport(result);
    try {
      // Absent on insecure origins; rejects when the permission is denied or the
      // document isn't focused. None of those deserve a thrown error in the UI.
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(markdown);
      flash("copied");
    } catch {
      flash("failed");
    }
  }, [result, flash]);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="sr-only" aria-live="polite">
        {copyState === "copied"
          ? "Markdown copied to clipboard."
          : copyState === "failed"
            ? "Could not copy to the clipboard. Use the Markdown download instead."
            : ""}
      </span>

      <button
        type="button"
        onClick={handleCopy}
        className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-[11px] transition-colors duration-200 ${
          copyState === "copied"
            ? "border-sentiment-positive/50 bg-sentiment-positive/10 text-sentiment-positive"
            : copyState === "failed"
              ? "border-sentiment-negative/50 bg-sentiment-negative/10 text-sentiment-negative"
              : "border-console-border text-console-dim hover:border-console-accent/40 hover:text-console-accent"
        }`}
      >
        {copyState === "copied" ? (
          <svg
            viewBox="0 0 12 12"
            className="h-3 w-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M2 6.5 4.5 9 10 3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 12 12"
            className="h-3 w-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            aria-hidden="true"
          >
            <rect x="4" y="1.5" width="6.5" height="6.5" rx="1" />
            <path d="M8 10.5H2.5a1 1 0 0 1-1-1V4" strokeLinecap="round" />
          </svg>
        )}
        {/* The word changes with the icon — the ✓ never carries the news alone. */}
        {copyState === "copied" ? "Copied" : copyState === "failed" ? "Failed" : "Copy MD"}
      </button>

      <span aria-hidden="true" className="mx-0.5 h-3 w-px bg-console-border" />

      {(
        [
          ["json", "JSON"],
          ["md", "MD"],
          ["csv", "CSV"],
        ] as const
      ).map(([kind, label]) => (
        <button
          key={kind}
          type="button"
          onClick={() => handleDownload(kind)}
          className="rounded border border-console-border px-2.5 py-1 font-mono text-[11px] text-console-dim transition-colors duration-200 hover:border-console-accent/40 hover:text-console-accent"
        >
          {label}
          <span className="sr-only"> — download this briefing as {label}</span>
        </button>
      ))}
    </div>
  );
}
