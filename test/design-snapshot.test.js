import { describe, it, expect } from "vitest";
import { solveGroup, resetTally } from "../src/core/solver.js";
import { cases } from "./grid.js";
import { signature } from "./signature.js";

/* The design snapshot.

   Solves a fixed grid of configurations and compares every resulting design
   against a committed baseline. It asserts nothing about whether a design is
   correct — only that it has not moved. Any change meant to preserve behaviour
   must leave this file untouched.

   When a diff is intended, re-bless with `npm run test:bless` and put the
   before/after in the commit message. Do not re-bless to make a red build go
   green; a diff you cannot explain is the bug this test exists to find.

   Coverage note: this drives solveGroup, which is the design solver. It does
   not cover buildRoute, missionHardware, or the simulator-guided candidate walk
   — those live inside the component's effect and are not callable yet. */

describe("design snapshot", () => {
  it("produces unchanged designs across the configuration grid", async () => {
    resetTally();

    const solved = cases().map(({ name, input }) => ({
      name,
      res: solveGroup(input),
    }));
    const text = solved.map(({ name, res }) => signature(name, res)).join("\n");

    /* A grid that solves nothing would sail past any baseline, so assert the
       solver is actually being exercised before trusting the comparison. */
    const found = solved.filter(({ res }) => res).length;
    expect(
      found,
      "no configuration in the grid produced a design",
    ).toBeGreaterThan(0);

    await expect(text).toMatchFileSnapshot("./__snapshots__/designs.txt");
  }, 600_000);
});
