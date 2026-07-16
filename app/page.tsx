import { Workbench } from "@/components/Workbench";
import { GEMINI_MODEL } from "@/lib/config";

/**
 * Server shell. Everything here renders on the server — `Workbench` is the only
 * client island on the page.
 */
export default function Home() {
  return (
    // pb-20 clears the fixed StatusLine strip at the bottom of the viewport.
    <div className="relative mx-auto flex min-h-screen max-w-[1240px] flex-col px-4 pb-20 pt-8 sm:px-6 lg:px-8">
      <header className="hero-glow relative mb-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            {/* The wordmark: mono, because the product's whole thesis is that
                prose becomes data. The bracket is the parse. */}
            <h1 className="flex items-baseline font-mono text-4xl font-bold tracking-tight text-console-ink sm:text-5xl">
              <span aria-hidden="true" className="text-console-accent/40">
                [
              </span>
              <span className="px-0.5">Signal</span>
              <span aria-hidden="true" className="text-console-accent/40">
                ]
              </span>
            </h1>
            <p className="mt-3 text-base text-console-dim sm:text-lg">
              Paste the noise.{" "}
              <span className="text-console-ink">Read the signal.</span>
            </p>
          </div>

          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-console-dim">
            <span className="rounded border border-console-border px-2 py-1">
              {GEMINI_MODEL}
            </span>
            <span className="rounded border border-console-border px-2 py-1">
              Bring your own key
            </span>
          </div>
        </div>

        <p className="mt-5 max-w-xl text-sm leading-relaxed text-console-dim">
          Unstructured market text in — a structured briefing out: summary,
          entities, KPIs, sentiment and topics. Your key never leaves your tab.
        </p>
      </header>

      <main className="flex-1">
        <Workbench />
      </main>
    </div>
  );
}
