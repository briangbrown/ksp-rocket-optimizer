// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import KSPMissionPlanner from "../src/ui/app.jsx";
import { fromLink, toLink } from "../src/ui/link.js";
import { allByLabel, click, settle } from "./app-harness.js";

/* The design as a link, #140, from the page's side. A link that will not
   read is a callout over the default rocket and never a blank page; a link
   that reads arrives with the brief set; and the share button on the set
   brief puts the link on the clipboard and says so. The codec itself is
   test/link.test.ts, and what the seam is handed either way is
   test/seam-input.test.tsx. */

afterEach(() => {
  cleanup();
  location.hash = "";
});

const rocketNote = (severity: string) =>
  document.querySelector(`#rocket .callout[data-severity="${severity}"]`);
const briefFold = () =>
  [...document.querySelectorAll("button[aria-expanded]")].find((b) =>
    b.querySelector(".label")?.textContent?.trim().startsWith("Mission"),
  );

describe("a design as a link", () => {
  it("says so where the link will not read, over the default rocket", async () => {
    location.hash = "#c=not-a-design";
    render(<KSPMissionPlanner />);
    await settle();
    const note = rocketNote("bad");
    expect(note?.textContent).toMatch(/did not carry a design/);
    expect(rocketNote("bad")?.textContent).not.toMatch(/No solution/);
    expect(
      document.querySelectorAll("#rocket .callout[data-severity='bad']").length,
    ).toBe(1);
    expect(document.querySelector("canvas, table")).toBeTruthy();
  }, 120_000);

  it("arrives with the brief set and the rocket in view", async () => {
    /* A link the app itself would write: the default mission with the
       payload changed, so that loading it is visible. */
    const text =
      "KSP-PLANNER " +
      JSON.stringify({ dest: "Minmus", payload: 4.5, tech: ["Start"] });
    location.hash = await toLink(text);
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    render(<KSPMissionPlanner />);
    /* Before the solve returns: the brief is already set. */
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(briefFold()?.getAttribute("aria-expanded")).toBe("false");
    await settle();
    expect(briefFold()?.textContent).toMatch(/Minmus/);
    expect(briefFold()?.textContent).toMatch(/4\.5/);
    expect(scrolled).toHaveBeenCalled();
    /* Most settings were left at their defaults, which the link is told. */
    expect(rocketNote("info")?.textContent).toMatch(/left at their defaults/);
  }, 120_000);

  it("shares the design from the set brief", async () => {
    const written: Array<string> = [];
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: async (s: string) => void written.push(s) },
      configurable: true,
    });
    render(<KSPMissionPlanner />);
    await settle();
    const share = allByLabel("Share the link");
    expect(share.length, "no share button on the set brief").toBe(1);
    await click(share[0]);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(written.length).toBe(1);
    const url = new URL(written[0]);
    expect(url.origin + url.pathname).toBe(location.origin + location.pathname);
    const back = await fromLink(url.hash);
    expect(back && "text" in back && back.text).toMatch(/^KSP-PLANNER \{/);
    expect(rocketNote("good")?.textContent).toBe("Link copied.");
    /* The address bar carries the same link without asking. */
    expect(location.hash).toBe(url.hash);
  }, 120_000);
});
