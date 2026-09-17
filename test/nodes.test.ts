import { describe, it, expect } from "vitest";
import nodes from "../src/data/nodes.json";
import geometry from "../src/data/geometry.json";
import parts from "../src/data/parts.json";
import structure from "../src/data/structure.json";
import couplers from "../src/data/couplers.json";
import power from "../src/data/power.json";

/* nodes.json is what a .craft writer stands a rocket up with: each part's
   config name and where its nodes sit. These hold the file to the tables it
   serves and to the geometry it has to agree with, so a regeneration that
   drops a part or moves a node against the drag cube says so here. #461 */

type Node = { p: [number, number, number]; d: number[]; s: number };
type Entry = {
  name: string;
  nodes: Record<string, Node>;
  attach: Node | null;
  rules: number[] | null;
  resources: Record<string, number>;
  mass: number;
  command: boolean;
  via?: string;
};
type Art = "stock" | "restock";
const table = (art: Art) =>
  (nodes as unknown as Record<Art, Record<string, Entry>>)[art];

const titles = (): Array<string> => {
  const out: Array<string> = [];
  const walk = (x: unknown) => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") {
      const n = (x as { n?: unknown }).n;
      if (typeof n === "string") out.push(n);
      Object.values(x).forEach(walk);
    }
  };
  [parts, structure, couplers, power].forEach(walk);
  return out;
};

describe("the nodes table", () => {
  it.each(["stock", "restock"] as const)(
    "has an entry for every part the tables place (%s)",
    (art) => {
      const t = table(art);
      const missing = titles().filter((n) => !t[n]);
      expect(missing).toEqual([]);
    },
  );

  it("names every part the way a craft does: dots, never underscores", () => {
    for (const art of ["stock", "restock"] as const)
      for (const [title, e] of Object.entries(table(art))) {
        expect(e.name, title).toMatch(/^[A-Za-z0-9.-]+$/);
        expect(e.name, title).not.toContain("_");
      }
  });

  it("gives every stackable part a stack node, with top above bottom", () => {
    for (const art of ["stock", "restock"] as const)
      for (const [title, e] of Object.entries(table(art))) {
        if (e.rules?.[0] !== 1) continue;
        const ids = Object.keys(e.nodes);
        expect(ids.length, `${art} ${title} has no stack node`).toBeGreaterThan(
          0,
        );
        if (e.nodes.top && e.nodes.bottom)
          expect(
            e.nodes.top.p[1],
            `${art} ${title} top below bottom`,
          ).toBeGreaterThan(e.nodes.bottom.p[1]);
      }
  });

  it("puts a tank's nodes inside its box, a lip short of it", () => {
    /* A tank's drag cube is the whole tank, rim and end caps included; its
       stack nodes sit on the end faces. So the box is never shorter than the
       node span, and it is longer by the lip — 55 mm on the FL-T100, 63 on
       the FL-T400 — which is how far two stacked tanks overlap in the game.
       A craft writer places by node, not by box, or every tank floats a lip
       above the one below (#464). The adapter tanks that carry an engine
       mount past their bottom node are the named exceptions. */
    const tanks = new Set(
      (parts as { tanks: Array<{ n: string }> }).tanks.map((t) => t.n),
    );
    const mounts = new Set([
      "Kerbodyne Engine Cluster Adapter Tank",
      "Kerbodyne SIV Fuelled Engine Adapter",
    ]);
    const off: Array<string> = [];
    for (const art of ["stock", "restock"] as const) {
      const h = (geometry as Record<Art, { PART_H: Record<string, number> }>)[
        art
      ].PART_H;
      for (const [title, e] of Object.entries(table(art))) {
        if (!tanks.has(title) || !e.nodes.top || !e.nodes.bottom) continue;
        const box = h[title];
        if (box === undefined) continue;
        const span = e.nodes.top.p[1] - e.nodes.bottom.p[1];
        const lip = box - span;
        if (lip < -0.005 || (lip > 0.15 && !mounts.has(title)))
          off.push(`${art} ${title}: nodes ${span.toFixed(3)} box ${box}`);
      }
    }
    expect(off).toEqual([]);
  });

  it("carries a command part at each stack size, for the payload's place", () => {
    const r = table("restock");
    const roots = Object.values(r).filter((e) => e.command);
    const sizes = new Set(
      roots.map((e) => e.nodes.top?.s ?? e.nodes.bottom?.s),
    );
    expect(roots.length).toBeGreaterThanOrEqual(4);
    expect(
      [...sizes].filter((s) => s !== undefined).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("agrees with the part tables on what a full tank holds", () => {
    /* parts.json carries lf/ox/mono/xe per tank; nodes.json carries the
       config's RESOURCE maxAmounts. Two extractions of the same number. */
    const bad: Array<string> = [];
    for (const t of (
      parts as {
        tanks: Array<{
          n: string;
          lf: number;
          ox: number;
          mono: number;
          xe: number;
        }>;
      }
    ).tanks) {
      const e = table("restock")[t.n];
      if (!e) continue;
      const want: Record<string, number> = {
        LiquidFuel: t.lf,
        Oxidizer: t.ox,
        MonoPropellant: t.mono,
        XenonGas: t.xe,
      };
      for (const [k, v] of Object.entries(want))
        if ((e.resources[k] ?? 0) !== v)
          bad.push(`${t.n} ${k}: tables ${v}, config ${e.resources[k] ?? 0}`);
    }
    /* ReStock+ rebalances the Oscar-B into its Oscar family — 8.1/9.9 where
       stock holds 18/22 — and parts.json carries stock's. A per-art resource
       is #468; until then the one known disagreement is named here so a
       second one still fails. */
    const known = new Set([
      "Oscar-B Fuel Tank LiquidFuel: tables 18, config 8.1",
      "Oscar-B Fuel Tank Oxidizer: tables 22, config 9.9",
    ]);
    expect(bad.filter((b) => !known.has(b))).toEqual([]);
    expect(
      bad.filter((b) => known.has(b)).length,
      "the Oscar-B agrees now; drop the exception",
    ).toBe(2);
  });
});
