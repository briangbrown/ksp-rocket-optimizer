// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";

/* Can you see that it is solving?

   The bar is `position: fixed`, which pins it to the layout viewport. An
   on-screen keyboard does not shrink that one — it shrinks the visual viewport,
   and the browser scrolls the focused field up into what is left — so the bar
   ends up above the visible area at exactly the moment it is needed: you have
   typed a value into a field and want to know the solve started. Reported from
   an Android phone as the solve appearing not to run at all, because the only
   thing saying it had was off screen.

   jsdom has no visualViewport, so this installs one and moves it. The solver is
   mocked out — this is about where a box is drawn, not what it contains. */

vi.mock("../src/ui/solver-client.js", () => ({
  usingWorker: () => true,
  cancelSolve: () => {},
  solve: () => Promise.resolve({ stages: [], tally: {} }),
}));

const { render, cleanup } = await import("@testing-library/react");
const { act } = await import("react");
const { settle } = await import("./app-harness.js");
const { default: KSPMissionPlanner } = await import("../src/ui/app.jsx");

/* The one fixed, full-width layer above everything else. */
const bar = () =>
  [...document.querySelectorAll("div")].find(
    (d) => d.style.position === "fixed" && d.style.zIndex === "50",
  );

function fakeViewport() {
  const listeners = {};
  const vv = {
    offsetTop: 0,
    addEventListener: (type, fn) => ((listeners[type] ??= []).push(fn), null),
    removeEventListener: (type, fn) => {
      listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn);
    },
    /* Move the visible area, the way opening a keyboard does. */
    async moveTo(top) {
      this.offsetTop = top;
      await act(async () => {
        for (const fn of listeners.resize ?? []) fn();
      });
    },
    listeners,
  };
  window.visualViewport = vv;
  return vv;
}

afterEach(() => {
  cleanup();
  delete window.visualViewport;
});

describe("the solving bar", () => {
  it("follows the visual viewport when a keyboard pushes it", async () => {
    const vv = fakeViewport();
    render(<KSPMissionPlanner />);
    await settle(30_000);

    const el = bar();
    expect(el, "no fixed solving bar rendered").toBeTruthy();
    expect(el.style.transform).toBe("translateY(0px)");

    await vv.moveTo(240);
    expect(
      bar().style.transform,
      "the bar stayed at the top of the layout viewport, which is off screen",
    ).toBe("translateY(240px)");

    await vv.moveTo(0);
    expect(bar().style.transform).toBe("translateY(0px)");
  }, 60_000);

  it("unsubscribes on unmount", async () => {
    /* A listener left on visualViewport outlives the app and calls setState on
       an unmounted tree. */
    const vv = fakeViewport();
    render(<KSPMissionPlanner />);
    await settle(30_000);
    expect(vv.listeners.resize?.length).toBe(1);
    cleanup();
    expect(vv.listeners.resize?.length ?? 0).toBe(0);
    expect(vv.listeners.scroll?.length ?? 0).toBe(0);
  }, 60_000);
});
