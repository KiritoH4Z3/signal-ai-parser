import { EXAMPLES, EXAMPLE_RESULTS } from "@/lib/examples";
import {
  direction,
  GLYPH,
  SPOKEN,
  TONE,
} from "@/components/report/MetricCards";
import {
  ProvenanceLines,
  type ProvenancePair,
} from "@/components/landing/ProvenanceLines";

/**
 * The signature element: the real "Earnings note" example, shown as prose on
 * the left and as the metrics it produced on the right, with a hairline wiring
 * each claim back to the sentence that made it.
 *
 * Everything here is real. The paragraph is `EXAMPLES` verbatim and the cards
 * are `EXAMPLE_RESULTS` verbatim — the same two constants the console itself
 * runs on. Nothing is retyped: the marked phrases are located *inside* the
 * source string by index, so a mark that no longer matches the example text
 * silently stops being a mark rather than quietly becoming a lie.
 */

const LABEL = "📊 Earnings note";
const SOURCE = EXAMPLES[LABEL];
const RESULT = EXAMPLE_RESULTS[LABEL];

/**
 * Which phrases produced which metric. `phrase` must appear in SOURCE verbatim;
 * `metricLabel` must match a label in RESULT.metrics.
 */
const MARKS = [
  {
    id: "revenue",
    phrase: "Revenue rose 27% year over year to $4.2 billion",
    metricLabel: "Revenue",
  },
  {
    id: "margin",
    phrase: "Operating margin expanded to 31%",
    metricLabel: "Operating margin",
  },
] as const;

/** The load sequence, staggered to ~1.5s total. Runs once; it is not a loop. */
const TIMING = {
  mark: [150, 400],
  line: [550, 800],
  card: [950, 1150],
} as const;

const CONTAINER_ID = "hero-diagram";
const COLUMN_ID = "hero-source";
const markId = (id: string) => `hero-mark-${id}`;
const cardId = (id: string) => `hero-card-${id}`;

type Segment = { text: string; markId?: string };

/**
 * Cut the source paragraph into marked and unmarked runs. Scans forward only,
 * so marks must be listed in the order they appear; an unfindable phrase is
 * skipped and its text simply stays unmarked.
 */
function segment(
  source: string,
  marks: readonly { id: string; phrase: string }[],
): Segment[] {
  const out: Segment[] = [];
  let cursor = 0;

  for (const mark of marks) {
    const at = source.indexOf(mark.phrase, cursor);
    if (at === -1) continue;
    if (at > cursor) out.push({ text: source.slice(cursor, at) });
    out.push({ text: mark.phrase, markId: mark.id });
    cursor = at + mark.phrase.length;
  }
  if (cursor < source.length) out.push({ text: source.slice(cursor) });

  return out;
}

const SEGMENTS = segment(SOURCE, MARKS);

const PAIRS: ProvenancePair[] = MARKS.map((mark, i) => ({
  fromId: markId(mark.id),
  toId: cardId(mark.id),
  delayMs: TIMING.line[i] ?? 0,
}));

function HeroCard({
  id,
  phrase,
  metricLabel,
  delayMs,
}: {
  id: string;
  phrase: string;
  metricLabel: string;
  delayMs: number;
}) {
  const metric = RESULT.metrics.find((m) => m.label === metricLabel);
  if (!metric) return null;

  const dir = direction(metric.change);

  return (
    <div
      id={cardId(id)}
      className="animate-fade-up rounded-md border border-console-border bg-console-surface p-4"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <p className="mb-2 text-xs leading-snug text-console-dim">{metric.label}</p>
      <p className="font-mono text-2xl font-bold tracking-tight text-console-ink">
        {metric.value}
      </p>
      {metric.change ? (
        <p className={`mt-1 font-mono text-xs font-medium ${TONE[dir]}`}>
          <span aria-hidden="true">{GLYPH[dir]}</span>
          <span className={GLYPH[dir] ? "ml-1" : ""}>{metric.change}</span>
          {SPOKEN[dir] ? <span className="sr-only"> {SPOKEN[dir]}</span> : null}
        </p>
      ) : null}

      {/*
        The provenance, carried by the card itself. Below lg this is the visible
        fallback for the hairlines — source above, cards below, each card
        echoing the phrase it came from. At lg the drawn line takes over the job
        visually, but the echo stays in the accessibility tree: the SVG is
        decorative, so this is the only thing telling a screen reader where the
        number came from.
      */}
      <p className="mt-3 border-t border-console-border pt-3 font-serif text-xs italic leading-relaxed text-console-faint lg:sr-only">
        <span className="not-italic">From: </span>
        {phrase}
      </p>
    </div>
  );
}

export function HeroDiagram() {
  return (
    <div
      id={CONTAINER_ID}
      className="relative mt-12 grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-24"
    >
      <div id={COLUMN_ID}>
        <p className="mb-3 font-serif text-sm italic text-console-faint">
          What you paste
        </p>
        {/* Serif, dim: this is the raw material, not the product. */}
        <p className="font-serif text-[15px] leading-[1.8] text-console-dim sm:text-base">
          {SEGMENTS.map((seg, i) =>
            seg.markId ? (
              <span
                key={i}
                id={markId(seg.markId)}
                className="animate-mark-in rounded-[2px] px-0.5"
                style={{
                  animationDelay: `${TIMING.mark[MARKS.findIndex((m) => m.id === seg.markId)] ?? 0}ms`,
                }}
              >
                {seg.text}
              </span>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <p className="kicker">What you read</p>
        {MARKS.map((mark, i) => (
          <HeroCard
            key={mark.id}
            id={mark.id}
            phrase={mark.phrase}
            metricLabel={mark.metricLabel}
            delayMs={TIMING.card[i] ?? 0}
          />
        ))}
      </div>

      <ProvenanceLines
        containerId={CONTAINER_ID}
        columnId={COLUMN_ID}
        pairs={PAIRS}
      />
    </div>
  );
}
