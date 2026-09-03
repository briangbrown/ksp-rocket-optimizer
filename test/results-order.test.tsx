// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import KSPMissionPlanner from "../src/ui/app.jsx";
import { byText, click, openFold, settle } from "./app-harness.js";

/* The results in reading order, #134. The layout suite holds the order of
   the sections in a browser; this holds what jsdom can see of the rest: the
   build section is two lists behind one pair of tabs, and the route starts
   folded because nothing on it has been cut. */

afterEach(cleanup);

const heading = (text: string) =>
  [...document.querySelectorAll("section")].find(
    (s) =>
      document.getElementById(s.getAttribute("aria-labelledby") ?? "")
        ?.textContent === text,
  );

describe("the results", () => {
  it("show the design by stage, and the bill behind a tab", async () => {
    render(<KSPMissionPlanner />);
    await settle();
    const build = heading("How to build it");
    expect(build, "no build section").toBeTruthy();
    expect(
      build?.querySelector("table"),
      "the bill is showing first",
    ).toBeNull();
    expect(byText("auto"), "no stage-count picker").toBeTruthy();

    await click("Build order");
    expect(build?.querySelector("table"), "no parts table").toBeTruthy();
    expect(byText("auto")).toBeUndefined();

    await click("By stage");
    expect(build?.querySelector("table")).toBeNull();
  }, 120_000);

  it("keep the route folded until it is cut", async () => {
    render(<KSPMissionPlanner />);
    await settle();
    const route = heading("Where it goes");
    expect(route?.querySelector("button")?.getAttribute("aria-expanded")).toBe(
      "false",
    );
    expect(route?.textContent).toContain("7 legs · 7,216 m/s · one span");
    await openFold("Where it goes");
    const cut = [...document.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === "Add staging event",
    );
    await click(cut);
    await settle();
    /* Folded again, the line says so. */
    await click(route?.querySelector("button"));
    expect(route?.textContent).toContain("7 legs · 7,216 m/s · 1 cut");
  }, 180_000);
});
