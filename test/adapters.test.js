import { describe, it, expect } from "vitest";
import { adapterChain, adapterGraph, fitStructure } from "../src/core/tanks.js";
import { DATA } from "../src/core/catalogue.js";
import { withDeps } from "../src/core/tech.js";

/* The adapter subsystem.

   None of this was covered, and it was broken in two independent ways at once
   — the chain was asked for backwards, and the caches never noticed a change of
   roster. Between them the whole thing was inert: no design in the snapshot
   carried an adapter, so nothing failed and nothing looked wrong.

   These tests are the ones that would have caught it. */

const tierUnlocks = (lvl) =>
  withDeps(
    DATA.nodes,
    new Set(
      Object.entries(DATA.nodes)
        .filter(([, v]) => v.lvl <= lvl)
        .map(([k]) => k),
    ),
  );

/* A fresh array each time: these caches are keyed on the array, so reusing one
   would be testing the cache rather than the roster. */
const tanksFor = (lvl) => {
  const unlocked = tierUnlocks(lvl);
  return DATA.tanks.filter(
    (t) => (!t.t || unlocked.has(t.t)) && !t.mh && !t.rs,
  );
};

describe("adapter chains", () => {
  /* Stock spans only. The parts bridging 1.25 -> 1.875 are all Making History
     or ReStock+, which the app excludes, so the stock graph is exactly
     0.625>1.25, 1.25>2.5 and 2.5>3.75. */
  it("spans narrow to wide, which is the only direction the graph is keyed", () => {
    const tanks = tanksFor(9);
    const up = adapterChain(tanks, 1.25, 2.5);
    expect(up).not.toBeNull();
    expect(up.parts.length).toBeGreaterThan(0);
    expect(up.dry).toBeGreaterThan(0);

    /* Asked the other way round it returns the empty sentinel rather than
       searching. `fitStructure` used to call it exactly like this, which is why
       it never fitted an adapter to anything. */
    const down = adapterChain(tanks, 2.5, 1.25);
    expect(down.parts).toEqual([]);
    expect(down.dry).toBe(0);
  });

  it("chains hops when no single part spans the gap", () => {
    const chain = adapterChain(tanksFor(9), 0.625, 3.75);
    expect(chain).not.toBeNull();
    expect(chain.parts.length).toBe(3); // 0.625 -> 1.25 -> 2.5 -> 3.75
  });

  it("returns null when nothing spans the gap", () => {
    expect(adapterChain(tanksFor(9), 0.625, 4.999)).toBeNull();
  });
});

describe("roster changes invalidate the caches", () => {
  it("finds an adapter for a roster that has one, after a roster that did not", () => {
    /* Order is the whole point. Tier 3 has no adapter-capable tanks at all, so
       it populates the graph with nothing. Before the fix that empty graph was
       cached in a bare `let` and reused for every later roster — and an empty
       Map is truthy, so it was never rebuilt. Tier 9 then found no chain for a
       span it plainly covers. */
    const early = tanksFor(3);
    expect(adapterGraph(early).size).toBe(0);
    expect(adapterChain(early, 0.625, 1.25)).toBeNull();

    const late = tanksFor(9);
    expect(adapterGraph(late).size).toBeGreaterThan(0);

    const chain = adapterChain(late, 0.625, 1.25);
    expect(chain).not.toBeNull();
    expect(chain.parts.length).toBeGreaterThan(0);
  });

  it("keeps a separate chain memo per roster", () => {
    /* The memo was keyed on `from>to` alone, so the null cached for a roster
       without the part outlived that roster. */
    const early = tanksFor(3);
    const late = tanksFor(9);
    expect(adapterChain(early, 0.625, 1.25)).toBeNull();
    expect(adapterChain(late, 0.625, 1.25)).not.toBeNull();
    /* and back again — the tier-9 answer must not leak into tier 3 either */
    expect(adapterChain(early, 0.625, 1.25)).toBeNull();
  });
});

describe("fitStructure", () => {
  const unlocked = tierUnlocks(9);

  it("fits an adapter when the coupler is wider than the stack below it", () => {
    const tanks = tanksFor(9);
    /* A coupler wider than the tank below it needs something to span the two.
       Picking an engine that takes a coupler at all is what makes `under` come
       from the coupler rather than from the engine. */
    const engine = DATA.engines.find((e) => e.n.includes("Terrier"));
    expect(engine).toBeTruthy();

    const wide = fitStructure({
      engine,
      n: 2,
      stackD: 1.25,
      tanks,
      unlocked,
      excluded: new Set(),
    });
    /* Either it spans the gap or it refuses the build — what it must not do is
       silently connect mismatched diameters for free, which is what returning
       an empty chain for every call amounted to. */
    if (wide) {
      const spanned = wide.adapt.parts.length > 0;
      const noGapToSpan = wide.coup ? wide.coup.top <= 1.25 : true;
      expect(spanned || noGapToSpan).toBe(true);
    }
  });

  it("fits nothing when the engine is narrower than the stack", () => {
    const engine = DATA.engines.find((e) => e.n.includes("Spark"));
    const fit = fitStructure({
      engine,
      n: 1,
      stackD: 2.5,
      tanks: tanksFor(9),
      unlocked,
      excluded: new Set(),
    });
    expect(fit).toBeTruthy();
    expect(fit.adapt.parts).toEqual([]);
  });
});
