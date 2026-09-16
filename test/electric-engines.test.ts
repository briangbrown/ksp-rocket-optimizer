import { describe, it, expect } from "vitest";
import { planMission } from "../src/core/plan.js";
import { DATA } from "../src/core/catalogue.js";
import { sweepCases } from "./grid.js";

/* Electric propulsion is excluded on purpose, and this is what says so.

   A power plant is not modelled — no panels, no batteries, no generator, and
   nothing in a stage's mass or cost for any of them — so an ion engine sized
   here is an engine flying on power nobody paid for. The 420 s clock used to
   keep them out by accident, because the smallest xenon container empties
   through one Dawn in 834 s. #410 replaced that clock with an arc and the
   accident went with it: the mass objective answered Eeloo with fourteen ion
   engines burning for 25 minutes each.

   #415 is what lifts this, once the plant is priced and a many-revolution
   burn costs the spiral Δv it actually costs. Until then, red here is the
   exclusion having come undone again.

   The guard is pinned by the mission below rather than by a bare pool. An
   ion-only pool produces nothing whether the guard is there or not — a stack
   of 0.625 m xenon containers under a real payload fails for several reasons
   at once — so a test written that way would pass without testing anything,
   which is the trap V4 in docs/lessons is about. */

const ion = DATA.engines.find((e) => e.f.includes("Xe"))!;
const xeTanks = DATA.tanks.filter((t) => t.xe > 0);

describe("an engine the solver cannot supply power for", () => {
  it("is in the catalogue, with tanks and a tech node", () => {
    /* The exclusion is the solver's, not a gap in the data — if this fails,
       the reason for the rest of the file has changed. */
    expect(ion.n).toMatch(/Dawn/);
    expect(xeTanks.length).toBeGreaterThan(0);
    expect(ion.iv).toBeGreaterThan(4000);
  });

  it("is never delivered, on the objective that would otherwise want it", () => {
    /* Mass is the objective ions win on: they are 4,200 s of Isp against a
       Nerv's 800, and at 8,000 funds an engine the cost objective never looked
       at them. Eeloo is where the Δv is long enough for that to pay. */
    return (async () => {
      const c = sweepCases().find((x) => x.name === "Eeloo-pay2.5-cut")!;
      const p = await planMission({ ...c.input, objective: "mass" });
      const used = (p?.stages ?? [])
        .map((s) => s.sol?.engine.n)
        .filter((n): n is string => !!n);
      expect(used.length).toBeGreaterThan(3);
      expect(
        used.filter((n) => /Dawn/.test(n)),
        "an ion engine was delivered",
      ).toEqual([]);
    })();
  }, 300_000);
});
