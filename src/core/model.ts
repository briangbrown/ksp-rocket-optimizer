import {
  PAYLOAD_ASPECT,
  clusterSpan,
  engineLen,
  heightOf,
  payloadDiaOf,
  ringPositions,
  stageGeom,
  tankStackLen,
  widthOf,
} from "./geometry.js";
import { diaOf } from "./parts.js";
import type { Coupler, Engine, Shroud, Tank } from "./catalogue.js";
import type {
  BoosterPart,
  Boosters,
  DecouplerFit,
  Solution,
} from "./solution.js";

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
  | (Shape & { role: "engine"; part: Engine })
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
function columnsOf(S: number, ringR: number) {
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

/* One stage's worth of shapes, standing on `base`, and how tall it came out. */
function stageParts(sol: Solution, base: number, push: (p: ModelPart) => void) {
  const g = stageGeom(sol);
  const S = g.S;
  const columns = columnsOf(S, g.ringR);
  let y = base;

  /* Engines. Each column carries its own cluster, laid out by the same
     ringPositions the plan view uses, and turned with the column. */
  if (g.engine > 0) {
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
    /* The same width stageSize charges for it, so the shapes cannot reach
       further than the stage was sized at. */
    const bd = widthOf(b.part, diaOf(b.part));
    /* Against the outermost tank, because that is what it is bolted to. For a
       plain run that is the core's own diameter; where the run is a packed ring
       the outer tanks reach `packed.width / 2` and the booster has to clear
       them — measuring off the core alone put it 0.31 m inside the ring, which
       only showed once the boosters were drawn at their real length and reached
       up into it.

       Not `span`, which is the widest thing the stage has: a wide engine
       cluster would push the booster off the tank it is supposed to touch.

       Nothing exercises the ring half of this. No stage in the mission grid has
       both — nine carry boosters, five carry a ring, none carries both — so the
       clearance is reasoned rather than checked, and it is here because the
       placement is wrong without it, not because a test went red. */

    const hold = Math.max(g.td, g.pack ? g.pack.w : 0);
    const br = (S > 1 ? g.ringR : hold / 2) + bd / 2;
    /* Its foot goes as low as the stage still reaches out to meet it.

       A booster bolts to whatever is beside it, and below the tanks a stage
       may keep its width or lose it. Three Mammoths on an EP-50 plate are as
       wide as the Kerbodyne tanks above them, so a Clydesdale runs right down
       past them and its nozzle lines up with theirs. A 0.29 m engine under a
       1.25 m tank does not, and a booster standing on the base beside it hangs
       against nothing — which is what #86 was.

       So walk down from the tanks through the adapters, the coupler and the
       engines, and stop at the first section too narrow to touch. That is one
       rule for both, and it takes in the fuelled engines as well without
       naming them: a Twin-Boar carries 32 t of propellant and is 2.75 m across
       against a 2.5 m stack, so it is wide enough on its own terms. */
    const sections = [
      { h: g.engine, reach: clusterSpan(g.perEng, g.ed) / 2 },
      { h: g.coupler, reach: sol.coupler ? sol.coupler.top / 2 : 0 },
      ...g.adapters.map((a2) => ({ h: a2.h, reach: a2.w / 2 })),
    ];
    let foot = tankBase;
    for (let k = sections.length - 1; k >= 0; k--) {
      if (sections[k].h <= 0) continue;
      if (sections[k].reach < hold / 2) break;
      foot -= sections[k].h;
    }
    /* Its real length, uncapped. It was truncated to the run it is bolted to,
       which is a part drawn at a size it is not — and it never needed to be:
       every booster the mission grid picks is shorter than the tanks it hangs
       from, so the cap only ever hid how wrong the length underneath it was. */
    const bh = boosterLength(b, bd);
    for (let i = 0; i < b.n; i++) {
      const a = (i / b.n) * 2 * Math.PI;
      push({
        role: "booster",
        part: b.part,
        x: Math.cos(a) * br,
        z: Math.sin(a) * br,
        y: foot,
        r: bd / 2,
        h: bh,
      });
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
function boosterLength(b: Boosters, bd: number) {
  const p = b.part;
  if (p.column) return tankStackLen(p.column) + engineLen(p);
  const measured = heightOf(p, 0);
  if (measured > 0) return measured;
  const vol = (p.fuelM || 0) / 1.15 || 1;
  return Math.max(bd, vol / ((Math.PI / 4) * bd * bd));
}

/* The whole vehicle: the stages still attached, bottom first, with the payload
   on top. `stages` is what the build view calls `live` — already sliced to the
   staging step being shown. */
export function modelOf(
  stages: ReadonlyArray<{ sol?: Solution | null }>,
  payload = 0,
  payloadDia = 0,
) {
  const parts: Array<ModelPart> = [];
  /* Which stage a part came from. Nothing in the drawing needs it — every view
     is a projection of the whole rocket — but a check does: a booster longer
     than the run it hangs from genuinely reaches into the stage above, and
     telling that apart from a part overlapping its own stage takes knowing
     which stage each one is. */
  let stage = 0;
  const push = (p: ModelPart) => parts.push({ ...p, stage });
  let y = 0;
  for (const st of stages) {
    if (!st.sol) continue;
    y += stageParts(st.sol, y, push);
    stage++;
  }
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
