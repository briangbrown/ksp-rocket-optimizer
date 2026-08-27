// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { act } from "react";
import KSPMissionPlanner from "../src/ui/app.jsx";
import {
  settle,
  byText,
  allByText,
  click,
  design,
  stat,
} from "./app-harness.js";

/* Does changing a control actually re-solve?

   Everything else tests the solver. Nothing tested the wiring that feeds it,
   and during #19 that gap let a real bug through with the whole suite green:
   `groups` left the solve effect's dependency array and `effCuts` did not
   replace it, so moving a stage split would silently have done nothing — the
   displayed design just staying stale.

   The design snapshot cannot see this, because it calls solveGroup directly.
   The seam contract cannot, because it calls planMission directly. The render
   sweep drives destinations and objectives but touches no other control.

   Each case asserts the design *changed*, not what it changed to. That needs no
   baseline, survives every legitimate solver change, and fails exactly when a
   dependency goes missing.

   Verified by removing each name from the effect's dependency array in turn.
   Caught: effCuts, payload, margin, maxAspect, extraDv, splitBy, needGimbal,
   boosters. Not caught: payloadDia, which only reaches the drag model and the
   drawing, and asparagus, whose control appears only once crossfeed is
   researched. Both are gaps, listed here so the next person knows the sweep is
   not exhaustive rather than assuming it is. */

let base;

async function mount() {
  render(<KSPMissionPlanner />);
  await settle();
}

/* Set a controlled numeric field the way the component expects.

   Three things have to be right. React ignores a plain value assignment, so the
   native setter is needed. The Slider keeps a draft string while focused and
   only commits it on blur. And React's onBlur is delegated from `focusout`, not
   `blur` — `blur` does not bubble, so a dispatched `blur` never reaches the
   listener and the draft is silently dropped. */
/* The fields have no explicit type attribute, so `input[type="text"]` matches
   nothing — select by what they are not. */
const numericFields = () =>
  [...document.querySelectorAll("input")].filter(
    (i) => i.type !== "range" && i.type !== "checkbox",
  );

function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  ).set;
  setter.call(input, String(value));
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function setField(input, value) {
  await act(async () => {
    typeInto(input, value);
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
}

describe("a control change re-solves", () => {
  beforeAll(() => {
    base = null;
  });

  it("a stage cut changes the design", async () => {
    /* The one that broke. Cuts reach the solver through effCuts, which reaches
       planMission as an array of indices. */
    await mount();
    const before = design();
    expect(stat("Liftoff mass")).not.toBe("—");

    const cuts = allByText("cut here");
    expect(cuts.length, "no cut controls rendered").toBeGreaterThan(0);
    await click(cuts[0]);
    await settle();

    expect(design(), "cutting a stage did not change the design").not.toBe(
      before,
    );
    cleanup();
  }, 300_000);

  it("the tech tier changes the design", async () => {
    await mount();
    const before = design();

    const tech = [...document.querySelectorAll("button")].find((b) =>
      b.textContent.trim().startsWith("Tech tree"),
    );
    expect(tech, "no tech tree control").toBeTruthy();
    await click(tech);
    /* Stage-count chips stop at 5, so "9" is unambiguously a tier. */
    await click(byText("9"));
    await settle();

    expect(
      design(),
      "unlocking the tech tree did not change the design",
    ).not.toBe(before);
    cleanup();
  }, 300_000);

  it("the payload changes the design", async () => {
    await mount();
    const before = design();

    const fields = numericFields();
    expect(fields[0]?.value, "first text field is no longer payload").toBe(
      "2.5",
    );
    await setField(fields[0], 9);
    await settle();

    expect(design(), "changing the payload did not change the design").not.toBe(
      before,
    );
    cleanup();
  }, 300_000);

  it("a typed value commits with no blur and no key event at all", async () => {
    /* The case that was actually reported. On an Android keyboard the action
       key is "Next": it moves focus to the following field, and on the device
       this came from it delivered neither a keydown readable as Enter nor a
       focusout React acted on. Nothing committed, nothing re-solved, and the box
       kept showing the typed number because the draft is what is rendered (#46).

       So this types and then does nothing — no focusout, no keydown, no blur —
       and waits. Every other case in this file supplies one of those events,
       which is why none of them could see this. */
    await mount();
    const before = design();
    const field = numericFields()[0];
    expect(field?.value, "first text field is no longer payload").toBe("2.5");

    await act(async () => {
      field.focus();
    });
    await act(async () => {
      typeInto(field, 9);
    });
    /* Past the field's own idle interval, and then the usual settle. */
    await act(async () => {
      await new Promise((r) => setTimeout(r, 800));
    });
    await settle();

    expect(design(), "a typed value never reached the solver").not.toBe(before);
    cleanup();
  }, 300_000);

  it("Enter commits without relying on the blur", async () => {
    /* Every other case here dispatches `focusout` directly, which is the path
       that already worked. Enter went untested, and it was the one that broke:
       it asked for a blur and left the commit to React's onBlur, so the value
       reaching state depended on a focusout raised from inside an in-flight
       keydown. In the browser that round trip did not always complete — the box
       showed the typed number and nothing re-solved (#46).

       jsdom's blur() does complete, so simulating Enter faithfully passes with
       or without the fix. Neutering blur() is what makes this a regression
       test: it stands in for the browser that did not deliver the focusout, and
       before the fix the commit had nowhere else to happen. */
    await mount();
    const before = design();
    const field = numericFields()[0];
    expect(field?.value, "first text field is no longer payload").toBe("2.5");

    const realBlur = HTMLInputElement.prototype.blur;
    HTMLInputElement.prototype.blur = () => {};
    try {
      await act(async () => {
        field.focus();
      });
      await act(async () => {
        typeInto(field, 9);
        field.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
      });
    } finally {
      HTMLInputElement.prototype.blur = realBlur;
    }
    await settle();

    expect(design(), "Enter did not re-solve").not.toBe(before);
    cleanup();
  }, 300_000);

  it("the margin changes the design", async () => {
    await mount();
    const before = design();
    const fields = numericFields();
    expect(fields[1]?.value, "second field is no longer margin").toBe("10");
    await setField(fields[1], 40);
    await settle();
    expect(design(), "changing the margin did not change the design").not.toBe(
      before,
    );
    cleanup();
  }, 300_000);

  it("the slenderness limit changes the design", async () => {
    await mount();
    const before = design();
    const fields = numericFields();
    expect(fields[3]?.value, "fourth field is no longer max aspect").toBe("14");
    await setField(fields[3], 4);
    await settle();
    expect(
      design(),
      "changing the slenderness limit did not change the design",
    ).not.toBe(before);
    cleanup();
  }, 300_000);

  it("the extra delta-v reserve changes the design", async () => {
    await mount();
    const before = design();
    const fields = numericFields();
    expect(fields[4]?.value, "fifth field is no longer extra dv").toBe("0");
    await setField(fields[4], 800);
    await settle();
    expect(
      design(),
      "adding a delta-v reserve did not change the design",
    ).not.toBe(before);
    cleanup();
  }, 300_000);

  it("forcing a stage count changes the design", async () => {
    /* Reaches the solver through splitBy, which is its own piece of wiring. */
    await mount();
    const before = design();
    await click(byText("2"));
    await settle();
    expect(
      design(),
      "forcing the stage count did not change the design",
    ).not.toBe(before);
    cleanup();
  }, 300_000);

  it("the roster toggles change the design", async () => {
    /* Solid boosters and the gimbal requirement both filter the parts the
       solver may use, by different routes. */
    await mount();
    const before = design();
    await click(byText("Solid boosters allowed"));
    await settle();
    const noSrb = design();
    expect(noSrb, "disallowing boosters did not change the design").not.toBe(
      before,
    );

    await click(byText("Gimbal in atmosphere"));
    await settle();
    expect(
      design(),
      "dropping the gimbal requirement did not change the design",
    ).not.toBe(noSrb);
    cleanup();
  }, 300_000);

  it("the return trip changes the design", async () => {
    await mount();
    const before = design();
    await click(byText("Return trip"));
    await settle();
    expect(
      design(),
      "toggling the return trip did not change the design",
    ).not.toBe(before);
    cleanup();
  }, 300_000);
});
