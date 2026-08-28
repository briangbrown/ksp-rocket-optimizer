import geometryData from "../data/geometry.json";
import { diaOf, isRadial } from "./parts.js";

/* ---------------------- vehicle -> simulator ---------------------- */
/* Stock propellant is 5 kg per 5 litres, so one tonne of it is exactly one cubic
   metre. Tank length follows from that and the diameter with a 15% structural
   allowance, which reproduces every stock tank: 1.875, 3.75 and 7.5 m.
   Aspect ratio is the buildability signal — a tall narrow stack wobbles on the
   pad and flips in the upper atmosphere no matter how good its Δv is. */
/* Enclosing-circle diameter for n packed circles, in units of one engine
   diameter. A cluster of four 1.25 m engines spans 3.02 m, so it sticks out past
   the 2.5 m tank above it and meets the airflow. */
const SPAN = [0, 1, 2, 2.155, 2.414, 2.701, 3, 3, 3.304, 3.613, 3.813];
const clusterSpan = (n, d) => d * (SPAN[n] || 1 + Math.sqrt(n));

/* How far a ring of parallel stacks sits from the middle.

   Radial symmetry in the VAB puts one column on the axis and S-1 around it, and
   that is what the plan view draws — so the only question is the radius. It was
   the tank diameter, which is right only while a column is no wider than its
   tank. Where the engine cluster is broader, and it often is, the columns ran
   through each other: four columns 1.25 m apart carrying 2.53 m clusters
   intersect by 1.28 m, in the drawing and in the design alike. #58

   Two clearances to keep, and the ring has to satisfy both. The centre column
   needs a whole column width to the ring. Neighbours on the ring are
   2 R sin(pi / (S-1)) apart, which only binds once there are enough of them —
   from nine columns up. Below two on the ring there is no neighbour to clear. */
const stackRing = (S, columnWidth) => {
  if (S < 2) return 0;
  const neighbours = S - 1;
  const gap =
    neighbours < 2 ? 0 : columnWidth / (2 * Math.sin(Math.PI / neighbours));
  return Math.max(columnWidth, gap);
};

const ENGINE_LEN = { 0: 0.9, 1: 1.6, 1.5: 2.0, 2: 2.6, 3: 4.5, 4: 5.0, R: 0 };
const engineLen = (e) =>
  PART_H[e.n] !== undefined
    ? PART_H[e.n]
    : Math.max(
        ...e.sz.map((z) => (ENGINE_LEN[z] !== undefined ? ENGINE_LEN[z] : 1.6)),
      );

/* One geometry model, shared by the buildability readout and the drag term.
   Frontal area is the tank cross-section or the summed engine cross-sections,
   whichever is larger: engines wider than the tank are exposed on the annulus,
   engines narrower than it sit in its shadow. */
/* Real part heights, measured off the drag cube bounding boxes in PartDatabase.
   The modelled lengths were close for tanks but wrong for boosters — a Kickback
   holds 19.5 t of solid fuel and is genuinely about 15 m long, which no simple
   volume formula was going to land on. Two parts have no cube; they fall back. */
const PART_H = geometryData.PART_H;
/* Real axial face areas, measured off the same drag cubes as the heights. It
   matters most for radial engines, where inferring an area from diameter is
   badly wrong — diaOf falls back to 1.25 m for anything with no stack profile,
   so a Twitch was being charged 1.23 m² of frontal area against a true 0.07. */
const PART_A = geometryData.PART_A;
const areaOf = (part, fallback) =>
  PART_A[part.n] !== undefined ? PART_A[part.n] : fallback;

/* The width a part actually presents, from its measured face area rather than
   its size class. It matters for anything without a stack profile: diaOf falls
   back to 1.25 m for a radial engine, so a Twitch drew as wide as the tank it
   bolts to when it is really 0.29 m across. */
const widthOf = (part, fallback) =>
  PART_A[part.n] !== undefined
    ? 2 * Math.sqrt(PART_A[part.n] / Math.PI)
    : fallback;

const heightOf = (part, fallback) =>
  PART_H[part.n] !== undefined ? PART_H[part.n] : fallback;
const tankStackLen = (tk) =>
  tk
    ? tk.list.reduce(
        (a, x) =>
          a +
          x.c *
            heightOf(
              x.t,
              (1.15 * x.t.prop) / ((Math.PI / 4) * Math.pow(diaOf(x.t), 2)),
            ),
        0,
      )
    : 0;

/* One definition of the stack's proportions, used by the summary, the drawing
   and the solver's slenderness limit alike. They disagreed before: the summary
   measured stages only, the drawing added the payload and the booster ring, and
   the constraint used a third variant — so a design could be drawn at 13:1,
   reported at 11:1, and pass a 12:1 limit. */
function stackGeometry(chain, payload) {
  let h = 0,
    w = 0;
  chain.forEach((x) => {
    const sol = x && x.sol ? x.sol : x;
    if (!sol || !sol.engine) return;
    const g = stageSize(sol);
    h += g.len;
    w = Math.max(w, g.coreWidth); // boosters excluded: they stage away
  });
  const payD = Math.max(0.9, Math.cbrt(Math.max(payload, 0.1)) * 1.1);
  h += payD * 1.3;
  w = Math.max(w, payD);
  return { h, w, payD, ar: w ? h / w : 0 };
}

/* Tank packing. A run of identical tanks does not have to be a single tall
   column: four of them can ring a fifth, turning five tanks tall into one tank
   tall at three times the width. Nothing about the propellant changes, so this
   is purely a way to trade height for width — which is worth doing exactly when
   the slenderness limit is binding and there is width to spare.

   Width to spare is the whole question. Frontal area is a max over the stack, so
   widening a stage costs nothing as long as it stays inside the widest thing
   below it, and costs a great deal the moment it does not. Measured across a
   range of builds, 33 of 38 stages with three or more stacked tanks had room.

   Holding it together: a radial column needs one crossfeed path and one anchor.
   A TT-38K with crossfeed switched on is 25 kg and does both jobs in one part,
   against 51 kg for a strut plus a fuel duct. A cubic strut at the far end stops
   the column pivoting. */
const PACK_JOIN = {
  n: "TT-38K Radial Decoupler (crossfeed on)",
  m: 0.025,
  cost: 600,
};
const PACK_BRACE = { n: "Cubic Octagonal Strut", m: 0.001, cost: 16 };

/* KSP's symmetry tool offers 2, 3, 4, 6 and 8-fold, so a ring has to be one of
   those to be placeable in one action. A packed block is L levels of a centre
   column with r tanks around each level, so it consumes exactly L × (r + 1)
   tanks — and only identical ones, since a ring of mismatched tanks is neither
   symmetric nor buildable.

   That gives a table rather than a formula:
     3 -> 2 around 1        6 -> 2 around 1, two levels
     4 -> 3 around 1        8 -> 3 around 1, two levels
     5 -> 4 around 1        9 -> 8 around 1
     7 -> 6 around 1       10 -> 4 around 1, two levels
   Preferring fewest levels, then the narrowest ring that achieves it. */
const PACK_SYM = [2, 3, 4, 6, 8];

function packShapes(n) {
  const out = [];
  for (const r of PACK_SYM)
    if (n % (r + 1) === 0) out.push({ r, levels: n / (r + 1) });
  /* shortest first, then narrowest */
  out.sort((a, b) => a.levels - b.levels || a.r - b.r);
  return out;
}

function packFor(sol, roomBelow, vacuumBase = false) {
  /* Per column, not per stage.

     A packed ring is one column's tanks rearranged around that column's centre
     — the plan view draws one at every stack centre, and stageSize adds the
     ring of stacks on top of it. Reading the stage total here counted every
     column's tanks into a single ring: a four-stack stage with two FL-T800 per
     column was packed as a ring of eight, which is a shape that cannot be
     built, and stageGeom then subtracted eight tanks' height from a
     per-column run and returned a tank length of -18 m. #56.

     With three the minimum for a ring, this also means a stage whose columns
     are short does not pack at all, which is the honest answer. */
  const S = sol.stacks || 1;
  const src = S > 1 ? sol.perStack : sol.tanks;
  if (!src || !src.list.length) return null;
  /* Only one kind of tank can go in a ring, so pack the largest identical run
     and leave everything else stacked on the centre column. Counting the whole
     stage — three sizes mixed — described a shape that could not be built. */
  const run = src.list.reduce(
    (best, x) =>
      !best || x.c > best.c || (x.c === best.c && x.t.wet > best.t.wet)
        ? x
        : best,
    null,
  );
  if (!run || run.c < 3) return null;
  /* The bottom stage sets the frontal area itself, so widening it is not free —
     there is nothing below to hide behind. That only matters where there is air:
     a group lifting off from Minmus or the Mun pays no drag at all, and refusing
     to pack its base was the atmospheric rule applied where it does not belong.
     Caller passes Infinity for the base and, in vacuum, tells us to allow it. */
  if (!isFinite(roomBelow) && !vacuumBase) return null;

  const td = diaOf(run.t);
  /* A count with no buildable ring is not the end of it — set one tank aside on
     the centre column and try again. Eleven has no symmetric arrangement, but ten
     is two levels of four around one, so eleven becomes that plus a spare stacked
     above. Peel one at a time and stop at the first count that works, since every
     tank left out of the ring is height not saved. */
  for (let n = run.c; n >= 3; n--) {
    for (const sh of packShapes(n)) {
      if (sh.levels >= n) continue; // no height saved
      const cols = sh.r * sh.levels; // tanks that move off the centre
      const pk = {
        r: sh.r,
        levels: sh.levels,
        cols,
        width: clusterSpan(sh.r + 1, td),
        tank: run.t,
        packedCount: n,
        spare: run.c - n,
        mass: cols * (PACK_JOIN.m + PACK_BRACE.m),
        cost: cols * (PACK_JOIN.cost + PACK_BRACE.cost),
      };
      /* Ask stageSize what the stage would actually measure rather than
         predicting it. Parallel stacks and boosters both widen a stage in ways
         that do not compose the way a bare ring does — a hand-rolled formula had
         a three-stack stage coming out 5.29 m against a 5.19 m base while
         claiming 4.04 m. */
      if (stageSize({ ...sol, packed: pk }).width > roomBelow + 1e-6) continue;
      return pk;
    }
  }
  return null;
}

/* The pieces every view of a stage needs: how tall each part of it is, how wide
   it spans, and what the packed ring looks like. stageSize sums these into a
   bounding box; the elevation lays them out as rectangles. Both used to work them
   out separately, and drifted apart three times — on width, on height, and again
   when packing arrived, each time leaving the drawing describing a different
   rocket from the one the slenderness check was judging. */
function stageGeom(sol) {
  const td = sol.tanks ? diaOf(sol.tanks.list[0].t) : diaOf(sol.engine);
  const ed = widthOf(sol.engine, diaOf(sol.engine));
  /* Parallel columns: height is one column, not the sum. Width spans them, and
     the drag area is every column, since none hides behind another. */
  const S = sol.stacks || 1;
  let tank = S > 1 ? tankStackLen(sol.perStack) : tankStackLen(sol.tanks);
  /* Only the packed run gets shorter. Everything else still stacks on the centre
     column above and below it, so take out the height of the tanks that moved
     into the ring rather than scaling the whole run. */
  if (sol.packed) {
    const p = sol.packed;
    const one = heightOf(
      p.tank,
      (1.15 * p.tank.prop) / ((Math.PI / 4) * Math.pow(diaOf(p.tank), 2)),
    );
    tank -= one * (p.packedCount - p.levels);
  }
  /* Everything here is per column. With radial stacks sol.n counts every engine
     on the stage, so using it for the cluster span drew a three-stack stage as a
     three-engine cluster on one tank — engines far wider than the tank they sit
     under. */
  const perEng = sol.n / S;
  /* Two different widths. The engine block spans its own cluster and nothing
     more — a single Poodle under a packed tank ring is still one Poodle wide.
     The stage as a whole spans whichever is broader, which is what the bounding
     box and the drag area want. Sharing one number drew the engine at the ring's
     width. */
  const engineSpan = Math.max(td, clusterSpan(perEng, ed));
  const span = Math.max(engineSpan, sol.packed ? sol.packed.width : 0);
  /* Where the ring of parallel stacks sits. Exposed rather than worked out
     again in the drawing — see the first entry in "Where the bodies are
     buried". */
  const ringR = stackRing(S, span);
  const engine = engineLen(sol.engine);
  const coupler = sol.coupler ? heightOf({ n: sol.coupler.n }, 0.3) : 0;
  const decoupler = sol.decoupler ? heightOf({ n: sol.decoupler.n }, 0.15) : 0;
  const adapters = sol.adapters
    ? sol.adapters.parts.map((t) => ({
        t,
        h: heightOf(
          t,
          (1.15 * t.prop) / ((Math.PI / 4) * Math.pow(diaOf(t), 2)),
        ),
        w: diaOf(t),
      }))
    : [];
  return {
    td,
    ed,
    S,
    perEng,
    span,
    ringR,
    engineSpan,
    tank,
    engine,
    coupler,
    decoupler,
    adapters,
    pack: sol.packed
      ? {
          r: sol.packed.r,
          w: sol.packed.width,
          td,
          levels: sol.packed.levels,
          spare: sol.packed.spare || 0,
          /* Height of one level of the ring, so the elevation can draw the block
             band by band instead of as one tall rectangle. */
          levelH: heightOf(
            sol.packed.tank,
            (1.15 * sol.packed.tank.prop) /
              ((Math.PI / 4) * Math.pow(diaOf(sol.packed.tank), 2)),
          ),
        }
      : null,
  };
}

function stageSize(sol) {
  const g = stageGeom(sol);
  const { td, ed, S, perEng, span, tank } = g;
  /* A radial engine bolts to the side of the tank rather than sitting under it,
     so it adds a little frontal area in the tank's shadow — the same treatment
     radial boosters get — instead of tiling across the base. Counting two Thuds
     as a stacked cluster doubled this stage's area and charged it roughly twice
     the drag it should see. */
  const eArea = areaOf(sol.engine, (Math.PI / 4) * ed * ed);
  const tArea =
    sol.tanks && sol.tanks.list.length
      ? areaOf(sol.tanks.list[0].t, (Math.PI / 4) * td * td)
      : (Math.PI / 4) * td * td;
  const area =
    (isRadial(sol.engine)
      ? tArea + perEng * eArea * 0.85 // bolted to the side, in the tank's shadow
      : Math.max(tArea, perEng * eArea)) * (S > 1 ? 1 + (S - 1) * 0.85 : 1);
  /* The 0.3 m that used to stand in for "some structure" is now the parts
     themselves: the decoupler at the stage top, any adapter between tank and
     engine, and the coupler a cluster hangs from. All measured. */
  const struct =
    g.decoupler + g.adapters.reduce((a, x) => a + x.h, 0) + g.coupler;
  return {
    len: tank + g.engine + struct,
    width:
      (sol.boosters
        ? span + 2 * widthOf(sol.boosters.part, diaOf(sol.boosters.part))
        : span) +
      2 * stackRing(S, span), // a ring of stacks around the middle one
    /* Width without the boosters. They are gone by about 18 km, so a stack that
       looks stout on the pad can be a pencil for the rest of the ascent — which
       is when it flips. The slenderness limit judges what is left. */
    coreWidth: Math.max(span, td) + 2 * stackRing(S, Math.max(span, td)), // side by side, or a triangle
    stacks: S,
    area,
  };
}

/* Flying a trajectory costs a couple of hundred milliseconds, and the same
   vehicle gets simulated twice — once while choosing a stage count, once for the
   flight card. Key on the numbers that actually change the flight. */

export {
  ENGINE_LEN,
  PACK_BRACE,
  PACK_JOIN,
  PACK_SYM,
  PART_A,
  PART_H,
  SPAN,
  areaOf,
  clusterSpan,
  engineLen,
  heightOf,
  packFor,
  packShapes,
  stackGeometry,
  stageGeom,
  stageSize,
  tankStackLen,
  widthOf,
};
