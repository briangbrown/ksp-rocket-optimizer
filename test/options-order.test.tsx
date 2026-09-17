// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import KSPMissionPlanner from "../src/ui/app.jsx";
import { byText, click, openBrief, openFold, settle } from "./app-harness.js";

/* The order of the mission's options, and that none of them come and go.

   The brief's options had accreted in the order they were built: the two
   least-touched limits opened the fold, and "Stay at least" — the other half
   of the departure date — sat three controls from it and vanished whenever
   the return was switched off. Now the fold is four labelled groups in the
   order a reader touches them, and every control stands whether or not it
   counts for this mission, saying so when it does not. #451 */

afterEach(cleanup);

/* The labels a reader scans, in document order: group headings and field
   labels are `.label` spans, and a toggle is a chip whose text is its label. */
const labels = (root: ParentNode) =>
  [...root.querySelectorAll(".label, button.chip")]
    .map((el) => el.textContent?.trim() ?? "")
    .filter(Boolean);
const labelled = (text: string) =>
  labels(document).some((l) => l.startsWith(text));

describe("the mission's options", () => {
  it("fold into four groups, most touched first, with the date whole", async () => {
    render(<KSPMissionPlanner />);
    await settle();
    await openBrief();
    await openFold("More options");
    const seen = labels(document);
    const order = [
      "When",
      "Leave from year",
      "and day",
      "Stay at least",
      "How you fly it",
      "Transfer",
      "Burns",
      "What may go on it",
      "Parachutes fitted",
      "Radial boosters allowed",
      "Asparagus staging",
      "Gimbal in atmosphere",
      "Limits",
      "Slenderness limit",
      "Extra Δv",
    ];
    const at = order.map((l) => seen.findIndex((s) => s.startsWith(l)));
    for (const [i, l] of order.entries())
      expect(at[i], `${l} is not on the page`).toBeGreaterThanOrEqual(0);
    for (let i = 1; i < order.length; i++)
      expect(at[i], `${order[i]} comes before ${order[i - 1]}`).toBeGreaterThan(
        at[i - 1],
      );
  }, 120_000);

  it("keep the stay in view when the trip is one way", async () => {
    render(<KSPMissionPlanner />);
    await settle();
    await openBrief();
    await openFold("More options");
    expect(labelled("Stay at least")).toBe(true);
    await click(byText("Return trip"));
    await settle();
    /* Still there, and saying when it counts. */
    expect(labelled("Stay at least")).toBe(true);
    expect(document.body.textContent).toMatch(/Counts on a return trip/);
  }, 120_000);
});
