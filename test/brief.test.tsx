// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { act } from "react";
import { must } from "./must.js";
import KSPMissionPlanner from "../src/ui/app.jsx";
import {
  byText,
  click,
  openBrief,
  openSetup,
  settle,
  solving,
} from "./app-harness.js";

/* The brief folds and unfolds, #133.

   The inputs card is the form while the mission is being decided and one line
   once it is. The rules: open on mount; folded by the first design that
   solves; stays wherever the reader put it after that, across every re-solve,
   until they say Done; and folded, it is stuck to the top of the page — the
   visual viewport's top, for the same reason as the solving bar. Each is a
   state the render sweep drives through without asserting. */

const brief = () =>
  must(
    [...document.querySelectorAll("button[aria-expanded]")].find(
      (b) => b.querySelector(".label")?.textContent?.trim() === "Brief",
    ),
    "the brief's header",
  );
const briefOpen = () => brief().getAttribute("aria-expanded") === "true";
const briefCard = () => must(brief().closest("section"), "the brief's card");
/* The set line is the header's summary: the one bold body span in it. */
const line = () => brief().querySelector(".body")?.textContent ?? null;

function fakeViewport() {
  const listeners: Record<string, Array<() => void>> = {};
  const vv = {
    offsetTop: 0,
    addEventListener: (type: string, fn: () => void) => (
      (listeners[type] ??= []).push(fn),
      null
    ),
    removeEventListener: (type: string, fn: () => void) => {
      listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn);
    },
    async moveTo(top: number) {
      this.offsetTop = top;
      await act(async () => {
        for (const fn of listeners.resize ?? []) fn();
      });
    },
  };
  window.visualViewport = vv as unknown as VisualViewport;
  return vv;
}

afterEach(() => {
  cleanup();
  delete (window as { visualViewport?: unknown }).visualViewport;
});

describe("the brief", () => {
  it("is the form until the first design solves, then a line", async () => {
    render(<KSPMissionPlanner />);
    expect(briefOpen(), "the brief should open as the form").toBe(true);
    expect(line(), "no summary while the form is open").toBeNull();
    await settle();
    expect(briefOpen(), "the brief did not fold on the first design").toBe(
      false,
    );
    expect(line()).toBe("Kerbin → Mun · land & return · 2.5 t · cheapest");
  }, 120_000);

  it("stays open once touched, follows every change, and folds on Done", async () => {
    render(<KSPMissionPlanner />);
    await settle();
    await openBrief();
    expect(briefOpen()).toBe(true);

    /* A change re-solves; the fold that follows the first solve must not
       follow this one, or the form vanishes under the reader's thumb. */
    await click("Minmus");
    expect(solving(), "the change did not start a solve").toBe(true);
    await settle();
    expect(briefOpen(), "the brief folded on a re-solve").toBe(true);
    await click("Fewest parts");
    await click("Return trip");
    await settle();
    expect(briefOpen()).toBe(true);

    await click("Done");
    expect(briefOpen()).toBe(false);
    expect(line()).toBe(
      "Kerbin → Minmus · land, one way · 2.5 t · fewest parts",
    );
  }, 180_000);

  it("is stuck to the top of the visual viewport when set", async () => {
    const vv = fakeViewport();
    render(<KSPMissionPlanner />);
    await settle();
    expect(briefOpen()).toBe(false);
    const card = briefCard();
    expect(card.style.position).toBe("sticky");
    expect(card.style.transform).toBe("translateY(0px)");
    await vv.moveTo(240);
    expect(
      briefCard().style.transform,
      "the set brief stayed at the top of the layout viewport",
    ).toBe("translateY(240px)");

    /* Open, it is a card in the flow like any other. */
    await openBrief();
    expect(briefCard().style.position).toBe("");
  }, 120_000);

  it("keeps setup in a sheet behind the header's gear", async () => {
    render(<KSPMissionPlanner />);
    await settle();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(byText("Light"), "the theme choice is on the page").toBeUndefined();
    await openSetup();
    const sheet = must(document.querySelector('[role="dialog"]'), "the sheet");
    expect(sheet.textContent).toContain("Installed");
    expect(sheet.textContent).toContain("Tech tree");
    expect(sheet.textContent).toContain("Configuration");
    expect(byText("Light")).toBeTruthy();
    await click("Close");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  }, 120_000);
});
