import { describe, it, expect } from "vitest";
import { fitOrtho } from "../src/ui/components/three-view.jsx";
import { PANELS, clips } from "./framing.js";

/* Does the camera see the whole rocket?

   `test/panel-containment.test.jsx` reads the SVG and asserts nothing escapes
   its panel. There is no equivalent for the 3D view: jsdom has no WebGL, so
   there are no pixels to measure and nothing that produces any. #63.

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
        for (const [view, aspect] of PANELS)
          if (clips(view, extent, aspect))
            bad.push(`${view} @${aspect.toFixed(2)}: ${height}x${reach}`);
      }
    expect(bad.slice(0, 6), `${bad.length} views clip the model`).toEqual([]);
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

  it("leaves room, but not a lot", () => {
    const { halfH } = fitOrtho("side", { height: 40, reach: 5 }, 1);
    expect(halfH).toBeGreaterThan(20);
    expect(halfH).toBeLessThan(20 * 1.25);
  });
});
