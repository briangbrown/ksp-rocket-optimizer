import { addTally } from "../core/tally.js";
import { planMission } from "../core/plan.js";
import type { PlanInput } from "../core/plan.js";
import type { Tally } from "../core/tally.js";
import type { ChainCandidate, Prepared } from "../core/solver.js";

/* One unit's answer coming back from a thread, or the reason there is none. */
type UnitReply = {
  i: number;
  cands?: Array<ChainCandidate>;
  tally?: Tally;
  error?: string;
};

/* As `errText` in unit.worker.ts, and for the same reason. */
const errText = (err: unknown) => {
  const m = err instanceof Error ? err.message : undefined;
  return String(m || err);
};

/* The solver, running off the main thread.

   This lives in ui/ rather than core/ because it is a delivery mechanism, not
   physics — it assumes a worker host, and core/ is meant to assume nothing. All
   it does is hand messages to planMission, which was built for this: the seam
   takes and returns only data a structured clone can carry, enforced by
   test/seam-contract.test.js and test/seam-input.test.jsx.

   No yielding here. In-process, onYield exists to let React paint between
   segments; on a worker thread there is nothing to paint and nothing to block,
   so it returns immediately and the solve runs flat out. */

/* How many threads to ask for, which is not "as many as there are cores".

   On a container, one per core bar this one, capped at eight: past that the
   measurement stops improving — 4.63x at eight against 4.66x at twelve on
   eighteen cores — because the group runs out of units to hand out.

   A phone is a different machine. A Pixel 8 is one big core, four mid and four
   little, and hardwareConcurrency reports nine without saying which is which.
   Measured there, best of three, on a full-tech Mun solve:

     serial      10.5 s
     4 threads    5.1 s     2.06x
     8 threads    5.6 s     1.88x

   More threads is slower. The extra four land on the little cores, take about
   three times as long over a unit, and set the tail the rest of the pool waits
   on. There is no affinity control on the platform — nothing exposes which core
   is which, and nothing lets a worker ask for one — so the only way to keep the
   work on the fast cores is to not create the threads that would land on the
   slow ones.

   userAgentData.mobile is the signal for that, and it is the property we
   actually care about rather than a proxy for it. Where it is missing — Safari,
   Firefox — a phone gets the desktop sizing, which is a worse guess than the
   one Chrome allows and still correct, just slower. ?threads=N overrides all of
   it; see perf/README.md. */
const CORES = (self.navigator && self.navigator.hardwareConcurrency) || 4;
/* Not in anyone's lib yet, and Safari and Firefox do not have it at all —
   which is why the sizing below falls back rather than depending on it. */
type UaData = { mobile?: boolean };
const MOBILE = !!(
  self.navigator &&
  (self.navigator as Navigator & { userAgentData?: UaData }).userAgentData
    ?.mobile
);
const WANT = MOBILE
  ? Math.min(4, Math.max(2, Math.floor(CORES / 2)))
  : Math.min(8, Math.max(2, CORES - 1));

/* Nested workers, which every current browser allows and some older ones do
   not. If construction throws, `fanOut` stays null and planMission solves the
   units here in order — slower, and identical. */
function makePool(want: number) {
  let workers: Array<Worker>;
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
  const fanOut = (
    p: Prepared,
    units: Array<{ k: number; shares: Array<number> }>,
  ) =>
    new Promise<Array<Array<ChainCandidate>>>((resolve, reject) => {
      const out = new Array<Array<ChainCandidate>>(units.length);
      let next = 0,
        left = units.length;
      if (!left) return resolve(out);
      for (const w of workers) {
        w.onmessage = (e: MessageEvent) => {
          const m: UnitReply = e.data;
          if (m.error) return reject(new Error(m.error));
          if (m.cands) out[m.i] = m.cands;
          /* Fold the thread's counters back in, so the search stats describe
             the whole search rather than the part of it that ran here. */
          if (m.tally) addTally(m.tally);
          if (--left === 0) return resolve(out);
          if (next < units.length) {
            const i = next++;
            w.postMessage({ i, ...units[i] });
          }
        };
        w.onerror = (err: ErrorEvent) =>
          reject(new Error(err.message || "unit worker"));
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

self.onmessage = async (e: MessageEvent) => {
  const {
    id,
    input,
    threads,
  }: { id: number; input: PlanInput; threads: number } = e.data;
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
    self.postMessage({ id, error: errText(err) });
  } finally {
    if (pool) pool.close();
  }
};
