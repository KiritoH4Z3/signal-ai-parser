import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Signal — AI Market Intelligence Parser",
  description:
    "Paste the noise. Read the signal. Unstructured market text in, structured intelligence briefing out.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
