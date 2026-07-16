/**
 * The editorial brief: an accent-left-border pull quote. This is the one place
 * on the page set in prose rather than mono — it is the model's writing, not
 * data, and the type change says so.
 */
export function SummaryCard({ summary }: { summary: string }) {
  return (
    <section
      aria-labelledby="summary-heading"
      className="border-l-2 border-console-accent bg-console-surface/60 py-1 pl-5 pr-4"
    >
      <h3 id="summary-heading" className="kicker mb-2">
        Brief
      </h3>
      <p className="text-[15px] leading-relaxed text-console-ink sm:text-base">
        {summary}
      </p>
    </section>
  );
}
