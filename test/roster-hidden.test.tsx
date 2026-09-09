// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import KSPMissionPlanner from "../src/ui/app.jsx";
import { click, openSetup, settle } from "./app-harness.js";

/* ReStock+ hides its Making History stand-ins when the expansion is
   installed — see test/parts-data.test.ts for the list and the rule. This is
   the page's side: a shared design with both expansions on is built without
   them, and the tree says why the box is dead. The link is the one that
   reported it: a Kerbol fly-by, cheapest, whose second stage was a Caravel. */

const LINK =
  "#c=TVBBagMxDPzLnE1JaNqCboVAD4Veelxy0Hq1iYvXXiw5zRLy92JKltw0w2g0oyvGkifQFX0eFhA-pfQhwUGNTUDQWkb2gpuD5Qfhd31UjXHpl6YpYrWkkI6gkaOKw8xLzDyAtuu8Dwx6fnp7cZi4HEMCbTcOcrHC-zNo45D7H_EWzs3cZzU49DmrSVGQlSoO_lRNVpREho8w9RzvzBw5yVf-XZOwzlz4WHVlJr686yzeQNtdCzBz0pCTtqLT6e50v9l-EKSAXh1M_GkfxhHUHdqmj3WQ4R_5agpKNUYHnWNoqOs2bnc43P4A";

afterEach(() => {
  cleanup();
  location.hash = "";
});

const dialog = () => document.querySelector('[role="dialog"]') ?? document.body;
const button = (re: RegExp) =>
  [...dialog().querySelectorAll("button")].find((b) =>
    re.test(b.textContent ?? ""),
  );
const row = (re: RegExp) =>
  [...dialog().querySelectorAll("label")].find((l) =>
    re.test(l.textContent ?? ""),
  );
/* An expansion's row: its name leads the label. A part's row can carry the
   expansion's name too, in the reason it is dead, so the anchor matters. */
const box = (label: string) =>
  row(new RegExp(`^${label.replace("+", "\\+")}`))?.querySelector("input") as
    HTMLInputElement | undefined;

describe("ReStock+ stand-ins under Making History", () => {
  it("are not built, and the tree shows them dead with the reason", async () => {
    location.hash = LINK;
    render(<KSPMissionPlanner />);
    await settle();
    /* Solved, on both expansions, without the hidden engine. */
    expect(document.body.textContent).toMatch(/Kerbin → Kerbol/);
    expect(document.querySelector("#rocket")?.textContent).not.toMatch(
      /Caravel|Ursa|Castor|Galleon|Schnauzer|Trash Panda/,
    );

    await openSetup();
    expect(box("Making History")?.checked).toBe(true);
    expect(box("ReStock+")?.checked).toBe(true);
    const tree = button(/Tech tree/);
    if (tree?.getAttribute("aria-expanded") !== "true") await click(tree);
    const node = button(/^Heavier Rocketry/);
    /* Nine parts under the node, three of them stand-ins: the count is what
       the install offers. */
    expect(node?.textContent).toMatch(/6\/6$/);
    await click(node);
    const caravel = row(/Caravel/);
    const input = caravel?.querySelector("input") as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(input.checked).toBe(false);
    expect(caravel?.textContent).toMatch(
      /hidden by ReStock\+ with Making History/,
    );
    /* A real Making History part beside it is live. */
    const skiff = row(/Skiff/)?.querySelector("input") as HTMLInputElement;
    expect(skiff.disabled).toBe(false);
    expect(skiff.checked).toBe(true);

    /* Untick Making History and the stand-in is a part again. */
    await click(box("Making History"));
    const back = row(/Caravel/)?.querySelector("input") as HTMLInputElement;
    expect(back.disabled).toBe(false);
    expect(back.checked).toBe(true);
    expect(button(/^Heavier Rocketry/)?.textContent).toMatch(/\d+\/\d+$/);
  }, 240_000);
});
