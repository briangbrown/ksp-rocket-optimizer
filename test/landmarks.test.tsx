// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import KSPMissionPlanner from "../src/ui/app.jsx";
import {
  openBrief,
  openFold,
  openSetup,
  settle,
  solving,
} from "./app-harness.js";

/* What a screen reader is given to navigate by, #141: one main, one footer,
   one h1; every section a landmark named by the heading it starts with, at a
   level that never skips; the setup dialog headed the same way; and the
   solving state in a live region that says what it is doing and then what
   came of it. The full-screen overlay is a dialog too, but jsdom draws no
   WebGL and never offers it — visual/render.test.ts holds that one. */

afterEach(cleanup);

const headings = () =>
  [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].map((h) => ({
    level: Number(h.tagName[1]),
    text: h.textContent?.trim() ?? "",
  }));

const status = () =>
  document.querySelector('[role="status"]')?.textContent ?? null;

describe("the page's landmarks", () => {
  it("has one main, one footer outside it, and one h1", async () => {
    render(<KSPMissionPlanner />);
    await settle();
    expect(document.querySelectorAll("main").length).toBe(1);
    expect(document.querySelectorAll("footer").length).toBe(1);
    expect(document.querySelector("footer")?.closest("main")).toBeNull();
    expect(document.querySelectorAll("h1").length).toBe(1);
    /* Every section is inside the main, so nothing is outside a landmark. */
    for (const s of document.querySelectorAll("section"))
      expect(s.closest("main, [role='dialog']"), s.id).not.toBeNull();
  }, 120_000);

  it("names every section by a heading, at a level that never skips", async () => {
    render(<KSPMissionPlanner />);
    await settle();
    await openBrief();
    await openFold("More options");
    await openFold("Where it goes");
    await openSetup();
    for (const s of document.querySelectorAll("section")) {
      const id = s.getAttribute("aria-labelledby");
      const h = id ? document.getElementById(id) : null;
      expect(
        h,
        `a section with no heading: ${s.id || "(bare)"}`,
      ).not.toBeNull();
      expect(h?.tagName, `${h?.textContent} is not a heading`).toMatch(
        /^H[23]$/,
      );
    }
    const hs = headings();
    expect(hs[0].level).toBe(1);
    let prev = 0;
    for (const h of hs) {
      expect(
        h.level,
        `"${h.text}" is h${h.level} after h${prev}`,
      ).toBeLessThanOrEqual(prev + 1);
      prev = h.level;
    }
    /* The brief's folds are inside the brief, and the sheet's section is
       inside the sheet. */
    /* Among the sections' headings: the h1 is "Mission Δv Planner", and
       the mission section's heading starts the same way. */
    const by = (text: string) =>
      hs.find((h) => h.level > 1 && h.text.startsWith(text));
    expect(by("Mission")?.level).toBe(2);
    expect(by("More options")?.level).toBe(3);
    expect(document.querySelector('[role="dialog"] h2')?.textContent).toBe(
      "Setup",
    );
    expect(by("Tech tree")?.level).toBe(3);
  }, 120_000);
});

describe("the solving state", () => {
  it("is a live region that says what it is doing, then what came of it", async () => {
    render(<KSPMissionPlanner />);
    expect(document.querySelector('[role="status"]')).not.toBeNull();
    /* While it runs: the same words as the pill. */
    for (let i = 0; i < 100 && !solving(); i++)
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });
    expect(solving(), "never saw it solving").toBe(true);
    expect(status()).toMatch(/^Solving Kerbin → Mun…$/);
    /* And after: the craft and its liftoff mass, not silence. */
    await settle();
    expect(status()).toMatch(/^.+: [\d.,]+ t at liftoff\.$/);
  }, 120_000);
});
