import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Isolate each test file (fresh module registry + globals) so the per-file
    // temp DATA_DIR / DB singleton don't bleed across files.
    isolate: true,
    testTimeout: 30000,
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary"],
      // Coverage is measured over the business logic, not the presentational
      // React pages (client components that just fetch + render).
      include: ["src/lib/**", "src/db/**", "src/app/api/**", "src/components/**"],
      // Interactive client components (like the pages) are presentational and driven
      // by manual/e2e checks, not unit coverage; their logic lives in src/lib.
      exclude: ["**/*.d.ts", "src/db/schema.ts", "src/components/JobDetailsPanel.tsx"],
    },
  },
});
