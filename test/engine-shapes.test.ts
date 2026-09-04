import { describe, it, expect } from "vitest";
import shapes from "../src/data/engine-shapes.json";
import { DATA } from "../src/core/catalogue.js";
import { SPAN, engineShape, useArt } from "../src/core/geometry.js";
import { bellProfile, engineLayout, engineProfile } from "../src/ui/views.js";
import type { Nozzle } from "../src/ui/views.js";

/* How each engine is drawn, #85. The table is authored rather than measured —
   the one in src/data/ that is — so what a test can hold is that it is
   complete, that every proportion keeps the drawing inside the envelope the
   solver sized the engine at, and that the profiles built from it are the
   shapes they claim: closed, inside the radius, and sharp at the lip. */

const engines = DATA.engines.map((e) => e.n);
/* Indexed by title below; the JSON import types every key literally. */
const table: Readonly<Record<string, Nozzle>> = shapes.shapes;

describe("the engine shape table", () => {
  it("names every engine in the catalogue, and nothing else", () => {
    const named = Object.keys(shapes.shapes).sort();
    expect(named).toEqual([...engines].sort());
    for (const n of Object.keys(shapes.restock))
      expect(engines, `restock override for an unknown part: ${n}`).toContain(
        n,
      );
  });

  it("keeps every engine inside its envelope", () => {
    const all = [
      ...Object.entries(shapes.shapes),
      ...Object.entries(shapes.restock),
    ];
    for (const [n, s] of all) {
      const at = (what: string) => `${n}: ${what}`;
      expect([1, 2, 4], at("bells")).toContain(s.n);
      expect(s.plate, at("plate")).toBeGreaterThanOrEqual(0);
      expect(s.body[1], at("body height")).toBeGreaterThanOrEqual(0);
      /* Room left for a bell, however short. */
      expect(s.plate + s.body[1], at("no room for a bell")).toBeLessThan(1);
      expect(s.body[0], at("body radius")).toBeGreaterThan(0);
      expect(s.body[0], at("body wider than the part")).toBeLessThanOrEqual(1);
      expect(s.throat, at("throat")).toBeGreaterThan(0);
      expect(s.throat, at("throat wider than the bell")).toBeLessThanOrEqual(1);
      expect(s.exit, at("exit")).toBeGreaterThan(0);
      expect(s.exit, at("exit wider than the bell")).toBeLessThanOrEqual(1);
    }
  });

  it("follows the art: ReStock's Poodle is four bells, stock's is one", () => {
    const poodle = engines.find((n) => n.includes('"Poodle"'))!;
    useArt({ mh: false, rs: true });
    expect(engineShape(poodle)?.n).toBe(4);
    useArt({ mh: false, rs: false });
    expect(engineShape(poodle)?.n).toBe(1);
    useArt(null);
    expect(engineShape(poodle)?.n).toBe(4);
    expect(engineShape("no such engine")).toBeUndefined();
  });

  it("spaces a cluster the way the solver does", () => {
    /* views.ts carries its own copy of SPAN so it need not import the solver
       into the bundle that draws; this is what keeps the two the same. */
    const R = 1.5;
    for (const n of [2, 4]) {
      const L = engineLayout(R, 3, {
        n,
        plate: 0.1,
        body: [0.5, 0.2],
        throat: 0.4,
        exit: 1,
      });
      expect(L.rb).toBeCloseTo(R / SPAN[n], 9);
      /* The farthest bell edge is exactly the envelope. */
      expect(L.offset + L.rb).toBeCloseTo(R, 9);
    }
  });
});

const inside = (pts: ReadonlyArray<[number, number]>, R: number, H: number) => {
  for (const [r, y] of pts) {
    expect(r).toBeGreaterThanOrEqual(-1e-9);
    expect(r).toBeLessThanOrEqual(R + 1e-9);
    expect(Math.abs(y)).toBeLessThanOrEqual(H / 2 + 1e-9);
  }
};

describe("an engine's profile", () => {
  const R = 0.625;
  const H = 1.2;
  const terrier: Nozzle = {
    n: 1,
    plate: 0.08,
    body: [0.32, 0.22],
    throat: 0.28,
    exit: 1,
  };

  it("starts and ends on the axis, inside the cylinder it replaces", () => {
    for (const s of Object.values(shapes.shapes)) {
      const pts = engineProfile(R, H, s);
      expect(pts[0][0]).toBe(0);
      expect(pts[pts.length - 1][0]).toBe(0);
      expect(pts[pts.length - 1][1]).toBeCloseTo(H / 2, 9);
      inside(pts, R, H);
      /* No zero-length segments for the lathe to make slivers of. */
      for (let i = 1; i < pts.length; i++)
        expect(
          Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]),
        ).toBeGreaterThan(1e-9);
    }
  });

  it("is widest at the lip and narrow at the throat, with a sharp lip", () => {
    const pts = bellProfile(R, H, terrier.throat, terrier.exit, -H / 2);
    const lip = pts.findIndex(([r, y]) => r === R && y === -H / 2);
    expect(lip, "no lip at the exit radius on the base").toBeGreaterThan(0);
    /* The wall turns through nearly 180 degrees at the lip: in along the
       inside, out along the outside. A fillet here would read as a bucket. */
    const [a, b, c] = [pts[lip - 1], pts[lip], pts[lip + 1]];
    const ang = (p: [number, number], q: [number, number]) =>
      Math.atan2(q[1] - p[1], q[0] - p[0]);
    const turn = Math.abs(ang(a, b) - ang(b, c));
    expect(turn).toBeGreaterThan(Math.PI / 2);
    /* The outside flares: radius grows all the way from throat to lip. */
    const outside = pts.slice(lip);
    for (let i = 1; i < outside.length; i++)
      expect(outside[i][0]).toBeLessThanOrEqual(outside[i - 1][0] + 1e-9);
    expect(outside[outside.length - 1][0]).toBeCloseTo(terrier.throat * R, 9);
  });

  it("reads the Dart as a cone: wide at the body, narrow at the base", () => {
    const dart = table[engines.find((n) => n.includes('"Dart"'))!];
    const pts = engineProfile(R, H, dart);
    const base = pts.filter(([, y]) => Math.abs(y + H / 2) < 1e-9);
    const rBase = Math.max(...base.map(([r]) => r));
    expect(rBase).toBeLessThan(dart.body[0] * R);
  });
});
