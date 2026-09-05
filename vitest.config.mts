import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Mirrors tsconfig.json's "@/*" path alias -- unused until this config
// existed, since the only prior test (critical-paths.test.ts) imported
// nothing from the app itself. Needed for tests that import real page/data
// modules (which pull in "@/..." imports transitively) instead of only
// hitting a live Supabase project over the network.
export default defineConfig({
  resolve: {
    alias: {
      "@": dirname,
    },
  },
  // tsconfig.json sets jsx: "preserve" for Next's own webpack/SWC pipeline;
  // Vite's own transform (oxc, as of Vite 8) needs it actually transformed
  // to plain JS to run the .tsx files under test in plain Node.
  oxc: {
    jsx: "automatic",
  },
});
