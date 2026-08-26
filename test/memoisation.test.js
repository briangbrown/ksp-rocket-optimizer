import { describe, it, expect } from "vitest";
import { couplerFor } from "../src/core/parts.js";
import { fitStructure } from "../src/core/tanks.js";
import { ispAt } from "../src/core/performance.js";
import { DATA } from "../src/core/catalogue.js";
import { withDeps } from "../src/core/tech.js";

/* The solver caches results in several places. Every one of them is a chance to
   answer for the wrong roster, and the design snapshot cannot catch it — the
   grid never toggles an expansion and never excludes a part, so a cache keyed
   on too little passes it byte-identical.

   That is exactly how #18 survived: a cache that ignored its argument, invisible
   because nothing exercised the code it broke. These tests exercise it. */

const all = () => withDeps(DATA.nodes, new Set(Object.keys(DATA.nodes)));
const spark = DATA.engines.find((e) => e.n.includes("Spark"));
const thumper = DATA.engines.find((e) => e.n.includes("Thumper"));

describe("couplerFor cache", () => {
  it("answers per expansions, with the roster objects unchanged", () => {
    /* The case that matters: toggling ReStock+ in the UI replaces `expansions`
       but leaves the `unlocked` and `excluded` Sets alone. A cache keyed on
       those two identities alone serves the previous answer. */
    const unlocked = all();
    const excluded = new Set();
    const rs = { mh: false, rs: true };
    const noRs = { mh: false, rs: false };

    expect(couplerFor(spark, 2, unlocked, excluded, false, rs).n).toBe(
      "EP-12 Engine Plate",
    );
    expect(couplerFor(spark, 2, unlocked, excluded, false, noRs)).toBeNull();
    /* and back, so a stale entry in either direction fails */
    expect(couplerFor(spark, 2, unlocked, excluded, false, rs).n).toBe(
      "EP-12 Engine Plate",
    );

    expect(couplerFor(thumper, 2, unlocked, excluded, false, rs).n).toBe(
      "EP-18 Engine Plate",
    );
    expect(couplerFor(thumper, 2, unlocked, excluded, false, noRs).n).toBe(
      "TVR-200 Stack Bi-Coupler",
    );
  });

  it("answers per excluded set", () => {
    const unlocked = all();
    const none = new Set();
    const banned = new Set(["TVR-200 Stack Bi-Coupler"]);
    const noRs = { mh: false, rs: false };

    const before = couplerFor(thumper, 2, unlocked, none, false, noRs);
    expect(before.n).toBe("TVR-200 Stack Bi-Coupler");
    const after = couplerFor(thumper, 2, unlocked, banned, false, noRs);
    expect(after && after.n).not.toBe("TVR-200 Stack Bi-Coupler");
  });

  it("answers per noPlate", () => {
    const unlocked = all();
    const excluded = new Set();
    const rs = { mh: false, rs: true };
    expect(couplerFor(thumper, 2, unlocked, excluded, false, rs).n).toBe(
      "EP-18 Engine Plate",
    );
    expect(
      couplerFor(thumper, 2, unlocked, excluded, true, rs).n,
    ).not.toContain("Engine Plate");
  });
});

describe("fitStructure cache", () => {
  const tanks = (unlocked) =>
    DATA.tanks.filter((t) => (!t.t || unlocked.has(t.t)) && !t.mh && !t.rs);

  it("answers per expansions, with the roster objects unchanged", () => {
    const unlocked = all();
    const excluded = new Set();
    const tk = tanks(unlocked);
    const base = {
      engine: thumper,
      n: 2,
      stackD: 1.25,
      tanks: tk,
      unlocked,
      excluded,
    };

    const withRs = fitStructure({
      ...base,
      expansions: { mh: false, rs: true },
    });
    const noRs = fitStructure({
      ...base,
      expansions: { mh: false, rs: false },
    });
    expect(withRs && withRs.coup && withRs.coup.n).not.toBe(
      noRs && noRs.coup && noRs.coup.n,
    );
  });

  it("answers per roster", () => {
    const early = withDeps(
      DATA.nodes,
      new Set(
        Object.entries(DATA.nodes)
          .filter(([, v]) => v.lvl <= 3)
          .map(([k]) => k),
      ),
    );
    const late = all();
    const exp = { mh: false, rs: false };

    /* Same engine and geometry, two rosters. The early one cannot have every
       decoupler the late one does, so the fitted structure differs. */
    const a = fitStructure({
      engine: thumper,
      n: 1,
      stackD: 2.5,
      tanks: tanks(early),
      unlocked: early,
      excluded: new Set(),
      expansions: exp,
    });
    const b = fitStructure({
      engine: thumper,
      n: 1,
      stackD: 2.5,
      tanks: tanks(late),
      unlocked: late,
      excluded: new Set(),
      expansions: exp,
    });
    expect(a && a.dec.n).not.toBe(b && b.dec.n);
  });

  it("answers per stage flags", () => {
    const unlocked = all();
    const tk = tanks(unlocked);
    const base = {
      engine: thumper,
      n: 2,
      stackD: 1.25,
      tanks: tk,
      unlocked,
      excluded: new Set(),
      expansions: { mh: false, rs: false },
    };
    /* plateAbove zeroes the decoupler count; if the flag were missing from the
       key the second call would return the first's answer. */
    const normal = fitStructure({ ...base, plateAbove: false });
    const plated = fitStructure({ ...base, plateAbove: true });
    expect(normal.dec.qty).toBeGreaterThan(0);
    expect(plated.dec.qty).toBe(0);
  });
});

describe("ispAt cache", () => {
  it("answers per pressure", () => {
    const e = DATA.engines.find((x) => x.n.includes("Thumper"));
    const vac = ispAt(e, 0);
    const sea = ispAt(e, 1);
    expect(sea).toBeLessThan(vac);
    expect(ispAt(e, 0)).toBe(vac); // cached value still correct
    expect(ispAt(e, 1)).toBe(sea);
  });

  it("answers per engine", () => {
    const a = DATA.engines.find((x) => x.n.includes("Spark"));
    const b = DATA.engines.find((x) => x.n.includes("Thumper"));
    expect(ispAt(a, 0.5)).not.toBe(ispAt(b, 0.5));
  });
});
