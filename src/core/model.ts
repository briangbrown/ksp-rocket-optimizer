import {
  PAYLOAD_ASPECT,
  boosterLength,
  boosterRing,
  boosterWidth,
  clusterSpan,
  engineLen,
  payloadDiaOf,
  ringPositions,
  stageGeom,
  standoffOf,
  tankRun,
  widthOf,
} from "./geometry.js";
import { attachHalf } from "./nodes.js";
import { diaOf } from "./parts.js";
import type { Coupler, Engine, Shroud, Tank } from "./catalogue.js";
import type { BoosterPart, DecouplerFit, Solution } from "./solution.js";

/* One shape. A cylinder standing on the stack axis or on a ring around it:
   where its base sits, how wide, how tall, and what it is.

   `rTop` is set only where the shape tapers, which today is the payload alone.
   `stage` is stamped on by `modelOf` as it walks, and the payload has none
   because it belongs to no stage. */
type Shape = {
  x: number;
  z: number;
  y: number;
  r: number;
  h: number;
  rTop?: number;
  stage?: number;
  /* For a part bolted to the side of a column — a radial engine — the
     azimuth it faces: the direction from the part to the axis it is bolted
     to, in the x–z plane, radians. The renderer turns the mesh so its attach
     face looks that way and stands it on the tank's wall; the shape itself
     is still the cylinder that bounds the part. Absent on a stack part. #164 */
  face?: number;
  /* Which radial booster this part is bolted to, counted from 1 across the
     whole model. What a shape *is* is its role — a booster's tank is a tank,
     and is drawn like one — and where it is bolted is this. #123

     An identifier rather than a flag because a column separates as one body:
     its tanks and its engine are held together by a radial decoupler and leave
     on it, so the animation has to turn them about a shared pivot. Grouping
     them by position would work today and would stop working the moment two
     boosters shared a footprint. #124 */
  ring?: number;
};

/* Discriminated on the role, because which part a shape stands for follows
   from the job it is doing: a booster shape carries whatever the ring is made
   of, and only that one knows about columns. Written as one wide `part` it was
   a union every reader had to re-narrow by hand, and by the wrong question —
   asking whether a part has a `column` field finds the liquid ones and misses
   every solid booster in the game.

   A tank has no part where it is a level of a packed ring, which is drawn as
   the column it belongs to rather than as any one tank. */
type ModelPart =
  /* `BoosterPart` because a liquid column's engine is the pool's synthesised
     part, which is the real engine with its mass and fuel rewritten — the same
     engine doing the same job, on a ring. */
  | (Shape & { role: "engine"; part: Engine | BoosterPart })
  | (Shape & { role: "coupler"; part: Coupler | Shroud | null })
  | (Shape & { role: "adapter"; part: Tank })
  | (Shape & { role: "tank"; part?: Tank })
  | (Shape & { role: "decoupler"; part: DecouplerFit | null })
  | (Shape & { role: "booster"; part: BoosterPart })
  | (Shape & { role: "payload" });

type ModelRole = ModelPart["role"];

/* The rocket as solid shapes, in metres.

   Every part of a launch vehicle here is a cylinder standing on the stack axis
   or on a ring around it, so the whole thing reduces to a list of them: where
   the base sits, how wide, how tall, and what it is. That list is what the
   build view draws — and being only numbers, it is also what a test can check
   without a renderer.

   This is the one description. Four of the last five bugs in this repository
   were two descriptions of the same rocket disagreeing about where something
   was — the width estimate against the drawing (#9), the tank ring against the
   stage (#56), three separate ideas of how far apart parallel columns sit
   (#58), and four ways to count a coupler (#60). Nothing here works a dimension
   out for itself: every one comes from `stageGeom`, which is the authority.
   #63.

   Axes: y is up, along the stack. x and z are the plan. The origin is the base
   of the bottom live stage, so the model is built in the order it is flown. */

/* Where the columns of a stage stand, and which way each is turned.

   Radial symmetry puts one on the axis and the rest on a ring, and everything
   bolted to a column turns with it — a pair of engines on a column at 120
   degrees points along that column. */
export function columnsOf(S: number, ringR: number) {
  const out: Array<[number, number, number]> = [[0, 0, 0]];
  for (let i = 0; i < S - 1; i++) {
    const th = (i / (S - 1)) * 2 * Math.PI;
    out.push([Math.cos(th) * ringR, Math.sin(th) * ringR, th]);
  }
  return out;
}

const turn = (x: number, z: number, th: number) => [
  x * Math.cos(th) - z * Math.sin(th),
  x * Math.sin(th) + z * Math.cos(th),
];

/* Where a stage's radial engines start round the column: half a step from
   zero where the stage has no boosters, so the two rings interleave when
   they are equal in number — and where it has boosters, whichever phase in
   one step of the engine ring puts every engine furthest from the nearest
   booster, the boosters keeping the 0° and 180° planes a pilot turns in.
   Null where no phase clears them and the ring has to stand outboard. The
   drawing and the craft both read it. #467 */
export function radialPhase(
  sol: Solution,
  g: ReturnType<typeof stageGeom>,
): { phase: number; clear: boolean } {
  const half = Math.PI / Math.max(1, g.perEng);
  const b = sol.boosters;
  if (!b || !g.radial || g.engineH <= 0) return { phase: half, clear: true };
  const hold = Math.max(g.td, g.pack ? g.pack.w : 0);
  const bd = boosterWidth(b.part);
  const rB = hold / 2 + standoffOf(b.hold.n) + attachHalf(b.part, bd);
  const rE = hold / 2 + g.ed / 2;
  const nearest = (ph: number) => {
    let least = Infinity;
    for (let i = 0; i < b.n; i++)
      for (let j = 0; j < g.perEng; j++) {
        const da = ph + (j / g.perEng - i / b.n) * 2 * Math.PI;
        const d2 = rB * rB + rE * rE - 2 * rB * rE * Math.cos(da);
        least = Math.min(least, Math.sqrt(Math.max(0, d2)));
      }
    return least;
  };
  const steps = 72;
  let best = half,
    bestD = -1;
  for (let k = 0; k < steps; k++) {
    const ph = ((k / steps) * 2 * Math.PI) / g.perEng;
    const d = nearest(ph);
    if (d > bestD + 1e-9) {
      bestD = d;
      best = ph;
    }
  }
  return bestD >= (bd + g.ed) / 2
    ? { phase: best, clear: true }
    : { phase: half, clear: false };
}

/* Where a stage's ring of boosters stands: how wide each is (`bd`), how long
   (`bh`), where its foot is (`foot`), the ring's radius (`br`), the length of
   a liquid column's engine (`eh`), the width of what the ring is bolted to
   (`hold`). Shared by the drawing below and by the craft adapter
   (core/craft.ts), so the file and the picture put a booster in one place.
   #464 */
export function boosterLayout(
  sol: Solution,
  g: ReturnType<typeof stageGeom>,
  tankBase: number,
  above: Solution | null = null,
) {
  const b = sol.boosters!;
  /* The same width stageSize charges for it, so the shapes cannot reach
     further than the stage was sized at. */
  const bd = boosterWidth(b.part);
  /* Against the outermost tank, because that is what it is bolted to. For a
     plain run that is the core's own diameter; where the run is a packed ring
     the outer tanks reach `packed.width / 2` and the booster has to clear
     them — measuring off the core alone put it 0.31 m inside the ring, which
     only showed once the boosters were drawn at their real length and reached
     up into it.

     Not `span`, which is the widest thing the stage has whether or not the
     booster ever comes near it: a wide engine cluster it stops above would
     push it off the tank it is supposed to touch. What it does have to clear
     is whatever it ends up running alongside, which the walk below knows.

     Nothing exercises the ring half of this. No stage in the mission grid has
     both — nine carry boosters, five carry a ring, none carries both — so the
     clearance is reasoned rather than checked, and it is here because the
     placement is wrong without it, not because a test went red. */

  const hold = Math.max(g.td, g.pack ? g.pack.w : 0);
  /* Its foot goes to the stage's base: the bottom of what is under the tanks,
     engine, coupler and adapters, so its nozzle lines up with the core
     engine's, which is how the game's rockets are built and what probes 3
     and 5 asked for (#467). Until then a walk stopped at the first section
     too narrow to bolt to (#86, #109) — a 1.875 m engine plate under a 2.5 m
     tank held probe 5's columns at the tank base with a wide Vector cluster
     below them. Since #438 the holder meets the booster's middle on the
     tank, so nothing hangs from what is beside its foot; the walk's other
     question, how far out the ring stands, is `draw` below. */
  const sections = [
    /* Below the tanks a radial engine is only its bell, off to the side:
       nothing on the axis for the ring to clear. */
    { h: g.engine, draw: g.radial ? 0 : clusterSpan(g.perEng, g.ed) / 2 },
    { h: g.coupler, draw: sol.coupler ? sol.coupler.top / 2 : 0 },
    ...g.adapters.map((a2) => ({ h: a2.h, draw: a2.w / 2 })),
  ];
  const base = tankBase - sections.reduce((t, x) => t + Math.max(0, x.h), 0);
  let foot = base;
  /* Its real length, uncapped. It was truncated to the run it is bolted to,
     which is a part drawn at a size it is not — and it never needed to be:
     every booster the mission grid picks is shorter than the tanks it hangs
     from, so the cap only ever hid how wrong the length underneath it was. */
  const bh = boosterLength(b.part, bd);
  /* The walk says how far down the foot *may* go; this says how far it can
     go and still be held. The game holds a radially attached part by its
     surface-attach node, and on a solid booster that node is at mid-height,
     so the decoupler on the tank wall has to meet the booster's middle: at
     least half of it stands beside the tanks, whatever its nozzle lines up
     with. A Clydesdale beside three Mammoths does that from the engines'
     base with metres to spare and lines its nozzle up with theirs, as the
     game shows. A 1.77 m Mite beside two Boars does not: lowered to their
     base it ran its whole length alongside the engine block and topped out
     1.04 m below the tank, bolted to nothing, and twenty of the sweep's 119
     boosters did the same. So the foot is the walk's answer only where the
     booster is long enough for it, and otherwise rises until its middle is
     level with the tank base. #86 and #109 are about how far down the foot
     may go; this is the other half of the same joint. #438 */
  foot = Math.max(foot, tankBase - bh / 2);
  /* What the booster runs alongside below the tanks, and has to clear with
     no decoupler between: the widest section between its foot and the tank
     base — a cluster of bells wider than the tank — and, where the stage's
     engines are radial and no phase of their ring clears the boosters
     (`radialPhase`), the bells on the wall itself. The boosters keep the 0°
     and 180° planes a pilot turns in; only where no phase clears them does
     the ring stand outboard of the engines. Pushed out regardless, probe 2's
     Shrimps hung half a metre off the tank on a TT-38K a quarter of that
     thick, and collided with the Twitches in the VAB (#467). */
  let clear = 0;
  if (g.radial && g.engineH > 0 && !radialPhase(sol, g).clear)
    clear = hold / 2 + g.ed;
  let top = tankBase;
  for (let k = sections.length - 1; k >= 0 && top > foot + 1e-9; k--) {
    if (sections[k].h <= 0) continue;
    if (sections[k].draw > clear) clear = sections[k].draw;
    top -= sections[k].h;
  }
  /* Its decoupler's thickness off the wall it is bolted to, its bare face
     against whatever it clears, and far enough out that the ring clears
     itself — `boosterRing` keeps all three, and `stageSize` charges the
     stage for the same radius. #420 */
  const half = attachHalf(b.part, bd);
  const br = boosterRing(
    b.n,
    bd,
    g.S > 1 ? g.ringR : hold / 2,
    standoffOf(b.hold.n),
    half,
    clear,
  );
  /* And no higher than the tanks it hangs beside, where the stage above
     would meet it: that stage stands on the top tank, and where it reaches
     out past the ring's inner face — a cluster wider than this stage's core —
     a booster reaching past the tank top reaches into its engines. Probe 3's
     Kickbacks topped out 0.15 m up the Terriers' bells of the three-stack
     stage above (#467). So the foot goes down until the top is level with
     the tank top, as far as the holder still meets the middle; a booster
     longer than twice the tank run keeps the holder and pokes up, which is
     the solver's to refuse. A stage above narrow enough to stand inside the
     ring is passed by, as the game allows, and the foot stays where the
     walk put it. */
  const reach = above ? stageGeom(above).span / 2 : 0;
  if (reach > br - half) {
    foot = Math.min(foot, tankBase + g.tank - bh);
    foot = Math.max(foot, tankBase - bh / 2);
  }
  const col = b.part.column;
  /* Numbered across the model, so two stages carrying boosters at the same
     angle are still two rings. */
  /* A column's engine, where it has one. `nEng` is what the pools write to
     say so: a drop tank is tankage with nothing under it. */
  const eh = col && (b.part.nEng ?? 1) ? engineLen(b.part) : 0;
  return { bd, bh, half, base, foot, br, eh, hold };
}

/* One stage's worth of shapes, standing on `base`, and how tall it came out. */
function stageParts(
  sol: Solution,
  base: number,
  push: (p: ModelPart) => void,
  /* Held on an object rather than as a local the caller reassigns, because the
     compiler cannot follow an assignment made inside the walk. */
  ringNo: { n: number },
  above: Solution | null = null,
) {
  const g = stageGeom(sol);
  const S = g.S;
  const columns = columnsOf(S, g.ringR);
  let y = base;

  /* Engines. Each column carries its own cluster, laid out by the same
     ringPositions the plan view uses, and turned with the column. A radial
     engine is placed once the tanks are, since it hangs on them. */
  if (g.engine > 0 && !g.radial) {
    const spread = (clusterSpan(g.perEng, g.ed) - g.ed) / 2;
    for (const [cx, cz, th] of columns)
      for (const [ux, uz] of ringPositions(g.perEng)) {
        const [ox, oz] = turn(ux * spread, uz * spread, th);
        push({
          role: "engine",
          part: sol.engine,
          x: cx + ox,
          z: cz + oz,
          y,
          r: g.ed / 2,
          h: g.engine,
        });
      }
  }
  y += g.engine;

  /* A coupler gathers one column's cluster onto that column's tank, and the
     adapters bridge that column's diameters — one set per column, which is
     what #60 settled. */
  /* `sol.coupler` is named as well as measured: `g.coupler` is zero without
     one, so the second test never changes what runs — it says out loud what the
     first one already relies on. */
  if (g.coupler > 0 && sol.coupler) {
    for (const [cx, cz] of columns)
      push({
        role: "coupler",
        part: sol.shroud || sol.coupler,
        x: cx,
        z: cz,
        y,
        r: sol.coupler.top / 2,
        h: g.coupler,
      });
    y += g.coupler;
  }
  for (const a of g.adapters) {
    for (const [cx, cz] of columns)
      push({
        role: "adapter",
        part: a.t,
        x: cx,
        z: cz,
        y,
        r: a.w / 2,
        h: a.h,
      });
    y += a.h;
  }

  /* Where the tanks start, kept because the radial boosters below hang off
     them and would otherwise have to add the engine, the coupler and every
     adapter back up for themselves. */
  const tankBase = y;

  /* Tanks. A packed run is a ring of tanks around the column's own centre,
     level by level, with anything that did not fit still stacked on it. */
  if (g.tank > 0) {
    if (g.pack) {
      const pk = g.pack;
      const spareH = pk.spare * pk.levelH;
      const rest = g.tank - spareH - pk.levels * pk.levelH;
      const column = (yy: number, h: number) => {
        for (const [cx, cz] of columns)
          push({ role: "tank", x: cx, z: cz, y: yy, r: g.td / 2, h });
      };
      if (rest > 0.01) {
        column(y, rest);
        y += rest;
      }
      const rk = (pk.w - pk.td) / 2;
      for (let L = 0; L < pk.levels; L++) {
        column(y, pk.levelH);
        for (const [cx, cz, th] of columns)
          for (let i = 0; i < pk.r; i++) {
            const a = (i / pk.r) * 2 * Math.PI + th;
            push({
              role: "tank",
              x: cx + Math.cos(a) * rk,
              z: cz + Math.sin(a) * rk,
              y,
              r: pk.td / 2,
              h: pk.levelH,
            });
          }
        y += pk.levelH;
      }
      if (spareH > 0.01) {
        column(y, spareH);
        y += spareH;
      }
    } else {
      /* Tank by tank, not the run in one piece. Every seam between two of them
         is a line in the drawing, and there is no other way to get it: two
         tanks of the same diameter stacked end to end are continuous in depth
         and in normals, so the outline pass finds them by surface id or not at
         all — and a single cylinder has no ids to differ. */
      let ty = y;
      for (const tk of g.run) {
        for (const [cx, cz] of columns)
          push({
            role: "tank",
            part: tk.t,
            x: cx,
            z: cz,
            y: ty,
            r: g.td / 2,
            h: tk.h,
          });
        ty += tk.h;
      }
      y += g.tank;
    }
  }

  /* Radial engines: on the wall of the outermost tank, `perEng` of them round
     each column, the bell hanging `g.engine` below the tank base and the
     rest of the part up the wall. Half a step round from the boosters'
     azimuths, which start at zero, so the two rings interleave. #164 */
  if (g.radial && g.engineH > 0) {
    const R = Math.max(g.td, g.pack ? g.pack.w : 0) / 2;
    const r = g.ed / 2;
    for (const [cx, cz, th] of columns)
      for (let j = 0; j < g.perEng; j++) {
        const a = radialPhase(sol, g).phase + (j / g.perEng) * 2 * Math.PI + th;
        push({
          role: "engine",
          part: sol.engine,
          x: cx + Math.cos(a) * (R + r),
          z: cz + Math.sin(a) * (R + r),
          y: tankBase - g.engine,
          r,
          h: g.engineH,
          face: a + Math.PI,
        });
      }
  }

  /* The decoupler sits at the top of the stage, on the axis: the columns hang
     off the core through joiners rather than separating on their own. */
  if (g.decoupler > 0) {
    push({
      role: "decoupler",
      part: sol.decoupler,
      x: 0,
      z: 0,
      y,
      r: g.td / 2,
      h: g.decoupler,
    });
    y += g.decoupler;
  }

  /* Radial boosters stand beside the stage, outside the ring of columns rather
     than inside it — and against the tanks, which is what they are bolted to.

     `br` was already measured off the tank's diameter, because that is where
     the decoupler goes. The foot was not: standing it on the stage's base put
     it alongside the engine, the coupler and the adapters, every one of them
     narrower than the tank, so a booster was drawn against nothing at all for
     that whole length and read as floating. Every booster-bearing stage in the
     mission grid had it, and where a stage's own engine is a solid booster —
     `engineLen` is then the entire casing, and a Clydesdale is 22 m — it ran to
     twenty-five metres of empty space. #86 */
  if (sol.boosters) {
    const b = sol.boosters;
    const { bd, bh, half, foot, br, eh } = boosterLayout(
      sol,
      g,
      tankBase,
      above,
    );
    const col = b.part.column;
    for (let i = 0; i < b.n; i++) {
      const a = (i / b.n) * 2 * Math.PI;
      const x = Math.cos(a) * br;
      const z = Math.sin(a) * br;
      const ring = ++ringNo.n;
      /* A solid booster is one part and is drawn as one. A liquid column is an
         engine with a run of tanks above it, and a drop tank is the run on its
         own — five parts and four, drawn as one cylinder each until now, so
         there was no seam between the tanks and no line where the engine met
         the tank above it. The outline pass cannot put them back: two tanks of
         the same diameter are continuous in depth and in normals, so that seam
         is found by surface id or not at all, and one shape carries one id.
         The same fault #71 fixed on the stack, in the branch it did not reach.

         Drawn part by part they are also drawn *as* what they are — the tanks
         in the tank colour and the engine in the engine colour, like the parts
         on the axis, rather than a featureless cylinder in a colour of its
         own. #123 */
      /* A solid is drawn at its casing, which is what the attach node
         measures — `bd` is the cube, fins and all, and a Kickback drawn at
         its fins' 1.6 m stood 0.25 m into the tank it is held against. */
      if (!col) {
        push({
          role: "booster",
          part: b.part,
          ring,
          x,
          z,
          y: foot,
          r: half,
          h: bh,
        });
        continue;
      }
      let y = foot;
      /* The engine at its own width — `bd` is the column's, its widest tank. */
      if (eh > 0) {
        push({
          role: "engine",
          part: b.part,
          ring,
          x,
          z,
          y,
          r: widthOf(b.part, diaOf(b.part)) / 2,
          h: eh,
        });
        y += eh;
      }
      /* The same walk the stack's own run is drawn by, so the two cannot
         disagree about how long a run of tanks is. */
      for (const t of tankRun(col)) {
        push({
          role: "tank",
          part: t.t,
          ring,
          x,
          z,
          y,
          r: bd / 2,
          h: t.h,
        });
        y += t.h;
      }
    }
  }

  return y - base;
}

/* How long a booster actually is.

   Measured, where the part table has a height for it, which is nearly always.
   The volume estimate below it was drawing every one of them far too short —
   a Shrimp is 3.99 m and came out 1.69, a Mite 1.77 against 0.75, a
   Thoroughbred 12.23 against 7.37. It is 40 to 135% out.

   A liquid radial is not one part but a stack, so it is its column plus the
   engine on the bottom of it: a Mainsail column is 14.46 m where the estimate
   said 8.70.

   The estimate survives only for a part with no measured height at all. Solid
   fuel is 7.5 kg per 5 litre unit, so 1.5 t per cubic metre; the grain alone
   left the small boosters far too stubby, so it adds a nozzle and closure
   allowance that scales with bore. */

/* The whole vehicle: the stages still attached, bottom first, with the payload
   on top. `stages` is what the build view calls `live` — already sliced to the
   staging step being shown. */
export function modelOf(
  stages: ReadonlyArray<{ sol?: Solution | null }>,
  payload = 0,
  payloadDia = 0,
) {
  const parts: Array<ModelPart> = [];
  const ringNo = { n: 0 };
  /* Which stage a part came from. Nothing in the drawing needs it — every view
     is a projection of the whole rocket — but a check does: a booster longer
     than the run it hangs from genuinely reaches into the stage above, and
     telling that apart from a part overlapping its own stage takes knowing
     which stage each one is. */
  let stage = 0;
  const push = (p: ModelPart) => parts.push({ ...p, stage });
  let y = 0;
  const solved = stages.map((st) => st.sol ?? null).filter((s) => s !== null);
  solved.forEach((sol, k) => {
    y += stageParts(sol, y, push, ringNo, solved[k + 1] ?? null);
    stage++;
  });
  const payD = payloadDiaOf(payload, payloadDia);
  if (payD > 0)
    parts.push({
      role: "payload",
      x: 0,
      z: 0,
      y,
      r: payD / 2,
      /* KSP's pods taper by one stack size, and that ladder halves: the Mk1
         goes 1.25 to 0.625, the Mk1-3 2.5 to 1.25. The Mk2 is the odd one at
         two thirds. */
      rTop: payD / 4,
      /* The same figure the slenderness limit is measured on — see
         PAYLOAD_ASPECT. Drawing a shape the solver did not measure is the
         two-descriptions failure this whole model exists to prevent. */
      h: payD * PAYLOAD_ASPECT,
    });
  return parts;
}

/* The box the model occupies: how tall, and how far anything reaches from the
   axis. The cameras frame from this, which is what makes containment true by
   construction rather than something to check in pixels afterwards. */
export function extentOf(parts: ReadonlyArray<ModelPart>) {
  let height = 0,
    reach = 0;
  for (const p of parts) {
    height = Math.max(height, p.y + p.h);
    reach = Math.max(reach, Math.hypot(p.x, p.z) + p.r);
  }
  return { height, reach, width: reach * 2 };
}

export type { ModelPart, ModelRole };
