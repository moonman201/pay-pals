import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // apps/web components are written for the automatic JSX runtime (no React import).
  esbuild: { jsx: "automatic" },
  resolve: {
    // The evidence pack view is rendered with its own data in the review tests; it imports apps/web helpers by alias.
    alias: { "@": fileURLToPath(new URL("../../apps/web", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
