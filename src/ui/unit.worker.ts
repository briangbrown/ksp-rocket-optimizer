import { TALLY, resetTally } from "../core/tally.js";
import { solveUnit } from "../core/solver.js";
import type { Prepared } from "../core/solver.js";

/* One thread of the sharded search (#50).

   `solveGroup`'s `(k, shares)` pairs are independent, so this holds the group's
   parameters and solves whichever splits it is handed. It lives in ui/ for the
   same reason solver.worker.js does: it is a delivery mechanism, and core/ is
   not allowed to know it has threads at all.

   The parameters arrive once per group rather than with every unit. They carry
   the whole part roster, and cloning a few hundred parts twenty-three times per
   group is work for nothing.

   The tally travels back with each unit. It is a module-level counter, so the
   searching done here is invisible to the thread that asked for it, and the
   number the app reports would otherwise quietly become "whatever the
   orchestrator did on its own". */

/* What arrives: the group's parameters once, then one message per split. */
type UnitMessage =
  | { type: "init"; p: Prepared }
  | { type?: undefined; i: number; k: number; shares: Array<number> };

/* What was thrown, as the string the old expression produced: an Error's
   message where it has one, and the value itself otherwise. Written out because
   a caught value is `unknown`, and the difference matters — the client treats an
   empty string as no error at all. */
const errText = (err: unknown) => {
  const m = err instanceof Error ? err.message : undefined;
  return String(m || err);
};

let p: Prepared | null = null;

self.onmessage = (e: MessageEvent) => {
  const m: UnitMessage = e.data;
  if (m.type === "init") {
    p = m.p;
    return;
  }
  try {
    if (!p) throw new Error("a unit arrived before the group's parameters");
    resetTally();
    const cands = solveUnit(p, m.k, m.shares);
    self.postMessage({ i: m.i, cands, tally: { ...TALLY } });
  } catch (err) {
    self.postMessage({ i: m.i, error: errText(err) });
  }
};
