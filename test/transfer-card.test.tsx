// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import KSPMissionPlanner from "../src/ui/app.jsx";
import { toLink } from "../src/ui/link.js";
import { click, field, openBrief, openFold, settle } from "./app-harness.js";

/* The transfer card (#197): on an interplanetary mission the Fly section
   shows when to leave, the burn and its angle, the two drawings, and the
   window home; the brief's start date moves the window. */

afterEach(() => {
  cleanup();
  location.hash = "";
});

const config = (extra: object) =>
  "KSP-PLANNER " +
  JSON.stringify({
    from: { body: "Kerbin", state: "surface" },
    to: { body: "Duna", state: "low" },
    returning: true,
    payload: 1,
    payloadDia: 1.25,
    margin: 10,
    extraDv: 0,
    objective: "mass",
    boosters: true,
    chutes: true,
    needGimbal: true,
    planeNow: false,
    asparagus: false,
    maxAspect: 14,
    leaveAfter: 0,
    stay: 0,
    expansions: { mh: false, rs: true },
    tech: [],
    excluded: [],
    cuts: null,
    splits: [],
    ...extra,
  });

const fly = () => document.querySelector("#fly")?.textContent ?? "";

describe("the transfer card", () => {
  it("shows the window out and home, drawn and dated", async () => {
    location.hash = await toLink(config({}));
    render(<KSPMissionPlanner />);
    await settle();
    await openFold("How to fly it").catch(() => {});
    expect(fly()).toMatch(/The transfer to Duna/);
    expect(fly()).toMatch(/The transfer home to Kerbin/);
    /* The classic window: Year 1, in the 230s, from prograde. */
    expect(fly()).toMatch(/Leave\s*Y1 D2[2-4]\d \d\d:\d\d:\d\d/);
    expect(fly()).toMatch(/from prograde/);
    expect(fly()).toMatch(/Phase angle/);
    const imgs = document.querySelectorAll("#fly svg[role=img]");
    expect(imgs.length).toBe(4);
    for (const svg of imgs) expect(svg.innerHTML).not.toMatch(/NaN/);
    /* And the route names the same window on its leg. */
    expect(document.body.textContent).toMatch(/Leave Kerbin for Duna/);
  }, 180_000);

  it("flies the transfer the reader chooses", async () => {
    /* Duna's cheapest transfer is the mid-course one, seven metres a
       second of plane change; insisting on ballistic drops that burn and
       says so on the card. */
    location.hash = await toLink(config({}));
    render(<KSPMissionPlanner />);
    await settle();
    await openFold("How to fly it").catch(() => {});
    expect(fly()).toMatch(/Transfer\s*mid-course/);
    expect(fly()).toMatch(/Plane change/);
    await openBrief();
    await openFold("More options").catch(() => {});
    await click("Ballistic");
    await settle();
    expect(fly()).toMatch(/Transfer\s*ballistic/);
    expect(fly()).not.toMatch(/Plane change/);
    expect(fly()).toMatch(/Burn components/);
    location.hash = "";
  }, 180_000);

  it("offers a cheaper later window, and leaves then when asked", async () => {
    location.hash = await toLink(
      config({ to: { body: "Moho", state: "low" } }),
    );
    render(<KSPMissionPlanner />);
    await settle();
    await openFold("How to fly it").catch(() => {});
    expect(fly()).toMatch(/Leave\s*Y1 D(9\d|1\d\d) /);
    expect(fly()).toMatch(/A cheaper window follows on Y1 D2\d\d/);
    /* And the plot marks it, hollow. #213 */
    expect(document.querySelector("#fly [data-mark=next]")).toBeTruthy();
    await click("Leave then instead");
    await settle();
    /* Moho's windows keep differing, so a further offer may follow this
       one; what matters is that the window moved to the one offered. */
    expect(fly()).toMatch(/Leave\s*Y1 D2[5-9]\d /);
  }, 180_000);

  it("moves the window when the start date does", async () => {
    location.hash = await toLink(config({ leaveAfter: 0 }));
    render(<KSPMissionPlanner />);
    await settle();
    await openFold("How to fly it").catch(() => {});
    expect(fly()).toMatch(/Leave\s*Y1 D2[2-4]\d/);
    await openBrief();
    await openFold("More options").catch(() => {});
    const year = field("Leave from year") as HTMLInputElement;
    expect(year).toBeTruthy();
    await act(async () => {
      year.focus();
      year.value = "2";
      year.dispatchEvent(new Event("input", { bubbles: true }));
      year.dispatchEvent(new Event("change", { bubbles: true }));
      year.blur();
    });
    await settle();
    /* A synodic period on: the next Duna window is in Year 3. */
    expect(fly()).toMatch(/Leave\s*Y3 D/);
    expect(location.hash.length).toBeGreaterThan(10);
  }, 180_000);

  it("draws the Δv plot under each transfer, described, and none for the Mun", async () => {
    /* #213: one plot a transfer card, out and home, each a named image
       whose label says the axes and the window; the scale bar names five
       values, ascending to four times the cheapest. jsdom paints no canvas,
       so what is checked here is the overlay and the description; the
       pixels are the visual suite's. */
    location.hash = await toLink(config({}));
    render(<KSPMissionPlanner />);
    await settle();
    await openFold("How to fly it").catch(() => {});
    const plots = document.querySelectorAll("#fly [data-plot]");
    expect(plots.length).toBe(2);
    expect(plots[0].getAttribute("data-plot")).toBe("Kerbin-Duna");
    expect(plots[1].getAttribute("data-plot")).toBe("Duna-Kerbin");
    const label = plots[0].getAttribute("aria-label") ?? "";
    expect(label).toMatch(
      /departures from Y1 D1 to Y\d D\d+ along the bottom, flights of \d+ to \d+ days up the side/,
    );
    expect(label).toMatch(
      /The window chosen is marked: leaving Y1 D2[2-4]\d after \d+ days of flight, [\d,]+ m\/s\./,
    );
    expect(plots[0].querySelector("[data-mark=window]")).toBeTruthy();
    expect(plots[0].querySelector("canvas")).toBeTruthy();
    const scale = [...plots[0].querySelectorAll("[data-scale]")].map((e) =>
      Number(e.getAttribute("data-scale")),
    );
    expect(scale.length).toBe(5);
    for (let k = 1; k < 5; k++) expect(scale[k]).toBeGreaterThan(scale[k - 1]);
    /* Log: the middle value is the geometric mean of the ends, and the top
       is the grid's dearest cell — for Duna, well over four times the
       cheapest. */
    expect(scale[2] / Math.sqrt(scale[0] * scale[4])).toBeCloseTo(1, 2);
    expect(scale[4]).toBeGreaterThan(8 * scale[0]);
    expect(plots[0].innerHTML).not.toMatch(/NaN/);
    /* Still four named drawings: the plot's overlay is not one of them. */
    expect(document.querySelectorAll("#fly svg[role=img]").length).toBe(4);
    cleanup();
    location.hash = "";
    render(<KSPMissionPlanner />);
    await settle();
    await openFold("How to fly it").catch(() => {});
    expect(document.querySelectorAll("#fly [data-plot]").length).toBe(0);
  }, 180_000);
});
