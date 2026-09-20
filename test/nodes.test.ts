import { describe, it, expect } from "vitest";
import nodes from "../src/data/nodes.json";
import geometry from "../src/data/geometry.json";
import parts from "../src/data/parts.json";
import type { Tank } from "../src/core/catalogue.js";
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
  tech: string | null;
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

  it("names every part's tech by an id the tree has, and offers a command part only where it is researched", async () => {
    const { DATA } = await import("../src/core/catalogue.js");
    const ids = new Map(
      Object.entries(DATA.nodes).map(([title, n]) => [n.id, title]),
    );
    /* tech.json carries the config's id beside the tree's title, one each. */
    expect(ids.size).toBe(Object.keys(DATA.nodes).length);
    for (const art of ["stock", "restock"] as const)
      for (const [title, e] of Object.entries(table(art)))
        if (e.tech !== null)
          expect(ids.has(e.tech), `${title} needs ${e.tech}`).toBe(true);
    /* Brian's tier-6 career warned of a missing part: the root was an
       RC-001S, which is Advanced Unmanned Tech (#467). With that roster the
       Stayputnik (Basic Science) is offered and the RC-001S is not; with no
       roster, every command part is. */
    const { commandParts } = await import("../src/core/nodes.js");
    const titles = (r: ReturnType<typeof commandParts>) => r.map(([t]) => t);
    const roster = new Set(["Start", "Basic Science", "Unmanned Tech"]);
    const offered = titles(commandParts(roster));
    expect(offered).toContain("Probodobodyne Stayputnik");
    expect(offered).not.toContain("RC-001S Remote Guidance Unit");
    expect(titles(commandParts()).length).toBeGreaterThan(offered.length);
    expect(titles(commandParts(new Set()))).toEqual([]);
  });

  it("agrees with the part tables on what a full tank holds, in each art", async () => {
    /* parts.json carries lf/ox/mono/xe per tank, stock's numbers with a
       `restock` block where ReStock rebalances the part; nodes.json carries
       each art's config RESOURCE maxAmounts. `tanksInArt` is what the solver
       reads, so it is what is compared. The Oscar-B was the one known
       disagreement until #468 gave it its ReStock row. */
    const { tanksInArt } = await import("../src/core/parts.js");
    const raw = (parts as { tanks: Array<Tank> }).tanks;
    const bad: Array<string> = [];
    for (const [art, e] of [
      ["stock", { mh: false, rs: false }],
      ["restock", { mh: false, rs: true }],
    ] as const) {
      for (const t of tanksInArt(raw, e)) {
        const entry = table(art)[t.n];
        if (!entry) continue;
        const want: Record<string, number> = {
          LiquidFuel: t.lf,
          Oxidizer: t.ox,
          MonoPropellant: t.mono,
          XenonGas: t.xe,
        };
        for (const [k, v] of Object.entries(want))
          if ((entry.resources[k] ?? 0) !== v)
            bad.push(
              `${art} ${t.n} ${k}: tables ${v}, config ${entry.resources[k] ?? 0}`,
            );
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("topless", () => {
  /* The nose-cone tanks have no top node and the game will not stack under
     them; the pool leaves them out (core/tanks.ts). #467 */
  it("names the tanks nothing can stand on, and no others", async () => {
    const { topless } = await import("../src/core/nodes.js");
    expect(topless("FL-C1000 Fuel Tank")).toBe(true);
    expect(topless("Kerbodyne S3-3600 Nosecone")).toBe(true);
    expect(topless("FL-T400 Fuel Tank")).toBe(false);
    expect(topless("Rockomax Jumbo-64 Fuel Tank")).toBe(false);
    expect(topless("no such part")).toBe(false);
  });
});

describe("variantNodes", () => {
  /* A plate's shroud length moves its bottom node; the craft hangs the stage
     below from the variant it is written in (core/craft.ts). #467 */
  it("carries every engine plate's bottom node by shroud variant", () => {
    for (const art of ["stock", "restock"] as const) {
      const table = nodes[art] as unknown as Record<
        string,
        Entry & { variantNodes?: Record<string, Record<string, Node>> }
      >;
      for (const title of Object.keys(table).filter((t) =>
        / Engine Plate$/.test(t),
      )) {
        const vn = table[title].variantNodes;
        expect(vn, `${art} ${title}`).toBeDefined();
        expect(vn!.Short.bottom.p[1]).toBeLessThan(0);
        expect(vn!.Long.bottom.p[1]).toBeLessThan(vn!.Short.bottom.p[1]);
      }
    }
  });
});
