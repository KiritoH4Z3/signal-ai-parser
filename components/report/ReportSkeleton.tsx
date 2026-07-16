/**
 * Loading state. The block rhythm deliberately mirrors `ReportView` — brief,
 * then gauge beside metrics, then chips — so the report settles into the
 * skeleton's shape instead of replacing it. The shimmer is a decorative overlay
 * and collapses under `prefers-reduced-motion` (globals.css).
 */

function Shimmer({ className = "" }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded bg-console-border/60 ${className}`}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-console-dim/10 to-transparent" />
    </div>
  );
}

export function ReportSkeleton() {
  return (
    <div className="space-y-8" aria-hidden="true">
      {/* Brief */}
      <div className="border-l-2 border-console-border pl-5">
        <Shimmer className="mb-3 h-2.5 w-16" />
        <div className="space-y-2">
          <Shimmer className="h-3.5 w-full" />
          <Shimmer className="h-3.5 w-[94%]" />
          <Shimmer className="h-3.5 w-[72%]" />
        </div>
      </div>

      {/* Gauge + metrics */}
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <div className="flex flex-col items-center gap-3">
          <Shimmer className="h-[132px] w-[200px] rounded-t-full" />
          <Shimmer className="h-3 w-24" />
        </div>
        <div>
          <Shimmer className="mb-3 h-2.5 w-20" />
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-console-border bg-console-border sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-console-surface p-4">
                <Shimmer className="mb-3 h-2.5 w-2/3" />
                <Shimmer className="h-6 w-1/2" />
                <Shimmer className="mt-2 h-2.5 w-12" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Entities + topics */}
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <Shimmer className="mb-3 h-2.5 w-20" />
          <div className="flex flex-wrap gap-2">
            {["w-[72px]", "w-[96px]", "w-[60px]", "w-[110px]", "w-[84px]"].map((w) => (
              <Shimmer key={w} className={`h-7 rounded-full ${w}`} />
            ))}
          </div>
        </div>
        <div>
          <Shimmer className="mb-3 h-2.5 w-16" />
          <div className="flex flex-wrap gap-2">
            {["w-[64px]", "w-[88px]", "w-[56px]", "w-[92px]"].map((w) => (
              <Shimmer key={w} className={`h-6 ${w}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
