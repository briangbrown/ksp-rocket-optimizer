// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import type { PlanInput, PlanOpts } from "../src/core/plan.js";

/* What the application actually hands the seam.

   test/seam-contract.test.js builds its own input and checks that one is
   serialisable. That is worth having, and it is not the same claim: the app
   passed `unlocked` and `excluded` as Sets and `splitBy` as a Map for some
   time while that test stayed green, because planMission accepts either —
   `new Set(aSet)` copies happily.

   Nothing failed, and nothing would have, until the day the solve moved to a
   worker and the input had to survive a structured clone. So this intercepts
   the real call. */

const calls: Array<PlanInput> = [];
vi.mock("../src/core/plan.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/core/plan.js")>();
  return {
    ...real,
    planMission: (input: PlanInput, opts: PlanOpts) => {
      calls.push(input);
      return real.planMission(input, opts);
    },
  };
});

const { render, cleanup } = await import("@testing-library/react");
const { settle } = await import("./app-harness.js");
const { default: KSPMissionPlanner } = await import("../src/ui/app.jsx");

/* Same walk as the seam contract's checker, kept separate rather than shared:
   this one is about what the app builds, and coupling them would let a change
   to one quietly redefine the other. */
function unserialisable(
  value: unknown,
  path = "input",
  ancestors: ReadonlySet<unknown> = new Set(),
): Array<string> {
  const bad: Array<string> = [];
  if (value === null || typeof value !== "object") {
    if (typeof value === "function") bad.push(`${path}: function`);
    if (typeof value === "undefined") bad.push(`${path}: undefined`);
    if (typeof value === "number" && !Number.isFinite(value))
      bad.push(`${path}: ${value}`);
    return bad;
  }
  if (ancestors.has(value)) return [`${path}: circular reference`];
  const seen = new Set(ancestors).add(value);
  if (value instanceof Set) return [`${path}: Set`];
  if (value instanceof Map) return [`${path}: Map`];
  if (Array.isArray(value)) {
    value.forEach((v, i) =>
      bad.push(...unserialisable(v, `${path}[${i}]`, seen)),
    );
    return bad;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype)
    return [`${path}: class instance`];
  for (const [k, v] of Object.entries(value))
    bad.push(...unserialisable(v, `${path}.${k}`, seen));
  return bad;
}

describe("the input the app builds", () => {
  it("survives JSON, and a structured clone", async () => {
    render(<KSPMissionPlanner />);
    await settle();
    cleanup();

    expect(calls.length, "the app never called planMission").toBeGreaterThan(0);
    const input = calls[calls.length - 1];

    expect(unserialisable(input)).toEqual([]);
    /* structuredClone is what postMessage uses, so a worker needs this to hold
       even where JSON would be stricter than necessary. */
    expect(() => structuredClone(input)).not.toThrow();
  }, 300_000);
});
