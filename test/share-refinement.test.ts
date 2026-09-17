import { describe, it, expect } from "vitest";
import {
  lagrangeShares,
  mergeResults,
  splitShares,
} from "../src/core/solver.js";
import type { ChainCandidate, GroupResult } from "../src/core/solver.js";
import type { Solution } from "../src/core/solution.js";

/* The second wave of Δv splits, and the arithmetic under it.

   The lattice is coarse — five splits at k=2 — and what it lacks is
   resolution: 31 of 54 sweep cases came out lighter or cheaper at a lattice
   twice as fine, and 25 of the 48 winning splits used a share the lattice
   does not have. The fix is a targeted second wave round the lattice's
   winners: the Lagrange staging point for the engines they chose, their
   neighbours a twentieth either way, and a snap to the nearest leg end. These
   hold the pieces that can be held on their own; the sweep and the grid hold
   what they deliver. #447 */

const G0 = 9.81;
/* A stage as `lagrangeShares` reads it: Isp, and the structure that is its
   own — `dry` and `total` carry the payload, as a Solution's do. */
const stage = (isp: number, eps: number, payloadIn: number, own = 10) =>
  ({
    sol: {
      isp,
      dry: payloadIn + eps * own,
      total: payloadIn + own,
    } as Solution,
    want: 0,
    payloadIn,
    twrMin: 0,
    g: G0,
  }) as const;

describe("the Lagrange staging point", () => {
  it("splits evenly between identical stages", () => {
    const shares = lagrangeShares(
      [stage(320, 0.2, 5), stage(320, 0.2, 1)],
      3000,
    )!;
    expect(shares.length).toBe(2);
    expect(shares[0]).toBeCloseTo(0.5, 6);
    expect(shares[1]).toBeCloseTo(0.5, 6);
  });

  it("gives the better engine the larger share, and sums to one", () => {
    /* A Nerv above a Mainsail: 800 s against 310. The optimum hands the
       upper stage most of the Δv — which is what every top-heavy winner in
       the sweep was doing. */
    const shares = lagrangeShares(
      [stage(310, 0.12, 5), stage(800, 0.45, 1)],
      5000,
    )!;
    expect(shares[1]).toBeGreaterThan(shares[0]);
    expect(shares[0] + shares[1]).toBeCloseTo(1, 9);
    for (const x of shares) expect(x).toBeGreaterThan(0);
  });

  it("is monotone in the structure: a heavier stage takes less", () => {
    const light = lagrangeShares(
      [stage(320, 0.1, 5), stage(320, 0.2, 1)],
      3000,
    )!;
    expect(light[0]).toBeGreaterThan(0.5);
  });

  it("says when the chain cannot deliver the Δv at any split", () => {
    /* Every stage at its mass-ratio limit falls short: Σ c·ln(1/ε). */
    expect(
      lagrangeShares([stage(320, 0.5, 5), stage(320, 0.5, 1)], 5000),
    ).toBeNull();
    /* And where a stage's structure reads as nonsense. */
    expect(
      lagrangeShares([stage(320, 0, 5), stage(320, 0.2, 1)], 1000),
    ).toBeNull();
  });
});

describe("the lattice's shape", () => {
  it("tilts toward the top at four stages and more", () => {
    /* Nine of the ten k ≥ 4 winners at the fine lattice were top-heavy and
       the +0.4 tilt never won; it is gone and −0.1 and −0.3 are in. */
    for (const k of [4, 5, 6]) {
      const splits = splitShares(k);
      const top = splits.filter((s) => s[k - 1] > s[0] + 1e-9).length;
      const bottom = splits.filter((s) => s[0] > s[k - 1] + 1e-9).length;
      expect(top, `k=${k}`).toBe(4);
      expect(bottom, `k=${k}`).toBe(1);
      for (const s of splits)
        expect(s.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    }
  });
});

describe("two waves joined", () => {
  const cand = (k: number, score: number, slim = true): ChainCandidate =>
    ({
      chain: [],
      total: score,
      k,
      chainScore: score,
      ar: 1,
      slim,
    }) as ChainCandidate;
  const result = (
    best: ChainCandidate,
    byK: Array<ChainCandidate>,
    alts: Array<ChainCandidate>,
  ): GroupResult => ({ ...best, byK, alts }) as GroupResult;

  it("keeps the better at each stage count and both waves' runners-up", () => {
    const a2 = cand(2, 24.6),
      a3 = cand(3, 26),
      aAlt = cand(2, 25);
    const b2 = cand(2, 23.9),
      b4 = cand(4, 27),
      bAlt = cand(2, 24.0);
    const merged = mergeResults(
      result(a2, [a2, a3], [aAlt]),
      result(b2, [b2, b4], [bAlt]),
    )!;
    expect(merged.chainScore).toBe(23.9);
    expect(merged.byK.map((c) => [c.k, c.chainScore])).toEqual([
      [2, 23.9],
      [3, 26],
      [4, 27],
    ]);
    /* The lattice's own k=2 answer is still in the list the walk flies: it
       is a different chain, and the one flown may be the one that fits. */
    expect(merged.alts).toContain(a2);
    expect(merged.alts).toContain(aAlt);
    expect(merged.alts).toContain(bAlt);
  });

  it("is the other wave where one found nothing", () => {
    const a2 = cand(2, 24.6);
    const r = result(a2, [a2], []);
    expect(mergeResults(r, null)).toBe(r);
    expect(mergeResults(null, r)).toBe(r);
    expect(mergeResults(null, null)).toBeNull();
  });
});
