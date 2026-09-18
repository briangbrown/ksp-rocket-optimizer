import { describe, it, expect } from "vitest";
import { stagingOf } from "../src/core/staging.js";
import type { Solution } from "../src/core/solution.js";

/* The one staging order, on the shapes that decide it: which stages are
   solved and which carry a ring. Nothing here solves a rocket — the sweep's
   signature holds the real deliveries. #463 */

const sol = (boosters = false) =>
  ({ boosters: boosters ? {} : null }) as unknown as Solution;
const stage = (boosters = false) => ({ sol: sol(boosters) });
const unsolved = { sol: null };

describe("stagingOf", () => {
  it("numbers a plain stack from the launch down to zero", () => {
    const st = stagingOf([stage(), stage(), stage()]);
    expect(st.launch).toBe(3);
    expect(st.events.map((e) => e.stage)).toEqual([3, 2, 1, 0]);
    expect(st.events.map((e) => e.label)).toEqual([
      "On the pad",
      "Stage 1 spent",
      "Stage 2 spent",
      "Payload alone",
    ]);
    expect(st.events[0]).toMatchObject({
      ignite: [{ stage: 0, role: "engine" }],
      decouple: [],
      drop: 0,
      boost: false,
    });
    expect(st.events[1]).toMatchObject({
      ignite: [{ stage: 1, role: "engine" }],
      decouple: [{ stage: 0, role: "decoupler" }],
      drop: 1,
    });
    expect(st.events[3]).toMatchObject({
      ignite: [],
      decouple: [{ stage: 2, role: "decoupler" }],
      drop: 3,
    });
  });

  it("gives a ring of boosters a stage of its own, lit at launch", () => {
    const st = stagingOf([stage(true), stage()]);
    expect(st.launch).toBe(3);
    expect(st.events.map((e) => e.label)).toEqual([
      "On the pad",
      "Boosters away · core burns on",
      "Stage 1 spent",
      "Payload alone",
    ]);
    expect(st.events[0].ignite).toEqual([
      { stage: 0, role: "engine" },
      { stage: 0, role: "booster" },
    ]);
    expect(st.events[0].boost).toBe(true);
    expect(st.events[1]).toMatchObject({
      stage: 2,
      ignite: [],
      decouple: [{ stage: 0, role: "boosterHold" }],
      drop: 0,
      boost: false,
    });
  });

  it("lets a later stage carry a ring, which leaves once that stage is the bottom", () => {
    const st = stagingOf([stage(), stage(true), stage()]);
    expect(st.events.map((e) => [e.label, e.drop, e.boost])).toEqual([
      ["On the pad", 0, false],
      ["Stage 1 spent", 1, true],
      ["Boosters away · core burns on", 1, false],
      ["Stage 2 spent", 2, false],
      ["Payload alone", 3, false],
    ]);
    expect(st.events[1].ignite).toEqual([
      { stage: 1, role: "engine" },
      { stage: 1, role: "booster" },
    ]);
  });

  it("skips an unsolved stage and keeps the caller's indices", () => {
    const st = stagingOf([stage(), unsolved, stage()]);
    expect(st.events.map((e) => e.label)).toEqual([
      "On the pad",
      "Stage 1 spent",
      "Payload alone",
    ]);
    expect(st.events[1].ignite).toEqual([{ stage: 2, role: "engine" }]);
    expect(st.events[1].decouple).toEqual([{ stage: 0, role: "decoupler" }]);
    expect(stagingOf([])).toEqual({ launch: -1, events: [] });
  });

  it("is the stepper the build view had: pad, boosters away, each stage spent", () => {
    /* The algorithm `stagingSteps` used to own, kept here as the check that
       the projection did not move a step. */
    const old = (solved: Array<{ sol: Solution }>) => {
      const steps = [{ label: "On the pad", drop: 0, boost: true }];
      if (solved.length && solved[0].sol.boosters)
        steps.push({
          label: "Boosters away · core burns on",
          drop: 0,
          boost: false,
        });
      solved.forEach((_, i) =>
        steps.push({
          label:
            i === solved.length - 1 ? "Payload alone" : `Stage ${i + 1} spent`,
          drop: i + 1,
          boost: false,
        }),
      );
      return steps;
    };
    for (const solved of [
      [stage()],
      [stage(true)],
      [stage(), stage()],
      [stage(true), stage(), stage()],
    ]) {
      const now = stagingOf(solved).events.map(({ label, drop, boost }) => ({
        label,
        drop,
        boost,
      }));
      const was = old(solved);
      expect(now.map((s) => s.label)).toEqual(was.map((s) => s.label));
      expect(now.map((s) => s.drop)).toEqual(was.map((s) => s.drop));
      /* `boost` on the pad is now whether there is a ring at all, which the
         drawing reads the same: nothing to attach where there is none. */
      expect(now.slice(1).map((s) => s.boost)).toEqual(
        was.slice(1).map((s) => s.boost),
      );
    }
  });
});
