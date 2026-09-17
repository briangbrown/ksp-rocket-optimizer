import { describe, it, expect } from "vitest";
import { planMission, MAX_K } from "../src/core/plan.js";
import { stageCost } from "../src/core/performance.js";
import { sweepCases } from "./grid.js";
import type { Plan, PlanInput } from "../src/core/plan.js";

/* The solver's own cut, where one span is not enough.

   Cut everywhere it could be, the sweep came out worse in 21 of 39 cases: a
   cut costs the stage that spanned it. Where the uncut plan has spent every
   one of the MAX_K stages a group may have, or finds nothing, the picture
   inverts — Tylo 3.5 t cut after the ascent is 22% lighter, 30% cheaper and
   34% fewer parts. So the
   mission is planned again cut after every climb to orbit only then, and the
   two are held to the objective asked for. #449 */

const on = (p: Plan, objective: PlanInput["objective"]) =>
  objective === "mass"
    ? p.stages[0].sol!.total
    : p.stages.reduce(
        (a, s) => a + (objective === "cost" ? stageCost(s.sol!) : s.sol!.parts),
        0,
      );
const tylo = (payload: number) => ({
  ...sweepCases().find((c) => c.name === "Tylo-pay3.5")!.input,
  payload,
});

describe("the solver's cut", () => {
  it("is placed after the climb where every stage was spent, and only where it pays", async () => {
    const input = tylo(3.5);
    const uncut = await planMission({ ...input, objective: "mass" }, {});
    /* Held to the uncut plan the caller would otherwise have got: the cut
       plan is delivered only where it measures better. */
    const plan = await planMission({ ...input, objective: "mass" });
    expect(plan).not.toBeNull();
    /* After the climb off Kerbin, and after the climb back off Tylo. */
    expect(plan!.autoCuts).toEqual([0, 7]);
    expect(plan!.stages.some((s) => s.key > 0)).toBe(true);
    expect(uncut).not.toBeNull();
  }, 600_000);

  it("hands back the caller's plan where the cut does not solve either", async () => {
    /* Tylo 12 t has no design uncut, and none cut: the upper groups solve
       and the launch group — 890 t to orbit — does not. The first
       measurement of #449 read the first solved stage and missed that. The
       plan the caller would have had is what comes back, with nothing
       claimed for the solver. */
    const plan = await planMission({ ...tylo(12), objective: "cost" });
    expect(plan).not.toBeNull();
    expect(plan!.autoCuts).toEqual([]);
    expect(plan!.stages.some((s) => !s.sol)).toBe(true);
  }, 600_000);

  it("leaves a mission alone that had stages to spare", async () => {
    const c = sweepCases().find((x) => x.name === "Duna-pay3.5")!;
    const plan = await planMission(c.input);
    expect(plan!.autoCuts).toEqual([]);
    expect(Math.max(...plan!.stages.map((s) => s.subCount))).toBeLessThan(
      MAX_K,
    );
  }, 600_000);

  it("never delivers the cut plan where the uncut one measures better", async () => {
    /* The comparison is what makes the fallback safe: the same Tylo brief on
       each objective, and whatever is delivered is no worse than the uncut
       plan on that objective. */
    for (const objective of ["mass", "cost", "parts"] as const) {
      const input = { ...tylo(3.5), objective };
      const plan = (await planMission(input))!;
      const uncut = (await planMission({ ...input, splitBy: [[0, MAX_K]] }))!;
      /* A forced count is keyed on the caller's groups, so it also turns
         the fallback off — which is how the uncut plan is asked for here. */
      expect(uncut.autoCuts).toEqual([]);
      expect(on(plan, objective)).toBeLessThanOrEqual(
        on(uncut, objective) + 1e-6,
      );
    }
  }, 1_200_000);
});
