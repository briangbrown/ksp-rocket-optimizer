import { defineConfig } from "vitest/config";

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
    include: ["visual/**/*.test.js"],
    /* One browser, one page, walked in order. Parallel workers would each
       launch their own Chrome, and software rendering is slow enough that the
       launches would cost more than the assertions. */
    pool: "forks",
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});
