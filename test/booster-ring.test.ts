import { describe, it, expect } from "vitest";
import { boosterRing, standoffOf } from "../src/core/geometry.js";

/* A ring of radial boosters has to clear two things: the core it is bolted to,
   and itself.

   Only the first was kept, so a ring of wide boosters ran through itself. It
   needs both a broad booster and several of them, which is why no design in
   the grid had shown it — the model checks catch an overlap only once the
   solver happens to pick one. This checks the arithmetic directly, so it goes
   red on the fault whatever the solver is choosing that week. #420 */

const apart = (n: number, r: number) => 2 * r * Math.sin(Math.PI / n);
/* The decoupler's thickness, which every booster stands off its core by —
   0.22 m on ReStock's TT-38K, the art the tests run in. #422 */
const HOLD = standoffOf("TT-38K Radial Decoupler");

describe("a ring of radial boosters", () => {
  it("stands outside the core it is bolted to", () => {
    for (const n of [1, 2, 3, 4, 6, 8]) {
      const r = boosterRing(n, 1, 2); // narrow booster, wide core
      expect(r, `${n} boosters`).toBeGreaterThanOrEqual(2 + HOLD + 0.5 - 1e-9);
    }
  });

  it("clears itself, at every count that has neighbours", () => {
    for (const n of [3, 4, 5, 6, 7, 8, 9, 10, 12, 16]) {
      for (const bd of [0.5, 1, 2, 4]) {
        for (const coreHalf of [0.3, 1, 2, 5]) {
          const r = boosterRing(n, bd, coreHalf);
          expect(
            apart(n, r),
            `${n} boosters ${bd} m wide on a ${2 * coreHalf} m core sit ${apart(n, r).toFixed(3)} m apart`,
          ).toBeGreaterThanOrEqual(bd - 1e-9);
        }
      }
    }
  });

  it("puts the Tylo ring where it does not intersect", () => {
    /* The case that found it: eight boosters 3.986 m wide, standing against a
       core whose widest section at that height is its 3.986 m engine block.
       Bolted-on alone puts the ring at 3.986 m, where neighbours sit 3.051 m
       apart and each pair overlaps by 0.935 m — which is exactly what the
       model checks reported. */
    const bd = 3.986;
    const bolted = boosterRing(1, bd, bd / 2);
    /* Flush, as it was when this was found; the decoupler's thickness has
       since moved the ring out a little, and the overlap is smaller for it
       but still there. #422 */
    expect(apart(8, bolted - HOLD)).toBeCloseTo(3.051, 2);
    expect(bd - apart(8, bolted - HOLD)).toBeCloseTo(0.935, 2);
    expect(bd - apart(8, bolted)).toBeGreaterThan(0.7);
    const r = boosterRing(8, bd, bd / 2);
    expect(r).toBeGreaterThan(bolted);
    expect(apart(8, r)).toBeGreaterThanOrEqual(bd - 1e-9);
  });

  it("does not move a ring that already cleared itself", () => {
    /* Two and three of anything, and any count of boosters narrow against
       their core, are decided by the bolt and not by the neighbour — so the
       fix is invisible to every design that was already buildable. */
    for (const [n, bd, coreHalf] of [
      [2, 4, 1],
      [3, 1, 2],
      [4, 1, 2.5],
      [6, 0.625, 1.875],
    ] as Array<[number, number, number]>)
      expect(boosterRing(n, bd, coreHalf), `${n}x${bd} on ${coreHalf}`).toBe(
        coreHalf + HOLD + bd / 2,
      );
  });
});
