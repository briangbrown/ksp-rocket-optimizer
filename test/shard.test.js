import { describe, it, expect } from "vitest";
import { solveGroup, solveGroupWith } from "../src/core/solver.js";
import { cases } from "./grid.js";
import { signature } from "./signature.js";

/* Sharding the search must not change the answer.

   `solveGroup`'s (k, shares) units are independent, so they can run anywhere —
   but `better` keeps the first of equals, which makes the *order they are
   folded back* part of the result rather than an implementation detail. A pool
   that resolves in completion order instead of unit order would pick a
   different rocket on any tie, silently and rarely.

   jsdom has no Worker, so every suite that drives the app takes the in-process
   path and the sharded one is never executed. This runs it with a fake pool:
   real concurrency is not the point, the fold is. */

const hot = cases().find((c) => c.name === "tier9-pay3.5-dv5400-cost").input;

/* Resolves every unit before returning any of them, deliberately finishing
   them in reverse, and hands them back in unit order — which is what a real
   pool doing dynamic hand-out has to do. */
const shuffled = async (p, units) => {
  const { solveUnit } = await import("../src/core/solver.js");
  const out = new Array(units.length);
  for (let i = units.length - 1; i >= 0; i--)
    out[i] = await Promise.resolve().then(() =>
      solveUnit(p, units[i].k, units[i].shares),
    );
  return out;
};

describe("the sharded search", () => {
  it("gives the same design as solving in order on one thread", async () => {
    const serial = solveGroup(hot);
    const sharded = await solveGroupWith(hot, shuffled);
    expect(signature("sharded", sharded)).toBe(signature("sharded", serial));
  }, 120_000);

  it("breaks a tie by which unit came first", async () => {
    /* The reason fanOut's contract is unit order rather than completion order.
       `better` compares with a strict <, so equal candidates leave the
       incumbent in place and the earlier unit wins. Reversing that pair is
       enough to hand back the other rocket.

       Tested on made-up candidates rather than by hunting for a tie in the
       grid: the heaviest case has none, so a real-data version of this passes
       whether or not the ordering is honoured, which is worse than no test. */
    const twin = (total) => [
      { chain: [], total, k: 2, chainScore: 100, ar: 5, slim: true },
    ];
    const first = await solveGroupWith(hot, async () => [twin(1), twin(2)]);
    const second = await solveGroupWith(hot, async () => [twin(2), twin(1)]);
    expect(first.total).toBe(1);
    expect(second.total).toBe(2);
  }, 120_000);

  it("passes every unit exactly once, and nothing else", async () => {
    const seen = [];
    await solveGroupWith({ ...hot, minK: 1, maxK: 4 }, async (p, units) => {
      const { solveUnit } = await import("../src/core/solver.js");
      for (const u of units) seen.push(`k=${u.k}:${u.shares.length}`);
      return units.map((u) => solveUnit(p, u.k, u.shares));
    });
    /* 1 + 5 + 12 + 5 splits for k = 1..4. A change to splitShares is allowed to
       move this; a change that quietly drops units is not. */
    expect(seen.length).toBe(23);
    expect(seen.filter((s) => s.startsWith("k=3")).length).toBe(12);
    /* Every unit's shares must match its own k, or a worker would build a
       chain of the wrong length. */
    expect(seen.every((s) => s.split(":")[0] === `k=${s.split(":")[1]}`)).toBe(
      true,
    );
  }, 120_000);
});
