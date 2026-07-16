"use client";

import { MAX_LIBRARY } from "@/lib/config";
import { formatRelative } from "@/lib/history";
import type { SentimentLabel } from "@/lib/config";
import type { LibraryEntry } from "@/lib/types";

/**
 * The shelf: briefings the visitor chose to keep, each carrying the embedding
 * that makes it searchable (docs/PLAN.md § Phase 4).
 *
 * Presentational. The store is `lib/library.ts`; the network and the key stay in
 * `Workbench`, which is the only place in the app allowed to touch either.
 *
 * Rows are real <button>s with a sibling (never nested) delete, matching
 * HistoryRail — keyboard and screen-reader users get Enter, Space and a proper
 * role for free.
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
 * The Save control. Lives here rather than in `report/` because it belongs to
 * the Library's story, not the briefing's — and because the copy explaining
 * *why* saving needs a key has to sit next to the button that needs it.
 */
export function SaveToLibraryButton({
  onSave,
  saving,
  saved,
  hasKey,
  full,
}: {
  onSave: () => void;
  saving: boolean;
  /** This exact briefing is already on the shelf. */
  saved: boolean;
  hasKey: boolean;
  /** The Library is at MAX_LIBRARY — saving would push the oldest off. */
  full: boolean;
}) {
  const label = saving ? "Saving…" : saved ? "Saved" : "Save to Library";

  return (
    <button
      type="button"
      onClick={onSave}
      disabled={saving || saved}
      // A disabled button with no explanation is a dead end; keyless is a
      // *reason*, not a disabled state, so the button stays live and explains
      // itself when pressed.
      title={
        hasKey
          ? full
            ? `The Library is full (${MAX_LIBRARY}). Saving drops the oldest briefing.`
            : "Embed this briefing and keep it for semantic search"
          : "Needs a Gemini API key — saving embeds the briefing so you can search it"
      }
      className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-[11px] transition-colors duration-200 disabled:cursor-default ${
        saved
          ? "border-sentiment-positive/50 bg-sentiment-positive/10 text-sentiment-positive"
          : "border-console-accent/40 bg-console-accent/10 text-console-accent hover:bg-console-accent/20"
      }`}
    >
      {saved ? (
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
          <path d="M3 1.5h6v9L6 8.5l-3 2z" strokeLinejoin="round" />
        </svg>
      )}
      {label}
      {!hasKey && <span className="sr-only"> (requires a Gemini API key)</span>}
    </button>
  );
}

export function BriefingLibrary({
  entries,
  activeId,
  onRestore,
  onRemove,
  onClear,
  /** Ids the last answer cited — highlighted so a citation link lands visibly. */
  citedIds = [],
}: {
  entries: LibraryEntry[];
  activeId: string | null;
  onRestore: (entry: LibraryEntry) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  citedIds?: string[];
}) {
  const cited = new Set(citedIds);

  return (
    <section
      aria-labelledby="library-heading"
      className="rounded-lg border border-console-border bg-console-surface p-4 sm:p-5"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2
            id="library-heading"
            className="font-mono text-kicker uppercase text-console-ink"
          >
            Briefing Library
          </h2>
          <p className="mt-1 text-[11px] leading-relaxed text-console-dim">
            Saved briefings, each stored with its embedding — on this device, in this
            browser.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] tabular-nums text-console-faint">
            {entries.length}/{MAX_LIBRARY}
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
          Library is empty. Save a briefing to embed it — then ask questions across
          everything on the shelf.
        </p>
      ) : (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {entries.map((entry) => {
            const active = entry.id === activeId;
            const isCited = cited.has(entry.id);
            return (
              <li key={entry.id} id={`library-${entry.id}`} className="group relative">
                <button
                  type="button"
                  onClick={() => onRestore(entry)}
                  aria-current={active ? "true" : undefined}
                  className={`h-full w-full rounded-md border py-2 pl-2.5 pr-8 text-left transition-colors duration-200 ${
                    active
                      ? "border-console-accent/60 bg-console-accent/[0.07]"
                      : isCited
                        ? "border-console-accent/30 bg-console-well"
                        : "border-transparent bg-console-well hover:border-console-border"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[entry.sentiment]}`}
                    />
                    {/* Spelled out — sentiment never rides on the dot's colour alone. */}
                    <span
                      className={`font-mono text-[10px] uppercase tracking-[0.1em] ${
                        TEXT[entry.sentiment]
                      }`}
                    >
                      {entry.sentiment}
                    </span>
                    {isCited && (
                      <span className="rounded-sm bg-console-accent/15 px-1 font-mono text-[9px] uppercase tracking-[0.1em] text-console-accent">
                        cited
                      </span>
                    )}
                    <time
                      dateTime={new Date(entry.savedAt).toISOString()}
                      className="ml-auto font-mono text-[10px] tabular-nums text-console-faint"
                    >
                      {formatRelative(entry.savedAt)}
                    </time>
                  </span>
                  <span className="mt-1 line-clamp-2 block text-[11px] leading-snug text-console-dim">
                    {entry.preview || entry.result.summary}
                  </span>
                </button>

                {/* Always in the DOM and focusable — a hover-only control is
                    invisible to keyboard and touch. */}
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
                    Remove saved briefing from {formatRelative(entry.savedAt)}
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
