"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAX_LIBRARY } from "@/lib/config";
import { EXAMPLES, EXAMPLE_RESULTS } from "@/lib/examples";
import { addEntry, clearHistory, loadHistory, removeEntry } from "@/lib/history";
import { clearKey, getKey, setKey } from "@/lib/key-store";
import {
  addToLibrary,
  clearLibrary,
  embeddableText,
  loadLibrary,
  removeFromLibrary,
} from "@/lib/library";
import { topK } from "@/lib/vector";
import type { SignalErrorCode } from "@/lib/errors";
import type { Scored } from "@/lib/vector";
import type {
  AnalysisResult,
  AskResponse,
  AnalyzeResponse,
  HistoryEntry,
  LibraryEntry,
  ValidateKeyResponse,
} from "@/lib/types";
import { ApiKeyPanel, type KeyState } from "@/components/ApiKeyPanel";
import { ExampleGallery } from "@/components/ExampleGallery";
import { HistoryRail } from "@/components/HistoryRail";
import { InputPanel } from "@/components/InputPanel";
import { StatusLine } from "@/components/StatusLine";
import { AskArchive, type AskStatus } from "@/components/library/AskArchive";
import { BriefingLibrary, SaveToLibraryButton } from "@/components/library/BriefingLibrary";
import { ErrorPanel } from "@/components/report/ErrorPanel";
import { ExportBar } from "@/components/report/ExportBar";
import { ReportSkeleton } from "@/components/report/ReportSkeleton";
import { ReportView } from "@/components/report/ReportView";

/** How many saved briefings the client's retrieval sends on as context. */
const TOP_K = 3;

/**
 * A failure that already carries a message fit for a human. Anything else caught
 * in the Library flows is a transport error and gets a generic line instead —
 * this is what keeps a raw `TypeError: Failed to fetch` off the screen.
 */
class AskFailure extends Error {
  readonly code?: SignalErrorCode;
  constructor(message: string, code?: SignalErrorCode) {
    super(message);
    this.name = "AskFailure";
    this.code = code;
    Object.setPrototypeOf(this, AskFailure.prototype);
  }
}

/**
 * Embed texts via `/api/ask`. The key travels in the `X-Gemini-Key` header of a
 * same-origin request — the same and only path it takes anywhere else here.
 */
async function embed(key: string, texts: string[]): Promise<number[][]> {
  const res = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Gemini-Key": key },
    body: JSON.stringify({ op: "embed", texts }),
  });
  const body = (await res.json()) as AskResponse;
  if (!body.ok) throw new AskFailure(body.error.message, body.error.code);
  if (body.op !== "embed") throw new AskFailure("Unexpected response from the server.");
  return body.vectors;
}

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

export function Workbench() {
  const [view, setView] = useState<View>("idle");
  const [keyState, setKeyState] = useState<KeyState>("none");
  const [keyValue, setKeyValue] = useState("");

  const [text, setText] = useState("");
  const [activeExample, setActiveExample] = useState<string | null>(null);

  const [report, setReport] = useState<ReportState | null>(null);
  const [error, setError] = useState<{ code: SignalErrorCode; message: string } | null>(
    null,
  );

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);

  // --- Briefing Library / RAG (docs/PLAN.md § Phase 4) ---------------------
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [activeLibraryId, setActiveLibraryId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** The Library id of the briefing currently on screen, if it was saved. */
  const [savedReportId, setSavedReportId] = useState<string | null>(null);

  const [question, setQuestion] = useState("");
  const [askStatus, setAskStatus] = useState<AskStatus>("idle");
  const [answer, setAnswer] = useState<string | null>(null);
  const [citationIds, setCitationIds] = useState<string[]>([]);
  const [retrieved, setRetrieved] = useState<Scored<LibraryEntry>[]>([]);
  const [askError, setAskError] = useState<string | null>(null);

  const [testing, setTesting] = useState(false);
  const [testReason, setTestReason] = useState<string | null>(null);
  const [lastParseMs, setLastParseMs] = useState<number | null>(null);
  const [keyHighlight, setKeyHighlight] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const reportRef = useRef<HTMLDivElement>(null);
  const keyPanelRef = useRef<HTMLElement>(null);

  // Rehydrate from storage after mount. Doing this in an effect (not during
  // render) keeps the server and first client render identical.
  //
  // The asymmetry here is deliberate, not an oversight: the key comes back from
  // sessionStorage (same tab only — a fresh tab starts keyless), while history
  // comes back from localStorage (a fresh tab still has your past briefings).
  // The secret dies with the tab; the work does not.
  useEffect(() => {
    const stored = getKey();
    if (stored) {
      setKeyValue(stored);
      setKeyState("untested");
    }
    setHistory(loadHistory());
    setLibrary(loadLibrary());
  }, []);

  /** Record a finished briefing and make it the selected entry in the rail. */
  const recordHistory = useCallback(
    (result: AnalysisResult, sourceText: string, isPreview: boolean) => {
      const next = addEntry(result, sourceText, isPreview);
      setHistory(next);
      setActiveHistoryId(next[0]?.id ?? null);
    },
    [],
  );

  /**
   * Revisit a past briefing. The stored entry already holds the full
   * AnalysisResult, so this is pure state — no fetch, no key, no quota.
   */
  const handleRestore = useCallback((entry: HistoryEntry) => {
    setReport({ result: entry.result, preview: entry.isPreview ?? false });
    setText(entry.source);
    setActiveExample(null);
    setError(null);
    setView("report");
    setActiveHistoryId(entry.id);
    // A history entry is not a Library entry, even if the same text produced
    // both: the Save button must offer to shelve it, not claim it already is.
    setActiveLibraryId(null);
    setSavedReportId(null);
    setAnnouncement("Restored a saved briefing.");
  }, []);

  const handleRemoveHistory = useCallback(
    (id: string) => {
      setHistory(removeEntry(id));
      if (activeHistoryId === id) setActiveHistoryId(null);
      setAnnouncement("Briefing removed from history.");
    },
    [activeHistoryId],
  );

  const handleClearHistory = useCallback(() => {
    setHistory(clearHistory());
    setActiveHistoryId(null);
    setAnnouncement("History cleared.");
  }, []);

  /**
   * Show a saved briefing. Pure state, like the history rail — the entry already
   * holds its full AnalysisResult. It carries no `source`, so the editor is left
   * alone rather than being cleared: the Library restores a *report*, not an
   * editing session.
   */
  const handleRestoreLibrary = useCallback((entry: LibraryEntry) => {
    setReport({ result: entry.result, preview: false });
    setError(null);
    setView("report");
    setActiveLibraryId(entry.id);
    setActiveHistoryId(null);
    setSavedReportId(entry.id);
    setAnnouncement("Opened a saved briefing from the Library.");
    reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleRemoveLibrary = useCallback(
    (id: string) => {
      setLibrary(removeFromLibrary(id));
      if (activeLibraryId === id) setActiveLibraryId(null);
      if (savedReportId === id) setSavedReportId(null);
      // A citation pointing at a briefing that no longer exists is a broken link.
      setCitationIds((ids) => ids.filter((c) => c !== id));
      setRetrieved((rows) => rows.filter((r) => r.item.id !== id));
      setAnnouncement("Briefing removed from the Library.");
    },
    [activeLibraryId, savedReportId],
  );

  const handleClearLibrary = useCallback(() => {
    setLibrary(clearLibrary());
    setActiveLibraryId(null);
    setSavedReportId(null);
    setCitationIds([]);
    setRetrieved([]);
    setAskStatus("idle");
    setAnswer(null);
    setAnnouncement("Library cleared.");
  }, []);

  /**
   * Save the briefing on screen: embed `summary + topics`, then shelve the
   * result with its vector. The embedding is the whole reason this needs a key —
   * without a vector the briefing could be stored but never found.
   */
  const saveToLibrary = useCallback(async () => {
    if (!report) return;
    const key = keyValue.trim();
    if (!key) {
      // No request goes out. Point at the key panel, and say why.
      setKeyHighlight(true);
      setAnnouncement(
        "A Gemini API key is required to save a briefing — saving embeds it so you can search it later.",
      );
      return;
    }

    setSaving(true);
    setAskError(null);
    try {
      const vectors = await embed(key, [embeddableText(report.result)]);
      const vector = vectors[0];
      if (!vector) throw new Error("no vector");

      const { entries, persisted } = addToLibrary(report.result, text, vector);
      setLibrary(entries);
      setSavedReportId(entries[0]?.id ?? null);
      setActiveLibraryId(entries[0]?.id ?? null);
      setAnnouncement(
        persisted
          ? "Briefing saved to the Library."
          : "Briefing saved for this session only — this browser's storage is full.",
      );
    } catch (err) {
      const message =
        err instanceof AskFailure
          ? err.message
          : "Could not save this briefing. Check your connection and try again.";
      if (err instanceof AskFailure && err.code === "invalid_key") setKeyState("invalid");
      setAskError(message);
      setAskStatus("error");
      setAnnouncement(`Save failed. ${message}`);
    } finally {
      setSaving(false);
    }
  }, [report, keyValue, text]);

  /**
   * The RAG loop. Embed the question, rank the Library *here in the browser*,
   * and send only the top 3 briefings on as grounding context.
   *
   * The ranking never leaves this function — the route is given the shortlist,
   * not the shelf, so the model can only answer from what retrieval chose.
   */
  const askArchive = useCallback(async () => {
    const trimmed = question.trim();
    if (!trimmed || library.length === 0) return;

    const key = keyValue.trim();
    if (!key) {
      setKeyHighlight(true);
      setAnnouncement("A Gemini API key is required to ask the archive.");
      return;
    }

    setAskError(null);
    setAnswer(null);
    setCitationIds([]);
    setRetrieved([]);

    try {
      setAskStatus("embedding");
      const [questionVector] = await embed(key, [trimmed]);
      if (!questionVector) throw new AskFailure("The question could not be embedded.");

      setAskStatus("retrieving");
      const shortlist = topK(questionVector, library, TOP_K);
      if (shortlist.length === 0) {
        // Every stored vector is a different width — i.e. saved before EMBED_DIM
        // changed. Nothing is comparable, so there is nothing honest to answer.
        throw new AskFailure(
          "Your saved briefings were embedded by an older version. Re-save one to ask about it.",
        );
      }
      setRetrieved(shortlist);

      setAskStatus("answering");
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Gemini-Key": key },
        body: JSON.stringify({
          op: "answer",
          question: trimmed,
          context: shortlist.map(({ item }) => ({
            id: item.id,
            summary: item.result.summary,
            topics: item.result.topics,
            sentiment: item.result.sentiment.label,
          })),
        }),
      });
      const body = (await res.json()) as AskResponse;
      if (!body.ok) {
        if (body.error.code === "invalid_key") setKeyState("invalid");
        throw new AskFailure(body.error.message);
      }
      if (body.op !== "answer") throw new AskFailure("Unexpected response.");

      setAnswer(body.answer);
      setCitationIds(body.citations);
      setAskStatus("done");
      setAnnouncement(
        body.citations.length > 0
          ? `Answered from ${body.citations.length} saved ${
              body.citations.length === 1 ? "briefing" : "briefings"
            }.`
          : "Answered: the saved briefings did not cover that question.",
      );
    } catch (err) {
      const message =
        err instanceof AskFailure
          ? err.message
          : "The request could not be sent. Check your connection and try again.";
      if (err instanceof AskFailure && err.code === "invalid_key") setKeyState("invalid");
      setAskError(message);
      setAskStatus("error");
      setAnnouncement(`Question failed. ${message}`);
    }
  }, [question, library, keyValue]);

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
      setSavedReportId(null);
      setActiveLibraryId(null);
      setAnnouncement("Analysis complete. Showing a preview briefing.");
      // The example's own text, not the gallery label — `source` is what gets
      // restored into the editor, so it has to be the real thing.
      recordHistory(canned, EXAMPLES[label] ?? "", true);
    },
    [recordHistory],
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
        setSavedReportId(null);
        setActiveLibraryId(null);
        setKeyState("valid");
        setAnnouncement("Analysis complete.");
        recordHistory(body.result, text, false);
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
  }, [keyValue, text, recordHistory]);

  const focusKeyPanel = useCallback(() => {
    setKeyHighlight(true);
    // Scroll to the key panel itself, not the report. On desktop the panel is
    // sticky so either works, but on mobile the rail sits *above* the report and
    // scrolling to the report moved the panel off-screen — pointing away from
    // the very control being asked for.
    keyPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const keyMode = keyState === "valid" || keyState === "untested" ? "live" : "preview";
  const hasKey = keyValue.trim().length > 0;

  // Resolve cited ids back to entries at render time rather than storing the
  // rows: an entry the user removed after asking must stop being linkable.
  const citedEntries = useMemo(
    () =>
      citationIds
        .map((id) => library.find((e) => e.id === id))
        .filter((e): e is LibraryEntry => e !== undefined),
    [citationIds, library],
  );

  return (
    <div className="relative z-10">
      {/* Screen-reader announcements for every state transition. */}
      <div aria-live="polite" aria-atomic="true" className="sr-only" role="status">
        {announcement}
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-8">
        {/* Left rail — collapses above the input on mobile. */}
        <aside
          ref={keyPanelRef}
          className="order-1 space-y-4 lg:sticky lg:top-6 lg:order-none lg:self-start"
        >
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
          <HistoryRail
            entries={history}
            activeId={activeHistoryId}
            onRestore={handleRestore}
            onRemove={handleRemoveHistory}
            onClear={handleClearHistory}
          />
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
                exportSlot={
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ExportBar result={report.result} />
                    <span aria-hidden="true" className="mx-0.5 h-3 w-px bg-console-border" />
                    <SaveToLibraryButton
                      onSave={saveToLibrary}
                      saving={saving}
                      saved={savedReportId !== null}
                      hasKey={hasKey}
                      full={library.length >= MAX_LIBRARY}
                    />
                  </div>
                }
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

          {/* The RAG surface. Below the report because it is about the shelf as
              a whole, not the briefing on screen — and it stays visible keyless,
              where it explains itself instead of disappearing. */}
          <AskArchive
            libraryCount={library.length}
            hasKey={hasKey}
            status={askStatus}
            question={question}
            onQuestionChange={setQuestion}
            onAsk={askArchive}
            answer={answer}
            citations={citedEntries}
            retrieved={retrieved}
            error={askError}
            onOpenBriefing={handleRestoreLibrary}
            onAddKey={focusKeyPanel}
          />

          <BriefingLibrary
            entries={library}
            activeId={activeLibraryId}
            onRestore={handleRestoreLibrary}
            onRemove={handleRemoveLibrary}
            onClear={handleClearLibrary}
            citedIds={citationIds}
          />
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
