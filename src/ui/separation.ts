import { extentOf } from "../core/model.js";
import type { ModelPart } from "../core/model.js";
import type { Extent } from "./views.js";

/* ------------------------------ a stage separation ------------------------------

   What moves between one staging step and the next, and where the camera
   stands while it does. No three.js and no DOM, like `views.ts`: the whole
   choreography is arithmetic over two models, so it can be checked without a
   renderer — which is the only way anything about the 3D view has ever been
   checked here. #105

   Everything happens in the outgoing model's frame. `modelOf` puts the origin
   at the base of the bottom live stage, so the same physical part sits at a
   different height in the two models; `dy` below is that difference, and the
   incoming model is the surviving parts of the outgoing one lifted by it. */

/* Which staging step, stripped of its label: what has been dropped, and
   whether what is left still has its boosters on. */
type Phase = { drop: number; boost: boolean };

/* Where one part has got to, relative to where it started. `tilt` is a
   rotation away from the stack, about the tangent — a booster's separation
   motors push its top out first, so it swings as it falls. */
type Offset = { x: number; y: number; z: number; tilt: number };

type Separation = {
  /* The outgoing model, which is what is drawn for the whole transition: the
     parts that stay are the incoming model, and the parts that go are still
     on screen until they leave the frame. */
  parts: ReadonlyArray<ModelPart>;
  /* Index-aligned with `parts`. */
  goes: ReadonlyArray<boolean>;
  from: Extent;
  to: Extent;
  /* How far above the outgoing origin the surviving rocket stands. */
  dy: number;
};

/* How far a spent stage falls, as a multiple of the rocket it left. Enough to
   be off the panel by the end, since the camera is closing in on what is left
   at the same time. */
const DROP = 1.4;
/* And how far out a booster is thrown, against the widest thing on the stack.
   The motors fire once at separation, which is why it eases out rather than
   accelerating. */
const OUT = 1.3;
/* About twenty degrees by the time it is clear. */
const TILT = 0.35;

/* Accelerating from rest: what a released mass does. */
const falls = (t: number) => t * t;
/* One push and then nothing. */
const pushed = (t: number) => 1 - (1 - t) * (1 - t);
/* Eased at both ends, for the camera. Motion that starts and stops abruptly
   reads as a cut with a delay in the middle. */
const smooth = (t: number) => t * t * (3 - 2 * t);

/* Which parts of the outgoing model are not in the incoming one.

   Read off the two steps rather than by comparing the two models. A part's
   `stage` is its index within the live stages of the step it was built for, so
   a part of the outgoing model survives exactly when its stage is still live
   in the incoming one. The payload has no stage and always survives; boosters
   go the moment the step says they have.

   `ring` rather than the role, since #123: a column is drawn as its tanks and
   its engine, which are a tank and an engine doing their usual jobs on a ring.
   What leaves at the boosters-away step is everything bolted to that ring. */
function departing(parts: ReadonlyArray<ModelPart>, from: Phase, to: Phase) {
  const shed = to.drop - from.drop;
  return parts.map(
    (p) =>
      (p.stage !== undefined && p.stage < shed) ||
      (from.boost && !to.boost && p.ring !== undefined),
  );
}

export function separation(
  parts: ReadonlyArray<ModelPart>,
  incoming: ReadonlyArray<ModelPart>,
  from: Phase,
  to: Phase,
): Separation {
  const goes = departing(parts, from, to);
  /* Where the surviving rocket's base sits in the outgoing frame. `modelOf`
     stands the bottom live stage on zero, so the lowest surviving part is that
     base — and in the incoming model the same part stands on zero itself. */
  let dy = Infinity;
  parts.forEach((p, i) => {
    if (!goes[i]) dy = Math.min(dy, p.y);
  });
  return {
    parts,
    goes,
    from: extentOf(parts),
    to: extentOf(incoming),
    dy: isFinite(dy) ? dy : 0,
  };
}

/* Where each booster turns about.

   A column is an engine, a run of tanks and the radial decoupler holding them
   on. They come off as one body, so they turn about one point — the middle of
   the whole column, which is what a single-shape booster used to turn about by
   default. The renderer rotates every mesh about its own centre, so without
   this each part of a column pivots where it happens to sit and the column fans
   open on its way out. #124 */
const pivots = (parts: ReadonlyArray<ModelPart>) => {
  const span = new Map<number, { lo: number; hi: number }>();
  for (const p of parts) {
    if (p.ring === undefined) continue;
    const s = span.get(p.ring);
    if (!s) span.set(p.ring, { lo: p.y, hi: p.y + p.h });
    else {
      s.lo = Math.min(s.lo, p.y);
      s.hi = Math.max(s.hi, p.y + p.h);
    }
  }
  const mid = new Map<number, number>();
  for (const [k, s] of span) mid.set(k, (s.lo + s.hi) / 2);
  return mid;
};

export function pose(sep: Separation, t: number) {
  const drop = DROP * sep.from.height;
  const out = OUT * sep.from.reach;
  const mid = pivots(sep.parts);
  const offsets: Array<Offset> = sep.parts.map((p, i) => {
    if (!sep.goes[i]) return { x: 0, y: 0, z: 0, tilt: 0 };
    const fall = -drop * falls(t);
    if (p.ring === undefined) return { x: 0, y: fall, z: 0, tilt: 0 };
    /* Radially, away from the axis. A part standing on the axis has no
       direction to be thrown in, so it simply falls. */
    const r = Math.hypot(p.x, p.z);
    if (r < 1e-9) return { x: 0, y: fall, z: 0, tilt: 0 };
    const push = out * pushed(t);
    const tilt = TILT * pushed(t);
    /* The renderer turns a mesh about its own centre and then puts it where we
       say, so turning the column about a shared pivot is a translation we can
       fold in here rather than a second transform there.

       The pivot is directly below or above this part's centre, so the arm is
       vertical: `d` metres of it. Turning that arm by `tilt` about the tangent
       leaves the centre `d·sin` further out along the same radial direction the
       push is along, and `d·(cos − 1)` lower. Both are zero when `d` is — which
       is every solid booster, one shape whose centre is its own pivot, so their
       motion is unchanged to the bit. */
    const d = p.y + p.h / 2 - (mid.get(p.ring) ?? p.y + p.h / 2);
    const swing = d * Math.sin(tilt);
    return {
      x: (p.x / r) * (push + swing),
      y: fall + d * (Math.cos(tilt) - 1),
      z: (p.z / r) * (push + swing),
      tilt,
    };
  });
  /* The two framings, eased between. The parts on their way out are not in
     either of them: included, the camera would chase them off the panel
     instead of closing in on what is left. */
  const s = smooth(t);
  const mid0 = sep.from.height / 2;
  const mid1 = sep.dy + sep.to.height / 2;
  const midY = mid0 + (mid1 - mid0) * s;
  /* Everything the frame contains, parts on their way out included. Not for
     framing — see above — but for the depth window, which has to reach round
     them or they are cut in half in mid-air.

     Written about the point the camera looks at rather than about the floor,
     because `Extent` is a model standing on zero and a part on its way out is
     not: it falls below the pad, and in the plan view — which looks up from
     underneath — that is *towards* the camera, through the near plane. So the
     height reported here is twice the furthest any part gets from `midY`,
     which is what `spanAlong` then halves back. Measured off the posed parts
     rather than reasoned about, so a change to the choreography carries into
     it without anyone having to remember. #124 */
  let halfSpan = 0;
  let reach = 0;
  sep.parts.forEach((p, i) => {
    const o = offsets[i];
    /* `h/2 + r` rather than `h/2`: a part on its way out is turning, and a
       tilted cylinder reaches further along the axis than its own half-length.
       Generous is the safe direction for a clip plane. */
    const arm = p.h / 2 + p.r;
    halfSpan = Math.max(halfSpan, Math.abs(p.y + o.y + p.h / 2 - midY) + arm);
    reach = Math.max(reach, Math.hypot(p.x + o.x, p.z + o.z) + p.r);
  });

  return {
    offsets,
    extent: {
      height: sep.from.height + (sep.to.height - sep.from.height) * s,
      reach: sep.from.reach + (sep.to.reach - sep.from.reach) * s,
    },
    sweep: { height: 2 * halfSpan, reach },
    midY,
  };
}

export type { Offset, Phase, Separation };
