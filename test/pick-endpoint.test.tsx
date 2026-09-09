// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import KSPMissionPlanner from "../src/ui/app.jsx";
import { click, openBrief, settle } from "./app-harness.js";

/* Picking a body on the brief. The state already chosen stays where the new
   body can do it, and tapping the body already chosen changes nothing: a
   shared Kerbol fly-by, tapped on Kerbol, became a 36 km/s low solar orbit
   with no solution and an empty page where the rocket had been. Where the
   state cannot carry, the body opens on the first it can — surface, then low
   orbit — except Kerbol, which opens on a fly-by, the one Kerbol mission
   anyone means. */

const LINK =
  "#c=TVBBagMxDPzLnE1JaNqCboVAD4Veelxy0Hq1iYvXXiw5zRLy92JKltw0w2g0oyvGkifQFX0eFhA-pfQhwUGNTUDQWkb2gpuD5Qfhd31UjXHpl6YpYrWkkI6gkaOKw8xLzDyAtuu8Dwx6fnp7cZi4HEMCbTcOcrHC-zNo45D7H_EWzs3cZzU49DmrSVGQlSoO_lRNVpREho8w9RzvzBw5yVf-XZOwzlz4WHVlJr686yzeQNtdCzBz0pCTtqLT6e50v9l-EKSAXh1M_GkfxhHUHdqmj3WQ4R_5agpKNUYHnWNoqOs2bnc43P4A";

afterEach(() => {
  cleanup();
  location.hash = "";
});

const text = () => document.body.textContent ?? "";
const body = (name: string) =>
  [...document.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === name,
  );
/* The To end's state chip, as the open brief shows it: the To group comes
   first, so the first chip of that name is its. */
const arriving = () =>
  ["Surface", "Low orbit", "Stationary orbit", "Fly-by"].find(
    (s) => body(s)?.getAttribute("data-on") === "1",
  );
const solved = () => !/No solution/.test(text());

describe("picking a body on the brief", () => {
  it("keeps a shared Kerbol fly-by a fly-by when Kerbol is tapped again", async () => {
    location.hash = LINK;
    render(<KSPMissionPlanner />);
    await settle();
    expect(text()).toMatch(/Kerbol · fly-by/);
    expect(solved()).toBe(true);
    await openBrief();
    expect(arriving()).toBe("Fly-by");
    await click(body("Kerbol"));
    await settle();
    expect(arriving()).toBe("Fly-by");
    expect(text()).toMatch(/building your Kerbol rocket/);
    expect(solved()).toBe(true);
    /* The chips' reason names the body as the page does. */
    expect(text()).toMatch(/Kerbol has no surface to land on/);
    expect(text()).not.toMatch(/\bSun has no surface/);
  }, 180_000);

  it("carries the state to the next body where it can, and opens Kerbol on a fly-by", async () => {
    render(<KSPMissionPlanner />);
    await settle();
    expect(text()).toMatch(/Mun · land & return/);
    await openBrief();
    /* A landing stays a landing. */
    expect(arriving()).toBe("Surface");
    await click(body("Duna"));
    await settle();
    expect(arriving()).toBe("Surface");
    expect(text()).toMatch(/building your Duna rocket/);
    /* Kerbol cannot be landed on, and its low orbit is not the default.
       Whether tier 5 can throw 2.5 t at the sun is solvability's question,
       not this test's. */
    await click(body("Kerbol"));
    await settle();
    expect(arriving()).toBe("Fly-by");
    /* And a fly-by carries on to a body that can be flown by. */
    await click(body("Duna"));
    await settle();
    expect(arriving()).toBe("Fly-by");
    expect(text()).toMatch(/building your Duna rocket/);
  }, 180_000);
});
