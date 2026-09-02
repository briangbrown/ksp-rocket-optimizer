import { describe, it, expect } from "vitest";
import { solveGroup } from "../src/core/solver.js";
import {
  manifest,
  manifestCost,
  manifestCount,
  manifestMass,
  manifestProp,
} from "../src/core/manifest.js";
import { stageCost, stageParts } from "../src/core/performance.js";
import { planMission } from "../src/core/plan.js";
import { asparagusInput, cases } from "./grid.js";
import type { Solution } from "../src/core/solution.js";

/* You have to be able to build the rocket you are shown.

   A stage's mass, its cost and its part count are three separate sums over the
   same set of parts, and three sums can disagree. They did: the parts table
   charged a coupler per column where the dry mass charged one per stage, and
   after #57 the packed brackets went the other way — mass and cost per column,
   count per stage. #60.

   `manifest` is the list of what is actually there. This holds the other three
   to it, so a stage whose mass does not match its own parts fails here rather
   than flying on paper and not in the game. */

/* Masses are sums of doubles in a different order, so exact equality is the
   wrong test; a tenth of a kilogram is far below any real discrepancy and far
   above the accumulation. The gaps this was written for run to 300 kg. */
const MASS_EPS = 1e-4;

/* The three sums against the one list, for a single stage.

   Factored out because two describes ask it now: the grid below, and an
   asparagus solve that the grid cannot reach. */
function disagreements(sol: Solution, payloadIn: number, where: string) {
  const bad: Array<string> = [];
  /* Every part's dry mass, which is not `sol.dry`: that is the mass at
     burnout, and radial boosters have staged away by then. Taking the
     propellant out of the ignition mass leaves the hardware, boosters
     included, and works for both the plain and the boosted branch. */
  const own = sol.total - sol.prop - payloadIn;
  const m = manifestMass(sol);
  if (Math.abs(m - own) > MASS_EPS)
    bad.push(
      `${where}: dry mass ${own.toFixed(4)} t but its parts weigh ${m.toFixed(4)} t (${(m - own >= 0 ? "+" : "") + (m - own).toFixed(4)})`,
    );

  const cost = stageCost(sol);
  const mc = manifestCost(sol);
  /* Finite before equal. Two NaNs are not within half a fund of each other, so
     the comparison below would catch a hole in both sums — but it would report
     it as a disagreement, which is the wrong story: they agree perfectly and
     are both wrong. #93 */
  if (!Number.isFinite(cost) || !Number.isFinite(mc))
    bad.push(`${where}: cost ${cost} against parts ${mc}`);
  else if (Math.abs(mc - cost) > 0.5)
    bad.push(
      `${where}: cost ${cost.toFixed(0)} but its parts cost ${mc.toFixed(0)}`,
    );

  const parts = stageParts(sol);
  const mn = manifestCount(sol);
  if (mn !== parts)
    bad.push(`${where}: ${parts} parts counted but ${mn} listed`);

  /* And the propellant, which is the axis that used to keep the parts table
     and the solver apart: the solver reasons on dry mass because the rocket
     equation needs burnout and ignition separately, while a tank you place in
     the VAB is full. It attributes to the parts holding it — tanks, an
     adapter's dead volume, a solid booster's own grain, a radial column's
     fuel — so one enumeration serves both readings and `wet` is just
     `dry + prop`. #62 */
  const mp = manifestProp(sol);
  if (Math.abs(mp - sol.prop) > MASS_EPS)
    bad.push(
      `${where}: ${sol.prop.toFixed(4)} t of propellant but its parts hold ${mp.toFixed(4)}`,
    );
  return bad;
}

describe("the stage manifest", () => {
  it("accounts for every part's mass, cost and count", async () => {
    const bad: Array<string> = [];
    for (const c of cases()) {
      const res = solveGroup(c.input);
      if (!res) continue;
      res.chain.forEach((link, i) =>
        bad.push(
          ...disagreements(link.sol, link.payloadIn, `${c.name} stage ${i}`),
        ),
      );
    }
    expect(bad).toEqual([]);
  }, 300_000);
});

/* Drop tanks, which nothing else reaches.

   They are only built when the user asks for asparagus, and neither baseline
   turns it on — so the stand-in part the pool synthesises for one was never
   priced, never summed, and never looked at. It carried no `cost` at all, and
   `undefined` in `stageCost`'s booster term made the whole stage cost NaN.
   Every comparison against NaN is false, so a drop-tank stage could not win
   the cost objective at any payload, and one that won on mass was delivered
   with a price the summary showed as an em-dash. #93

   Solved through `planMission` rather than `solveGroup`, because the pools are
   assembled inside `boostedAscent` and the walk is what delivers one. */
describe("a stage with drop tanks", () => {
  it("prices and counts what it is built from", async () => {
    const bad: Array<string> = [];
    let dropTanks = 0;
    for (const objective of ["mass", "cost"] as const) {
      const res = await planMission(asparagusInput(objective), {
        onYield: () => Promise.resolve(),
      });
      if (!res) continue;
      res.stages.forEach((s, i) => {
        if (!s.sol) return;
        if (s.sol.boosters?.part.dropTank) dropTanks++;
        bad.push(
          ...disagreements(s.sol, s.payloadIn, `${objective} stage ${i}`),
        );
      });
    }
    /* Not vacuous: without a drop tank in one of them this checks nothing the
       grid does not already. */
    expect(dropTanks, "no drop tank in either design").toBeGreaterThan(0);
    expect(bad).toEqual([]);
  }, 300_000);

  /* And the count against the rocket, not against the other sum.

     The test above ties `stageParts` to `manifestCount`, which is worth having
     and could not have caught #97: both charged a drop tank for an engine, so
     they agreed and were both one part per column too many. This pins one side
     to what is actually bolted on — the tanks and the decoupler holding them —
     so the parity check then forces the other. #97 */
  it("lists a drop tank as its tanks and a decoupler, and nothing else", async () => {
    const res = await planMission(asparagusInput("mass"), {
      onYield: () => Promise.resolve(),
    });
    const drops = (res?.stages ?? [])
      .map((s) => s.sol)
      .filter((sol) => sol?.boosters?.part.dropTank);
    expect(drops.length, "no drop tank in the design").toBeGreaterThan(0);

    const bad: Array<string> = [];
    for (const sol of drops) {
      const b = sol!.boosters!;
      const rows = manifest(sol);
      const qty = (role: string) =>
        rows.filter((r) => r.role === role).reduce((a, r) => a + r.qty, 0);
      /* There is no engine on a drop tank, so there is no part standing for
         one. The composite the pool synthesises is a fiction of the two-phase
         maths, not something you place in the VAB. */
      if (qty("booster") !== 0)
        bad.push(`${qty("booster")} drop-tank parts listed, expected none`);
      /* One decoupler each, and the column's tanks. */
      if (qty("booster-decoupler") !== b.n)
        bad.push(`${qty("booster-decoupler")} decouplers for ${b.n} columns`);
      const tanks = b.part.column ? b.n * b.part.column.count : 0;
      if (qty("booster-tank") !== tanks)
        bad.push(`${qty("booster-tank")} tanks listed, expected ${tanks}`);
    }
    expect(bad).toEqual([]);
  }, 300_000);
});
