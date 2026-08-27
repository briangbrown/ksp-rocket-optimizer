import { TALLY } from "../core/tally.js";
import { planMission } from "../core/plan.js";

/* The solver, running off the main thread.

   This lives in ui/ rather than core/ because it is a delivery mechanism, not
   physics — it assumes a worker host, and core/ is meant to assume nothing. All
   it does is hand messages to planMission, which was built for this: the seam
   takes and returns only data a structured clone can carry, enforced by
   test/seam-contract.test.js and test/seam-input.test.jsx.

   No yielding here. In-process, onYield exists to let React paint between
   segments; on a worker thread there is nothing to paint and nothing to block,
   so it returns immediately and the solve runs flat out. */

/* One thread per core bar this one, capped. Past eight the measurement stops
   improving — 4.63x at eight against 4.66x at twelve on an eighteen-core
   container — because the group runs out of units to hand out. */
const WANT = Math.min(
  8,
  Math.max(
    2,
    ((self.navigator && self.navigator.hardwareConcurrency) || 4) - 1,
  ),
);

/* Nested workers, which every current browser allows and some older ones do
   not. If construction throws, `fanOut` stays null and planMission solves the
   units here in order — slower, and identical. */
function makePool(want) {
  let workers;
  try {
    workers = Array.from(
      { length: want },
      () =>
        new Worker(new URL("./unit.worker.js", import.meta.url), {
          type: "module",
        }),
    );
  } catch {
    return null;
  }

  /* Units are handed out one at a time as threads free up, not partitioned in
     advance. They are not equal — k=1 is a single split and k=3 is twelve — and
     on a phone the cores are not equal either, so a static split leaves the big
     cores idle waiting on a little one. */
  const fanOut = (p, units) =>
    new Promise((resolve, reject) => {
      const out = new Array(units.length);
      let next = 0,
        left = units.length;
      if (!left) return resolve(out);
      for (const w of workers) {
        w.onmessage = (e) => {
          const m = e.data;
          if (m.error) return reject(new Error(m.error));
          out[m.i] = m.cands;
          /* Fold the thread's counters back in, so the search stats describe
             the whole search rather than the part of it that ran here. */
          for (const key in m.tally) TALLY[key] += m.tally[key];
          if (--left === 0) return resolve(out);
          if (next < units.length) {
            const i = next++;
            w.postMessage({ i, ...units[i] });
          }
        };
        w.onerror = (err) => reject(new Error(err.message || "unit worker"));
        w.postMessage({ type: "init", p });
      }
      /* Prime every thread before waiting on any of them. */
      for (const w of workers) {
        if (next >= units.length) break;
        const i = next++;
        w.postMessage({ i, ...units[i] });
      }
    });

  return { fanOut, close: () => workers.forEach((w) => w.terminate()) };
}

self.onmessage = async (e) => {
  const { id, input, threads } = e.data;
  const want = threads > 0 ? threads : WANT;
  const pool = makePool(want);
  try {
    const result = await planMission(input, {
      onYield: () => Promise.resolve(),
      fanOut: pool && pool.fanOut,
    });
    self.postMessage({ id, result: { ...result, threads: pool ? want : 1 } });
  } catch (err) {
    /* An Error does not survive a structured clone with its stack intact, and
       the message is the part worth keeping. */
    self.postMessage({ id, error: String((err && err.message) || err) });
  } finally {
    if (pool) pool.close();
  }
};
