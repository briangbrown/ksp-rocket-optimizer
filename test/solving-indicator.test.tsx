// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";

/* Can you see that it is solving?

   The pill is `position: fixed`, which pins it to the layout viewport. An
   on-screen keyboard does not shrink that one — it shrinks the visual viewport,
   and the browser scrolls the focused field up into what is left — so the pill
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
const { must } = await import("./must.js");
const { default: KSPMissionPlanner } = await import("../src/ui/app.jsx");

/* The one fixed layer above everything but a sheet: the pill's row, which
   was a bar across the page until #136. */
const pill = () =>
  [...document.querySelectorAll("div")].find(
    (d) => d.style.position === "fixed" && d.style.zIndex === "50",
  );

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
    /* Move the visible area, the way opening a keyboard does. */
    async moveTo(top: number) {
      this.offsetTop = top;
      await act(async () => {
        for (const fn of listeners.resize ?? []) fn();
      });
    },
    listeners,
  };
  /* Two members of a VisualViewport, which is all the app reads of one. jsdom
     implements none of it, so a stand-in is the only way to drive this at all
     — and standing in for an interface is what an assertion is for. */
  window.visualViewport = vv as unknown as VisualViewport;
  return vv;
}

afterEach(() => {
  cleanup();
  delete (window as { visualViewport?: unknown }).visualViewport;
});

describe("the solving pill", () => {
  it("follows the visual viewport when a keyboard pushes it", async () => {
    const vv = fakeViewport();
    render(<KSPMissionPlanner />);
    await settle(30_000);

    const el = pill();
    expect(el, "no fixed solving pill rendered").toBeTruthy();
    expect(must(el, "the solving pill").style.transform).toBe(
      "translateY(0px)",
    );

    await vv.moveTo(240);
    expect(
      must(pill(), "the solving pill").style.transform,
      "the pill stayed at the top of the layout viewport, which is off screen",
    ).toBe("translateY(240px)");

    await vv.moveTo(0);
    expect(must(pill(), "the solving pill").style.transform).toBe(
      "translateY(0px)",
    );
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
