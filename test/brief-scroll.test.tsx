// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import KSPMissionPlanner from "../src/ui/app.jsx";
import { click, settle } from "./app-harness.js";

/* On the phone the set brief is a bar stuck to the top of the window, and
   opening it from far down the page unfolded the form with its top off the
   window (#202). Opening it now scrolls the brief to the top; closing it
   does not; and on a wide screen, where the brief is a card in a column,
   neither does. jsdom has no layout, so the phone is a matchMedia that says
   so and the scroll is a spy on `scrollIntoView`. */

afterEach(() => {
  cleanup();
  location.hash = "";
  // @ts-expect-error restoring what the test replaced
  delete window.matchMedia;
});

const phone = (yes: boolean) => {
  window.matchMedia = ((q: string) => ({
    matches: yes ? /max-width/.test(q) : /min-width/.test(q),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
};
const fold = () =>
  [...document.querySelectorAll("button[aria-expanded]")].find((b) =>
    b.querySelector(".label")?.textContent?.trim().startsWith("Mission"),
  );
const frame = () =>
  act(async () => {
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  });

describe("opening the brief on the phone", () => {
  it("scrolls the brief to the top on open, and not on close", async () => {
    phone(true);
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    render(<KSPMissionPlanner />);
    await settle();
    /* Folded once the first design solved. */
    expect(fold()?.getAttribute("aria-expanded")).toBe("false");
    scrolled.mockClear();
    await click(fold());
    await frame();
    expect(fold()?.getAttribute("aria-expanded")).toBe("true");
    expect(scrolled).toHaveBeenCalledTimes(1);
    expect(scrolled.mock.instances[0]).toBe(document.getElementById("brief"));
    await click(fold());
    await frame();
    expect(fold()?.getAttribute("aria-expanded")).toBe("false");
    expect(scrolled).toHaveBeenCalledTimes(1);
  }, 120_000);

  it("leaves a wide screen where it is", async () => {
    phone(false);
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    render(<KSPMissionPlanner />);
    await settle();
    scrolled.mockClear();
    await click(fold());
    await frame();
    expect(fold()?.getAttribute("aria-expanded")).toBe("true");
    expect(scrolled).not.toHaveBeenCalled();
  }, 120_000);
});
