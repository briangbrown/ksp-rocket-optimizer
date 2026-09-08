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
/* `right` is the sheet's second elevation (#183): the rocket a quarter turn
   round, seen from its +x side, as third-angle projection places it — to the
   right of the front view, with the face the front view shows on its left.
   Its screen axis is z, not x, so it is the one view the +x rule above does
   not apply to; what it has to agree with is the front, and `viewUp` is +y
   for both. */
export const VIEWS: Readonly<Record<string, View>> = {
  side: { dir: [0, 0, 1], up: [0, 1, 0] },
  right: { dir: [1, 0, 0], up: [0, 1, 0] },
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
  /* More air across than up. The two are not the same problem: a drawing
     limited by its height has whatever room the panel's shape leaves at the
     sides, which is usually plenty, while one limited by its width has only
     the margin — and that is the case a tall narrow elevation panel puts a
     boostered rocket in. Eight percent of a ring that sits tight against the
     core is a couple of pixels, and the outline is drawn outward from the
     silhouette in screen space, so the strokes on the outermost booster were
     being shaved. Widening only the binding term costs nothing when height is
     the one that binds. */
  const halfH = Math.max(need.h * 1.08, (need.w * 1.2) / aspect);
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
export function cameraFor(
  view: string,
  extent: Extent,
  aspect: number,
  /* What the depth window has to cover, where that is not what the frustum
     frames. During a staging transition they differ on purpose: the framing
     eases to the rocket that is left, because chasing the parts on their way
     out would push everything else off the panel — but those parts are still
     being drawn, and a near or far plane measured on what stays cuts them in
     half in mid-air. Leaving the panel at the edge is the intent; being sliced
     is not. #124 */
  depth: Extent = extent,
) {
  const axis = viewAxis(view);
  const dist = standOff(depth);
  const half = spanAlong(axis, depth.height, depth.reach);
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
       untouched and the back takes the full fade, whatever its size. Measured
       on what is framed rather than on the depth window, so a booster on its
       way out does not wash out the rocket it left. */
    cueNear: dist - spanAlong(axis, extent.height, extent.reach),
    cueSpan: 2 * spanAlong(axis, extent.height, extent.reach) || 1,
    ...fitOrtho(view, extent, aspect),
  };
}

/* ------------------------------ how big the box is ------------------------------

   `framing` above says how much of the model a view has to cover. This is the
   same question from the other side: how much room there is to cover it in.

   The elevation is the drawing — it is the rocket — so it takes the height it
   is offered, and the plan is a square beside it no wider than the elevation.
   Where the two do not fit across, both shrink by the same factor.

   Worth knowing why the height is not always filled. The plan is square,
   because what it shows is a disc: a taller panel would draw the same disc at
   the same size with empty space above and below it. It is drawn at the foot
   of its column so that its base and the elevation's line up, which is what
   the row's own bottom edge is.

   No DOM and no three.js, so `test/three-view.test.ts` can pin it the way it
   already pins `fitOrtho`. #99 */

/* A pencil seen edge-on is a few pixels wide at any sensible height, and a
   panel that narrow is not a drawing.

   The floor is what it is because a column is never narrower than its own
   label: "Elevation" and the Iso chip beside it run to about 110 px, and a
   panel narrower than that widens the column anyway — the arithmetic here then
   describes a row that does not fit, and the drawings spill past the card.
   Below the floor the model is drawn at full height with air either side of
   it, which is what `fitOrtho` does with a panel wider than the shape in it. */
const MIN_PANEL = 120;

export function panelSizes(
  { aw, ah }: { aw: number; ah: number },
  /* The elevation's own width over its height, in metres. */
  aspect: number,
  gap: number,
) {
  const across = Math.max(1, aw - gap);
  const tall = Math.max(1, ah);

  /* The elevation takes the height it is offered: the drawing it holds is the
     rocket. Its width follows from the model's own proportions. */
  let eh = tall;
  let ew = Math.max(MIN_PANEL, eh * aspect);

  /* The plan is square, and never wider than the elevation. It is the
     supporting view — what is bolted where, seen from underneath — and given
     the width it could take, a pencil's plan came out two and a half times the
     width of the elevation beside it and read as the main drawing. */
  let ps = Math.min(ew, tall);

  /* Where the two do not fit across, both shrink by the same factor, so the
     row keeps its proportions rather than one view eating the other. A squat
     stage is the case that needs it: at full height its elevation alone would
     be wider than the window. */
  const over = (ew + ps) / across;
  if (over > 1) {
    ew /= over;
    eh /= over;
    ps /= over;
  }
  return { elev: { w: ew, h: eh }, plan: { w: ps, h: ps } };
}

/* ------------------------------ the drafting sheet ------------------------------

   Where there is room — the wide layout — the build view is laid out as a
   drawing sheet: the front elevation top left, the right elevation beside it,
   the plan from below under the front elevation, and the isometric to the
   right of all three. The three orthographic views share **one scale**, so
   the plan's outline of a booster sits directly under its outline in the
   elevation and the right elevation is as tall as the front; that alignment
   is what a sheet is for, and `fitOrtho`, which frames one panel at a time,
   cannot give it. The isometric is pictorial and frames itself.

   The scale is the tightest that fits the three in the room: the elevations
   and the plan stacked have to fit the height less two header lines and a
   gap, and the two elevations side by side have to leave `ISO_SHARE` of the
   width for the isometric. The plan's cell is the front elevation's width
   whatever its own reach, so the two stay aligned; both frame the axis at
   their centre. #183 */
const SHEET_AIR = 1.1;
const ISO_SHARE = 0.4;
/* Air in pixels as well as in proportion. The outline is drawn a few device
   pixels outward from the silhouette, and ten per cent of a 2.5 m disc at the
   sheet's scale is two pixels: the plan's linework was clipped top and bottom
   on a stage whose plan is one disc. Each side of every orthographic cell. */
const SHEET_PAD = 8;

type Need = { w: number; h: number };

export function sheetSizes(
  { aw, ah }: { aw: number; ah: number },
  need: { front: Need; right: Need; plan: Need },
  gap: number,
  head: number,
) {
  const across = Math.max(1, aw);
  const tall = Math.max(1, ah);
  /* In metres, air included: the elevations' shared height, the plan's
     height, and the two elevations' widths. */
  const eh = 2 * SHEET_AIR * Math.max(need.front.h, need.right.h);
  const ph = 2 * SHEET_AIR * need.plan.h;
  const fw = 2 * SHEET_AIR * Math.max(need.front.w, need.plan.w);
  const rw = 2 * SHEET_AIR * need.right.w;
  const pad = 2 * SHEET_PAD;
  const byHeight =
    Math.max(1, tall - 2 * head - gap - 2 * pad) / Math.max(1e-6, eh + ph);
  const byWidth =
    Math.max(1, across * (1 - ISO_SHARE) - 2 * gap - 2 * pad) /
    Math.max(1e-6, fw + rw);
  const scale = Math.min(byHeight, byWidth);
  const front = {
    w: Math.max(MIN_PANEL, fw * scale + pad),
    h: Math.max(1, eh * scale + pad),
  };
  const right = { w: Math.max(MIN_PANEL, rw * scale + pad), h: front.h };
  const plan = { w: front.w, h: Math.max(1, ph * scale + pad) };
  const iso = {
    w: Math.max(MIN_PANEL, across - front.w - right.w - 2 * gap),
    h: Math.max(1, tall - head),
  };
  return { scale, front, right, plan, iso };
}

export { MIN_PANEL, ISO_SHARE };
export type { Extent, Vec3, View };
