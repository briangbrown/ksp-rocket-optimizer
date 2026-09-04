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

/* ------------------------------ engine profiles ------------------------------

   An engine drawn from its measured profile — src/data/engine-profiles.json,
   `EngineProfile` in src/core/geometry.ts — as polylines of [radius, y] with y
   centred on the part the way `CylinderGeometry` is, so the renderer revolves
   them with a lathe and places them where it places a cylinder. Written here
   rather than in the renderer so a test can hold the shape on numbers without
   three.js; `.claude/rules/renderer.md` says why views.ts never imports it.

   A lathe faces its triangles by the direction of travel: walked from the
   bottom up the outside, the surface faces out, which is the convention
   `taperedProfile` set. A bell is hollow — the plan view looks up into it —
   so its profile starts on the axis inside the throat, comes down the inside,
   turns at a sharp lip and goes back up the outside. The measurement is the
   outer skin; the wall is the one thing here that is drawn rather than
   measured. #85 */
type Profile = Array<[number, number]>;
type Measured = {
  h: number;
  w: number;
  n: number;
  profile: ReadonlyArray<ReadonlyArray<number>>;
  bellTop?: number;
  bells?: ReadonlyArray<{
    x: number;
    z: number;
    profile: ReadonlyArray<ReadonlyArray<number>>;
  }>;
};

/* The wall at the lip, as a fraction of the lip's radius: thick enough to
   read as an edge, thin enough that the inside is most of what is seen from
   below. */
const WALL = 0.06;

/* Two consecutive points the same are a zero-length segment, which a lathe
   turns into degenerate triangles and the crease pass into stray lines. */
const tidy = (pts: Profile): Profile =>
  pts.filter(
    ([r, y], i) =>
      i === 0 ||
      Math.abs(r - pts[i - 1][0]) + Math.abs(y - pts[i - 1][1]) > 1e-9,
  );

/* A measured outer skin as a hollow shell. `pts` run top to base as
   [y from the top, r] in the drawing's own metres; `top` is the centred y of
   the first point. The inside follows the outside in by the wall, from the lip
   up to the throat — the narrowest point in the lower half — and closes on
   the axis there. */
function shell(pts: ReadonlyArray<[number, number]>, top: number): Profile {
  const n = pts.length;
  if (n < 2) return [];
  const y = (i: number) => top - pts[i][0];
  const r = (i: number) => pts[i][1];
  let throat = n - 1;
  for (let i = Math.floor(n / 2); i < n; i++) if (r(i) < r(throat)) throat = i;
  /* A bell that never narrows — a solid motor's casing — is a shallow cup. */
  if (throat === n - 1) throat = Math.max(0, n - 3);
  const wall = WALL * r(n - 1);
  const out: Profile = [[0, y(throat)]];
  for (let i = throat; i < n; i++) out.push([Math.max(0, r(i) - wall), y(i)]);
  for (let i = n - 1; i >= 0; i--) out.push([r(i), y(i)]);
  out.push([0, y(0)]);
  return tidy(out);
}

/* Measured metres to the part's: the visible height to `H` and the widest
   radius to `R`, each on its own — the two agree within a few percent, since
   the envelope was measured off the same mesh, and clipping to R keeps the
   drawing inside what the solver sized. */
const fit = (R: number, H: number, m: Measured) => ({
  sy: H / m.h,
  sr: R / (m.w / 2),
});

const scaled = (
  pts: ReadonlyArray<ReadonlyArray<number>>,
  sy: number,
  sr: number,
  R: number,
): Array<[number, number]> =>
  pts.map(([y, r]) => [y * sy, Math.min(R, r * sr)]);

/* The body of revolution on the axis: the whole engine where it has one
   bell, else what stands above the bells, closed flat where they hang. */
function engineProfile(R: number, H: number, m: Measured): Profile {
  const { sy, sr } = fit(R, H, m);
  const top = H / 2;
  if (m.n <= 1 || m.bellTop === undefined)
    return shell(scaled(m.profile, sy, sr, R), top);
  const above = scaled(
    m.profile.filter(([y]) => y <= m.bellTop!),
    sy,
    sr,
    R,
  );
  if (above.length < 2) return [];
  const yb = top - m.bellTop * sy;
  const out: Profile = [[0, yb]];
  for (let i = above.length - 1; i >= 0; i--)
    out.push([above[i][1], top - above[i][0]]);
  out.push([0, top]);
  return tidy(out);
}

/* A cluster's bells, each a shell on its own axis at [x, z] from the part's. */
function engineBells(R: number, H: number, m: Measured) {
  if (m.n <= 1 || !m.bells) return [];
  const { sy, sr } = fit(R, H, m);
  const top = H / 2;
  return m.bells.map((b) => ({
    x: b.x * sr,
    z: b.z * sr,
    /* Clipped to the part's radius about the part's axis, not the bell's. */
    profile: shell(
      b.profile.map(([y, r]) => [
        y * sy,
        Math.max(0, Math.min(r * sr, R - Math.hypot(b.x, b.z) * sr)),
      ]),
      top,
    ),
  }));
}

export { MIN_PANEL, engineBells, engineProfile, shell };
export type { Extent, Measured, Profile, Vec3, View };
