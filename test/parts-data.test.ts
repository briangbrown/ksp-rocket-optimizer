import { describe, it, expect } from "vitest";
import { DATA } from "../src/core/catalogue.js";
import couplers from "../src/data/couplers.json";
import structure from "../src/data/structure.json";
import tech from "../src/data/tech.json";

/* Every part is behind a tech node the tree has, or it is named here. A part
   with no node used to be offered at every tier — seventeen Making History
   tanks were, because their rows were filled in from outside the install the
   configs came from (#191). The gates fail closed now, so a part in this list
   is not available at all; recording its node from its config (`TechRequired`
   in the .cfg) is what takes it off the list, and a new row arriving without
   one lands here and fails the build. */
const KNOWN_GAP = [
  "FL-A150 Fuel Tank Adapter",
  "FL-A151L Fuel Tank Adapter",
  "FL-A151S Fuel Tank Adapter",
  "FL-A215 Fuel Tank Adapter",
  "FL-C1000 Fuel Tank",
  "FL-R400 RCS Fuel Tank",
  "FL-TX1800 Fuel Tank",
  "FL-TX220 Fuel Tank",
  "FL-TX440 Fuel Tank",
  "FL-TX900 Fuel Tank",
  "Kerbodyne Engine Cluster Adapter Tank",
  "Kerbodyne S3-S4 Adapter Tank",
  "Kerbodyne S4-128 Fuel Tank",
  "Kerbodyne S4-256 Fuel Tank",
  "Kerbodyne S4-512 Fuel Tank",
  "Kerbodyne S4-64 Fuel Tank",
  "Stratus-V Minified Monopropellant Tank",
];

const nodes = new Set(Object.keys((tech as { nodes?: object }).nodes ?? tech));

describe("the part data", () => {
  it("puts every part behind a node the tree has, but for the ones named", () => {
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
    expect(missing).toEqual([...KNOWN_GAP].sort());
    const unknown = parts
      .filter((p) => p.t && !nodes.has(p.t))
      .map((p) => `${p.kind} ${p.n}: ${p.t}`);
    expect(unknown).toEqual([]);
    /* And the gap is what it says: all seventeen are Making History tanks. */
    for (const n of KNOWN_GAP) {
      const t = DATA.tanks.find((x) => x.n === n);
      expect(t?.mh, `${n} is not a Making History tank`).toBeTruthy();
    }
  });
});
