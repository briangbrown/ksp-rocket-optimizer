import { TALLY, resetTally } from "../core/tally.js";
import { solveUnit } from "../core/solver.js";

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

let p = null;

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === "init") {
    p = m.p;
    return;
  }
  try {
    resetTally();
    const cands = solveUnit(p, m.k, m.shares);
    self.postMessage({ i: m.i, cands, tally: { ...TALLY } });
  } catch (err) {
    self.postMessage({ i: m.i, error: String((err && err.message) || err) });
  }
};
