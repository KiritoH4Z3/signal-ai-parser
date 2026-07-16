"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The provenance hairlines: each marked phrase in the source paragraph is wired
 * to the metric card it produced. A claim is never shown without its source.
 *
 * This is the landing page's only client island, and it exists for exactly one
 * reason: the start of each line is the *end of a phrase inside flowing text*,
 * which no amount of static CSS can locate. Everything else on the page — the
 * prose, the marks, the cards, the whole reveal sequence — is server-rendered
 * and animated with `both`-filled CSS keyframes.
 *
 * Hand-built SVG, no chart or animation library (the same rule the sentiment
 * gauge is built under).
 */

export type ProvenancePair = {
  /** id of the marked <span> inside the source prose. */
  fromId: string;
  /** id of the metric card the phrase produced. */
  toId: string;
  /** Stagger, in ms, within the hero's ~1.5s load sequence. */
  delayMs: number;
};

type Line = {
  key: string;
  d: string;
  dotX: number;
  dotY: number;
  delayMs: number;
};

/** Below this the columns stack, the gutter disappears, and lines can't work. */
const WIDE = "(min-width: 1024px)";

export function ProvenanceLines({
  containerId,
  columnId,
  pairs,
}: {
  /** The positioned ancestor the SVG overlays; all coords are relative to it. */
  containerId: string;
  /** The prose column — its right edge is where the routing lane starts. */
  columnId: string;
  pairs: ProvenancePair[];
}) {
  const [lines, setLines] = useState<Line[]>([]);

  const measure = useCallback(() => {
    const container = document.getElementById(containerId);
    const column = document.getElementById(columnId);
    if (!container || !column) return;

    // Narrow viewport: the source stacks above the cards and each card echoes
    // its own phrase instead. Drop the lines rather than draw a tangle.
    if (!window.matchMedia(WIDE).matches) {
      setLines((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    const box = container.getBoundingClientRect();
    const laneStart = column.getBoundingClientRect().right - box.left + 14;
    const next: Line[] = [];

    pairs.forEach((pair, i) => {
      const from = document.getElementById(pair.fromId);
      const to = document.getElementById(pair.toId);
      if (!from || !to) return;

      // A marked phrase usually wraps, so its bounding box is the union of its
      // line fragments and its right edge is meaningless. The *last* client
      // rect is the real end of the phrase.
      const rects = from.getClientRects();
      const last = rects[rects.length - 1];
      if (!last) return;

      const card = to.getBoundingClientRect();

      // y sits just under the phrase's font box, i.e. in the leading below that
      // line. The horizontal run therefore crosses the gap beneath the words
      // that follow the phrase, never the glyphs themselves.
      const x0 = last.right - box.left + 2;
      const y0 = last.bottom - box.top + 3;
      const x1 = card.left - box.left - 6;
      const y1 = card.top - box.top + card.height / 2;

      // Each hairline turns down its own lane in the gutter so two elbows never
      // sit on top of each other. Clamped so a lane can't overshoot the card.
      const lane = Math.min(laneStart + i * 12, x1 - 10);
      if (lane <= x0) return;

      next.push({
        key: pair.fromId,
        d: `M ${x0.toFixed(1)} ${y0.toFixed(1)} H ${lane.toFixed(1)} V ${y1.toFixed(1)} H ${x1.toFixed(1)}`,
        dotX: x0,
        dotY: y0,
        delayMs: pair.delayMs,
      });
    });

    // The SVG is absolutely positioned inside the container it measures, so it
    // can't change that container's size — but a ResizeObserver still fires on
    // every reflow. Bail out when the geometry is unchanged so we never loop.
    setLines((prev) =>
      JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
    );
  }, [containerId, columnId, pairs]);

  useEffect(() => {
    measure();

    const container = document.getElementById(containerId);
    const observer = new ResizeObserver(() => measure());
    if (container) observer.observe(container);

    const media = window.matchMedia(WIDE);
    // Safari < 14 only has the deprecated addListener; both are cheap to wire.
    if (media.addEventListener) media.addEventListener("change", measure);
    else media.addListener(measure);

    // The font swap reflows the paragraph after hydration, which moves every
    // anchor. ResizeObserver catches the height change, but this is the honest
    // signal — and it's a no-op once the faces are already resolved.
    let cancelled = false;
    if (typeof document.fonts?.ready?.then === "function") {
      document.fonts.ready.then(() => {
        if (!cancelled) measure();
      });
    }

    return () => {
      cancelled = true;
      observer.disconnect();
      if (media.removeEventListener) media.removeEventListener("change", measure);
      else media.removeListener(measure);
    };
  }, [containerId, measure]);

  if (lines.length === 0) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block"
      aria-hidden="true"
      focusable="false"
    >
      {lines.map((line) => (
        <g key={line.key}>
          <circle
            cx={line.dotX}
            cy={line.dotY}
            r={2}
            className="animate-fade-in fill-console-accent"
            style={{ animationDelay: `${line.delayMs}ms` }}
          />
          <path
            d={line.d}
            fill="none"
            strokeWidth={1}
            pathLength={1}
            strokeDasharray={1}
            className="animate-draw-line stroke-console-accent/75"
            style={{ animationDelay: `${line.delayMs}ms` }}
          />
        </g>
      ))}
    </svg>
  );
}
