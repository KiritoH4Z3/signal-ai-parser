/**
 * A transport shown as its actual sequence of hops, in mono. Used for the two
 * claims on the landing page that are only worth making if they're legible —
 * where the key goes, and what leaves the browser when you ask a question.
 *
 * An <ol> because the order is the point: these are genuinely sequences, which
 * is also why they carry arrows rather than 01/02/03 markers. The arrow says
 * "and then it goes here"; a number would only say "this is the second one".
 */

export type FlowStep = {
  /** The hop itself. Mono — it names a real mechanism, not a concept. */
  node: string;
  /** Optional qualifier under the hop. */
  note?: string;
};

export function FlowDiagram({
  steps,
  label,
}: {
  steps: FlowStep[];
  /** Names the sequence for screen readers; the arrows are decorative. */
  label: string;
}) {
  return (
    <ol
      aria-label={label}
      className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-stretch sm:gap-2"
    >
      {steps.map((step, i) => (
        <li
          key={step.node}
          className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2"
        >
          {i > 0 ? (
            // Turns down at the same breakpoint the row stacks into a column.
            <span
              aria-hidden="true"
              className="font-mono text-xs leading-none text-console-accent"
            >
              <span className="sm:hidden">↓</span>
              <span className="hidden sm:inline">→</span>
            </span>
          ) : null}
          <div className="rounded border border-console-border bg-console-well px-3 py-2">
            <p className="break-words font-mono text-xs text-console-ink">
              {step.node}
            </p>
            {step.note ? (
              <p className="mt-1 break-words font-mono text-[10px] text-console-faint">
                {step.note}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
