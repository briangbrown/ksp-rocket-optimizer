// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import KSPMissionPlanner from "../src/ui/app.jsx";
import {
  click,
  openBrief,
  openFold,
  openSetup,
  settle,
} from "./app-harness.js";

/* Every paragraph behind a disclosure, #135. What jsdom can hold of it: the
   page's explanations are each behind an `i`, their words are in the DOM
   whether or not it has been pressed — so the render sweep's text scan reaches
   them — and pressing it shows them. A `title=` attribute is not a disclosure
   and is not a tooltip, so none is left on anything but a link. */

afterEach(cleanup);

/* A disclosure is the button that controls a region; the region is what it
   says. */
const disclosures = () =>
  [...document.querySelectorAll("button[aria-controls]")].filter((b) =>
    b.hasAttribute("aria-expanded"),
  );
const region = (b: Element) =>
  document.getElementById(b.getAttribute("aria-controls") ?? "");

/* The disclosures the app carries, once every fold that hides one is open:
   five slider hints, the objectives, the parachutes, the ascent's method,
   and the setup sheet's About. Callouts add theirs when they appear. */
const AT_LEAST = 9;

describe("a disclosure", () => {
  it("holds its words in the DOM whether or not it is open", async () => {
    render(<KSPMissionPlanner />);
    await settle();
    await openBrief();
    await openFold("More options");
    await openSetup();

    const all = disclosures();
    expect(all.length).toBeGreaterThanOrEqual(AT_LEAST);
    for (const b of all) {
      const name = b.getAttribute("aria-label") ?? b.textContent?.trim() ?? "?";
      expect(b.getAttribute("aria-expanded"), name).toBe("false");
      const r = region(b);
      expect(r, `${name}: no region`).toBeTruthy();
      expect(r?.hidden, `${name}: showing while closed`).toBe(true);
      expect(
        (r?.textContent ?? "").split(/\s+/).length,
        `${name}: nothing to disclose`,
      ).toBeGreaterThan(5);
    }
  }, 120_000);

  it("opens on a press and closes on Escape", async () => {
    render(<KSPMissionPlanner />);
    await settle();
    await openBrief();
    const b = disclosures().find(
      (x) => x.getAttribute("aria-label") === "About Payload delivered",
    );
    expect(b, "no payload hint").toBeTruthy();
    await click(b);
    expect(b?.getAttribute("aria-expanded")).toBe("true");
    expect(region(b!)?.hidden).toBe(false);
    expect(region(b!)?.textContent).toMatch(/pod, probe, science/);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(b?.getAttribute("aria-expanded")).toBe("false");
    expect(region(b!)?.hidden).toBe(true);
  }, 120_000);

  it("is the only tooltip: no title= outside a link", async () => {
    render(<KSPMissionPlanner />);
    await settle();
    await openBrief();
    await openFold("More options");
    await openSetup();
    const titled = [...document.querySelectorAll("[title]")].filter(
      (el) => el.tagName !== "A",
    );
    expect(titled.map((el) => el.outerHTML.slice(0, 80))).toEqual([]);
  }, 120_000);
});
