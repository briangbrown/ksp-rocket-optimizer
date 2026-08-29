import { fitOrtho, viewRight, viewUp } from "../src/ui/views.js";

/* Does a camera see the whole rocket?

   `framing` reduces the whole model to one cylinder and solves for its extent
   in closed form. Asking the same closed form whether its own answer is big
   enough would prove nothing, so this samples instead: a part is a cylinder,
   its extremes lie on the two rim circles, and every sampled point has to land
   inside the frustum. Independent arithmetic, and it fails if the closed form
   is wrong for any one part rather than only for the bounding cylinder.

   Shared because the claim is asked in two places: `test/three-view.test.js`
   over bounding cylinders no solver would produce, and `test/model.test.js`
   over the parts of the rockets it has already solved. */

/* Enough of the rim to catch a part off the axis; the extremes of a circle
   projected onto an axis are a smooth function, so this is not a fine sieve. */
const RIM = 36;

/* The panels as the build view sizes them. The elevation varies with the
   rocket and the angle it is turned to; these are the shapes it lands on. */
export const PANELS = [
  ["side", 170 / 300],
  ["side", 60 / 300],
  ["side", 300 / 300],
  ["plan", 1],
  ["iso", 200 / 300],
  ["iso", 1],
];

/* How far outside the frustum the worst point of `parts` falls, in metres.
   Zero or less is contained. The camera looks at the middle of the model's
   height, which is what the frustum is centred on. */
export function escapes(view, parts, extent, aspect) {
  const { halfW, halfH } = fitOrtho(view, extent, aspect);
  const r = viewRight(view);
  const u = viewUp(view);
  const midY = extent.height / 2;
  let worst = -Infinity;
  for (const p of parts)
    for (const end of [p.y, p.y + p.h]) {
      const y = end - midY;
      for (let i = 0; i < RIM; i++) {
        const th = (i / RIM) * 2 * Math.PI;
        const x = p.x + Math.cos(th) * p.r;
        const z = p.z + Math.sin(th) * p.r;
        worst = Math.max(
          worst,
          Math.abs(x * r.x + y * r.y + z * r.z) - halfW,
          Math.abs(x * u.x + y * u.y + z * u.z) - halfH,
        );
      }
    }
  return worst;
}

/* The bounding cylinder as a part, for sweeping shapes rather than rockets. */
export const asCylinder = ({ height, reach }) => [
  { x: 0, z: 0, y: 0, h: height, r: reach },
];
