import { describe, it, expect } from "vitest";
import { DATA } from "../src/core/catalogue.js";
import { isLifting } from "../src/core/parts.js";
import { poolsFor } from "../src/core/tanks.js";

/* The Mk2 and Mk3 fuselages are ovals with lift. They stack, but every radial
   rule takes a tank for a cylinder, so they are never packed round a column,
   never a column or a drop tank, and nothing radial bolts to one: the pools
   keep them in groups of their own, flagged, and the solver's radial paths
   pass those groups by. #467 */
describe("lifting bodies", () => {
  it("are the Mk2 and Mk3 parts, and only those", () => {
    const lifting = DATA.tanks.filter(isLifting).map((t) => t.n);
    expect(lifting.length).toBeGreaterThan(4);
    for (const n of lifting) expect(n).toMatch(/Mk[23]/);
    for (const t of DATA.tanks)
      if (/^Mk[23] .*Fuselage/.test(t.n)) expect(isLifting(t), t.n).toBe(true);
  });
  it("sit in pool groups of their own, flagged", () => {
    let flagged = 0;
    for (const e of DATA.engines)
      for (const pool of poolsFor(e, DATA.tanks)) {
        const kinds = new Set(pool.usable.map((t) => isLifting(t)));
        expect(kinds.size, `${e.n}: a mixed group`).toBe(1);
        expect(pool.lifting).toBe(isLifting(pool.usable[0]));
        if (pool.lifting) flagged++;
      }
    expect(flagged).toBeGreaterThan(0);
  });
});
