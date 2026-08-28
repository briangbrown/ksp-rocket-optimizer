import { describe, it, expect } from "vitest";
import { planMission } from "../src/core/plan.js";
import { missionCases } from "./grid.js";
import { missionSignature } from "./signature.js";
import { stageGeom } from "../src/core/geometry.js";

/* The design the application actually delivers.

   The design snapshot drives `solveGroup` and reads `best`. `planMission` does
   not deliver `best`: for an auto-stage-count launch it walks `byK`
   cheapest-first through the ascent simulator and hands back the first
   candidate that flies, then re-solves against the flown cost. None of that was
   pinned above the default roster, and the render sweep only ever enters it at
   tier 5 with a 2.5 t payload.

   The cost of that gap is on the record. Dropping the cluster-cap variant left
   all 81 grid designs byte-identical and moved eleven of 128 real missions,
   nine of them dearer on the objective asked for and one by 21%. The check that
   was supposed to catch it could not see the code that broke. #45.

   Same discipline as the design snapshot: a diff means the delivered design
   moved. If that is what you intended, re-bless and put the before and after in
   the commit message. If it is not, it is the bug this exists to catch. */

/* Two parallel columns may not occupy the same space.

   Radial symmetry puts one column on the axis and the rest on a ring, so the
   centre column needs a whole column width of radius, and neighbours on the
   ring need to clear each other too. The ring used to be a tank diameter
   whatever the column was actually as wide as, and four columns 1.25 m apart
   carrying 2.53 m engine clusters ran through each other by 1.28 m. #58

   Panel containment cannot see this. Every one of those parts was inside its
   panel; they were just inside it on top of one another. */
function intersecting(stages) {
  const bad = [];
  stages.forEach((st, i) => {
    if (!st.sol) return;
    const S = st.sol.stacks || 1;
    if (S < 2) return;
    const g = stageGeom(st.sol);
    const neighbours = S - 1;
    const gap =
      neighbours < 2 ? Infinity : 2 * g.ringR * Math.sin(Math.PI / neighbours);
    const over = Math.max(g.span - g.ringR, g.span - gap);
    if (over > 1e-6)
      bad.push(
        `stage ${i}: ${S} columns spanning ${g.span.toFixed(2)} m on a ${g.ringR.toFixed(2)} m ring — overlap ${over.toFixed(2)} m`,
      );
  });
  return bad;
}

describe("mission sweep", () => {
  it("delivers unchanged designs across destinations and payloads", async () => {
    const out = [];
    const overlaps = [];
    for (const c of missionCases()) {
      const res = await planMission(c.input, {
        onYield: () => Promise.resolve(),
      });
      out.push(missionSignature(c.name, res && res.stages));
      if (res)
        overlaps.push(...intersecting(res.stages).map((x) => `${c.name} ${x}`));
    }
    /* Asserted before the snapshot: a design whose columns intersect is wrong
       whatever the baseline says about it. */
    expect(overlaps).toEqual([]);
    await expect(out.join("\n")).toMatchFileSnapshot(
      "./__snapshots__/missions.txt",
    );
  }, 300_000);
});
