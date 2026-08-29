import { cameraFor, viewAxis, viewRight, viewUp } from "../src/ui/views.js";

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
  const { halfW, halfH } = cameraFor(view, extent, aspect);
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

/* How far outside the near and far planes the worst point of `parts` falls, in
   metres. Zero or less is contained.

   This is the check that was missing when the isometric's far plane cut the
   back off the rocket. `VIEWS` writes its directions unnormalised, so placing
   the camera at `dir * distance` stood it 14% further off than the near and far
   planes were told — and the margin they carried was generous enough to hide
   that on a tall rocket and not on a short one, so it showed up only at the
   last staging steps and only in one of the three views.

   Depth along the view axis, measured from where the camera actually is. */
export function escapesDepth(view, parts, extent) {
  const { axis, dist, near, far } = cameraFor(view, extent, 1);
  const midY = extent.height / 2;

  /* Stand the camera exactly where the renderer stands it — `axis * dist` from
     what it looks at — and then measure along the direction it is actually
     looking, normalised here rather than taken on trust.

     Asking `cameraFor` for both the position and the depth window would make
     this consistent with its own mistake and prove nothing: that is how the
     first version of this check passed with the very bug it was written for
     still in place. `VIEWS` writes its directions unnormalised, so an axis of
     length 1.143 both stood the camera 14% too far off and inflated the window
     by the same factor, and the two errors cancelled on paper while the far
     plane went on cutting the back off the rocket on screen. */
  const cam = { x: axis.x * dist, y: midY + axis.y * dist, z: axis.z * dist };
  const back = {
    x: cam.x,
    y: cam.y - midY,
    z: cam.z,
  };
  const len = Math.hypot(back.x, back.y, back.z) || 1;
  const look = { x: back.x / len, y: back.y / len, z: back.z / len };

  let worst = -Infinity;
  for (const p of parts)
    for (const end of [p.y, p.y + p.h]) {
      for (let i = 0; i < RIM; i++) {
        const th = (i / RIM) * 2 * Math.PI;
        const x = p.x + Math.cos(th) * p.r;
        const z = p.z + Math.sin(th) * p.r;
        const d =
          (cam.x - x) * look.x + (cam.y - end) * look.y + (cam.z - z) * look.z;
        worst = Math.max(worst, near - d, d - far);
      }
    }
  return worst;
}
