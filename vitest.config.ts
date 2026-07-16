import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // `server-only` throws on import outside a React Server Component. Next
      // resolves it to a no-op via the "react-server" condition; Vitest does not,
      // so point it at the same empty module to keep route handlers importable.
      "server-only": path.resolve(__dirname, "node_modules/server-only/empty.js"),
    },
  },
});
