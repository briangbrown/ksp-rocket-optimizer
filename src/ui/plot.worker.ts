import { priceColumns } from "../core/transfer.js";
import type { Grid } from "../core/transfer.js";

/* One thread of the Δv plot's finer pass (#213).

   The card prices the search's span three times finer than the search did,
   for the picture alone: thirty-five thousand Lambert cells, a couple of
   hundred milliseconds of arithmetic. On the page's thread that was sliced
   into twelve-millisecond runs with a paint between each and took a second
   and a half for the two plots of a return trip; here it is a run of
   columns priced whole, several threads at once, and the page paints twice
   — the coarse picture, then this. It lives in ui/ for the reason
   solver.worker.js does: a delivery mechanism, and core/ is not allowed to
   know it has threads at all.

   Everything crossing is plain data: the grid record `findWindow` keeps on
   the window, and an array of totals back. */

type PlotMessage = { id: number; grid: Grid; from: number; to: number };

/* As `errText` in unit.worker.ts, and for the same reason. */
const errText = (err: unknown) => {
  const m = err instanceof Error ? err.message : undefined;
  return String(m || err);
};

self.onmessage = (e: MessageEvent) => {
  const m: PlotMessage = e.data;
  try {
    self.postMessage({
      id: m.id,
      from: m.from,
      totals: priceColumns(m.grid, m.from, m.to),
    });
  } catch (err) {
    self.postMessage({ id: m.id, from: m.from, error: errText(err) });
  }
};
