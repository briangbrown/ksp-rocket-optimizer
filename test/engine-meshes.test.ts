import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { DATA } from "../src/core/catalogue.js";
import { artName, useArt } from "../src/core/geometry.js";

/* How each engine is drawn, #85: a simplified copy of the game's own mesh,
   one file an engine under public/engines/, made by tools/engine-meshes.mjs
   and fetched by the renderer when the engine is first drawn. What a test
   can hold is that the index covers the catalogue, that every file is a
   well-formed mesh — triangles indexing real vertices, hanging from the top
   node, no wider than it says — and that each stays small enough to fetch
   in front of a drawing. The one engine without a mesh is named, so a new
   part fails the build until it is packed. */

type Mesh = {
  h: number;
  w: number;
  v: ReadonlyArray<number>;
  i: ReadonlyArray<number>;
};
const DIR = "public/engines";
const index: {
  stock: Record<string, string>;
  restock: Record<string, string>;
} = JSON.parse(readFileSync(`${DIR}/index.json`, "utf8"));
const load = (file: string): Mesh =>
  JSON.parse(readFileSync(`${DIR}/${file}`, "utf8"));
const engines = DATA.engines.map((e) => e.n);

/* ReStock+'s Soyuz-style tank with a motor in it lives under FuelTank, not
   Engine, and was not in the pack. It is a tank; the drum is fine for it. */
const UNMEASURED = ["FL-S1200 Liquid Fuel Tank"];

/* Vertices a file may carry and bytes it may weigh: the tool aims under the
   first, and the second is what a phone fetches before a rocket draws. */
const VERTICES = 320;
const BYTES = 24_000;

describe("the engine meshes", () => {
  it("cover every engine in the catalogue but the ones named", () => {
    expect(Object.keys(index.stock).sort()).toEqual(
      engines.filter((n) => !UNMEASURED.includes(n)).sort(),
    );
    for (const n of Object.keys(index.restock))
      expect(engines, `restock mesh for an unknown part: ${n}`).toContain(n);
    /* Every file the index names is there, and nothing it does not. */
    const named = new Set([
      ...Object.values(index.stock),
      ...Object.values(index.restock),
    ]);
    const present = ["stock", "restock"].flatMap((d) =>
      readdirSync(`${DIR}/${d}`).map((f) => `${d}/${f}`),
    );
    expect(present.filter((f) => !named.has(f))).toEqual([]);
    for (const f of named) expect(() => statSync(`${DIR}/${f}`)).not.toThrow();
  });

  it("are small meshes hanging from the top node, inside their own width", () => {
    for (const [n, file] of [
      ...Object.entries(index.stock),
      ...Object.entries(index.restock),
    ]) {
      const at = (what: string) => `${n} (${file}): ${what}`;
      expect(statSync(`${DIR}/${file}`).size, at("bytes")).toBeLessThan(BYTES);
      const m = load(file);
      expect(m.h, at("height")).toBeGreaterThan(0);
      expect(m.w, at("width")).toBeGreaterThan(0);
      expect(m.v.length % 3, at("vertices")).toBe(0);
      expect(m.i.length % 3, at("triangles")).toBe(0);
      const nv = m.v.length / 3;
      expect(nv, at("too many vertices")).toBeLessThanOrEqual(VERTICES);
      expect(nv, at("too few vertices")).toBeGreaterThan(8);
      for (const k of m.i) {
        expect(k, at("index")).toBeGreaterThanOrEqual(0);
        expect(k, at("index past the vertices")).toBeLessThan(nv);
      }
      let low = 0;
      for (let k = 0; k < m.v.length; k += 3) {
        const [x, y, z] = [m.v[k], m.v[k + 1], m.v[k + 2]];
        low = Math.min(low, y);
        /* Below the node, nothing wider than the width; above it, the
           collar that sits inside the tank may be anything. */
        if (y <= 0)
          expect(
            Math.hypot(x, z),
            at("wider than its width"),
          ).toBeLessThanOrEqual((m.w / 2) * 1000 + 2);
      }
      expect(-low, at("height disagrees with the vertices")).toBeCloseTo(
        m.h * 1000,
        -1,
      );
    }
  });

  it("follow the art where ReStock remodelled the part, and only there", () => {
    const terrier = engines.find((n) => n.includes('"Terrier"'))!;
    const skiff = engines.find((n) => n.includes('"Skiff"'))!;
    expect(index.restock[terrier]).toBeDefined();
    expect(
      index.restock[skiff],
      "a Making History part ReStock never touched",
    ).toBeUndefined();
    useArt({ mh: false, rs: true });
    expect(artName()).toBe("restock");
    useArt({ mh: false, rs: false });
    expect(artName()).toBe("stock");
    useArt(null);
    expect(artName()).toBe("restock");
  });
});
