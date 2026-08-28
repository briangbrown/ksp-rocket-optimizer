import { describe, it, expect } from "vitest";
import { planMission } from "../src/core/plan.js";
import { missionCases } from "./grid.js";
import { missionSignature } from "./signature.js";

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

describe("mission sweep", () => {
  it("delivers unchanged designs across destinations and payloads", async () => {
    const out = [];
    for (const c of missionCases()) {
      const res = await planMission(c.input, {
        onYield: () => Promise.resolve(),
      });
      out.push(missionSignature(c.name, res && res.stages));
    }
    await expect(out.join("\n")).toMatchFileSnapshot(
      "./__snapshots__/missions.txt",
    );
  }, 300_000);
});
