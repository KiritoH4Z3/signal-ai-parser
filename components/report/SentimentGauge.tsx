"use client";

import { useEffect, useRef, useState } from "react";
import type { Sentiment } from "@/lib/types";
import type { SentimentLabel } from "@/lib/config";

/**
 * Hand-built SVG confidence gauge — no chart library (docs/PLAN.md pins this as
 * a deliberate craft piece, and it is the one signature element of the page).
 *
 * Geometry: a 240° sweep with the gap at the bottom. In SVG screen coords (y
 * grows downward) the bottom of the circle is at 90°, so a 120° gap centred
 * there runs 30°→150°; the arc is therefore drawn from 150° clockwise to 30°.
 */
const CX = 100;
const CY = 100;
const R = 76;
const SWEEP_DEG = 240;
const START_DEG = 150;
/** Length of the visible arc: (240/360) × 2πr. */
const ARC_LENGTH = (SWEEP_DEG / 360) * 2 * Math.PI * R;

function polar(angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) };
}

function arcPath(): string {
  const start = polar(START_DEG);
  const end = polar(START_DEG + SWEEP_DEG);
  // largeArcFlag=1 (240° > 180°), sweepFlag=1 (clockwise / increasing angle).
  return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${R} ${R} 0 1 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
}

const PATH = arcPath();

const STROKE: Record<SentimentLabel, string> = {
  Positive: "#34D399",
  Neutral: "#FBBF24",
  Negative: "#F87171",
};

const LABEL_CLASS: Record<SentimentLabel, string> = {
  Positive: "text-sentiment-positive",
  Neutral: "text-sentiment-neutral",
  Negative: "text-sentiment-negative",
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Counts 0→target over `duration`, or lands immediately if motion is reduced. */
function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  const frame = useRef<number>();

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      // easeOutCubic — fast start, settled landing.
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    };
  }, [target, duration]);

  return value;
}

export function SentimentGauge({ sentiment }: { sentiment: Sentiment }) {
  const score = Math.max(0, Math.min(100, Math.round(sentiment.confidence_score)));
  const color = STROKE[sentiment.label];
  const displayed = useCountUp(score);

  // Mount-time sweep: the dash offset starts fully hidden and transitions to the
  // score fraction on the first paint after mount.
  const [swept, setSwept] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setSwept(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const filled = swept ? ARC_LENGTH * (1 - score / 100) : ARC_LENGTH;
  const gaugeId = `gauge-grad-${sentiment.label}`;

  // role="img" belongs on the svg, not the figure — ARIA disallows it there.
  // The svg carries the score (its readout is drawn, not text); the figcaption
  // below already speaks the label and confidence band, so the two together
  // announce without repeating each other.
  return (
    <figure className="flex flex-col items-center gap-1">
      <div className="relative">
        <svg
          viewBox="0 0 200 152"
          className="w-[200px] max-w-full"
          role="img"
          aria-label={`Confidence score ${score} out of 100`}
          focusable="false"
        >
          <defs>
            <linearGradient id={gaugeId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.55" />
              <stop offset="100%" stopColor={color} stopOpacity="1" />
            </linearGradient>
          </defs>

          {/* Track */}
          <path
            d={PATH}
            fill="none"
            stroke="#1E2B29"
            strokeWidth={12}
            strokeLinecap="round"
          />

          {/* Tick marks at 0 / 25 / 50 / 75 / 100 — the console's measured feel. */}
          {[0, 25, 50, 75, 100].map((pct) => {
            const angle = START_DEG + (SWEEP_DEG * pct) / 100;
            const rad = (angle * Math.PI) / 180;
            const inner = R - 12;
            const outer = R - 19;
            return (
              <line
                key={pct}
                x1={CX + inner * Math.cos(rad)}
                y1={CY + inner * Math.sin(rad)}
                x2={CX + outer * Math.cos(rad)}
                y2={CY + outer * Math.sin(rad)}
                stroke="#1E2B29"
                strokeWidth={2}
                strokeLinecap="round"
              />
            );
          })}

          {/* Value arc */}
          <path
            d={PATH}
            fill="none"
            stroke={`url(#${gaugeId})`}
            strokeWidth={12}
            strokeLinecap="round"
            strokeDasharray={ARC_LENGTH}
            strokeDashoffset={filled}
            style={{
              transition: "stroke-dashoffset 1s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          />

          {/* Readout. Mono, because it is data. */}
          <text
            x={CX}
            y={CY + 4}
            textAnchor="middle"
            className="fill-console-ink font-mono"
            style={{ fontSize: "38px", fontWeight: 700, letterSpacing: "-0.02em" }}
          >
            {displayed}
          </text>
          <text
            x={CX}
            y={CY + 26}
            textAnchor="middle"
            className="fill-console-dim font-mono"
            style={{ fontSize: "10px", letterSpacing: "0.14em" }}
          >
            / 100
          </text>
        </svg>
      </div>

      <figcaption className="flex flex-col items-center gap-1 text-center">
        <span
          className={`font-mono text-sm font-bold uppercase tracking-[0.16em] ${LABEL_CLASS[sentiment.label]}`}
        >
          {sentiment.label}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-console-dim">
          {sentiment.confidence} confidence
        </span>
      </figcaption>
    </figure>
  );
}
