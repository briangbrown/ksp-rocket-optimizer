import { fitOrtho } from "../src/ui/components/three-view.jsx";

/* Does a camera see the whole rocket?

   Shared because the claim is asked in two places: `test/three-view.test.js`
   sweeps it over extents no solver would produce, and `test/model.test.js`
   asks it of the models it has already built, rather than solving twelve
   missions a second time to put one more question to the same parts. */

/* The panels as the build view sizes them. The elevation varies with the
   rocket; these are the shapes it lands on. */
export const PANELS = [
  ["side", 170 / 300],
  ["side", 60 / 300],
  ["side", 300 / 300],
  ["plan", 1],
  ["iso", 1],
];

/* What the view has to cover: side-on the camera looks across the stack, so
   the horizontal need is how far parts reach from the axis and the vertical is
   half the height. Looking up, both are the reach. */
export function needFor(view, { height, reach }) {
  return { w: reach, h: view === "side" ? height / 2 : reach };
}

export function clips(view, extent, aspect) {
  const { halfW, halfH } = fitOrtho(view, extent, aspect);
  const need = needFor(view, extent);
  return halfW + 1e-9 < need.w || halfH + 1e-9 < need.h;
}
