// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { byText, click, settle } from "./app-harness.js";
import KSPMissionPlanner from "../src/ui/app.jsx";

/* The figures under the build view describe the step you are looking at.

   They did not. `BuildView` measured `stackGeometry` over every solved stage
   and printed that at every step, so paging through to "Payload alone" left a
   1.1 m pod reading 23.2 m tall — while "N stages attached" beside it counted
   down correctly, which is what made it obvious. #101

   One thing does not follow the step, deliberately: the amber on the aspect.
   Slenderness is a constraint on the stack that leaves the pad, so a warning
   keyed to a step of it would come off a design that breaks the limit at
   exactly the moment you looked away from the pad. The pad's own figure is
   named on the line instead, and carries the colour.

   jsdom draws none of this — `canRender3D()` is false, so the panels are a
   line of text — but the figures are outside that branch and the stepper is
   not, which is the whole of what this asks about. */

afterEach(cleanup);

/* The one line under the panels, whitespace flattened. */
function figures() {
  const el = [...document.querySelectorAll("span")].find((s) =>
    /stages? attached$/.test((s.textContent ?? "").trim()),
  );
  if (!el?.parentElement) throw new Error("no figures under the build view");
  return (el.parentElement.textContent ?? "").replace(/\s+/g, " ").trim();
}

const num = (line: string, unit: string) => {
  const m = new RegExp(`([\\d.]+)\\s*${unit}`).exec(line);
  if (!m) throw new Error(`no "${unit}" in ${line}`);
  return Number(m[1]);
};

describe("the figures under the build view", () => {
  it("follow the staging step", async () => {
    render(<KSPMissionPlanner />);
    await settle();

    const onThePad = figures();
    expect(onThePad, "not on the pad to begin with").toMatch(/stages attached/);
    /* Nothing has staged away, so there is nothing to compare against yet. */
    expect(onThePad).not.toContain("on the pad");

    const tall = num(onThePad, "m tall");
    const across = num(onThePad, "m across");
    const ar = num(onThePad, ":1 aspect");
    expect(tall).toBeGreaterThan(1);

    /* The last step is the payload on its own: a pod and nothing else. */
    expect(byText("Payload alone"), "no staging steps to walk").toBeTruthy();
    await click("Payload alone");
    const alone = figures();

    expect(alone, "the stage count did not follow the step").toContain(
      "0 stages attached",
    );
    expect(
      num(alone, "m tall"),
      `still ${num(alone, "m tall")} m tall with nothing but the payload left`,
    ).toBeLessThan(tall);
    expect(num(alone, "m across")).toBeLessThanOrEqual(across);
    expect(num(alone, ":1 aspect")).toBeLessThan(ar);

    /* And the vehicle's own aspect is still on the line, because that is the
       one the limit is applied to and the one the colour belongs to. */
    expect(alone, "the pad's aspect is not reported beside it").toContain(
      `${ar.toFixed(1)} on the pad`,
    );
  }, 300_000);
});
