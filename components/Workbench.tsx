"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EXAMPLES, EXAMPLE_RESULTS } from "@/lib/examples";
import { clearKey, getKey, setKey } from "@/lib/key-store";
import type { SignalErrorCode } from "@/lib/errors";
import type { AnalysisResult, AnalyzeResponse, ValidateKeyResponse } from "@/lib/types";
import { ApiKeyPanel, type KeyState } from "@/components/ApiKeyPanel";
import { ExampleGallery } from "@/components/ExampleGallery";
import { InputPanel } from "@/components/InputPanel";
import { StatusLine } from "@/components/StatusLine";
import { ErrorPanel } from "@/components/report/ErrorPanel";
import { ReportSkeleton } from "@/components/report/ReportSkeleton";
import { ReportView } from "@/components/report/ReportView";

/**
 * The single "use client" island. Everything below it is presentational; the
 * page shell around it stays a server component.
 *
 * Two orthogonal state machines, per docs/PLAN.md:
 *   view     idle → loading → report | error
 *   keyState none | untested | valid | invalid
 *
 * Privacy contract: the key reaches the network in exactly one place — the
 * `X-Gemini-Key` header in `runAnalysis` / `testKey`. Never a body, never a URL,
 * never a log.
 */

type View = "idle" | "loading" | "report" | "error";

interface ReportState {
  result: AnalysisResult;
  /** Canned demo data rather than a live model call. */
  preview: boolean;
}

export function Workbench({
  /** Phase 3 seam: HistoryRail mounts here in the left rail. */
  historySlot,
  /** Phase 3 seam: ExportBar mounts in the report header. */
  exportSlot,
  /** Phase 3 seam: fires on every completed analysis (live or demo). */
  onResult,
}: {
  historySlot?: React.ReactNode;
  exportSlot?: React.ReactNode;
  onResult?: (result: AnalysisResult, meta: { preview: boolean; source: string }) => void;
} = {}) {
  const [view, setView] = useState<View>("idle");
  const [keyState, setKeyState] = useState<KeyState>("none");
  const [keyValue, setKeyValue] = useState("");

  const [text, setText] = useState("");
  const [activeExample, setActiveExample] = useState<string | null>(null);

  const [report, setReport] = useState<ReportState | null>(null);
  const [error, setError] = useState<{ code: SignalErrorCode; message: string } | null>(
    null,
  );

  const [testing, setTesting] = useState(false);
  const [testReason, setTestReason] = useState<string | null>(null);
  const [lastParseMs, setLastParseMs] = useState<number | null>(null);
  const [keyHighlight, setKeyHighlight] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const reportRef = useRef<HTMLDivElement>(null);

  // Rehydrate the key from sessionStorage after mount. Doing this in an effect
  // (not during render) keeps the server and first client render identical.
  useEffect(() => {
    const stored = getKey();
    if (stored) {
      setKeyValue(stored);
      setKeyState("untested");
    }
  }, []);

  const handleKeyChange = useCallback((next: string) => {
    setKeyValue(next);
    setKey(next);
    setKeyState(next.trim() ? "untested" : "none");
    setTestReason(null);
    setKeyHighlight(false);
  }, []);

  const handleClearKey = useCallback(() => {
    clearKey();
    setKeyValue("");
    setKeyState("none");
    setTestReason(null);
  }, []);

  const testKey = useCallback(async () => {
    const key = keyValue.trim();
    if (!key) return;
    setTesting(true);
    setTestReason(null);
    try {
      const res = await fetch("/api/validate-key", {
        method: "POST",
        headers: { "X-Gemini-Key": key },
      });
      const body = (await res.json()) as ValidateKeyResponse;
      if (body.ok) {
        setKeyState("valid");
        setAnnouncement("API key accepted.");
      } else {
        setKeyState("invalid");
        setTestReason(body.error.message);
        setAnnouncement(`API key rejected. ${body.error.message}`);
      }
    } catch {
      // The route never reached us — that is a transport failure, not a verdict
      // on the key, so the LED stays amber rather than turning red.
      setKeyState("untested");
      setTestReason("Could not reach the validation endpoint. Check your connection.");
    } finally {
      setTesting(false);
    }
  }, [keyValue]);

  /** Serve a canned briefing with zero network (preview / no-key mode). */
  const serveDemo = useCallback(
    (label: string) => {
      const canned = EXAMPLE_RESULTS[label];
      if (!canned) return;
      setReport({ result: canned, preview: true });
      setError(null);
      setView("report");
      setAnnouncement("Analysis complete. Showing a preview briefing.");
      onResult?.(canned, { preview: true, source: label });
    },
    [onResult],
  );

  const handlePickExample = useCallback(
    (label: string) => {
      const sample = EXAMPLES[label];
      if (!sample) return;
      setText(sample);
      setActiveExample(label);
      setKeyHighlight(false);

      // Keyless visitors get the pre-baked result immediately — no request, no
      // key, no quota. With a key, the sample just loads into the editor and the
      // visitor decides whether to spend a call on it.
      if (keyState === "none") serveDemo(label);
    },
    [keyState, serveDemo],
  );

  const runAnalysis = useCallback(async () => {
    const key = keyValue.trim();
    if (!key) {
      // No request goes out. Point at the key panel instead.
      setKeyHighlight(true);
      setAnnouncement("A Gemini API key is required to analyze your own text.");
      return;
    }

    setView("loading");
    setError(null);
    setAnnouncement("Analyzing…");

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Gemini-Key": key },
        body: JSON.stringify({ text }),
      });
      const body = (await res.json()) as AnalyzeResponse;

      if (body.ok) {
        setReport({ result: body.result, preview: false });
        setLastParseMs(body.durationMs);
        setView("report");
        setKeyState("valid");
        setAnnouncement("Analysis complete.");
        onResult?.(body.result, { preview: false, source: activeExample ?? "Pasted text" });
      } else {
        setError(body.error);
        setView("error");
        if (body.error.code === "invalid_key") setKeyState("invalid");
        setAnnouncement(`Analysis failed. ${body.error.message}`);
      }
    } catch {
      const fallback = {
        code: "api_error" as const,
        message: "The request could not be sent. Check your connection and try again.",
      };
      setError(fallback);
      setView("error");
      setAnnouncement(`Analysis failed. ${fallback.message}`);
    }
  }, [keyValue, text, activeExample, onResult]);

  const focusKeyPanel = useCallback(() => {
    setKeyHighlight(true);
    reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const keyMode = keyState === "valid" || keyState === "untested" ? "live" : "preview";

  return (
    <div className="relative z-10">
      {/* Screen-reader announcements for every state transition. */}
      <div aria-live="polite" aria-atomic="true" className="sr-only" role="status">
        {announcement}
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-8">
        {/* Left rail — collapses above the input on mobile. */}
        <aside className="order-1 space-y-4 lg:sticky lg:top-6 lg:order-none lg:self-start">
          <ApiKeyPanel
            value={keyValue}
            onChange={handleKeyChange}
            keyState={keyState}
            onTest={testKey}
            onClear={handleClearKey}
            testing={testing}
            testReason={testReason}
            highlighted={keyHighlight}
          />
          {/* Phase 3: HistoryRail lands here. */}
          {historySlot}
        </aside>

        {/* Main column */}
        <div className="order-2 min-w-0 space-y-8 lg:order-none">
          <ExampleGallery
            onPick={handlePickExample}
            activeLabel={activeExample}
            disabled={view === "loading"}
          />

          <InputPanel
            value={text}
            onChange={(next) => {
              setText(next);
              if (activeExample && next !== EXAMPLES[activeExample]) {
                setActiveExample(null);
              }
            }}
            onAnalyze={runAnalysis}
            busy={view === "loading"}
          />

          <div
            ref={reportRef}
            className="min-h-[200px] rounded-lg border border-console-border bg-console-surface/40 p-5 sm:p-6"
          >
            {view === "idle" && <IdleState />}
            {view === "loading" && <ReportSkeleton />}
            {view === "report" && report && (
              <ReportView
                result={report.result}
                preview={report.preview}
                exportSlot={exportSlot}
              />
            )}
            {view === "error" && error && (
              <ErrorPanel
                code={error.code}
                message={error.message}
                onRetry={runAnalysis}
                onAddKey={focusKeyPanel}
              />
            )}
          </div>
        </div>
      </div>

      {/* Pinned to the viewport like a real console status bar — it should never
          scroll away. The page reserves bottom padding for it. */}
      <div className="fixed inset-x-0 bottom-0 z-20">
        <StatusLine keyMode={keyMode} charCount={text.length} lastParseMs={lastParseMs} />
      </div>
    </div>
  );
}

/** Empty state: an invitation to act, not an apology for emptiness. */
function IdleState() {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center rounded-md border border-dashed border-console-border px-6 py-10 text-center">
      <svg
        viewBox="0 0 40 40"
        className="mb-4 h-9 w-9 text-console-dim/40"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        aria-hidden="true"
      >
        <path d="M4 26c4 0 4-12 8-12s4 12 8 12 4-18 8-18 4 18 8 18" strokeLinecap="round" />
      </svg>
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-console-dim">
        No briefing yet
      </p>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-console-dim">
        Pick an example above, or paste your own text and run an analysis. The
        briefing appears here.
      </p>
    </div>
  );
}
