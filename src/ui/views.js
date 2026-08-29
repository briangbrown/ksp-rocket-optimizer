/* ------------------------------- the cameras -------------------------------
   Where each locked view stands, which way is up, and how much of the model it
   has to cover. No three.js here on purpose: the build view sizes its panels
   from this, and pulling the renderer in to ask how wide a rocket is would put
   half a megabyte of it in the bundle that gets you to a solved rocket. The
   renderer imports this rather than the other way round. #63 step 5. */

const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const unit = (v) => {
  const m = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / m, y: v.y / m, z: v.z / m };
};
const vec = ([x, y, z]) => ({ x, y, z });

/* Where the camera stands and which way is up.

   Plan looks up from underneath, as the SVG one did — that is how you read
   what is bolted where, with the engines nearest the viewer.

   Every view must put world +x to the right of the screen. The columns of a
   parallel stage start at +x and work round, and the elevation draws that
   first pair left and right, so a view that disagrees on x draws the same
   rocket mirrored against the one beside it — three tanks leaning right in the
   elevation and left in the plan. three.js builds the basis as
   `right = up x (eye - target)`, so from underneath +x on the right forces +z
   to the top; you cannot have both that and z down the panel. Above the rocket
   would give both and is wrong for a different reason: the payload would sit
   over the engines. `viewRight` below is the check. */
export const VIEWS = {
  side: { dir: [0, 0, 1], up: [0, 1, 0] },
  plan: { dir: [0, -1, 0], up: [0, 0, 1] },
  iso: { dir: [0.72, 0.52, 0.72], up: [0, 1, 0] },
};

export const viewOf = (view) => VIEWS[view] || VIEWS.side;

/* `lookAt` builds the basis as z = eye - target, x = up x z, y = z x x, and the
   camera is placed along dir from what it looks at, so z is dir. Exported
   because two views disagreeing about which way is right is a mirrored
   drawing, and that is checkable without a GPU where the drawing is not. */
export function viewRight(view) {
  const { dir, up } = viewOf(view);
  return unit(cross(vec(up), vec(dir)));
}

export function viewUp(view) {
  return cross(unit(vec(viewOf(view).dir)), viewRight(view));
}

/* How far the model reaches along one screen axis.

   Everything `modelOf` produces is a cylinder standing on the y axis, so the
   whole rocket lies inside one cylinder: radius `reach`, height `height`. Its
   half-extent along a unit axis is its half-height times how much of that axis
   points along y, plus its radius times how much of the axis lies in the plane
   the discs are drawn in. Two terms, exact, and the same arithmetic for every
   camera.

   The three views used to carry a formula each, and the three-quarter one
   framed the bounding sphere — the honest way to avoid solving for the angle,
   and far too loose: a 40 m pencil 3 m across asked for a frustum 20 m wide for
   a rocket that is never wider than 3, so it drew in a seventh of the panel.
   Solving for the angle is four multiplications. */
const spanAlong = (a, H, reach) =>
  (H / 2) * Math.abs(a.y) + reach * Math.hypot(a.x, a.z);

/* Half-extents the view has to cover, before the panel's own shape is applied.
   Straight from the model, which is what makes containment structural: the
   frustum is the rocket's extent, so nothing can fall outside the panel. */
export function framing(view, { height: H, reach }) {
  return {
    w: spanAlong(viewRight(view), H, reach),
    h: spanAlong(viewUp(view), H, reach),
  };
}

/* The frustum for a panel of a given shape.

   Fit whichever half-extent is the tighter against the panel's own aspect, so a
   pencil is limited by its height and a squat stage by its width, then leave a
   little air. */
export function fitOrtho(view, extent, aspect) {
  const need = framing(view, extent);
  const halfH = Math.max(need.h, need.w / aspect) * 1.08;
  return { halfW: halfH * aspect, halfH };
}
