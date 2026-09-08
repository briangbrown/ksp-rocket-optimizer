import { describe, it, expect } from "vitest";
import { DATA } from "../src/core/catalogue.js";
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
