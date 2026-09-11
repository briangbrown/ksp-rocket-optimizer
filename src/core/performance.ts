import curvesData from "../data/curves.json";
import { evalCurve, ispCurve } from "./atmosphere.js";
import { G0 } from "./constants.js";
import { RADIAL_DECOUPLER_FUNDS } from "./parts.js";
import type { Curve } from "./atmosphere.js";
import type { Tank } from "./catalogue.js";
import type { Solution } from "./solution.js";

/* What the search is being asked to minimise. */
type Objective = "mass" | "cost" | "parts";

function propellantFor(dv: number, dry: number, isp: number, k: number) {
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
/* A Map rather than the JSON object it is read from: a lookup by part name on
   a plain object can land on a prototype property — `constructor`, `toString`
   — and the function built from that would then be called on a pressure.
   CodeQL flagged exactly that dispatch (js/unvalidated-dynamic-method-call),
   three times, once per refactor that moved the line. A Map has no such
   properties to hit, and `ispFnFor` checks the shape of what it gets back. */
const REAL_CURVE: ReadonlyMap<string, Curve> = new Map(
  Object.entries(curvesData.REAL_CURVE as Record<string, Curve>),
);
const ispCut = (e: { ia: number; iv: number }) =>
  Math.min(12, Math.max(3, 3 + 9 * (e.ia / e.iv)));
const _ispFns = new Map<string, (x: number) => number>();
/* Cache the value, not just the curve. This is called 124 million times across
   the design grid and has 116 distinct answers — the curve lookup was already
   cached, but the evaluation was not, and evaluating a Hermite spline is not
   free. Pure in (engine, pressure), so nothing here needs invalidating. */
const _ispVals = new Map<string, Map<number, number>>();
/* Engines and the stand-in parts a booster pool synthesises alike: all this
   needs is a name to key the cache on and the two Isp figures. */
/* An engine's Isp against pressure, as one function: the real atmosphereCurve
   where the config supplied one, else the shape inferred from the two table
   figures. The sizer and the simulator both take their curve from here. They
   used to build it separately — `ispAt` from the real keys, `buildVehicleFor`
   from the inferred cutoff — and agreed only below 1 atm, where the third key
   cannot reach; at Eve's 5 atm a Swivel was 26 s to one and 146 s to the
   other. #328 */
function ispFnFor(e: { n: string; iv: number; ia: number }) {
  const real = REAL_CURVE.get(e.n);
  return real && Array.isArray(real)
    ? (x: number) => Math.max(0, evalCurve(real, x))
    : ispCurve(e.iv, e.ia, ispCut(e));
}
function ispAt(e: { n: string; iv: number; ia: number }, p: number) {
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
    f = ispFnFor(e);
    _ispFns.set(e.n, f);
  }
  const v = f(p);
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
/* Kept as its own sum, and it is the only reading that is. Everything else a
   stage's parts add up to comes from the one walk in manifest.js — the rows you
   are shown, the mass, the cost off the hot path, the count — but `stageCost`
   and `stageParts` are called for every viable candidate the search considers,
   1.9 million times across two of the grid's eighty-one cases alone. Folding
   the walk instead costs 9% of the whole grid, measured: 13.13s to 14.30s, and
   hoisting the visitor out of the call changes nothing, because the cost is the
   walk's ten calls against this one expression.

   So this stays fast and `test/manifest.test.js` holds it to the walk, which is
   the same arrangement `fitStructure`'s dry mass already has and for the same
   reason. #62 */
function stageCost(c: Solution) {
  const est = (t: Tank) =>
    t.cost != null ? t.cost : t.prop * TANK_FUNDS_PROP + t.dry * TANK_FUNDS_DRY;
  let f =
    c.n * c.engine.cost +
    (c.decoupler ? c.decoupler.cost : DECOUPLER_FUNDS) +
    (c.coupler ? c.coupler.cost * (c.stacks || 1) : 0) +
    (c.rejoin ? c.rejoin.cost : 0) +
    (c.packed ? c.packed.cost * (c.stacks || 1) : 0) +
    (c.joiner ? ((c.stacks || 1) - 1) * 2 * c.joiner.cost : 0);
  if (c.tanks) f += c.tanks.list.reduce((a, x) => a + x.c * est(x.t), 0);
  if (c.adapters)
    f += (c.stacks || 1) * c.adapters.parts.reduce((a, t) => a + est(t), 0);
  /* A liquid radial column costs its engine plus its tanks, not just the
     engine — reporting only the engine made columns look cheap, and the cost
     objective picked them over designs that were genuinely cheaper. A drop
     tank is the same sum with nothing in the first term. The decoupler is the
     TT-38K's own price, not the estimate a stage with no decoupler recorded
     falls back to: the part is named, so it is priced. #161 */
  if (c.boosters)
    f +=
      c.boosters.n *
      (c.boosters.part.cost +
        (c.boosters.part.column ? c.boosters.part.column.funds || 0 : 0) +
        RADIAL_DECOUPLER_FUNDS);
  return f;
}
const stageParts = (c: Solution) =>
  c.n +
  (c.tanks ? c.tanks.count : 0) +
  (c.adapters ? c.adapters.parts.length * (c.stacks || 1) : 0) +
  (c.coupler ? c.stacks || 1 : 0) +
  (c.rejoin ? 1 : 0) +
  (c.packed ? c.packed.cols * 2 * (c.stacks || 1) : 0) +
  ((c.stacks || 1) - 1) * 2 +
  /* Zero where the plate above makes the joint. The `&&` here read that as
     "no decoupler recorded" and charged one anyway. #107 */
  (c.decoupler ? c.decoupler.qty : 1) +
  /* What a ring is made of, which is not the same for all three kinds. The
     decoupler is always one. Then a solid booster is itself an engine, a liquid
     column is an engine with its tanks hanging under it, and a drop tank is
     tankage with no engine at all — `nEng` is what the pools already write to
     say which. The `2` here was the decoupler plus an engine, and charged the
     drop tank for an engine it does not have: six columns, six parts that are
     not on the rocket, which under-selected asparagus for the parts objective
     the same way #93 did for cost. #97 */
  (c.boosters
    ? c.boosters.n *
      (1 +
        (c.boosters.part.nEng ?? 1) +
        (c.boosters.part.column ? c.boosters.part.column.count : 0))
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
function scoreOf(c: Solution, objective: Objective) {
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
  ispFnFor,
  propellantFor,
  scoreOf,
  stageCost,
  stageParts,
};
export type { Objective };
