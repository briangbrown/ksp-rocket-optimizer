import { describe, it, expect } from "vitest";
import { planMission } from "../src/core/plan.js";
import { stackGeometry } from "../src/core/geometry.js";
import { missionCases } from "./grid.js";
import { must } from "./must.js";

/* The slenderness limit is about the rocket that leaves the pad.

   It was applied to each segment's own chain. A mission with no cuts in it is
   one segment, so the two were the same number and nothing looked wrong — and
   both baselines solve missions with no cuts. Cut one into four and they part
   company: segments reading 6.2, 4.6, 2.3 and 1.7 against a limit of 8, for a
   vehicle that is 9.5:1. The solver delivered it, and the build view turned
   the figure amber, correctly, on a design every segment of which had passed.

   Groups are solved from the top of the stack downwards, so what is above a
   group is known when it is sized. Carrying that down means the group that
   reaches the pad judges the whole vehicle — which is the one judgement that
   gates what is delivered. #102 */

describe("slenderness", () => {
  it("is measured on the whole rocket, not on a segment of it", async () => {
    const c = must(
      missionCases().find((x) => x.name === "Eeloo-pay2.5-cut"),
      "the cut mission",
    );
    const res = must(
      await planMission(c.input, { onYield: () => Promise.resolve() }),
      "a design for the cut mission",
    );
    const solved = res.stages.filter((s) => s.sol);
    expect(solved.length, "no design to measure").toBeGreaterThan(1);

    /* More than one segment, or this checks the thing that always worked. */
    expect(
      new Set(solved.map((s) => s.key)).size,
      "the cuts did not produce segments",
    ).toBeGreaterThan(1);

    const { ar } = stackGeometry(solved, c.input.payload, c.input.payloadDia);
    expect(
      ar,
      `the vehicle is ${ar.toFixed(1)}:1 against a ${c.input.maxAspect}:1 limit`,
    ).toBeLessThanOrEqual(c.input.maxAspect);
  }, 300_000);
});
