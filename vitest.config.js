import { defineConfig } from "vitest/config";
import ShardSequencer from "./test/sequencer.js";

export default defineConfig({
  test: {
    /* Explicit, so the benchmarks in perf/ can never be collected as tests.
       They are measurements, not assertions, they take minutes, and their
       results depend on the machine — none of which belongs in CI.

       test/sharding.test.ts walks the same pattern by hand to check the shard
       plan covers every file; a change here needs a change there. */
    include: ["test/**/*.test.{ts,tsx}"],
    setupFiles: ["test/setup.ts"],
    sequence: {
      /* Which file runs on which CI shard, and in what order within one.
         vitest's own rule splits by the hash of the path into equal counts,
         which divides this suite's work very unequally — test/shard-plan.ts has
         the reasoning and the measurements. Does nothing unless `--shard` is
         passed, so a local `npm test` is untouched. */
      sequencer: ShardSequencer,
    },
  },
});
