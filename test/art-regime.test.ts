import { describe, it, expect } from "vitest";
import geometryData from "../src/data/geometry.json";
import { PART_A, PART_H, useArt, widthOf } from "../src/core/geometry.js";
import { DATA } from "../src/core/catalogue.js";
import { solveGroup } from "../src/core/solver.js";
import { withDeps } from "../src/core/tech.js";

const tierUnlocks = (lvl: number) =>
  withDeps(
    DATA.nodes,
    new Set(
      Object.entries(DATA.nodes)
        .filter(([, v]) => v.lvl <= lvl)
        .map(([k]) => k),
    ),
  );

/* Which install the sizes come from.

   ReStock replaces the models of parts that already exist, so a part is a
   different size depending on whether it is installed — the Poodle presents
   4.853 m² to the airflow in a stock install and 2.899 in a ReStock one. Part
   availability already followed the checkboxes; the measurements did not, so
   unticking ReStock+ shrank the roster and left everything in it ReStock-sized.

   These are cheap because the tables are data. The expensive half — that a
   design actually changes — is the design snapshot, which is pinned to the
   default regime. #118 */

const RESTOCK = { mh: false, rs: true };
const STOCK = { mh: false, rs: false };

describe("the geometry tables", () => {
  it("carries one table per art regime, not one per mod", () => {
    expect(Object.keys(geometryData).sort()).toEqual(["restock", "stock"]);
  });

  /* ReStock+ parts do not exist without ReStock, so the stock table is smaller
     by exactly those. Anything else missing would be a hole. */
  it("measures every part the selection can reach", () => {
    const missing: Array<string> = [];
    for (const [regime, exp] of [
      ["stock", STOCK],
      ["restock", RESTOCK],
    ] as const) {
      useArt(exp);
      for (const e of DATA.engines) {
        if (e.rs && !exp.rs) continue;
        if (e.mh && !exp.mh) continue;
        /* The Nerv's cube is procedural in every install; it has no measured
           height anywhere and falls back by design. */
        if (e.n.includes("Nerv")) continue;
        if (PART_H(e.n) === undefined) missing.push(`${regime}: ${e.n}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("reads a different size when ReStock+ is off", () => {
    useArt(RESTOCK);
    const restock = PART_A('RE-L10 "Poodle" Liquid Fuel Engine');
    useArt(STOCK);
    const stock = PART_A('RE-L10 "Poodle" Liquid Fuel Engine');
    expect(restock).toBeCloseTo(2.899, 3);
    expect(stock).toBeCloseTo(4.853, 3);
    /* And that it reaches the number the solver actually uses. */
    useArt(STOCK);
    expect(widthOf({ n: 'RE-L10 "Poodle" Liquid Fuel Engine' }, 0)).toBeCloseTo(
      2.486,
      2,
    );
  });

  /* Making History adds parts and remodels nothing, so its engines are measured
     in both tables — drawn with whichever art is installed, because ReStock
     remodels 38 of its 69 parts. The Pollux is the case that mattered: a solid
     booster that fell through to a 2.0 m size-class guess. */
  it("measures the Making History engines in both regimes", () => {
    for (const exp of [STOCK, RESTOCK]) {
      useArt(exp);
      expect(PART_H('THK "Pollux"')).toBeGreaterThan(10);
      /* The Cub is radial, which is the case diaOf gets badly wrong: it would
         be charged 1.25 m across on the fallback. */
      expect(widthOf({ n: 'RV-1 "Cub"' }, 1.25)).toBeLessThan(0.6);
    }
  });

  /* The three ReStock cubes that do not describe their parts (#110, #112). The
     ReStock table carries the stock heights on purpose; reproducing a 25.1 m
     Mammoth faithfully would be wrong about the part. */
  it("does not reproduce the corrupt ReStock cubes", () => {
    for (const exp of [STOCK, RESTOCK]) {
      useArt(exp);
      expect(PART_H('S3 KS-25x4 "Mammoth" Liquid Fuel Engine')).toBeCloseTo(
        4.144,
        3,
      );
      /* 8.716, not the 8.707 #112 used: that was Size2LFB, the legacy model
         KSP hides with TechHidden, and the part you can actually place is
         Size2LFB_v2. The generator prefers the visible part. */
      expect(PART_H('LFB KR-1x2 "Twin-Boar" Liquid Fuel Engine')).toBeCloseTo(
        8.716,
        3,
      );
      expect(PART_H("CR-7 R.A.P.I.E.R. Engine")).toBeCloseTo(1.184, 3);
    }
  });

  /* Leave the module the way the rest of the suite expects to find it. */
  it("defaults to the regime the baselines were measured in", () => {
    useArt(null);
    expect(PART_A('RE-L10 "Poodle" Liquid Fuel Engine')).toBeCloseTo(2.899, 3);
  });
});

describe("a solve under each regime", () => {
  /* The cheap tests above prove the tables differ. This one proves the solver
     reads them: the same roster, the same budget, the same objective, and only
     the art regime changed. If this ever passes trivially — identical designs —
     the wiring has come loose and the checkboxes are cosmetic again. */
  it("designs a different rocket when only the art changes", () => {
    const unlocked = tierUnlocks(9);
    const engines = DATA.engines.filter(
      (e) => unlocked.has(e.t) && !e.mh && !e.rs,
    );
    const tanks = DATA.tanks.filter(
      (t) => (!t.t || unlocked.has(t.t)) && !t.mh && !t.rs,
    );
    const base = {
      dv: 5400,
      payload: 3.5,
      engines,
      tanks,
      unlocked,
      excluded: new Set<string>(),
      needGimbal: false,
      maxAspect: 12,
      asparagus: false,
      g: 9.81,
      kind: "launch" as const,
      bodyName: "Kerbin",
      boosters: true,
      srbs: engines.filter((e) => e.f.includes("SF") && e.fuelM > 0),
      objective: "mass" as const,
      minK: 1,
      maxK: 3,
    };
    const restock = solveGroup({
      ...base,
      expansions: { mh: false, rs: true },
    });
    const stock = solveGroup({ ...base, expansions: { mh: false, rs: false } });
    expect(restock, "the ReStock regime built nothing").toBeTruthy();
    expect(stock, "the stock regime built nothing").toBeTruthy();
    expect(JSON.stringify(stock)).not.toEqual(JSON.stringify(restock));
  });
});
