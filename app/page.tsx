import type { Metadata } from "next";
import Link from "next/link";
import { EXAMPLE_RESULTS } from "@/lib/examples";
import { ReportView } from "@/components/report/ReportView";
import { HeroDiagram } from "@/components/landing/HeroDiagram";
import { FlowDiagram } from "@/components/landing/FlowDiagram";
import { GEMINI_MODEL } from "@/lib/config";

const title = "Signal — Paste the noise. Read the signal.";
const description =
  "Drop in a news article, an earnings note or a long email and get a structured briefing back: summary, entities, KPIs, sentiment and topics. Bring your own Gemini key — it lives in sessionStorage and never leaves your tab.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, siteName: "Signal", type: "website" },
  twitter: { card: "summary_large_image", title, description },
};

const REPO = "https://github.com/KiritoH4Z3/signal-ai-parser";

/** The briefing anatomy section shows the whole result the hero teased. */
const BRIEFING = EXAMPLE_RESULTS["📊 Earnings note"];

/**
 * The measured numbers, presented as data. Every one is verified against
 * README's Results table and rounded exactly as it is there.
 *
 * The first-load figure is the console's, not this page's: the console is the
 * product, and it is the heavier of the two (this landing prerenders at 98 kB).
 * Both come from the same `next build` — re-measure them together or not at all.
 */
const BUILT: { value: string; label: string; note: string }[] = [
  { value: "171", label: "Tests", note: "~5s, all offline" },
  { value: "113 kB", label: "First-load JS", note: "/console, prerendered" },
  { value: "4", label: "Runtime dependencies", note: "next, react, react-dom, server-only" },
  { value: "0", label: "Accessibility violations", note: "accesslint, WCAG AA" },
  { value: "8", label: "Named error codes", note: "each with a friendly panel" },
];

/** Serif, because an eyebrow is a label on the thing, not the thing. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-serif text-sm italic text-console-faint">{children}</p>
  );
}

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="mt-2 font-mono text-xl font-bold tracking-tight text-console-ink sm:text-2xl"
    >
      {children}
    </h2>
  );
}

export default function Home() {
  return (
    <div className="relative mx-auto flex min-h-screen max-w-[1240px] flex-col px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <header>
        <nav
          aria-label="Main"
          className="flex flex-wrap items-center justify-between gap-4"
        >
          {/* Not a link — this is the page it would point at. The <h1> is the
              headline below; the wordmark is just the mark. */}
          <p className="flex items-baseline font-mono text-lg font-bold tracking-tight text-console-ink">
            <span aria-hidden="true" className="text-console-accent/70">
              [
            </span>
            <span className="px-0.5">Signal</span>
            <span aria-hidden="true" className="text-console-accent/70">
              ]
            </span>
          </p>

          <div className="flex items-center gap-5">
            <a
              href={REPO}
              className="rounded-sm font-mono text-xs text-console-dim transition-colors duration-200 hover:text-console-ink"
            >
              GitHub
            </a>
            <Link
              href="/console"
              className="rounded-sm font-mono text-xs text-console-accent transition-opacity duration-200 hover:opacity-80"
            >
              Open the console →
            </Link>
          </div>
        </nav>
      </header>

      <main className="flex-1">
        {/* ---------------------------------------------------------------- */}
        {/* Hero                                                             */}
        {/* ---------------------------------------------------------------- */}
        <section className="hero-glow relative pb-24 pt-16 sm:pt-24">
          {/*
            The headline changes typeface mid-sentence, and that switch *is* the
            product: serif and dim for the raw material you hand over, mono and
            accent for the thing you get back. Nothing else on this page is
            allowed to be this loud.
          */}
          <h1 className="max-w-4xl text-[2rem] font-bold leading-[1.15] tracking-tight sm:text-5xl lg:text-6xl">
            <span className="block font-serif font-normal text-console-dim">
              Paste the noise.
            </span>
            <span className="block font-mono text-console-accent">
              Read the signal.
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-console-dim">
            A news article, an earnings note, a &ldquo;quick question&rdquo;
            email that is never quick. One paste in, one structured briefing
            out — summary, entities, KPIs, sentiment and topics.
          </p>

          <HeroDiagram />

          <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              href="/console"
              className="rounded-md bg-console-accent px-5 py-2.5 font-mono text-sm font-bold text-console-bg transition-opacity duration-200 hover:opacity-90"
            >
              Open the console
            </Link>
            <a
              href="#key-transport"
              className="rounded-sm text-sm text-console-dim underline decoration-console-border underline-offset-4 transition-colors duration-200 hover:text-console-ink"
            >
              See how the key is handled
            </a>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 1 — the BYOK objection, answered before it is asked              */}
        {/* ---------------------------------------------------------------- */}
        <section
          id="key-transport"
          aria-labelledby="key-transport-heading"
          className="scroll-mt-8 border-t border-console-border py-16"
        >
          <Eyebrow>The part I thought hardest about</Eyebrow>
          <SectionHeading id="key-transport-heading">
            Your key never leaves the tab
          </SectionHeading>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-console-dim">
            &ldquo;Paste your API key into my website&rdquo; is a big ask, so
            here is the whole transport. Four hops, no storage, no logger.
          </p>

          <div className="mt-8">
            <FlowDiagram
              label="Where your Gemini key travels"
              steps={[
                { node: "sessionStorage", note: "your tab" },
                { node: "X-Gemini-Key", note: "request header" },
                { node: "/api/analyze", note: "this app's own route" },
                { node: "Google", note: "x-goog-api-key" },
              ]}
            />
          </div>

          <dl className="mt-10 grid gap-x-10 gap-y-6 sm:grid-cols-2">
            {[
              {
                term: "sessionStorage only",
                def: "The key dies when you close the tab. Never localStorage, never a cookie — a cookie would ride along on every request automatically.",
              },
              {
                term: "Header, never URL",
                def: "Query strings land in server logs and browser history. Headers don't.",
              },
              {
                term: "Never stored, never logged",
                def: "The route holds it in a local variable for the duration of one request. There is no database. There is no logger.",
              },
              {
                term: "Same-origin only",
                def: "Enforced by CSP: connect-src 'self'.",
              },
            ].map((item) => (
              <div key={item.term}>
                <dt className="font-mono text-xs font-bold text-console-ink">
                  {item.term}
                </dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-console-dim">
                  {item.def}
                </dd>
              </div>
            ))}
          </dl>

          <p className="mt-8 max-w-xl text-sm leading-relaxed text-console-faint">
            Your history and library live in localStorage and never leave your
            machine either. The asymmetry is deliberate: history should survive
            a reload, a key should not survive the tab.
          </p>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 2 — the briefing anatomy, rendered by the real components        */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="briefing-heading"
          className="border-t border-console-border py-16"
        >
          <Eyebrow>The whole of the paragraph above</Eyebrow>
          <SectionHeading id="briefing-heading">What comes back</SectionHeading>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-console-dim">
            One well-typed JSON object per analysis. The hero pulled two numbers
            out of that earnings note — this is everything else it found, drawn
            by the same components the console uses. Export any briefing as
            JSON, Markdown or CSV.
          </p>

          <div className="mt-10 rounded-lg border border-console-border bg-console-surface/40 p-5 sm:p-8">
            <ReportView result={BRIEFING} />
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 3 — RAG                                                          */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="ask-heading"
          className="border-t border-console-border py-16"
        >
          <Eyebrow>Once you have more than one</Eyebrow>
          <SectionHeading id="ask-heading">
            Ask across your briefings
          </SectionHeading>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-console-dim">
            Save briefings to the Library and ask questions against all of them
            at once. Two details in that sentence are doing real work.
          </p>

          <div className="mt-8">
            <FlowDiagram
              label="How a question is answered"
              steps={[
                { node: "Question", note: "embedded to a vector" },
                { node: "Cosine top-3", note: "in your browser" },
                { node: "/api/ask", note: "3 briefings only" },
                { node: "Grounded answer", note: "citations filtered" },
              ]}
            />
          </div>

          <dl className="mt-10 grid gap-x-10 gap-y-6 sm:grid-cols-2">
            <div>
              <dt className="font-mono text-xs font-bold text-console-ink">
                Retrieval runs client-side
              </dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-console-dim">
                Your saved briefings never leave the browser wholesale. Ranking
                is a dot product and a sort over vectors already in
                localStorage, and only the top three are ever sent as context.
              </dd>
            </div>
            <div>
              <dt className="font-mono text-xs font-bold text-console-ink">
                Citations are verified, not trusted
              </dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-console-dim">
                The prompt tells the model to answer only from what it was
                given — but a prompt is an instruction, not an enforcement
                mechanism. The route filters returned citation ids against the
                ids it actually sent, so a hallucinated source is dropped before
                it reaches you.
              </dd>
            </div>
          </dl>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 4 — the measured numbers                                         */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="built-heading"
          className="border-t border-console-border py-16"
        >
          <Eyebrow>Measured, not estimated</Eyebrow>
          <SectionHeading id="built-heading">Built like</SectionHeading>

          {/*
            DOM order is dt → dd → dd ("Tests, 171, ~5s all offline"), which is
            how this should be read aloud and the only ordering a <dl> allows.
            The flex `order` flips the number above its label visually without
            costing the structure — a stat reads as a number first.
          */}
          <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-console-border bg-console-border sm:grid-cols-3 lg:grid-cols-5">
            {BUILT.map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col bg-console-surface p-4"
              >
                <dt className="order-2 mt-1.5 text-xs leading-snug text-console-dim">
                  {stat.label}
                </dt>
                <dd className="order-1 break-words font-mono text-2xl font-bold tracking-tight text-console-ink">
                  {stat.value}
                </dd>
                <dd className="order-3 mt-1 break-words font-mono text-[10px] leading-snug text-console-faint">
                  {stat.note}
                </dd>
              </div>
            ))}
          </dl>

          <p className="mt-8 max-w-2xl text-sm leading-relaxed text-console-dim">
            The dependency count is the one I am most pleased with. No AI SDK —
            the {GEMINI_MODEL} calls are plain <code className="font-mono text-console-ink">fetch</code>{" "}
            against the REST API, which means full header control and trivially
            mockable tests. No chart library — the gauge above is hand-built
            SVG. No vector database — retrieval is a dot product over at most 25
            items that already live in the tab.
          </p>
        </section>
      </main>

      {/* ------------------------------------------------------------------ */}
      <footer className="border-t border-console-border pt-16">
        <div className="flex flex-col items-start gap-6 pb-10 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-md font-serif text-xl italic leading-snug text-console-dim sm:text-2xl">
            Three examples run with no key at all.
          </p>
          <Link
            href="/console"
            className="rounded-md bg-console-accent px-5 py-2.5 font-mono text-sm font-bold text-console-bg transition-opacity duration-200 hover:opacity-90"
          >
            Open the console
          </Link>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-console-border py-6 font-mono text-xs text-console-faint">
          <p>
            Built by{" "}
            <a
              href="https://github.com/KiritoH4Z3"
              className="rounded-sm text-console-dim transition-colors duration-200 hover:text-console-ink"
            >
              Abdullah
            </a>{" "}
            in the UAE.
          </p>
          <a
            href={REPO}
            className="rounded-sm text-console-dim transition-colors duration-200 hover:text-console-ink"
          >
            github.com/KiritoH4Z3/signal-ai-parser
          </a>
        </div>
      </footer>
    </div>
  );
}
