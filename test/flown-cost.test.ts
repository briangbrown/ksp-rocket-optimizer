import { describe, it, expect } from "vitest";
import { sustainerHolds } from "../src/core/solver.js";
import { ascentShareOf, planMission } from "../src/core/plan.js";
import { buildRoute } from "../src/core/orbits.js";
import { missionCases } from "./grid.js";
import type { Leg } from "../src/core/orbits.js";

/* The three faults one Minmus design showed at once (#167, #168, #169): a
   sustainer that stalled after separation was admitted, a flown ascent was
   compared against a whole segment's Δv, and the cheapest objective came
   back dearer than the lightest. Each is held here in the smallest terms it
   can be. */

describe("the sustainer guard", () => {
  /* Six Hammers on a Mainsail: 187.5 t at 1.40 for 24 s, then the Mainsail
     alone at 0.88 on 155 t — the design behind #168. Thrust in kN, mass in
     tonnes, as the solver has them. */
  const thrustA = 6 * 198 + 1379.5;
  const thrustC = 1379.5;
  it("refuses a core under one that the boosters left slow", () => {
    const h = sustainerHolds(thrustA, thrustC, 187.5, 159.4, 154.9, 24, 9.81);
    expect(h.twrSep).toBeCloseTo(0.91, 1);
    expect(h.vSep).toBeLessThan(250);
    expect(h.ok).toBe(false);
  });
  it("allows the same core when the boost has made it fast", () => {
    /* The same masses on a booster that burns four times as long. */
    const h = sustainerHolds(thrustA, thrustC, 187.5, 159.4, 154.9, 100, 9.81);
    expect(h.vSep).toBeGreaterThan(250);
    expect(h.ok).toBe(true);
  });
  it("allows a core that holds itself up, however slow", () => {
    const h = sustainerHolds(thrustA, 1600, 187.5, 159.4, 154.9, 24, 9.81);
    expect(h.twrSep).toBeGreaterThan(1);
    expect(h.ok).toBe(true);
  });
  it("never allows a core under the floor", () => {
    const h = sustainerHolds(thrustA, 1200, 187.5, 159.4, 154.9, 200, 9.81);
    expect(h.twrSep).toBeLessThan(0.85);
    expect(h.ok).toBe(false);
  });
});

describe("the ascent's share of a group", () => {
  it("is the ascent legs alone, with the margin", () => {
    const legs = [
      { kind: "ascent", dv: 3400 },
      { kind: "transfer", dv: 930 },
      { kind: "capture", dv: 160 },
    ] as unknown as ReadonlyArray<Leg>;
    expect(ascentShareOf(legs, 10)).toBeCloseTo(3740, 6);
    expect(ascentShareOf(legs.slice(1), 10)).toBe(0);
  });
});

describe("the objectives", () => {
  /* Cheapest must never be dearer than lightest, nor fewest parts more than
     lightest: the plan is delivered from whichever measures better on the
     objective asked for. Minmus at 6.5 t with a cut after the descent is
     the case from #169, where cheapest came back 6,526 funds dearer. */
  const base = missionCases()[0].input;
  const route = buildRoute("Minmus", "land", true, "Kerbin", true, false);
  const cutAfterDescent = route.findIndex((l) => /descent/i.test(l.label));
  const plan = (objective: "mass" | "cost" | "parts") =>
    planMission(
      { ...base, route, cuts: [cutAfterDescent], payload: 6.5, objective },
      { onYield: () => Promise.resolve() },
    );
  const sum = (
    p: Awaited<ReturnType<typeof plan>>,
    f: (s: { cost: number; parts: number; total: number }) => number,
  ) => p!.stages.reduce((a, s) => a + (s.sol ? f(s.sol) : 0), 0);
  it("deliver cheapest no dearer, and fewest parts no more, than lightest", async () => {
    const [mass, cost, parts] = await Promise.all([
      plan("mass"),
      plan("cost"),
      plan("parts"),
    ]);
    expect(mass && cost && parts, "a plan came back empty").toBeTruthy();
    expect(sum(cost, (s) => s.cost)).toBeLessThanOrEqual(
      sum(mass, (s) => s.cost) + 1e-6,
    );
    expect(sum(parts, (s) => s.parts)).toBeLessThanOrEqual(
      sum(mass, (s) => s.parts) + 1e-6,
    );
  }, 600_000);
});
