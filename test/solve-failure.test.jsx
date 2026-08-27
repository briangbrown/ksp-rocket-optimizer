// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";

/* What the app does when a solve produces nothing.

   `solve` returns null in two situations that look identical from here and are
   not: the run was superseded, in which case a newer one is already in flight
   and will clear the veil; or the worker failed to start or errored, in which
   case nothing else is coming.

   Treating both as "just return" leaves a failed worker showing "Solving"
   forever — the app's own comment says the reset has to be unconditional, and
   an early return had quietly made it conditional again. The client test covers
   `solve` resolving null instead of hanging; this covers the app doing
   something sensible with it. */

vi.mock("../src/ui/solver-client.js", () => ({
  usingWorker: () => true,
  cancelSolve: () => {},
  /* Every solve fails, as a worker that cannot start would. */
  solve: () => Promise.resolve(null),
}));

const { render, cleanup } = await import("@testing-library/react");
const { settle, solving } = await import("./app-harness.js");
const { default: KSPMissionPlanner } = await import("../src/ui/app.jsx");

describe("a solve that produces nothing", () => {
  it("clears the veil rather than leaving it up", async () => {
    render(<KSPMissionPlanner />);
    /* settle throws if the veil never lifts, so reaching the assertion is most
       of the test — but assert it explicitly, so a future settle that gives up
       quietly still fails here. */
    await settle(30_000);
    expect(solving(), "the solving veil never lifted").toBe(false);
    cleanup();
  }, 60_000);
});
