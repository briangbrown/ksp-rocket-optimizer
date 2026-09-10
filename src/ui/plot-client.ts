/* Prices a plot grid off the page's thread, on a small pool of workers where
   there is one (#213).

   A grid's columns are independent, so a request is cut into as many runs
   as there are threads and each run goes to its own; the replies are laid
   back into one array in column order. Two plots asking at once — the way
   out and the way home — interleave on the same pool, which is what keeps
   the pool small: the work is a couple of hundred milliseconds in all, and
   the point is that none of it is on the thread that paints.

   The pool is built on first use and kept: a plot is asked for on every
   change of the brief, and a worker's construction is milliseconds that
   would be spent every time. A request that is no longer wanted is simply
   not listened to — the run finishes in the background and its reply is
   dropped — since terminating the pool would cost the construction and
   whatever the other plot was waiting on.

   Falls back to pricing in-process when Worker is missing, as the solver
   client does: jsdom, and a browser that blocks workers. That is one stall
   of a couple of hundred milliseconds rather than a frozen page, and it is
   the rare path. */

import type { Grid } from "../core/transfer.js";

type PlotReply = {
  id: number;
  from: number;
  totals?: Array<number>;
  error?: string;
};

/* Enough threads to price a plot in a few slices, never so many that the
   solver's own pool is starved: the solver takes cores − 1, and this runs
   while it does. */
const CORES =
  (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4;
const THREADS = Math.min(4, Math.max(1, Math.floor((CORES - 1) / 2)));

const supported = () => typeof Worker !== "undefined";

let pool: Array<Worker> | null = null;
let seq = 0;
/* The requests in flight, by id: the grid's rows, so a run's totals can be
   laid at its column, and what each is still waiting on. */
const live = new Map<
  number,
  {
    nf: number;
    totals: Array<number>;
    left: number;
    resolve: (t: Array<number> | null) => void;
  }
>();

/* Every worker reports to the one router, which finds the request by id. */
function makePool() {
  const workers: Array<Worker> = [];
  try {
    for (let i = 0; i < THREADS; i++)
      workers.push(
        new Worker(new URL("./plot.worker.js", import.meta.url), {
          type: "module",
        }),
      );
  } catch {
    workers.forEach((w) => w.terminate());
    return null;
  }
  for (const w of workers) {
    w.onmessage = (e: MessageEvent) => {
      const m: PlotReply = e.data;
      const req = live.get(m.id);
      if (!req) return;
      if (m.error || !m.totals) {
        console.error("plot worker:", m.error || "no totals");
        live.delete(m.id);
        req.resolve(null);
        return;
      }
      for (let k = 0; k < m.totals.length; k++)
        req.totals[m.from * req.nf + k] = m.totals[k];
      if (--req.left === 0) {
        live.delete(m.id);
        req.resolve(req.totals);
      }
    };
    /* A worker that fails to start settles every request on it as null:
       the card keeps the coarse picture, which is a picture. */
    w.onerror = (err: ErrorEvent) => {
      console.error("plot worker failed:", err.message || err);
      for (const [id, req] of live) {
        live.delete(id);
        req.resolve(null);
      }
    };
  }
  return workers;
}

export const usingWorkers = () => supported();

/* The grid's totals, priced; null where the pool could not, or the signal
   aborted first — the caller keeps what it had. */
export async function priceGrid(
  grid: Grid,
  signal?: AbortSignal,
): Promise<Array<number> | null> {
  if (!supported()) {
    const { priceColumns } = await import("../core/transfer.js");
    if (signal?.aborted) return null;
    return priceColumns(grid, 0, grid.nt);
  }
  if (!pool) pool = makePool();
  if (!pool) {
    const { priceColumns } = await import("../core/transfer.js");
    return signal?.aborted ? null : priceColumns(grid, 0, grid.nt);
  }
  const workers = pool;
  const id = ++seq;
  const runs = Math.min(workers.length, grid.nt);
  return new Promise<Array<number> | null>((resolve) => {
    const req = {
      nf: grid.nf,
      totals: new Array<number>(grid.nt * grid.nf).fill(-1),
      left: runs,
      resolve: (t: Array<number> | null) => {
        signal?.removeEventListener("abort", onAbort);
        resolve(t);
      },
    };
    const onAbort = () => {
      live.delete(id);
      req.resolve(null);
    };
    live.set(id, req);
    signal?.addEventListener("abort", onAbort, { once: true });
    /* Even runs of columns, one to a thread. */
    for (let r = 0; r < runs; r++) {
      const from = Math.floor((grid.nt * r) / runs),
        to = Math.floor((grid.nt * (r + 1)) / runs);
      workers[r].postMessage({ id, grid, from, to });
    }
  });
}

/* For a test: forget the pool, so the next request builds one. */
export function resetPlotPool() {
  pool?.forEach((w) => w.terminate());
  pool = null;
  live.clear();
}

export type { PlotReply };
