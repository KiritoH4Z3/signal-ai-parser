import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Newsreader } from "next/font/google";
import "./globals.css";

/**
 * All three faces are self-hosted by next/font at build time — the CSP in
 * next.config.mjs pins `font-src 'self'`, so an external font host would be
 * blocked at runtime.
 */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

/**
 * The serif is the noise — raw source prose, before anything has been extracted
 * from it. It earns its place by being used almost nowhere: the landing hero's
 * first line, the source paragraph in the extraction diagram, and section
 * eyebrows. Everything the product actually produces is mono.
 */
const newsreader = Newsreader({
  subsets: ["latin"],
  display: "swap",
  style: ["normal", "italic"],
  variable: "--font-newsreader",
});

const title = "Signal — AI Market Intelligence Parser";
const description =
  "Paste the noise. Read the signal. Unstructured market text in, structured intelligence briefing out — summary, entities, KPIs, sentiment and topics, powered by Gemini.";

export const metadata: Metadata = {
  title,
  description,
  applicationName: "Signal",
  authors: [{ name: "Abdullah", url: "https://github.com/KiritoH4Z3" }],
  keywords: [
    "AI",
    "market intelligence",
    "text parsing",
    "Gemini",
    "sentiment analysis",
    "Next.js",
  ],
  openGraph: {
    title,
    description,
    siteName: "Signal",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} ${newsreader.variable} dark`}
      suppressHydrationWarning
    >
      <body className="console-grid min-h-screen font-sans">{children}</body>
    </html>
  );
}
