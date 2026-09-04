// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { settle } from "./app-harness.js";
import KSPMissionPlanner from "../src/ui/app.jsx";

/* Before the first solve has come back the results column has a shape and no
   numbers: the four sections' headings over a skeleton line each, and no
   alert. It used to show *No solution for at least one stage* under the veil,
   because an empty stage list is not a solved one — true, and the wrong thing
   to say to someone who has been on the page for a quarter of a second. Once
   a solve has returned there is no skeleton anywhere, whatever it found.
   #139 */

afterEach(cleanup);

const headings = () =>
  [...document.querySelectorAll("section[aria-busy] .label")].map((h) =>
    h.textContent?.trim(),
  );

describe("the first run", () => {
  it("shows the sections' shape before the first solve, and no alert", async () => {
    render(<KSPMissionPlanner />);
    /* Sorted: the route is second on the desktop, which jsdom is, and last
       on the phone; `results-order` holds the order, this holds the set. */
    expect(headings().sort()).toEqual(
      [
        "Your rocket",
        "How to build it",
        "How to fly it",
        "Where it goes",
      ].sort(),
    );
    expect(document.querySelectorAll("section[aria-busy] .skel").length).toBe(
      4,
    );
    expect(document.querySelector('[role="alert"]')).toBeNull();
    /* Nothing to fold yet: a fold on a section with nothing in it is a
       control that does nothing. */
    expect(
      document.querySelectorAll("section[aria-busy] button[aria-expanded]")
        .length,
    ).toBe(0);

    await settle();
    expect(document.querySelectorAll("[aria-busy]").length).toBe(0);
    expect(document.querySelectorAll(".skel").length).toBe(0);
  }, 300_000);
});
