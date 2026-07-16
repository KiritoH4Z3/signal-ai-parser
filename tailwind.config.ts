import type { Config } from "tailwindcss";

// Design tokens land in Phase 2 (intelligence-console palette).
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
