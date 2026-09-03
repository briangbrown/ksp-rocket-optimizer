// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { act } from "react";
import { must } from "./must.js";
import KSPMissionPlanner from "../src/ui/app.jsx";
import {
  settle,
  allByLabel,
  byText,
  click,
  design,
  field,
  openBrief,
  openFold,
  openSetup,
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

/* The brief folds once the first design solves (#133); every case here
   reaches for a control on it, and two for one under "More options". */
async function mount() {
  render(<KSPMissionPlanner />);
  await settle();
  await openBrief();
  await openFold("More options");
}

/* Set a controlled numeric field the way the component expects.

   Three things have to be right. React ignores a plain value assignment, so the
   native setter is needed. The Slider keeps a draft string while focused and
   only commits it on blur. And React's onBlur is delegated from `focusout`, not
   `blur` — `blur` does not bubble, so a dispatched `blur` never reaches the
   listener and the draft is silently dropped. */
function typeInto(input: HTMLInputElement | undefined, value: number | string) {
  if (!input) throw new Error("no such field");
  const setter = must(
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set,
    "the native value setter",
  );
  setter.call(input, String(value));
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function setField(label: string, value: number | string) {
  const input = must(field(label), `the "${label}" field`);
  await act(async () => {
    typeInto(input, value);
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
}

describe("a control change re-solves", () => {
  it("a stage cut changes the design", async () => {
    /* The one that broke. Cuts reach the solver through effCuts, which reaches
       planMission as an array of indices. */
    await mount();
    const before = design();
    expect(stat("Liftoff mass")).not.toBe("—");

    /* The route starts folded until it has a cut (#134). */
    await openFold("Where it goes");
    const cuts = [...document.querySelectorAll("button")].filter(
      (b) => b.getAttribute("aria-label") === "Add staging event",
    );
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

    await openSetup();
    await openFold("Tech tree");
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

    expect(field("Payload delivered")?.value).toBe("2.5");
    await setField("Payload delivered", 9);
    await settle();

    expect(design(), "changing the payload did not change the design").not.toBe(
      before,
    );
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
    const input = must(field("Payload delivered"), "the payload field");
    expect(input.value).toBe("2.5");

    const realBlur = HTMLInputElement.prototype.blur;
    HTMLInputElement.prototype.blur = () => {};
    try {
      await act(async () => {
        input.focus();
      });
      await act(async () => {
        typeInto(input, 9);
        input.dispatchEvent(
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
    expect(field("Δv margin")?.value).toBe("10");
    await setField("Δv margin", 40);
    await settle();
    expect(design(), "changing the margin did not change the design").not.toBe(
      before,
    );
    cleanup();
  }, 300_000);

  it("the slenderness limit changes the design", async () => {
    /* On a 1 t payload, not the 2.5 t default. The limit only reaches the
       design when it binds, and the default stack comes out at 5.84:1 — under
       the slider's own minimum of 6, so no value it offers can touch it. A 1 t
       payload wants a pencil: 13.57:1 left alone, 5.02:1 held to 6. */
    await mount();
    await setField("Payload delivered", 1);
    await settle();
    const before = design();
    expect(field("Slenderness limit")?.value).toBe("14");
    await setField("Slenderness limit", 6);
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
    expect(field("Extra Δv")?.value).toBe("0");
    await setField("Extra Δv", 800);
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
    await click(allByLabel("Fewer stages")[0]);
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
