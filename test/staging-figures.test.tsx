// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { byText, click, settle, stat } from "./app-harness.js";
import KSPMissionPlanner from "../src/ui/app.jsx";

/* The figures under the build view describe the step you are looking at.

   They did not. `BuildView` measured `stackGeometry` over every solved stage
   and printed that at every step, so paging through to "Payload alone" left a
   1.1 m pod reading 23.2 m tall — while "N stages attached" beside it counted
   down correctly, which is what made it obvious. #101

   Since #138 the figures are the headline `Stat`s — the ones that used to sit
   beside the name above the drawing — and the whole row follows the step:
   mass, stages, cost and parts as well as height and slenderness. On the pad
   the mass is the liftoff mass and is labelled so; after that it is the mass
   of what is still attached.

   One thing does not follow the step, deliberately: the amber on the aspect.
   Slenderness is a constraint on the stack that leaves the pad, so a warning
   keyed to a step of it would come off a design that breaks the limit at
   exactly the moment you looked away from the pad. The pad's own figure is
   stood beside it instead, and carries the colour.

   jsdom draws none of this — `canRender3D()` is false, so the panels are a
   line of text — but the figures are outside that branch and the stepper is
   not, which is the whole of what this asks about. */

afterEach(cleanup);

const num = (label: string) => {
  const v = stat(label);
  if (v === null) throw new Error(`no "${label}" under the build view`);
  return Number(v.replace(/,/g, ""));
};

describe("the figures under the build view", () => {
  it("follow the staging step", async () => {
    render(<KSPMissionPlanner />);
    await settle();

    /* Nothing has staged away, so the mass is the liftoff mass and there is
       nothing to compare the aspect against yet. */
    expect(stat("Liftoff mass"), "not on the pad to begin with").toBeTruthy();
    expect(stat("Mass")).toBeNull();
    expect(stat("On the pad")).toBeNull();

    const mass = num("Liftoff mass");
    const stages = num("Stages");
    const tall = num("Height");
    const ar = num("Aspect");
    const cost = num("Cost");
    const parts = num("Parts");
    expect(tall).toBeGreaterThan(1);
    expect(stages).toBeGreaterThan(1);

    /* The last step is the payload on its own: a pod and nothing else. */
    expect(byText("Payload alone"), "no staging steps to walk").toBeTruthy();
    await click("Payload alone");

    expect(stat("Liftoff mass"), "still labelled as the liftoff mass").toBe(
      null,
    );
    expect(num("Stages"), "the stage count did not follow the step").toBe(0);
    expect(num("Mass"), "the mass did not follow the step").toBeLessThan(mass);
    expect(
      num("Height"),
      `still ${num("Height")} m tall with nothing but the payload left`,
    ).toBeLessThan(tall);
    expect(num("Aspect")).toBeLessThan(ar);
    expect(num("Cost")).toBeLessThan(cost);
    expect(num("Parts")).toBeLessThan(parts);

    /* And the vehicle's own aspect is still on the row, because that is the
       one the limit is applied to and the one the colour belongs to. */
    expect(
      stat("On the pad"),
      "the pad's aspect is not reported beside it",
    ).toBe(ar.toFixed(1));
  }, 300_000);
});
