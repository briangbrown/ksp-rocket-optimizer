import {
  PAYLOAD_ASPECT,
  clusterSpan,
  payloadDiaOf,
  ringPositions,
  stageGeom,
  widthOf,
} from "./geometry.js";
import { diaOf } from "./parts.js";

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
function columnsOf(S, ringR) {
  const out = [[0, 0, 0]];
  for (let i = 0; i < S - 1; i++) {
    const th = (i / (S - 1)) * 2 * Math.PI;
    out.push([Math.cos(th) * ringR, Math.sin(th) * ringR, th]);
  }
  return out;
}

const turn = (x, z, th) => [
  x * Math.cos(th) - z * Math.sin(th),
  x * Math.sin(th) + z * Math.cos(th),
];

/* One stage's worth of shapes, standing on `base`, and how tall it came out. */
function stageParts(sol, base, push) {
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
  if (g.coupler > 0) {
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
      const column = (yy, h) => {
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
    const br = (S > 1 ? g.ringR : g.td / 2) + bd / 2;
    /* A stage with no tanks has nothing to hang them from, so they keep the
       engine for company — the case where the core is itself a solid booster. */
    const run = g.tank > 0 ? g.tank : g.engine;
    const foot = g.tank > 0 ? tankBase : base;
    /* Capped at the run it is bolted to, so it never rises past the stage top.
       A long booster on a short core is therefore drawn shorter than it is;
       letting it stand full height would grow the model's extent instead, and
       the panel is sized from that — the whole rocket would shrink to make room
       for a booster sticking out of the top of it. */
    const bh = Math.min(run, boosterLength(b, bd));
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

/* A booster's own length, from its volume where the part table has no height
   for it. Kept here rather than in the loop so the estimate has a name. */
function boosterLength(b, bd) {
  const vol = (b.part.fuelM || 0) / 1.15 || 1;
  return Math.max(bd, vol / ((Math.PI / 4) * bd * bd));
}

/* The whole vehicle: the stages still attached, bottom first, with the payload
   on top. `stages` is what the build view calls `live` — already sliced to the
   staging step being shown. */
export function modelOf(stages, payload = 0, payloadDia = 0) {
  const parts = [];
  const push = (p) => parts.push(p);
  let y = 0;
  for (const st of stages) {
    if (!st.sol) continue;
    y += stageParts(st.sol, y, push);
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
export function extentOf(parts) {
  let height = 0,
    reach = 0;
  for (const p of parts) {
    height = Math.max(height, p.y + p.h);
    reach = Math.max(reach, Math.hypot(p.x, p.z) + p.r);
  }
  return { height, reach, width: reach * 2 };
}
