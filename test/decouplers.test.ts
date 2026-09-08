import { describe, it, expect } from "vitest";
import structureData from "../src/data/structure.json";
import { DATA } from "../src/core/catalogue.js";
import { decouplerFor } from "../src/core/parts.js";
import { withDeps } from "../src/core/tech.js";

/* The stack decoupler is a stack part.

   `pickStruct` used to fall back, where no decoupler of the stack's own size
   was researched, to any decoupler with no diameter — and the parts with no
   diameter are the radial ones, so a 5 m Kerbodyne stack whose roster had no
   TD-37 was handed a TT-38K on price, a part with no stack node at all. The
   baselines could not see it: their rosters carry a decoupler at every size
   they use. This asks the picker, at every tier and every size class a part
   can present, for a part that has a diameter; the stack's own where one is
   researched; else the largest researched no wider than the stack, which is
   what a player puts under a tank too wide for their decouplers. #190 */

const tierUnlocks = (lvl: number) =>
  withDeps(
    DATA.nodes,
    new Set(
      Object.entries(DATA.nodes)
        .filter(([, v]) => v.lvl <= lvl)
        .map(([k]) => k),
    ),
  );
const SIZES = [0.625, 1.25, 1.875, 2.5, 3.75, 5];
const stack = structureData.decoupler.filter((x) => x.d != null);

describe("the stack decoupler", () => {
  for (let tier = 1; tier <= 9; tier++) {
    it(`is a stack part of the right size at tier ${tier}`, () => {
      const unlocked = tierUnlocks(tier);
      const researched = stack.filter((x) => !x.t || unlocked.has(x.t));
      for (const d of SIZES) {
        const dec = decouplerFor(unlocked, d, null);
        const where = `tier ${tier}, ${d} m`;
        expect(dec.d, `${where}: ${dec.n} has no stack node`).not.toBeNull();
        if (!researched.length) continue; // the stand-in, and nothing to hold it to
        const sizes = researched.map((x) => x.d as number);
        const want = sizes.includes(d)
          ? d
          : sizes.some((w) => w < d)
            ? Math.max(...sizes.filter((w) => w < d))
            : Math.min(...sizes);
        expect(dec.d, `${where}: got ${dec.n}`).toBe(want);
      }
    });
  }
});
