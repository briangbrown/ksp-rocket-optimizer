// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { act } from "react";
import { byText, settle, solving } from "./app-harness.js";
import KSPMissionPlanner from "../src/ui/app.jsx";

/* Panel containment.

   Every part drawn in the build view must lie inside the panel it is drawn in,
   at every staging step. The elevation and the geometry have drifted apart
   three separate times, and the symptom each time was a part running off the
   side or the top rather than anything throwing.

   This reads the SVG rectangles directly. SVG geometry lives in attributes —
   x, y, width, height — not in CSS, so unlike the style scan in the render
   sweep, jsdom preserves it exactly. The elevation is deliberately drawn with
   overflow visible, so an escaping part is not clipped; it simply overlaps the
   rest of the page, which is why nothing errors when this goes wrong. */

/* Rectangles carry a 0.8-wide stroke centred on the edge, so half of it sits
   outside the geometry. One pixel of tolerance keeps that from reading as an
   escape while staying far tighter than any real overflow, which runs to tens
   of pixels. */
const TOLERANCE = 1;

const buttons = () => [...document.querySelectorAll("button")];

async function click(el) {
  if (!el) throw new Error("missing button");
  await act(async () => {
    el.click();
  });
}

/* The staging stepper. Labels are generated from the design, so the set differs
   per rocket: always "On the pad", "Boosters away · core burns on" only when
   there are boosters, then one per stage ending in "Payload alone". */
const STEP_LABEL =
  /^(On the pad|Boosters away · core burns on|Stage \d+ spent|Payload alone)$/;
const stepButtons = () =>
  buttons().filter((b) => STEP_LABEL.test(b.textContent.trim()));

const num = (el, attr) => {
  const raw = el.getAttribute(attr);
  return raw === null ? 0 : parseFloat(raw);
};

/* Every rect must sit inside the svg that contains it. A non-finite coordinate
   is reported as its own failure rather than silently passing a comparison —
   NaN < 0 is false, so a bad number would otherwise look contained. */
function violations(where, only = () => true) {
  const out = [];
  for (const svg of document.querySelectorAll("svg")) {
    if (!only(svg)) continue;
    const W = num(svg, "width");
    const H = num(svg, "height");
    if (!Number.isFinite(W) || !Number.isFinite(H) || W <= 0 || H <= 0) {
      out.push(`${where}: panel has bad size ${W}x${H}`);
      continue;
    }
    /* The elevation is drawn in rectangles and the plan view in circles, so both
       shapes are reduced to a bounding box and checked the same way. Checking
       only rects would have left the plan view — where the engine ring spilling
       past the edge is a recorded failure — entirely uncovered. */
    const boxes = [
      ...[...svg.querySelectorAll("rect")].map((r) => ({
        what: "rect",
        x: num(r, "x"),
        y: num(r, "y"),
        w: num(r, "width"),
        h: num(r, "height"),
      })),
      ...[...svg.querySelectorAll("circle")].map((c) => ({
        what: "circle",
        x: num(c, "cx") - num(c, "r"),
        y: num(c, "cy") - num(c, "r"),
        w: 2 * num(c, "r"),
        h: 2 * num(c, "r"),
      })),
    ];

    for (const { what, x, y, w, h } of boxes) {
      if (![x, y, w, h].every(Number.isFinite)) {
        out.push(
          `${where}: ${what} has a non-finite coordinate x=${x} y=${y} w=${w} h=${h}`,
        );
        continue;
      }
      const over = [];
      if (x < -TOLERANCE) over.push(`left by ${(-x).toFixed(1)}`);
      if (y < -TOLERANCE) over.push(`top by ${(-y).toFixed(1)}`);
      if (x + w > W + TOLERANCE)
        over.push(`right by ${(x + w - W).toFixed(1)}`);
      if (y + h > H + TOLERANCE)
        over.push(`bottom by ${(y + h - H).toFixed(1)}`);
      if (over.length) {
        out.push(
          `${where}: ${what} ${w.toFixed(1)}x${h.toFixed(1)} at (${x.toFixed(1)},${y.toFixed(1)}) ` +
            `escapes ${W.toFixed(1)}x${H.toFixed(1)} panel — ${over.join(", ")}`,
        );
      }
    }
  }
  return out;
}

/* `wMax` in BuildView picks one term per part: pack, else parallel stacks, else
   plain width. A packed tank part carries both `pack` and `S`, and the renderer
   runs both loops — so a part that is packed *and* on parallel stacks draws out
   past what the estimate counted.

   That was recorded here as latent, on the grounds that no stage in the grid was
   ever both. It is not latent any more: five stages across the two committed
   baselines are both, and the tier 9 Tylo case below is one of them. #9. */

/* Only destinations that actually build are worth stepping through; the six that
   come back as dashes draw nothing. That set is pinned by solvability.txt in the
   render sweep, so it cannot drift silently. */
const BUILDABLE = [
  "Low orbit",
  "Stationary orbit",
  "Gilly",
  "Mun",
  "Minmus",
  "Duna",
  "Ike",
  "Dres",
  "Jool",
  "Pol",
];
const OBJECTIVES = ["Lightest", "Cheapest", "Fewest parts"];

describe("panel containment", () => {
  it("keeps every part inside its panel at every staging step", async () => {
    render(<KSPMissionPlanner />);
    await settle();

    const problems = [];
    let stepsChecked = 0;

    for (const dest of BUILDABLE) {
      await click(byText(dest));
      await settle();

      /* Step buttons are re-created on each render, so the list is re-read
         rather than held across clicks. */
      const count = stepButtons().length;
      expect(count, `${dest}: no staging steps rendered`).toBeGreaterThan(0);

      for (let i = 0; i < count; i++) {
        const step = stepButtons()[i];
        const label = step.textContent.trim();
        await click(step);
        await act(async () => {
          await new Promise((r) => setTimeout(r, 30));
        });
        problems.push(...violations(`${dest} · ${label}`));
        stepsChecked++;
      }
    }
    cleanup();

    /* Guard against the check passing because nothing was drawn. */
    expect(stepsChecked, "no staging steps were checked").toBeGreaterThan(
      BUILDABLE.length,
    );
    expect(problems).toEqual([]);
  }, 900_000);

  /* A packed tank ring on parallel stacks, which is the shape #9 is about and
     which nothing else here reaches.

     The two sweeps above run at the default roster and payload, where that
     combination does not occur. It occurs at tier 9 — `test/__snapshots__` has
     five stages that are both packed and on parallel stacks, and this is the
     one that is a mission a user can actually ask for rather than a raw delta-v
     budget. Tylo at 3.5 t, which the mission sweep solves as a four-stack
     design with parallel columns. */
  it("keeps a packed ring on parallel stacks inside its panel", async () => {
    render(<KSPMissionPlanner />);
    await settle();

    /* Tier 9 first: Tylo does not build at the default roster at all. */
    await click(
      buttons().find((b) => b.textContent.trim().startsWith("Tech tree")),
    );
    await click(byText("9"));
    await settle();

    const field = [...document.querySelectorAll("input")].filter(
      (i) => i.type !== "range" && i.type !== "checkbox",
    )[0];
    expect(field?.value, "first text field is no longer payload").toBe("2.5");
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      ).set.call(field, "3.5");
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    await settle();

    await click(byText("Tylo"));
    await settle();

    const problems = [];
    let checked = 0;
    const count = stepButtons().length;
    expect(count, "Tylo at tier 9 rendered no staging steps").toBeGreaterThan(
      0,
    );
    for (let i = 0; i < count; i++) {
      const step = stepButtons()[i];
      const label = step.textContent.trim();
      await click(step);
      await act(async () => {
        await new Promise((r) => setTimeout(r, 30));
      });
      problems.push(...violations(`Tylo tier 9 · 3.5 t · ${label}`));
      checked++;
    }
    cleanup();
    expect(checked, "no staging steps were checked").toBeGreaterThan(1);
    expect(problems).toEqual([]);
  }, 900_000);

  /* The objective changes which parts the solver picks — clusters, packed tank
     rings, parallel columns — so it changes the shapes being drawn, not just
     their sizes. Worth sweeping on one busy destination. */
  it("keeps every part inside its panel across objectives", async () => {
    render(<KSPMissionPlanner />);
    await settle();
    await click(byText("Dres"));
    await settle();

    const problems = [];
    for (const objective of OBJECTIVES) {
      await click(byText(objective));
      await settle();
      for (let i = 0; i < stepButtons().length; i++) {
        const step = stepButtons()[i];
        const label = step.textContent.trim();
        await click(step);
        await act(async () => {
          await new Promise((r) => setTimeout(r, 30));
        });
        problems.push(...violations(`Dres · ${objective} · ${label}`));
      }
    }
    cleanup();
    expect(problems).toEqual([]);
  }, 900_000);
});
