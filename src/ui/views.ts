/* ------------------------------- the cameras -------------------------------
   Where each locked view stands, which way is up, and how much of the model it
   has to cover. No three.js here on purpose: the build view sizes its panels
   from this, and pulling the renderer in to ask how wide a rocket is would put
   half a megabyte of it in the bundle that gets you to a solved rocket. The
   renderer imports this rather than the other way round. #63 step 5. */

/* Plain numbers, no three.js — see above. */
type Vec3 = { x: number; y: number; z: number };

/* Where a camera stands and which way is up, both unnormalised. */
type View = { dir: ReadonlyArray<number>; up: ReadonlyArray<number> };

/* The box the model occupies, as `extentOf` measures it. */
type Extent = { height: number; reach: number };

const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const unit = (v: Vec3): Vec3 => {
  const m = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / m, y: v.y / m, z: v.z / m };
};
const vec = ([x, y, z]: ReadonlyArray<number>): Vec3 => ({ x, y, z });

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
/* Keyed by string rather than by the three names, because `viewOf` below is
   handed whatever the caller has and falls back to the side elevation. */
export const VIEWS: Readonly<Record<string, View>> = {
  side: { dir: [0, 0, 1], up: [0, 1, 0] },
  plan: { dir: [0, -1, 0], up: [0, 0, 1] },
  iso: { dir: [0.72, 0.52, 0.72], up: [0, 1, 0] },
};

export const viewOf = (view: string) => VIEWS[view] || VIEWS.side;

/* `lookAt` builds the basis as z = eye - target, x = up x z, y = z x x, and the
   camera is placed along dir from what it looks at, so z is dir. Exported
   because two views disagreeing about which way is right is a mirrored
   drawing, and that is checkable without a GPU where the drawing is not. */
export function viewRight(view: string) {
  const { dir, up } = viewOf(view);
  return unit(cross(vec(up), vec(dir)));
}

export function viewUp(view: string) {
  return cross(viewAxis(view), viewRight(view));
}

/* The direction from what the camera looks at towards where it stands, as a
   unit vector. `VIEWS` writes `dir` unnormalised because the numbers read
   better that way — the isometric is 0.72, 0.52, 0.72 — and its length is
   1.143, not 1. Placing the camera at `dir * distance` therefore stands it 14%
   further off than the distance says, which is how the far plane came to cut
   the back off the isometric while the side and the plan, whose directions
   happen to be unit vectors, were fine. Normalise once, here, and use the same
   vector to place the camera and to size its depth. #63 */
export function viewAxis(view: string) {
  return unit(vec(viewOf(view).dir));
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
const spanAlong = (a: Vec3, H: number, reach: number) =>
  (H / 2) * Math.abs(a.y) + reach * Math.hypot(a.x, a.z);

/* Half-extents the view has to cover, before the panel's own shape is applied.
   Straight from the model, which is what makes containment structural: the
   frustum is the rocket's extent, so nothing can fall outside the panel. */
export function framing(view: string, { height: H, reach }: Extent) {
  return {
    w: spanAlong(viewRight(view), H, reach),
    h: spanAlong(viewUp(view), H, reach),
  };
}

/* The frustum for a panel of a given shape.

   Fit whichever half-extent is the tighter against the panel's own aspect, so a
   pencil is limited by its height and a squat stage by its width, then leave a
   little air. */
export function fitOrtho(view: string, extent: Extent, aspect: number) {
  const need = framing(view, extent);
  const halfH = Math.max(need.h, need.w / aspect) * 1.08;
  return { halfW: halfH * aspect, halfH };
}

/* How far off the camera stands. An orthographic projection does not care, so
   this is generous rather than tight — far enough that no part of any rocket
   is ever behind the camera. */
const standOff = ({ height, reach }: Extent) =>
  Math.max(height, reach * 2) * 3 + 10;

/* Everything about the camera for one view of one model.

   Near and far come from how deep the model actually is along the axis the
   camera looks down — the same `spanAlong` the framing uses, asked about a
   third direction — rather than from a bounding sphere and a fudge factor. A
   sphere is a poor fit for a stack of cylinders seen end-on, and the fudge was
   what let the shortfall from the unnormalised direction above go unnoticed:
   it was generous enough to hide the error on a tall rocket and not on a short
   one, so the clipping appeared only at the last staging steps. */
export function cameraFor(view: string, extent: Extent, aspect: number) {
  const axis = viewAxis(view);
  const dist = standOff(extent);
  const half = spanAlong(axis, extent.height, extent.reach);
  /* Enough that a rounding error at the silhouette does not shave it, and
     little enough that the depth buffer keeps its precision where the drawing
     is. */
  const slack = half * 0.05 + 0.5;
  return {
    axis,
    dist,
    near: Math.max(0.01, dist - half - slack),
    far: dist + half + slack,
    /* The model's own depth range, for cueing: the front of the rocket is
       untouched and the back takes the full fade, whatever its size. */
    cueNear: dist - half,
    cueSpan: 2 * half || 1,
    ...fitOrtho(view, extent, aspect),
  };
}

export type { Extent, Vec3, View };
