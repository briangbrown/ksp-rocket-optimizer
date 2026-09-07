import { describe, it, expect } from "vitest";
import { planMission } from "../src/core/plan.js";
import { missionCases } from "./grid.js";
import type { PlanInput } from "../src/core/plan.js";

/* A radial ring without a solid in the roster.

   `wantMounts` used to ask for a solid booster in the roster before it would
   try any mount at all, so a career with liquid engines and no SRBs never saw
   a liquid radial column unless asparagus was on — and the brief's toggle was
   disabled on such a roster, so nothing on the page could ask either. Neither
   baseline can see this: the design grid and the mission sweep both solve at
   tiers where the Hammer and the Flea are researched, and with a solid in the
   roster the gate was already open. #160

   The 3.5 t low-orbit mission on the mass objective, with every solid taken
   out of the engine list the way the app takes out an excluded part, delivers
   a pair of Thud columns; with the switch off it delivers no ring at all. The
   switch is what the second half holds, since a test that only asked for the
   column would pass on a solver that ignored the toggle. */
const solidFree = (input: PlanInput): PlanInput => ({
  ...input,
  objective: "mass",
  engines: input.engines.filter((e) => !(e.f.includes("SF") && e.fuelM > 0)),
});

describe("a roster with no solid boosters", () => {
  const base = missionCases().find((c) => c.name === "Low orbit-pay3.5");
  if (!base) throw new Error("the low-orbit 3.5 t mission has left the grid");

  it("still gets a liquid radial column when boosters are allowed", async () => {
    const res = await planMission(solidFree(base.input), {
      onYield: () => Promise.resolve(),
    });
    const ring = res?.stages[0]?.sol?.boosters;
    expect(ring, "no ring on the launch stage").toBeTruthy();
    expect(ring?.part.column, "the ring is not a liquid column").toBeTruthy();
  }, 300_000);

  it("gets no ring at all when they are not", async () => {
    const res = await planMission(
      { ...solidFree(base.input), boosters: false },
      { onYield: () => Promise.resolve() },
    );
    expect(res, "the mission stopped solving").toBeTruthy();
    expect(res?.stages[0]?.sol?.boosters ?? null).toBeNull();
  }, 300_000);
});
