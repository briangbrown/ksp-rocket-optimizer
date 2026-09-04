import { describe, it, expect } from "vitest";
import profiles from "../src/data/engine-profiles.json";
import { DATA } from "../src/core/catalogue.js";
import { engineShape, useArt } from "../src/core/geometry.js";
import { engineBells, engineProfile } from "../src/ui/views.js";
import type { Measured } from "../src/ui/views.js";

/* How each engine is drawn, #85: a profile measured from the install's
   meshes by tools/engine-profiles.mjs. What a test can hold is that the
   table covers the catalogue, that every profile is a well-formed skin — top
   to base, inside the width it declares, bells inside the part — and that
   the shells built from it are closed, inside their cylinder, and sharp at
   the lip. The one engine without a profile is named, so a new part fails
   the build until it is measured. */

const engines = DATA.engines.map((e) => e.n);
const stock: Readonly<Record<string, Measured>> = profiles.stock;
const restock: Readonly<Record<string, Measured>> = profiles.restock;

/* ReStock+'s Soyuz-style tank with a motor in it lives under FuelTank, not
   Engine, and was not in the pack. It is a tank; the drum is fine for it. */
const UNMEASURED = ["FL-S1200 Liquid Fuel Tank"];

describe("the engine profile table", () => {
  it("covers every engine in the catalogue but the ones it names", () => {
    const named = Object.keys(stock).sort();
    expect(named).toEqual(
      engines.filter((n) => !UNMEASURED.includes(n)).sort(),
    );
    for (const n of Object.keys(restock))
      expect(engines, `restock profile for an unknown part: ${n}`).toContain(n);
  });

  it("is a skin from the top node to the base, inside its own width", () => {
    for (const [n, m] of [
      ...Object.entries(stock),
      ...Object.entries(restock),
    ]) {
      const at = (what: string) => `${n}: ${what}`;
      expect(m.h, at("height")).toBeGreaterThan(0);
      expect(m.profile.length, at("points")).toBeGreaterThan(8);
      expect(m.profile[0][0], at("starts at the node")).toBe(0);
      expect(m.profile[m.profile.length - 1][0], at("ends at the base")).toBe(
        m.h,
      );
      for (let i = 1; i < m.profile.length; i++)
        expect(m.profile[i][0], at("y runs down")).toBeGreaterThanOrEqual(
          m.profile[i - 1][0],
        );
      for (const [, r] of m.profile)
        expect(r, at("radius past the width")).toBeLessThanOrEqual(
          m.w / 2 + 1e-6,
        );
      if (m.n > 1) {
        expect(m.bells?.length, at("bells")).toBe(m.n);
        expect(m.bellTop, at("bellTop")).toBeGreaterThan(0);
        for (const b of m.bells ?? [])
          expect(
            Math.hypot(b.x, b.z),
            at("a bell outside the part"),
          ).toBeLessThan(m.w / 2);
      } else expect(m.bells, at("bells on a single")).toBeUndefined();
    }
  });

  it("follows the art where ReStock remodelled the part", () => {
    const terrier = engines.find((n) => n.includes('"Terrier"'))!;
    useArt({ mh: false, rs: true });
    const rs = engineShape(terrier)!;
    useArt({ mh: false, rs: false });
    const st = engineShape(terrier)!;
    useArt(null);
    expect(rs.h).not.toBe(st.h);
    /* And a Making History part reads the same under both. */
    const skiff = engines.find((n) => n.includes('"Skiff"'))!;
    expect(restock[skiff]).toBeUndefined();
    expect(engineShape(skiff)).toBe(stock[skiff]);
    expect(engineShape("no such engine")).toBeUndefined();
  });

  it("knows a cluster from a single bell", () => {
    const by = (nick: string) => stock[engines.find((n) => n.includes(nick))!];
    expect(by('"Mammoth"').n).toBe(4);
    expect(by('"Poodle"').n).toBe(2);
    expect(by("'Corgi'").n).toBe(4);
    /* Four thrust transforms inside one bell are one bell. */
    expect(by("R.A.P.I.E.R.").n).toBe(1);
    expect(by('"Mainsail"').n).toBe(1);
  });
});

const inside = (pts: ReadonlyArray<[number, number]>, R: number, H: number) => {
  for (const [r, y] of pts) {
    expect(r).toBeGreaterThanOrEqual(-1e-9);
    expect(r).toBeLessThanOrEqual(R + 1e-9);
    expect(Math.abs(y)).toBeLessThanOrEqual(H / 2 + 1e-9);
  }
};

describe("an engine's shell", () => {
  const R = 0.625;
  const H = 1.2;

  it("starts and ends on the axis, inside the cylinder it replaces", () => {
    for (const m of Object.values(stock)) {
      const pts = engineProfile(R, H, m);
      if (pts.length === 0) continue;
      expect(pts[0][0]).toBe(0);
      expect(pts[pts.length - 1][0]).toBe(0);
      expect(pts[pts.length - 1][1]).toBeCloseTo(H / 2, 9);
      inside(pts, R, H);
      for (let i = 1; i < pts.length; i++)
        expect(
          Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]),
        ).toBeGreaterThan(1e-9);
      for (const b of engineBells(R, H, m)) {
        expect(Math.hypot(b.x, b.z)).toBeLessThan(R);
        inside(b.profile, R, H);
      }
    }
  });

  it("is sharp at the lip and hollow behind it", () => {
    const terrier = stock[engines.find((n) => n.includes('"Terrier"'))!];
    const pts = engineProfile(R, H, terrier);
    /* The lip is the lowest point; the wall turns through more than a right
       angle there — in along the inside, out along the outside. */
    const yMin = Math.min(...pts.map(([, y]) => y));
    const lip = pts.findIndex(
      ([r, y]) =>
        y === yMin &&
        r === Math.max(...pts.filter(([, yy]) => yy === yMin).map(([r]) => r)),
    );
    expect(lip).toBeGreaterThan(0);
    const [a, b, c] = [pts[lip - 1], pts[lip], pts[lip + 1]];
    const ang = (p: [number, number], q: [number, number]) =>
      Math.atan2(q[1] - p[1], q[0] - p[0]);
    /* At least a right angle: horizontal in along the base, then up the
       outside. A fillet would turn through less. */
    expect(Math.abs(ang(a, b) - ang(b, c))).toBeGreaterThanOrEqual(
      Math.PI / 2 - 1e-9,
    );
    /* Inside the lip the wall is thinner than the lip radius by the wall. */
    expect(a[0]).toBeLessThan(b[0]);
    expect(a[0]).toBeGreaterThan(b[0] * 0.8);
  });
});
