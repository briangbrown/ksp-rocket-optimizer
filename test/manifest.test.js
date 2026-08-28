import { describe, it, expect } from "vitest";
import { solveGroup } from "../src/core/solver.js";
import {
  manifestCost,
  manifestCount,
  manifestMass,
} from "../src/core/manifest.js";
import { stageCost, stageParts } from "../src/core/performance.js";
import { cases } from "./grid.js";

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

describe("the stage manifest", () => {
  it("accounts for every part's mass, cost and count", async () => {
    const bad = [];
    for (const c of cases()) {
      const res = solveGroup(c.input);
      if (!res) continue;
      res.chain.forEach((link, i) => {
        const sol = link.sol;
        if (!sol) return;
        const where = `${c.name} stage ${i}`;

        /* Every part's dry mass, which is not `sol.dry`: that is the mass at
           burnout, and radial boosters have staged away by then. Taking the
           propellant out of the ignition mass leaves the hardware, boosters
           included, and works for both the plain and the boosted branch. */
        const own = sol.total - sol.prop - link.payloadIn;
        const m = manifestMass(sol);
        if (Math.abs(m - own) > MASS_EPS)
          bad.push(
            `${where}: dry mass ${own.toFixed(4)} t but its parts weigh ${m.toFixed(4)} t (${(m - own >= 0 ? "+" : "") + (m - own).toFixed(4)})`,
          );

        const cost = stageCost(sol);
        const mc = manifestCost(sol);
        if (Math.abs(mc - cost) > 0.5)
          bad.push(
            `${where}: cost ${cost.toFixed(0)} but its parts cost ${mc.toFixed(0)}`,
          );

        const parts = stageParts(sol);
        const mn = manifestCount(sol);
        if (mn !== parts)
          bad.push(`${where}: ${parts} parts counted but ${mn} listed`);
      });
    }
    expect(bad).toEqual([]);
  }, 300_000);
});
