// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { RouteMap } from "../src/ui/components/route.jsx";
import type { Leg } from "../src/core/orbits.js";

/* The route map runs bottom-up — launchpad last, the way a rocket is read —
   and a cut is "separate after leg i". Its scissors therefore go between the
   row for leg i and the row for leg i + 1, which is above leg i's row. They
   sat below it for a long time, a slot too low everywhere, with one under
   the launchpad and none between the final burn and the leg before it. #139 */

afterEach(cleanup);

const leg = (label: string, free = false): Leg => ({
  label,
  dv: free ? 0 : 1000,
  kind: free ? "aero" : "transfer",
  body: "Kerbin",
  free,
});

const ROUTE = [
  leg("Launchpad → orbit"),
  leg("Orbit → escape"),
  leg("Capture"),
  leg("Aerobrake", true),
];

/* The map's rows and buttons in reading order, top of the page first: a leg
   by its label, a cut by the index its button toggles. */
type Spy = ((i: number) => void) & { last: number };
const reading = (root: HTMLElement, onToggle: Spy) => {
  const out: Array<string> = [];
  for (const el of root.querySelectorAll<HTMLElement>("button, .body")) {
    if (el.tagName === "BUTTON") {
      el.click();
      out.push(`cut ${onToggle.last}`);
    } else out.push(el.textContent ?? "");
  }
  return out;
};

describe("the route map", () => {
  it("puts each cut between the leg it follows and the next", () => {
    const toggle: Spy = Object.assign((i: number) => void (toggle.last = i), {
      last: -1,
    });
    const { container } = render(
      <RouteMap
        route={ROUTE}
        cuts={new Set([0])}
        onToggle={toggle}
        color="#fff"
        stages={[]}
        onPlaneMode={() => {}}
      />,
    );
    expect(reading(container, toggle)).toEqual([
      "Aerobrake",
      "Capture",
      "cut 1",
      "Orbit → escape",
      "cut 0",
      "Launchpad → orbit",
    ]);
    /* The one cut placed is after the launch, so it reads under the leg it
       ends and over the pad — and the ends of the route offer none: nothing
       to separate after the final burn, nothing after a free leg. */
    const cut = container.querySelector('[aria-label="Remove staging event"]');
    expect(cut?.textContent).toBe("separates here");
    expect(
      container.querySelectorAll('[aria-label$="staging event"]').length,
    ).toBe(2);
  });
});
