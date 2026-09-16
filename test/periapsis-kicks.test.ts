import { describe, it, expect } from "vitest";
import {
  ARC_MAX,
  MAX_PASSES,
  PASS_WORTH,
  finiteBurnDv,
  splitBurn,
} from "../src/core/performance.js";

/* A long ejection flown as periapsis kicks.

   Each pass sweeps a fraction of the arc, and the penalty goes as the square
   of the arc while the Δv only divides — so `n` passes cost `1 / n²` of what
   one pass costs. The arithmetic comes out exactly as dividing the arc, which
   is what makes this four lines rather than a second model. #412 */

describe("splitting a burn into passes", () => {
  it("is exactly dividing the arc", () => {
    /* n passes of dv/n over arc/n, summed, is one burn over arc/n. If this
       stops holding, splitBurn is solving a different problem than it says. */
    for (const arc of [0.3, 0.8, 1.5]) {
      for (const n of [2, 3, 5]) {
        const byHand = n * finiteBurnDv(1000 / n, arc / n)!;
        expect(byHand, `arc ${arc} in ${n}`).toBeCloseTo(
          finiteBurnDv(1000, arc / n)!,
          9,
        );
      }
    }
  });

  it("costs a quarter in two passes and a sixteenth in four", () => {
    /* The 1/n² the whole idea rests on, read off the penalty rather than
       asserted from the algebra. */
    const arc = 1.5;
    const one = finiteBurnDv(1000, arc)! - 1000;
    const rows = [1, 2, 3, 4].map((n) => {
      const cost = finiteBurnDv(1000, arc / n)! - 1000;
      return `${n} pass${n > 1 ? "es" : " "}: +${cost.toFixed(1)} m/s  (1/${(one / cost).toFixed(1)} of one pass)`;
    });
    console.log(
      `a 1000 m/s burn over ${((arc * 180) / Math.PI).toFixed(0)}°:\n  ` +
        rows.join("\n  "),
    );
    /* 1/n² is the leading term of the exact form, not the whole of it, so the
       ratios come out a few percent over — 4.1 and 16.4 here. Asserting the
       exact number would be asserting the expansion. */
    for (const n of [2, 3, 4]) {
      const ratio = one / (finiteBurnDv(1000, arc / n)! - 1000);
      expect(ratio, `${n} passes`).toBeGreaterThan(n * n);
      expect(ratio, `${n} passes`).toBeLessThan(n * n * 1.1);
    }
  });

  it("takes a pass only while one earns its keep", () => {
    /* The threshold is the model's one trade of Δv against a player's time,
       so it is worth seeing it bite rather than trusting it. */
    const cheap = splitBurn(1000, 0.3)!; // a small arc: nothing to save
    expect(cheap.passes).toBe(1);
    const dear = splitBurn(4000, 2.0)!; // a long one: worth splitting
    expect(dear.passes).toBeGreaterThan(1);
    /* And the last pass it took saved at least the threshold, while the one
       after would not have. */
    const took = finiteBurnDv(4000, 2.0 / dear.passes)!;
    const more = finiteBurnDv(4000, 2.0 / (dear.passes + 1))!;
    if (dear.passes < MAX_PASSES)
      expect(took - more, "took a pass that did not earn it").toBeLessThan(
        PASS_WORTH,
      );
  });

  it("flies an arc in passes that one pass could not fly at all", () => {
    /* The rescue half: past ARC_MAX a single burn is refused outright, and
       splitting is what makes it flyable rather than impossible. */
    const arc = ARC_MAX + 0.5;
    expect(finiteBurnDv(1000, arc)).toBeNull();
    const split = splitBurn(1000, arc)!;
    expect(split).not.toBeNull();
    expect(split.passes).toBeGreaterThan(1);
    expect(arc / split.passes).toBeLessThan(ARC_MAX);
  });

  it("never charges more than flying it in one go", () => {
    for (const arc of [0.2, 0.5, 1, 2, 3])
      for (const dv of [200, 1000, 4000]) {
        const one = finiteBurnDv(dv, arc);
        const split = splitBurn(dv, arc);
        expect(split, `${dv} over ${arc}`).not.toBeNull();
        if (one !== null)
          expect(split!.applied, `${dv} over ${arc}`).toBeLessThanOrEqual(one);
        expect(split!.applied).toBeGreaterThanOrEqual(dv);
      }
  });
});
