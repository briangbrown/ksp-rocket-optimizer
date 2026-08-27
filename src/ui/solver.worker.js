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

self.onmessage = async (e) => {
  const { id, input } = e.data;
  try {
    const result = await planMission(input, {
      onYield: () => Promise.resolve(),
    });
    self.postMessage({ id, result });
  } catch (err) {
    /* An Error does not survive a structured clone with its stack intact, and
       the message is the part worth keeping. */
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
