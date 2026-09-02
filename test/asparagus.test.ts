import { describe, it, expect } from "vitest";
import { boostersAfter } from "../src/core/ascent.js";

/* Crossfeed, on numbers.

   Asparagus is the one branch of the solver that changes how a rocket *flies*
   rather than only what it is made of: the ring sheds a pair each time a pair's
   worth of propellant has gone, so the mass history — and therefore the
   delta-v — is not the same as dropping the whole ring at once. Drag thins with
   it for the same reason.

   That behaviour ran in no check at all. It is measured now through the mission
   sweep, which pins the designs it produces, and here, which pins the rule
   itself: three numbers in, one out, and no simulation to run. #125 */

describe("shedding a crossfed ring", () => {
  it("keeps them all until the first pair's worth is gone", () => {
    expect(boostersAfter(6, 10, 0)).toBe(6);
    expect(boostersAfter(6, 10, 9.99)).toBe(6);
  });

  it("drops a pair at a time, not one and not the ring", () => {
    expect(boostersAfter(6, 10, 10)).toBe(4);
    expect(boostersAfter(6, 10, 19.9)).toBe(4);
    expect(boostersAfter(6, 10, 20)).toBe(2);
  });

  /* The last pair has nothing left to feed it, so it burns to the end with the
     core. Shedding it would leave the stage flying on an engine whose
     propellant the model has already taken away. */
  it("never goes below the last pair, however much has gone", () => {
    for (const spent of [20, 30, 100, 1e6])
      expect(boostersAfter(6, 10, spent), `after ${spent}`).toBe(2);
    expect(boostersAfter(2, 10, 1e6)).toBe(2);
  });

  /* An odd ring is not something the pools build — they come in pairs by
     construction — but the arithmetic should not invent a stack if one ever
     arrives, and `n - 2` is what stops it. */
  it("does not shed more than it has", () => {
    for (const n of [2, 3, 4, 5, 6, 8])
      for (const spent of [0, 5, 10, 25, 1e4]) {
        const left = boostersAfter(n, 10, spent);
        expect(left, `${n} boosters, ${spent} spent`).toBeLessThanOrEqual(n);
        expect(left).toBeGreaterThanOrEqual(Math.min(n, 2));
      }
  });

  it("only ever sheds as more goes", () => {
    let last = Infinity;
    for (let spent = 0; spent <= 60; spent += 2.5) {
      const left = boostersAfter(8, 10, spent);
      expect(left, `at ${spent}`).toBeLessThanOrEqual(last);
      last = left;
    }
  });
});
