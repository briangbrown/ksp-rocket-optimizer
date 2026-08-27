import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    /* Explicit, so the benchmarks in perf/ can never be collected as tests.
       They are measurements, not assertions, they take minutes, and their
       results depend on the machine — none of which belongs in CI. */
    include: ["test/**/*.test.{js,jsx}"],
    setupFiles: ["test/setup.js"],
  },
});
