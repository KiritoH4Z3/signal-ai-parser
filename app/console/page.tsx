import type { Metadata } from "next";
import Link from "next/link";
import { Workbench } from "@/components/Workbench";
import { GEMINI_MODEL } from "@/lib/config";

const title = "Console — Signal";
const description =
  "Paste any block of market text and get a structured briefing back: summary, entities, KPIs, sentiment and topics. Bring your own Gemini key — it never leaves your tab.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, siteName: "Signal", type: "website" },
  twitter: { card: "summary_large_image", title, description },
};

/**
 * Server shell. Everything here renders on the server — `Workbench` is the only
 * client island on the page.
 */
export default function ConsolePage() {
  return (
    // pb-20 clears the fixed StatusLine strip at the bottom of the viewport.
    <div className="relative mx-auto flex min-h-screen max-w-[1240px] flex-col px-4 pb-20 pt-8 sm:px-6 lg:px-8">
      <header className="hero-glow relative mb-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            {/* The wordmark: mono, because the product's whole thesis is that
                prose becomes data. The bracket is the parse. */}
            <h1 className="font-mono text-4xl font-bold tracking-tight text-console-ink sm:text-5xl">
              <Link
                href="/"
                aria-label="Signal — back to the home page"
                className="inline-flex items-baseline rounded-sm transition-opacity duration-200 hover:opacity-80"
              >
                <span aria-hidden="true" className="text-console-accent/70">
                  [
                </span>
                <span className="px-0.5">Signal</span>
                <span aria-hidden="true" className="text-console-accent/70">
                  ]
                </span>
              </Link>
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
