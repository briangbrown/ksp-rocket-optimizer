import { describe, it, expect } from "vitest";
import { planMission } from "../src/core/plan.js";
import { sweepCases } from "./grid.js";
import { missionSignature } from "./signature.js";
import { stageGeom } from "../src/core/geometry.js";
import type { PlanStage } from "../src/core/plan.js";

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
function intersecting(stages: ReadonlyArray<PlanStage>) {
  const bad: Array<string> = [];
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
    let dropTanks = 0;
    for (const c of sweepCases()) {
      const res = await planMission(c.input, {
        onYield: () => Promise.resolve(),
      });
      out.push(missionSignature(c.name, res && res.stages));
      if (res) {
        overlaps.push(...intersecting(res.stages).map((x) => `${c.name} ${x}`));
        if (c.input.asparagus)
          dropTanks += res.stages.filter(
            (st) => st.sol?.boosters?.part.dropTank,
          ).length;
      }
    }
    /* The crossfed rows have to actually build one.

       Three of them are in the sweep because this branch had produced three
       defects before any check looked at it, and pinning a design that never
       reaches the drop-tank pool would pin nothing about the pool. As it
       stands only the mass row delivers one — the cost and parts rows solve the
       same mission with crossfeed available and choose against it, which is
       worth pinning too, but it is not this. If the last one stops, these rows
       are decoration and this says so. #125 */
    expect(
      dropTanks,
      "no asparagus row in the sweep delivered a drop tank",
    ).toBeGreaterThan(0);
    /* Asserted before the snapshot: a design whose columns intersect is wrong
       whatever the baseline says about it. */
    expect(overlaps).toEqual([]);
    await expect(out.join("\n")).toMatchFileSnapshot(
      "./__snapshots__/missions.txt",
    );
  }, 300_000);
});
