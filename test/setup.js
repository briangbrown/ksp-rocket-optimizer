import { beforeEach } from "vitest";

/* Every test starts with an empty roster.

   The app persists the researched tech tree, so a run comes back where you left
   it. jsdom has a real localStorage and every test in a file shares it, which
   means one test unlocking tier 9 leaves every test after it solving at tier 9
   — and tier 9 is roughly fifteen times the work of the tier 5 default.

   That is what had happened. test/resolve-wiring.test.jsx unlocks the tree in
   its second case, and its remaining eight went from about 1.5 s each to
   between 8 and 13 s. The file was 91 s; it is 21 s with this in place, and the
   suite as a whole 93 s to 24 s.

   Registered globally rather than left to each suite because the leak is
   invisible. It costs time, not correctness — nothing fails, no assertion
   changes, and the only symptom is a slow CI gate that looks like it is simply
   the price of solving rockets. A suite that genuinely wants state to survive
   between tests has to say so, which is the right way round. */
beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* a node-environment suite, with no storage to clear */
  }
});
