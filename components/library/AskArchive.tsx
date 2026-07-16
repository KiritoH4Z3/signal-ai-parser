"use client";

import { useId, useState } from "react";
import { MAX_QUESTION_CHARS, MIN_QUESTION_CHARS } from "@/lib/config";
import type { LibraryEntry } from "@/lib/types";
import type { Scored } from "@/lib/vector";

/**
 * Ask the archive (docs/PLAN.md § Phase 4) — the RAG loop, made visible.
 *
 * The retrieval step is the interesting part and it happens in this browser: the
 * question is embedded, cosine-ranked against the vectors already in
 * localStorage, and only the top 3 briefings are sent on to the model. So the UI
 * *shows* that — the ranked shortlist with similarity scores is rendered, not
 * hidden behind a spinner. A RAG demo that only prints the answer is
 * indistinguishable from a chatbot.
 *
 * Presentational: the key and both fetches stay in `Workbench`.
 */

export type AskStatus = "idle" | "embedding" | "retrieving" | "answering" | "done" | "error";

/** What the console is doing, in its own voice. */
const BUSY_COPY: Record<string, string> = {
  embedding: "Embedding question…",
  retrieving: "Ranking briefings in this browser…",
  answering: "Answering from the top 3…",
};

export function AskArchive({
  libraryCount,
  hasKey,
  status,
  question,
  onQuestionChange,
  onAsk,
  answer,
  citations,
  retrieved,
  error,
  onOpenBriefing,
  onAddKey,
}: {
  libraryCount: number;
  hasKey: boolean;
  status: AskStatus;
  question: string;
  onQuestionChange: (next: string) => void;
  onAsk: () => void;
  answer: string | null;
  /** The saved briefings the answer cited, resolved for linking. */
  citations: LibraryEntry[];
  /** The client-side shortlist actually sent as context. */
  retrieved: Scored<LibraryEntry>[];
  error: string | null;
  onOpenBriefing: (entry: LibraryEntry) => void;
  onAddKey: () => void;
}) {
  const inputId = useId();
  const hintId = useId();
  const [touched, setTouched] = useState(false);

  const busy = status === "embedding" || status === "retrieving" || status === "answering";
  const empty = libraryCount === 0;
  const tooShort = question.trim().length < MIN_QUESTION_CHARS;
  // Only the two things that make asking *impossible* disable the control. A
  // missing key does not: that button explains itself instead of going dead.
  const disabled = busy || empty || (touched && tooShort);

  return (
    <section
      aria-labelledby="ask-heading"
      className="rounded-lg border border-console-border bg-console-surface p-4 sm:p-5"
    >
      <div className="mb-1 flex items-center gap-2">
        <h2 id="ask-heading" className="font-mono text-kicker uppercase text-console-ink">
          Ask the archive
        </h2>
        <span className="rounded-sm border border-console-border px-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-console-faint">
          RAG
        </span>
      </div>

      <p id={hintId} className="mb-3 text-[11px] leading-relaxed text-console-dim">
        Retrieval runs in this browser: your question is embedded, cosine-ranked
        against{" "}
        <span className="font-mono tabular-nums text-console-ink">{libraryCount}</span>{" "}
        saved{" "}
        {libraryCount === 1 ? "briefing" : "briefings"}, and only the top 3 are sent to the
        model — which is told to answer from those alone.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (!busy && !empty && !tooShort) onAsk();
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Ask a question about your saved briefings
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id={inputId}
            type="text"
            value={question}
            onChange={(e) => onQuestionChange(e.target.value)}
            maxLength={MAX_QUESTION_CHARS}
            placeholder={
              empty ? "Save a briefing first…" : "Which briefings mention revenue growth?"
            }
            disabled={empty}
            aria-describedby={hintId}
            className="min-w-0 flex-1 rounded border border-console-border bg-console-well px-3 py-2 text-sm text-console-ink placeholder:text-console-faint focus:border-console-accent/50 disabled:cursor-not-allowed disabled:text-console-faint"
          />
          <button
            type="submit"
            disabled={disabled}
            className="shrink-0 rounded border border-console-accent/40 bg-console-accent/10 px-4 py-2 font-mono text-xs text-console-accent transition-colors duration-200 hover:bg-console-accent/20 disabled:cursor-not-allowed disabled:border-console-border disabled:bg-transparent disabled:text-console-faint"
          >
            {busy ? "Working…" : "Ask"}
          </button>
        </div>
      </form>

      {/* Keyless: explain, never a dead button with no reason. */}
      {!hasKey && !empty && (
        <p className="mt-3 rounded border border-console-border bg-console-well px-3 py-2 text-[11px] leading-relaxed text-console-dim">
          Asking calls Gemini twice — once to embed your question, once to answer
          from the retrieved briefings — so it needs a key.{" "}
          <button
            type="button"
            onClick={onAddKey}
            className="font-mono text-console-accent underline decoration-console-accent/30 underline-offset-2 transition-colors duration-200 hover:decoration-console-accent"
          >
            Add a key
          </button>{" "}
          to switch it on. Your saved briefings stay readable without one.
        </p>
      )}

      {/* One live region for the whole exchange: the status while it works, the
          answer when it lands. Screen-reader users hear the outcome without
          hunting for it. */}
      <div aria-live="polite" aria-atomic="false" className="mt-4">
        {busy && (
          <p className="font-mono text-[11px] text-console-dim">
            <span aria-hidden="true" className="mr-1.5 text-console-accent">
              ▮
            </span>
            {BUSY_COPY[status]}
          </p>
        )}

        {status === "error" && error && (
          <p className="rounded border border-sentiment-negative/40 bg-sentiment-negative/[0.07] px-3 py-2 text-xs leading-relaxed text-sentiment-negative">
            {error}
          </p>
        )}

        {status === "done" && answer && (
          <div className="animate-fade-up space-y-3">
            {/* The retrieval trace: the whole point, so it is shown, not implied. */}
            {retrieved.length > 0 && (
              <div className="rounded border border-console-border bg-console-well px-3 py-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-console-faint">
                  Retrieved in-browser · top {retrieved.length} of {libraryCount}
                </p>
                <ul className="mt-1.5 space-y-1">
                  {retrieved.map(({ item, score }) => (
                    <li key={item.id} className="flex items-baseline gap-2">
                      <span className="font-mono text-[10px] tabular-nums text-console-accent">
                        {score.toFixed(3)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenBriefing(item)}
                        className="min-w-0 flex-1 truncate text-left text-[11px] text-console-dim transition-colors duration-200 hover:text-console-ink"
                      >
                        {item.preview || item.result.summary}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded border border-console-accent/25 bg-console-accent/[0.05] px-3 py-3">
              <p className="text-sm leading-relaxed text-console-ink">{answer}</p>

              {citations.length > 0 ? (
                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-console-border pt-2.5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-console-faint">
                    Sources
                  </span>
                  {citations.map((entry, i) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => onOpenBriefing(entry)}
                      className="rounded border border-console-accent/30 bg-console-accent/10 px-2 py-0.5 font-mono text-[10px] text-console-accent transition-colors duration-200 hover:bg-console-accent/20"
                    >
                      [{i + 1}]{" "}
                      <span className="font-sans">
                        {truncate(entry.preview || entry.result.summary, 40)}
                      </span>
                      <span className="sr-only"> — open this saved briefing</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-3 border-t border-console-border pt-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-console-faint">
                  No sources cited — the answer above is the model saying so.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max).trimEnd()}…`;
}
