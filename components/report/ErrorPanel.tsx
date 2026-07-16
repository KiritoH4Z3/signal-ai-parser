import { FRIENDLY_MESSAGES, type SignalErrorCode } from "@/lib/errors";

/**
 * The only failure surface. It renders `FRIENDLY_MESSAGES` keyed by code — a
 * stack trace or raw upstream detail must never reach this component (the route
 * layer already strips them; this is the second wall).
 */

/** Short, non-apologetic headline per code. The message says how to fix it. */
const TITLES: Record<SignalErrorCode, string> = {
  missing_key: "No API key",
  invalid_key: "Key rejected",
  rate_limited: "Rate limited",
  input_too_short: "Not enough text",
  input_too_long: "Text too long",
  empty_response: "No analysis returned",
  malformed_json: "Unreadable model output",
  api_error: "Request failed",
};

/** Codes the user can act on right here. */
const RETRYABLE: SignalErrorCode[] = [
  "rate_limited",
  "empty_response",
  "malformed_json",
  "api_error",
];

export function ErrorPanel({
  code,
  message,
  onRetry,
  onAddKey,
}: {
  code: SignalErrorCode;
  /** Server-supplied friendly text; falls back to the local map. */
  message?: string;
  onRetry?: () => void;
  onAddKey?: () => void;
}) {
  const needsKey = code === "missing_key" || code === "invalid_key";
  const canRetry = RETRYABLE.includes(code) && onRetry;

  return (
    <div
      className="animate-fade-up rounded-lg border border-sentiment-negative/30 bg-sentiment-negative/[0.06] p-5"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <svg
          viewBox="0 0 20 20"
          className="mt-0.5 h-5 w-5 shrink-0 text-sentiment-negative"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <circle cx="10" cy="10" r="8" />
          <path d="M10 6v5" strokeLinecap="round" />
          <circle cx="10" cy="14" r="0.9" fill="currentColor" stroke="none" />
        </svg>

        <div className="min-w-0 flex-1">
          <h3 className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-sentiment-negative">
            {TITLES[code]}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-console-ink">
            {message || FRIENDLY_MESSAGES[code]}
          </p>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-console-dim">
            code {code}
          </p>

          {(canRetry || (needsKey && onAddKey)) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {canRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="rounded border border-console-border bg-console-well px-3 py-1.5 font-mono text-xs text-console-ink transition-colors duration-200 hover:border-console-accent/50 hover:text-console-accent"
                >
                  Try again
                </button>
              )}
              {needsKey && onAddKey && (
                <button
                  type="button"
                  onClick={onAddKey}
                  className="rounded border border-console-accent/40 bg-console-accent/10 px-3 py-1.5 font-mono text-xs text-console-accent transition-colors duration-200 hover:bg-console-accent/20"
                >
                  Add a key
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
