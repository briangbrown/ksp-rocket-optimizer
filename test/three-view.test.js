import { describe, it, expect } from "vitest";
import { fitOrtho } from "../src/ui/components/three-view.jsx";
import { extentOf, modelOf } from "../src/core/model.js";
import { planMission } from "../src/core/plan.js";
import { missionCases } from "./grid.js";

/* Does the camera see the whole rocket?

   `test/panel-containment.test.jsx` reads the SVG and asserts nothing escapes
   its panel. There is no equivalent for the 3D view: jsdom has no WebGL, so
   there are no pixels to measure and nothing that produces any. #63.

   What can be checked without a GPU is the claim the 3D view rests on — that
   the frustum is derived from the model's own extent, so a part cannot fall
   outside the view. That is containment by construction rather than by
   inspection, and it is a stronger statement: it holds for every rocket, not
   for the ones a sweep happens to solve.

   The rest of the renderer — that three.js draws what it is handed — is not
   testable here and is checked on the Cloudflare preview by a person. */

/* The panels as the build view sizes them. The elevation varies with the
   rocket; these are the shapes it lands on. */
const PANELS = [
  ["side", 170 / 300],
  ["side", 60 / 300],
  ["side", 300 / 300],
  ["plan", 1],
  ["iso", 1],
];

describe("the orthographic framing", () => {
  it("covers the model, whatever shape the panel is", async () => {
    const bad = [];
    for (const c of missionCases()) {
      const res = await planMission(c.input, {
        onYield: () => Promise.resolve(),
      });
      if (!res) continue;
      for (let drop = 0; drop < res.stages.length; drop++) {
        const parts = modelOf(
          res.stages.slice(drop),
          c.input.payload,
          c.input.payloadDia,
        );
        if (!parts.length) continue;
        const extent = extentOf(parts);
        for (const [view, aspect] of PANELS) {
          const { halfW, halfH } = fitOrtho(view, extent, aspect);
          /* Side-on, the camera looks across the stack: the horizontal need is
             how far parts reach from the axis, the vertical is its height.
             Looking up, both are the reach. */
          const needW = extent.reach;
          const needH = view === "side" ? extent.height / 2 : extent.reach;
          if (halfW + 1e-9 < needW || halfH + 1e-9 < needH)
            bad.push(
              `${c.name} +${drop} ${view} @${aspect.toFixed(2)}: frustum ${halfW.toFixed(2)}x${halfH.toFixed(2)} against ${needW.toFixed(2)}x${needH.toFixed(2)}`,
            );
        }
      }
    }
    expect(bad.slice(0, 6), `${bad.length} views clip the rocket`).toEqual([]);
  }, 300_000);

  it("keeps the panel's own shape, so nothing is stretched", () => {
    /* An orthographic frustum whose aspect differs from the canvas squashes
       the drawing, which on a schematic reads as a design change rather than a
       rendering one. */
    for (const [view, aspect] of PANELS) {
      const { halfW, halfH } = fitOrtho(view, { height: 30, reach: 4 }, aspect);
      expect(halfW / halfH, `${view} @${aspect}`).toBeCloseTo(aspect, 9);
    }
  });

  it("leaves room, but not a lot", () => {
    const { halfH } = fitOrtho("side", { height: 40, reach: 5 }, 1);
    expect(halfH).toBeGreaterThan(20);
    expect(halfH).toBeLessThan(20 * 1.25);
  });
});
