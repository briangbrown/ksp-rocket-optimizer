import { describe, it, expect } from "vitest";
import { DATA } from "../src/core/catalogue.js";
import { offered } from "../src/core/constants.js";
import couplers from "../src/data/couplers.json";
import structure from "../src/data/structure.json";
import tech from "../src/data/tech.json";

/* Every part is behind a tech node the tree has, with a price. A part with no
   node used to be offered at every tier — seventeen Making History tanks
   were, because their rows were filled in from outside the install the
   configs came from (#191). Their nodes and prices are from their configs now
   (`TechRequired`, `cost`), the gates fail closed, and a row arriving without
   a node fails the build here rather than showing up everywhere. */

const nodes = new Set(Object.keys((tech as { nodes?: object }).nodes ?? tech));

describe("the part data", () => {
  it("puts every part behind a node the tree has, and a price on every tank", () => {
    const parts: Array<{ kind: string; n: string; t: string | null }> = [
      ...DATA.engines.map((e) => ({ kind: "engine", n: e.n, t: e.t })),
      ...DATA.tanks.map((t) => ({ kind: "tank", n: t.n, t: t.t })),
      ...couplers.COUPLERS.map((c) => ({ kind: "coupler", n: c.n, t: c.t })),
      ...Object.entries(structure).flatMap(([kind, list]) =>
        (list as Array<{ n: string; t: string | null }>).map((x) => ({
          kind,
          n: x.n,
          t: x.t,
        })),
      ),
    ];
    const missing = parts
      .filter((p) => !p.t)
      .map((p) => p.n)
      .sort();
    expect(missing).toEqual([]);
    const unknown = parts
      .filter((p) => p.t && !nodes.has(p.t))
      .map((p) => `${p.kind} ${p.n}: ${p.t}`);
    expect(unknown).toEqual([]);
    /* And every tank is priced: the same seventeen had no cost either. */
    const unpriced = DATA.tanks
      .filter((t) => t.cost === undefined)
      .map((t) => t.n);
    expect(unpriced).toEqual([]);
  });
});

/* ReStock+ ships stand-ins for Making History parts — a Caravel where the
   expansion would have a Skiff — and hides them itself the moment the
   expansion is installed: `MHReplacement = True` in the part, and a patch
   (`ReStockPlus/Patches/MakingHistoryPartHiding.cfg`) that sets `TechHidden`
   and `category = none` on every such part `:NEEDS[SquadExpansion/MakingHistory]`.
   With both expansions ticked the app was offering all of them, and a
   Kerbol fly-by was built on an engine that is not in the game. The rows
   carry `mhr` now, read from the merged ModuleManager cache of an install
   with both mods; this is that list, so a re-extraction that drops or adds
   one is seen. */
const HIDDEN_UNDER_MH = [
  "FL-S1200 Liquid Fuel Tank",
  "FL-X1800 Liquid Fuel Tank",
  "FL-X220 Liquid Fuel Tank",
  "FL-X440 Liquid Fuel Tank",
  "FL-X900 Liquid Fuel Tank",
  "FL-XA1200 Fuel Tank Adapter",
  "FL-XA160 Fuel Tank Adapter",
  "FL-XA160-S Fuel Tank Adapter",
  "FL-XA600 Fuel Tank Adapter",
  "Kerbodyne SAIV Liquid Fuel Tank Adapter",
  "Kerbodyne SIV Fuelled Engine Adapter",
  "Kerbodyne SIV-128K Liquid Fuel Tank",
  "Kerbodyne SIV-256K Liquid Fuel Tank",
  "Kerbodyne SIV-512K Liquid Fuel Tank",
  "Kerbodyne SIV-64K Liquid Fuel Tank",
  "RK-1 'Trash Panda' Vernier Engine",
  "RK-107 'Ursa' Liquid Fuel Engine",
  "TCK-2 'Castor' Solid Rocket Booster",
  "UR-1 'Galleon' Liquid Fuel Engine",
  "UR-137 'Schnauzer' Liquid Fuel Engine",
  "UR-2 'Caravel' Liquid Fuel Engine",
];

describe("the parts ReStock+ hides under Making History", () => {
  const rows = [...DATA.engines, ...DATA.tanks];
  it("are exactly the flagged rows, every one a ReStock+ part", () => {
    const flagged = rows.filter((p) => p.mhr);
    expect(flagged.map((p) => p.n).sort()).toEqual(HIDDEN_UNDER_MH);
    expect(flagged.filter((p) => !p.rs).map((p) => p.n)).toEqual([]);
  });
  it("are offered without the expansion and never with it", () => {
    const caravel = rows.find((p) => /Caravel/.test(p.n))!;
    expect(offered(caravel, { mh: false, rs: true })).toBe(true);
    expect(offered(caravel, { mh: true, rs: true })).toBe(false);
    expect(offered(caravel, { mh: true, rs: false })).toBe(false);
    expect(offered(caravel, { mh: false, rs: false })).toBe(false);
    /* A core caller with no expansions to speak of takes everything, as the
       coupler gate always has. */
    expect(offered(caravel, null)).toBe(true);
  });
  it("leaves the plates to whichever expansion is present", () => {
    /* Both mods ship the plates, so one row carries both flags and either
       expansion offers it; without either there are no plates in the game. */
    const plates = couplers.COUPLERS.filter((c) => c.plate);
    const under = (x: { mh: boolean; rs: boolean }) =>
      [...new Set(plates.filter((c) => offered(c, x)).map((c) => c.n))].sort();
    const all = ["EP-12", "EP-18", "EP-25", "EP-37", "EP-50"].map(
      (n) => `${n} Engine Plate`,
    );
    expect(under({ mh: true, rs: true })).toEqual(all);
    expect(under({ mh: true, rs: false })).toEqual(all);
    expect(under({ mh: false, rs: true })).toEqual(all);
    expect(under({ mh: false, rs: false })).toEqual([]);
    expect(plates.filter((c) => "mhr" in c)).toEqual([]);
  });
  it("names a stock or Making History part everywhere else", () => {
    const stock = rows.filter((p) => !p.mh && !p.rs);
    expect(stock.filter((p) => p.mhr)).toEqual([]);
    for (const p of stock)
      expect(offered(p, { mh: false, rs: false })).toBe(true);
  });
});

/* parts.json is stock's numbers with a `restock` block where ReStock
   rebalances a part, and `tanksInArt` applies it by the rule `useArt` picks
   the geometry tables with. nodes.json is read off each art's ConfigCache,
   so the two agree on what a tank holds and weighs — the Oscar-B did not,
   for one art or the other, until #468. */
describe("a tank holds what the install says, in each art", () => {
  const UNIT: Record<string, number> = {
    LiquidFuel: 0.005,
    Oxidizer: 0.005,
    MonoPropellant: 0.004,
    XenonGas: 0.0001,
  };
  it("propellant and dry mass, for every tank the pools can hold", async () => {
    const { tanksInArt } = await import("../src/core/parts.js");
    const { topless } = await import("../src/core/nodes.js");
    const nodes = (await import("../src/data/nodes.json"))
      .default as unknown as Record<
      "stock" | "restock",
      Record<string, { resources: Record<string, number>; mass: number }>
    >;
    const bad: Array<string> = [];
    for (const [art, e] of [
      ["stock", { mh: false, rs: false }],
      ["restock", { mh: false, rs: true }],
    ] as const)
      for (const t of tanksInArt(DATA.tanks, e)) {
        if (topless(t.n)) continue;
        const entry = nodes[art][t.n];
        if (!entry) continue;
        const cap = Object.entries(entry.resources).reduce(
          (a, [k, v]) => a + v * (UNIT[k] ?? 0),
          0,
        );
        if (Math.abs(cap - t.prop) > 1e-3)
          bad.push(
            `${art} ${t.n}: prop ${t.prop} against ${cap.toFixed(4)} held`,
          );
        if (Math.abs(entry.mass - t.dry) > 1e-3)
          bad.push(
            `${art} ${t.n}: dry ${t.dry} against ${entry.mass} in the install`,
          );
      }
    expect(bad).toEqual([]);
  });
  it("keeps a stock roster's identity and memoises the ReStock one", async () => {
    const { tanksInArt } = await import("../src/core/parts.js");
    const stock = tanksInArt(DATA.tanks, { mh: false, rs: false });
    expect(stock).toBe(DATA.tanks);
    const rs = tanksInArt(DATA.tanks, { mh: false, rs: true });
    expect(rs).not.toBe(DATA.tanks);
    expect(tanksInArt(DATA.tanks, null)).toBe(rs);
    const oscar = rs.find((t) => t.n === "Oscar-B Fuel Tank")!;
    expect(oscar).toMatchObject({
      prop: 0.09,
      dry: 0.01125,
      lf: 8.1,
      ox: 9.9,
      cost: 18,
    });
    expect(DATA.tanks.find((t) => t.n === "Oscar-B Fuel Tank")!.prop).toBe(0.2);
  });
});
