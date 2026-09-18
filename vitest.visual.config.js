import { defineConfig } from "vitest/config";
import ShardSequencer from "./test/sequencer.js";

/* The visual suite runs a real browser and is not part of `npm test`.

   Two reasons, and both are recorded elsewhere in this repository. The main
   suite is already a couple of minutes on CI and `test/model.test.js` carries a
   note about a worker running out of memory when the mission models were built
   twice; adding a browser to that run invites it back. And three.js splits its
   own screenshot tests into a separate job for the same reason.

   `vitest.config.js` pins collection to `test/`, so nothing here is picked up
   by accident — the same arrangement `perf/` has. #73 */
export default defineConfig({
  test: {
    include: ["visual/**/*.test.ts"],
    /* One browser, one page, walked in order. Parallel workers would each
       launch their own Chrome, and software rendering is slow enough that the
       launches would cost more than the assertions. */
    pool: "forks",
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 300_000,
    hookTimeout: 300_000,
    sequence: {
      /* Which file runs on which CI shard. The same packing the main suite
         uses, and it matters more here: one worker means a shard's wall clock
         is the *sum* of its files rather than its longest, so an uneven split
         is paid in full rather than absorbed by three idle workers.

         render is 151.5s of the suite's 322.8 and is the floor on its own —
         sixteen tests sharing one page, several reading what the one before
         left, so it does not divide. Three shards reach that floor: render
         alone, layout, and transfer with stops. Two cannot — the other three
         files together are 171.3s, which is no better than the hash split this
         replaces.

         Each file here serves its own build and opens its own browser, so
         reordering them is safe; what the order cannot do is help, since
         nothing runs beside anything. */
      sequencer: ShardSequencer,
    },
  },
});
