import type { AnalysisResult } from "@/lib/types";
import { SummaryCard } from "@/components/report/SummaryCard";
import { SentimentGauge } from "@/components/report/SentimentGauge";
import { MetricCards } from "@/components/report/MetricCards";
import { EntityChips } from "@/components/report/EntityChips";
import { TopicTags } from "@/components/report/TopicTags";

/**
 * Composes the briefing. Reading order is the analyst's order: what happened
 * (brief) → how sure and how big (gauge + metrics) → who and what (entities,
 * topics).
 *
 * `exportSlot` is a Phase 3 seam — ExportBar drops in without touching this
 * component's internals.
 */
export function ReportView({
  result,
  preview = false,
  exportSlot,
}: {
  result: AnalysisResult;
  /** True when the report came from canned demo data rather than a live call. */
  preview?: boolean;
  exportSlot?: React.ReactNode;
}) {
  return (
    <article className="animate-fade-up space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-mono text-sm font-bold uppercase tracking-[0.16em] text-console-ink">
            Briefing
          </h2>
          {preview && (
            <span className="rounded border border-sentiment-neutral/40 bg-sentiment-neutral/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-sentiment-neutral">
              Preview mode
            </span>
          )}
        </div>
        {exportSlot}
      </header>

      <SummaryCard summary={result.summary} />

      <div className="grid gap-8 lg:grid-cols-[220px_1fr] lg:gap-6">
        <div className="flex flex-col items-center justify-start">
          <SentimentGauge sentiment={result.sentiment} />
          {result.sentiment.reasoning && (
            <p className="mt-4 max-w-[220px] text-center text-xs leading-relaxed text-console-dim">
              {result.sentiment.reasoning}
            </p>
          )}
        </div>
        <MetricCards metrics={result.metrics} />
      </div>

      <div className="grid gap-8 border-t border-console-border pt-8 lg:grid-cols-2">
        <EntityChips entities={result.entities} />
        <TopicTags topics={result.topics} />
      </div>
    </article>
  );
}
