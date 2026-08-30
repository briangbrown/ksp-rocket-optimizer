import { describe, it, expect } from "vitest";
import {
  MIN_PANEL,
  fitOrtho,
  panelSizes,
  viewAxis,
  viewRight,
} from "../src/ui/views.js";
import { PANELS, asCylinder, escapes, escapesDepth } from "./framing.js";

/* Does the camera see the whole rocket?

   There are no pixels to measure and nothing that produces any: jsdom has no
   WebGL. `test/panel-containment.test.jsx` could read the SVG rectangles while
   there were any; #63 step 4 removed them.

   What can be checked without a GPU is the claim the 3D view rests on — that
   the frustum is derived from the model's own extent, so a part cannot fall
   outside the view. `fitOrtho` is arithmetic over an extent, so the property
   holds or fails on numbers rather than on rockets: the sweep here is over
   extents no solver would produce as well as ones it would, which is a wider
   net than twelve missions and costs no solve at all. `test/model.test.js`
   runs the same assertion over the models actually built, against the
   rockets it has already solved for its own checks.

   The rest of the renderer — that three.js draws what it is handed — is not
   testable here and is checked on the Cloudflare preview by a person. */

describe("the orthographic framing", () => {
  it("covers the extent, whatever shape the panel and the rocket are", () => {
    /* A pencil, a squat stage, and everything between — including ratios past
       anything the slenderness limit allows, because the frustum should not
       depend on the rocket being buildable. */
    const bad = [];
    for (const height of [0.5, 1, 2.5, 7, 18, 40, 90, 200])
      for (const reach of [0.15, 0.6, 1.25, 3, 8, 25]) {
        const extent = { height, reach, width: reach * 2 };
        for (const [view, aspect] of PANELS) {
          const out = escapes(view, asCylinder(extent), extent, aspect);
          if (out > 1e-9)
            bad.push(
              `${view} @${aspect.toFixed(2)}: ${height}x${reach} escapes by ${out.toFixed(3)}`,
            );
        }
      }
    expect(bad.slice(0, 6), `${bad.length} views clip the model`).toEqual([]);
  });

  it("looks down a unit vector", () => {
    /* `VIEWS` writes its directions unnormalised because they read better that
       way — the isometric is 0.72, 0.52, 0.72, whose length is 1.143. Anything
       that multiplies a distance by the direction has to normalise it first,
       and the one place that did not stood the camera 14% further off than its
       far plane was told. */
    for (const view of ["side", "plan", "iso"]) {
      const a = viewAxis(view);
      expect(Math.hypot(a.x, a.y, a.z), `${view} axis`).toBeCloseTo(1, 12);
    }
  });

  it("keeps the whole depth of the model between its planes", () => {
    /* Over the same spread of shapes. A short wide model is the case that
       failed: the stand-off carries a constant term, so the further the
       distance runs ahead of the model's own size, the more an error in where
       the camera actually stands matters. */
    const bad = [];
    for (const height of [0.5, 1, 2.5, 7, 18, 40, 90, 200])
      for (const reach of [0.15, 0.6, 1.25, 3, 8, 25]) {
        const extent = { height, reach, width: reach * 2 };
        for (const view of ["side", "plan", "iso"]) {
          const out = escapesDepth(view, asCylinder(extent), extent);
          if (out > 1e-9)
            bad.push(`${view}: ${height}x${reach} clips ${out.toFixed(3)}`);
        }
      }
    expect(bad.slice(0, 6), `${bad.length} clip in depth`).toEqual([]);
  });

  it("keeps the panel's own shape, so nothing is stretched", () => {
    /* An orthographic frustum whose aspect differs from the canvas squashes
       the drawing, which on a schematic reads as a design change rather than a
       rendering one. */
    for (const [view, aspect] of PANELS) {
      const { halfW, halfH } = fitOrtho(view, { height: 30, reach: 4 }, aspect);
      expect(halfW / halfH, `${view} @${aspect}`).toBeCloseTo(aspect, 9);
    }
  });

  it("sends +x to the right of the screen in every view", () => {
    /* Two views that disagree about this draw the same rocket mirrored. The
       columns of a parallel stage start at +x and work round, and the
       elevation draws that first pair left and right, so a stage with three
       radial tanks leaned right in the elevation and left in the plan for as
       long as the plan's up vector was -z. Nothing renders here, but the basis
       three.js would build from is arithmetic, and mirroring is a sign. */
    for (const view of ["side", "plan", "iso"])
      expect(viewRight(view).x, `${view} mirrors the x axis`).toBeGreaterThan(
        0,
      );
  });

  it("leaves room, but not a lot", () => {
    const { halfH } = fitOrtho("side", { height: 40, reach: 5 }, 1);
    expect(halfH).toBeGreaterThan(20);
    expect(halfH).toBeLessThan(20 * 1.25);
  });
});

/* How big a box each drawing gets.

   The panels used to be sized from constants — 300 tall at most, 150 square —
   so they could not grow into a window however much of one there was. This is
   the arithmetic that replaced them, and it is here rather than in the browser
   suite for the same reason `fitOrtho` is: it is a function of four numbers,
   and a rule about how a row fits together is worth checking on every shape
   rather than on the one rocket a screenshot happens to hold. #99 */
describe("the panels", () => {
  const GAP = 22;

  it("gives the elevation the height, and the plan what is left across", () => {
    /* A pencil in a wide box: room for both, so the drawing that is the rocket
       takes all the height there is. */
    const { elev, plan } = panelSizes({ aw: 1000, ah: 1300 }, 0.216, GAP);
    expect(elev.h).toBe(1300);
    expect(elev.w).toBeCloseTo(1300 * 0.216, 6);
    expect(plan.w).toBe(plan.h);
    expect(elev.w + GAP + plan.w).toBeLessThanOrEqual(1000 + 1e-9);
  });

  it("shares the width where there is not enough for both", () => {
    /* A squat stage: at full height its elevation would be twice as wide as
       the box, so the two take one height between them instead — which is the
       arrangement that keeps the plan worth looking at, and the plan is the
       view that matters on a stage with a ring of columns. */
    const { elev, plan } = panelSizes({ aw: 1000, ah: 1300 }, 2, GAP);
    expect(elev.h).toBeCloseTo(plan.h, 9);
    expect(elev.w).toBeCloseTo(elev.h * 2, 6);
    expect(elev.w + GAP + plan.w).toBeCloseTo(1000, 6);
  });

  it("never draws a panel narrower than its own label", () => {
    /* A column is as wide as the widest thing in it, and the label above the
       elevation runs to about 110 px. A panel narrower than that widens the
       column anyway, and then the row is wider than the arithmetic thinks and
       spills past the card — which it did, by three pixels, at 480 px wide. */
    const { elev, plan } = panelSizes({ aw: 420, ah: 300 }, 0.02, GAP);
    expect(elev.w).toBe(MIN_PANEL);
    expect(elev.w + GAP + plan.w).toBeLessThanOrEqual(420 + 1e-9);
  });

  it("fits the row whatever the box and the rocket are", () => {
    const bad = [];
    for (const aw of [280, 420, 640, 980, 1700])
      for (const ah of [120, 300, 700, 1300])
        for (const aspect of [0.02, 0.1, 0.216, 0.5, 1, 2, 6]) {
          const { elev, plan } = panelSizes({ aw, ah }, aspect, GAP);
          const across = elev.w + GAP + plan.w;
          /* Two claims: the row fits the width it was given, and neither panel
             is taller than the height it was given. A panel that overflows
             either is a drawing drawn outside its own section. */
          if (across > aw + 1e-9)
            bad.push(`${aw}x${ah} @${aspect}: row ${across.toFixed(1)}`);
          if (elev.h > ah + 1e-9 || plan.h > ah + 1e-9)
            bad.push(`${aw}x${ah} @${aspect}: taller than its box`);
          if (plan.w !== plan.h)
            bad.push(`${aw}x${ah} @${aspect}: the plan is not square`);
        }
    expect(bad.slice(0, 6), `${bad.length} boxes do not fit`).toEqual([]);
  });
});
