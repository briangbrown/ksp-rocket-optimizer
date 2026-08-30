// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { act } from "react";
import { byText, settle, stat } from "./app-harness.js";
import KSPMissionPlanner from "../src/ui/app.jsx";

/* The render sweep.

   Drives the real application across destinations, objectives and profiles, and
   fails on two things:

     1. NaN, Infinity, undefined or null reaching the rendered output — in text,
        or in a style attribute, where a bad number becomes a mispositioned part
        rather than a visible error.

     2. A destination that used to produce a design quietly ceasing to.

   The second check is not in the original description of this sweep, and it is
   the more useful of the two. `fmt` (see the top of the source) converts every
   non-finite number to an em-dash before it is displayed, so a NaN travelling
   through any Stat is invisible to a text scan — verified by forcing liftoff
   mass to NaN, which the scan did not see. What a reader would actually notice
   is the design turning into a row of dashes, so that is what is asserted.

   Mounting the component at all is a meaningful part of the value here: the
   crash-on-load this sweep originally caught was a const used before its
   declaration, which neither the linter nor the bundler flagged. */

const BAD_TEXT = /\b(NaN|Infinity|undefined|null)\b/;

/* Style attributes are scanned too, but expect little from it.

   The CSSOM validates on assignment and silently drops anything it cannot
   parse, so `width: NaN%`, `width: undefinedpx` and `opacity: NaN` all leave no
   trace — reading the attribute back gives null, not the bad value. That is
   jsdom and real browsers alike, so no DOM-based scan can catch a bad number in
   a numeric CSS property. Only string-valued properties survive to be seen,
   `font-family: NaN` being the type case.

   Catching a bad number in the drawing therefore needs assertions on the
   geometry functions themselves — `stageGeom` and `stageSize` are pure and
   testable — which is what test/model.test.js does instead, over the models the
   build view actually draws. It read the SVG attributes jsdom preserves until
   #63 step 4 removed the SVG; there is nothing to read now, since jsdom makes
   no WebGL context. */
const BAD_STYLE = /\b(NaN|Infinity|undefined)\b/;

async function click(label: string) {
  const el = byText(label);
  if (!el) throw new Error(`no button labelled "${label}"`);
  await act(async () => {
    el.click();
  });
}

/* Offenders are reported with context — "NaN appears somewhere in 10 kB of text"
   is not an actionable failure. */
function scan(where: string) {
  const problems: Array<string> = [];

  const text = document.body.textContent ?? "";
  const m = text.match(BAD_TEXT);
  if (m) {
    const at = text.indexOf(m[0]);
    problems.push(
      `${where}: "${m[0]}" in text near …${text.slice(Math.max(0, at - 60), at + 60)}…`,
    );
  }

  for (const el of document.querySelectorAll("[style]")) {
    const style = el.getAttribute("style") ?? "";
    const sm = style.match(BAD_STYLE);
    if (sm) {
      problems.push(
        `${where}: "${sm[0]}" in style="${style.slice(0, 120)}" on <${el.tagName.toLowerCase()}>`,
      );
      break;
    }
  }

  return problems;
}

const DESTINATIONS = [
  "Low orbit",
  "Stationary orbit",
  "Moho",
  "Eve",
  "Gilly",
  "Mun",
  "Minmus",
  "Duna",
  "Ike",
  "Dres",
  "Jool",
  "Laythe",
  "Vall",
  "Tylo",
  "Pol",
  "Eeloo",
];
const OBJECTIVES = ["Lightest", "Cheapest", "Fewest parts"];
const PROFILES = ["Flyby", "Orbit", "Land"];

describe("render sweep", () => {
  it("mounts without a bad value in the initial render", async () => {
    render(<KSPMissionPlanner />);
    await settle();
    expect(scan("initial mount")).toEqual([]);
    cleanup();
  }, 180_000);

  it("renders every destination, and the same ones still produce a design", async () => {
    render(<KSPMissionPlanner />);
    await settle();

    const problems = [];
    const table = [];
    for (const dest of DESTINATIONS) {
      await click(dest);
      await settle();
      problems.push(...scan(`destination ${dest}`));
      table.push(
        `${dest.padEnd(18)} liftoff=${String(stat("Liftoff mass")).padEnd(9)} stages=${stat("Stages")}`,
      );
    }
    cleanup();

    expect(problems).toEqual([]);

    /* Which destinations are buildable at the default tech tier and payload,
       and how big the rocket comes out. Six of the sixteen are dashes — Moho,
       Eve, Laythe, Vall, Tylo and Eeloo — which is the brutal landings and the
       far ones, not a fault. Re-bless with `npm run test:bless` when a change
       to the routes or the solver is meant to move these. */
    await expect(table.join("\n") + "\n").toMatchFileSnapshot(
      "./__snapshots__/solvability.txt",
    );
  }, 900_000);

  it("renders every objective and profile without a bad value", async () => {
    render(<KSPMissionPlanner />);
    await settle();

    const problems = [];
    for (const objective of OBJECTIVES) {
      await click(objective);
      await settle();
      problems.push(...scan(`objective ${objective}`));
    }
    for (const profile of PROFILES) {
      /* Land is withdrawn where there is no surface to land on. */
      if (!byText(profile)) continue;
      await click(profile);
      await settle();
      problems.push(...scan(`profile ${profile}`));
    }
    cleanup();
    expect(problems).toEqual([]);
  }, 900_000);
});
