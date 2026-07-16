import type { Config } from "tailwindcss";

/**
 * Design tokens for the "intelligence console" direction (docs/PLAN.md §
 * "Design direction"). Components reference these names only — no raw hex in
 * JSX. Contrast against `console.bg` / `console.surface` was measured: ink
 * 16.7:1, dim 7.4:1, accent 13.1:1, positive 10.0:1, neutral 11.6:1, negative
 * 7.0:1 — all comfortably past AA (4.5:1).
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        console: {
          bg: "#0A0F0E",
          surface: "#101817",
          // A touch above `surface` for nested wells (textarea, chips).
          well: "#0D1413",
          border: "#1E2B29",
          accent: "#5EEAD4",
          ink: "#E6F1EF",
          dim: "#8AA6A1",
          // De-emphasised text (units, counts, field labels). This exists as a
          // solid token because the obvious alternative — `text-console-dim/60`
          // — composites to #596D6A over `surface`, which is 3.28:1 and fails
          // AA. Use this instead of an opacity modifier on any real text.
          faint: "#728B87",
        },
        sentiment: {
          positive: "#34D399",
          neutral: "#FBBF24",
          negative: "#F87171",
        },
      },
      fontFamily: {
        // Prose. Set on <body>.
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        // Every data surface: metric values, chips, counters, status line,
        // timestamps. The mono-for-data rule is what sells the console feel.
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "monospace"],
        // The noise: raw, un-extracted source prose, and nothing else. Held to
        // three uses (hero's first line, the diagram's source paragraph,
        // section eyebrows) so the contrast against `mono` stays legible as an
        // argument rather than reading as decoration.
        serif: ["var(--font-newsreader)", "ui-serif", "Georgia", "serif"],
      },
      fontSize: {
        // Uppercase letterspaced section kickers.
        kicker: ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.14em" }],
      },
      keyframes: {
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "led-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.45" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        /**
         * The landing hero's extraction sequence. Each of these ends at the
         * element's *resting* appearance and runs with `both` fill, so the 0%
         * frame holds during `animation-delay` and the 100% frame sticks
         * afterwards. That is what lets the reduced-motion block in globals.css
         * collapse the whole sequence to its final state on the first paint —
         * no JS gate, no flash of the un-run state.
         */
        "mark-in": {
          "0%": {
            color: "#8AA6A1",
            backgroundColor: "rgba(94, 234, 212, 0)",
            boxShadow: "inset 0 -1px 0 0 rgba(94, 234, 212, 0)",
          },
          "100%": {
            color: "#E6F1EF",
            backgroundColor: "rgba(94, 234, 212, 0.1)",
            boxShadow: "inset 0 -1px 0 0 rgba(94, 234, 212, 0.55)",
          },
        },
        // Paths carry pathLength={1}, so one length-agnostic keyframe draws any
        // hairline regardless of its measured geometry.
        "draw-line": {
          "0%": { strokeDashoffset: "1" },
          "100%": { strokeDashoffset: "0" },
        },
      },
      animation: {
        shimmer: "shimmer 1.6s infinite",
        "fade-up": "fade-up 380ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "led-pulse": "led-pulse 1.8s ease-in-out infinite",
        "fade-in": "fade-in 300ms ease-out both",
        "mark-in": "mark-in 400ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "draw-line": "draw-line 500ms cubic-bezier(0.16, 1, 0.3, 1) both",
      },
    },
  },
  plugins: [],
};

export default config;
