"use client";

import { useId, useState } from "react";
import { looksLikeGeminiKey } from "@/lib/key-store";

/**
 * The BYOK panel — a headline feature, not a settings afterthought (docs/PLAN.md
 * § "ApiKeyPanel"). The key lives in sessionStorage via the parent and travels
 * only in the `X-Gemini-Key` header of a same-origin request.
 */

export type KeyState = "none" | "untested" | "valid" | "invalid";

const LED: Record<KeyState, { dot: string; text: string; label: string }> = {
  none: { dot: "bg-console-dim/40", text: "text-console-dim", label: "no key" },
  untested: {
    dot: "bg-sentiment-neutral",
    text: "text-sentiment-neutral",
    label: "untested",
  },
  valid: {
    dot: "bg-sentiment-positive shadow-[0_0_8px_rgba(52,211,153,0.9)]",
    text: "text-sentiment-positive",
    label: "valid",
  },
  invalid: {
    dot: "bg-sentiment-negative shadow-[0_0_8px_rgba(248,113,113,0.9)]",
    text: "text-sentiment-negative",
    label: "invalid",
  },
};

export function ApiKeyPanel({
  value,
  onChange,
  keyState,
  onTest,
  onClear,
  testing,
  testReason,
  highlighted = false,
}: {
  value: string;
  onChange: (next: string) => void;
  keyState: KeyState;
  onTest: () => void;
  onClear: () => void;
  testing: boolean;
  /** Friendly reason from /api/validate-key when the key was rejected. */
  testReason: string | null;
  /** Set when the user tried to analyze without a key — draws the eye here. */
  highlighted?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const inputId = useId();
  const hintId = useId();

  const malformed = value.length > 0 && !looksLikeGeminiKey(value);
  const led = LED[keyState];

  return (
    <section
      aria-labelledby={`${inputId}-heading`}
      className={`rounded-lg border bg-console-surface p-4 transition-colors duration-500 ${
        highlighted
          ? "border-console-accent shadow-[0_0_0_3px_rgba(94,234,212,0.14)]"
          : "border-console-border"
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2
          id={`${inputId}-heading`}
          className="font-mono text-kicker uppercase text-console-ink"
        >
          API key
        </h2>
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em]">
          <span
            aria-hidden="true"
            className={`inline-block h-2 w-2 rounded-full ${led.dot} ${
              testing ? "animate-led-pulse" : ""
            }`}
          />
          <span className={led.text}>{testing ? "testing" : led.label}</span>
        </span>
      </div>

      {highlighted && (
        <p className="mb-3 rounded border border-console-accent/30 bg-console-accent/[0.07] px-3 py-2 text-xs leading-relaxed text-console-ink">
          Analyzing your own text needs a Gemini key. Paste one below, or click an
          example to see a finished briefing without a key.
        </p>
      )}

      <label htmlFor={inputId} className="sr-only">
        Gemini API key
      </label>
      <div className="relative">
        <input
          id={inputId}
          type={revealed ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="AIza…"
          spellCheck={false}
          // `autocomplete="off"` + an ignore hint here failed WCAG 3.3.8
          // (Accessible Authentication): it blocks password managers, forcing
          // the visitor to transcribe a 39-character key by hand every session —
          // sessionStorage is deliberately cleared when the tab closes. Letting a
          // manager fill it is the user's own choice and does not weaken the
          // privacy claim: *we* still never store or log the key.
          autoComplete="current-password"
          autoCorrect="off"
          autoCapitalize="off"
          aria-describedby={hintId}
          aria-invalid={keyState === "invalid"}
          className="w-full rounded border border-console-border bg-console-well py-2 pl-3 pr-16 font-mono text-xs text-console-ink placeholder:text-console-faint focus:border-console-accent/50"
        />
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          aria-pressed={revealed}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-console-dim transition-colors duration-200 hover:text-console-accent"
        >
          {revealed ? "Hide" : "Show"}
        </button>
      </div>

      {/* Format hint: warn, never block. */}
      {malformed && (
        <p className="mt-2 font-mono text-[11px] leading-relaxed text-sentiment-neutral">
          Google AI Studio keys usually start with{" "}
          <span className="font-bold">AIza</span> and run 39 characters. You can
          still test this one.
        </p>
      )}

      {keyState === "invalid" && testReason && (
        <p className="mt-2 text-xs leading-relaxed text-sentiment-negative">
          {testReason}
        </p>
      )}
      {keyState === "valid" && (
        <p className="mt-2 font-mono text-[11px] text-sentiment-positive">
          Key accepted by Google. Live analysis is on.
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onTest}
          disabled={!value.trim() || testing}
          className="flex-1 rounded border border-console-accent/40 bg-console-accent/10 px-3 py-1.5 font-mono text-xs text-console-accent transition-colors duration-200 hover:bg-console-accent/20 disabled:cursor-not-allowed disabled:border-console-border disabled:bg-transparent disabled:text-console-faint"
        >
          {testing ? "Testing…" : "Test key"}
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={!value}
          className="rounded border border-console-border px-3 py-1.5 font-mono text-xs text-console-dim transition-colors duration-200 hover:border-sentiment-negative/40 hover:text-sentiment-negative disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-console-border disabled:hover:text-console-dim"
        >
          Clear
        </button>
      </div>

      <p id={hintId} className="mt-3 text-[11px] leading-relaxed text-console-dim">
        Your key stays in this browser tab. It&rsquo;s sent per-request to this
        app&rsquo;s proxy and forwarded to Google — never stored, never logged.
      </p>

      <a
        href="https://aistudio.google.com"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] text-console-accent underline decoration-console-accent/30 underline-offset-2 transition-colors duration-200 hover:decoration-console-accent"
      >
        Get a free key at aistudio.google.com
        <svg
          viewBox="0 0 12 12"
          className="h-2.5 w-2.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M4 2h6v6M10 2 3 9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </section>
  );
}
