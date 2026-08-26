import curvesData from "../data/curves.json";
import { evalCurve, ispCurve } from "./atmosphere.js";
import { G0 } from "./constants.js";

function propellantFor(dv, dry, isp, k) {
  if (!isFinite(dv)) return null;
  const R = Math.exp(dv / (isp * G0));
  const den = 1 + k - R * k;
  if (den <= 1e-6) return null;
  const mp = ((R - 1) * dry) / den;
  return mp > 0 && mp < 1e5 ? mp : null;
}

/* ---------------------- pressure-corrected performance ----------------------
   Stock atmosphereCurve is three keys: vacuum, sea level, then a cutoff where the
   engine quits, somewhere between 3 and 12 atm. Without the real cfg files the
   cutoff is inferred from how sea-level-tolerant an engine already is — vacuum
   bells like the Terrier give up early, sea-level bells like the Vector hold on.
   This is the one assumption real part files would replace.

   The pressure a stage actually burns at was measured by running the simulator
   over Kerbin, Duna and Laythe designs and taking the propellant-weighted mean:
   the first stage averages 62% of surface pressure, the second 5%, the third
   effectively none. */
const STAGE_PRESSURE = [0.62, 0.05, 0, 0];
/* Real atmosphereCurve keys, lifted from the part configs. Two-value keys carry
   zero tangents, which is what KSP's FloatCurve does with them.
   These replace an inferred cutoff of 3 + 9*(Isp_asl/Isp_vac) that turned out to
   be wrong by 3.4 atm on average and correct for only 4 engines in 60. It ran
   systematically optimistic for vacuum bells — a Terrier was given a 5.2 atm
   cutoff against a real 3.0, so it was still credited with thrust at pressures
   where it actually produces nothing. Everything computed at Eve moved. */
const REAL_CURVE = curvesData.REAL_CURVE;
const ispCut = (e) => Math.min(12, Math.max(3, 3 + 9 * (e.ia / e.iv)));
const _ispFns = new Map();
/* PROTOTYPE: result cache, not just curve cache. */
const _ispVals = new Map();
function ispAt(e, p) {
  if (!p) return e.iv;
  let byP = _ispVals.get(e.n);
  if (byP === undefined) {
    byP = new Map();
    _ispVals.set(e.n, byP);
  }
  const hit = byP.get(p);
  if (hit !== undefined) return hit;
  let f = _ispFns.get(e.n);
  if (!f) {
    const real = REAL_CURVE[e.n];
    f = real ? (x) => evalCurve(real, x) : ispCurve(e.iv, e.ia, ispCut(e));
    _ispFns.set(e.n, f);
  }
  const v = Math.max(0, f(p));
  byP.set(p, v);
  return v;
}

/* --------------------------- what counts as "best" ---------------------------
   Engine, tank and decoupler prices all come from the part configs now. These
   constants remain only as a fallback for a part with no cost recorded — 92 funds
   per tonne of propellant plus a structural term, which is roughly where the
   stock line sits. Worth knowing that tanks are the larger share: on a cheapest
   Mun landing they are about 62% of the funds against 38% for engines and
   boosters, so the leverage on cost is in how much propellant a design needs,
   not in which engine burns it. */
const TANK_FUNDS_PROP = 92,
  TANK_FUNDS_DRY = 1250,
  DECOUPLER_FUNDS = 75;

/* Prices are real now — every tank and decoupler carries the figure from its
   config. Only a part with no cost recorded falls back to the old model. */
function stageCost(c) {
  const est = (t) =>
    t.cost != null ? t.cost : t.prop * TANK_FUNDS_PROP + t.dry * TANK_FUNDS_DRY;
  let f =
    c.n * c.engine.cost +
    (c.decoupler ? c.decoupler.cost : DECOUPLER_FUNDS) +
    (c.coupler ? c.coupler.cost : 0) +
    (c.rejoin ? c.rejoin.cost : 0) +
    (c.packed ? c.packed.cost : 0) +
    (c.joiner ? ((c.stacks || 1) - 1) * 2 * c.joiner.cost : 0);
  if (c.tanks) f += c.tanks.list.reduce((a, x) => a + x.c * est(x.t), 0);
  if (c.adapters) f += c.adapters.parts.reduce((a, t) => a + est(t), 0);
  /* A liquid radial column costs its engine plus its tanks, not just the engine —
     reporting only the engine made columns look cheap, and the cost objective
     picked them over designs that were genuinely cheaper. */
  if (c.boosters)
    f +=
      c.boosters.n *
      (c.boosters.part.cost +
        (c.boosters.part.column ? c.boosters.part.column.funds || 0 : 0) +
        DECOUPLER_FUNDS);
  return f;
}
const stageParts = (c) =>
  c.n +
  (c.tanks ? c.tanks.count : 0) +
  (c.adapters ? c.adapters.parts.length : 0) +
  (c.coupler ? 1 : 0) +
  (c.rejoin ? 1 : 0) +
  (c.packed ? c.packed.cols * 2 : 0) +
  ((c.stacks || 1) - 1) * 2 +
  (c.decoupler && c.decoupler.qty ? c.decoupler.qty : 1) +
  (c.boosters
    ? c.boosters.n *
      (2 + (c.boosters.part.column ? c.boosters.part.column.count : 0))
    : 0);

/* Selection is greedy per stage: a cheap-but-heavy upper stage makes everything
   below it bigger, and a stage cannot see that while it is being sized. Mass is
   kept as the tiebreak so the myopia stays bounded. */
/* Selecting greedily per stage is myopic — a cheap heavy upper stage makes
   everything below it bigger. These couplings price that downstream effect back
   in, and were fitted by sweeping: without them the cost objective came out
   dearer than the mass objective on two of six test missions. A moderate mass
   term also helps the part count, since lighter stages need fewer tanks. */
const COUPLE_COST = 1500,
  COUPLE_PARTS = 20;
function scoreOf(c, objective) {
  if (objective === "cost") return stageCost(c) + c.total * COUPLE_COST;
  if (objective === "parts") return stageParts(c) + c.total / COUPLE_PARTS;
  return c.total * (1 + 0.006 * (c.n + (c.tanks ? c.tanks.count : 0)));
}

export {
  COUPLE_COST,
  COUPLE_PARTS,
  DECOUPLER_FUNDS,
  REAL_CURVE,
  STAGE_PRESSURE,
  TANK_FUNDS_DRY,
  TANK_FUNDS_PROP,
  ispAt,
  ispCut,
  propellantFor,
  scoreOf,
  stageCost,
  stageParts,
};
