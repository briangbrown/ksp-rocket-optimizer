import curvesData from "../data/curves.json";
import { evalCurve, synthCurve } from "./atmosphere.js";
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

/* ------------------------- a burn that is not an impulse -------------------------

   Every leg of the route is priced as an impulse: all of the Δv delivered at a
   point. A real burn is spread over time, and what it costs is not its duration
   but the arc it sweeps while thrusting — the same 523 s is a hundred degrees of
   a low Kerbin orbit and two hundredths of a degree of a solar one. So the
   quantity to price against is

       θ = ω · t,   ω = sqrt(μ / r³) at the burn point

   and a fixed cap in seconds, which is what `solveStage` has carried since it
   was written for launches, is the same number meaning different things in
   every orbit. #409

   Hold thrust in a *fixed* direction, centred on the point the impulse would
   have been applied at, and the component along the intended direction averages
   sin(θ/2)/(θ/2) over the arc — the textbook first cut, whose first-order form
   is θ²/24. Nobody flies that. SAS holds prograde, and a prograde burn keeps far
   more of itself: 95.96% of a 90° arc against the 90.01% the fixed form charges.

   So what ships is fitted to the burn as it is actually flown. `sinc(θ/3)`
   tracks an integrated prograde burn to within 0.7% out to 112° of arc and sits
   just below it the whole way, so it still overcharges rather than flatters.
   The exact reciprocal is used rather than an expansion: it costs one sine, and
   it keeps rising where an expansion flattens out.

   `test/finite-burn.test.ts` flies it: two-body motion with the thrust on,
   integrated, compared on the energy the burn actually bought. The closed form
   comes out conservative and knowably so. Against an inertially held burn it
   overcharges by 0.1% of the leg at 17° of arc and 3.3% at 95°, because it
   counts only the component along the intended direction and a real burn also
   gets work out of the radial one. Against a pilot holding prograde — which is
   what SAS does and what anyone actually flies — it overcharges by about 4% of
   the leg at 86°.

   That gap is left on the table on purpose. Overcharging keeps a long burn
   honest; undercharging ships optimistic Δv, which is the failure the whole
   route budget exists to avoid. Calibrating to the prograde curve is worth
   doing and belongs with the change that starts reading this, where it can be
   measured against designs rather than against a trajectory.

   One thing this is not: a burn spread over more than a revolution is not a
   spread impulse but a spiral, and wants a different formula entirely. That is
   the low-thrust work, and it is why `ARC_MAX` refuses rather than extrapolates. */

/* Half a revolution. Past it a burn is turning through more than it is pushing
   along, and the fit above is extrapolation — it was flown out to 2 radians.
   The practical limit is far lower and belongs to the caller: what is refused
   here is what is meaningless, not what is unwise. */
const ARC_MAX = Math.PI;

/* How much of the arc the fitted curve is taken over. Two thirds of the half
   angle a fixed-thrust burn would use, which is the whole of the difference
   between the textbook form and a burn flown prograde. */
const ARC_FIT = 3;

/* ---------------------------- flown in passes ----------------------------

   A long ejection is not flown in one go. The way it is actually done is a
   periapsis kick: burn a share of it each time round, coming back to the same
   point of the same orbit, until the apoapsis is where it needs to be. Each
   pass sweeps a fraction of the arc, and since the penalty goes as the square
   of the arc while the Δv only divides, `n` passes cost the whole burn
   `1 / n²` of what one pass costs — a 14% penalty in one pass is under 1% in
   four.

   The arithmetic falls out exactly: `n` passes of `dv/n` over `arc/n` come to
   `dv · x / sin x` with `x = arc / (3n)`, which is `finiteBurnDv(dv, arc / n)`.
   Splitting a burn is dividing its arc.

   Two things this does not model. The orbit is more eccentric after each kick,
   so periapsis comes round slower and the craft is moving faster through it;
   and the passes have to fit inside whatever window the leg is flown on. Both
   push in the direction of fewer passes than the arithmetic alone would take.

   Only a transfer is flown this way. A capture has one periapsis to work with
   and has to be bound by the end of it, an ascent and a landing are not orbital
   burns at all, and a plane change gets two nodes an orbit rather than one. #412 */

/* What one more pass has to save to be worth flying.

   This is the one number in the model that trades Δv against a player's time,
   and it is here rather than hidden in a cap because that is what it is. A
   pass is an orbit of waiting — cheap, since a coast warps at up to 100,000×
   — and then a burn that has to be flown attended at no more than 4× physics
   warp. Nobody splits a burn to save five metres a second; everybody splits one
   to save two hundred. Twenty-five is the middle of that, and it is the number
   to move when the brief grows a control for how a mission is flown. #416 */
const PASS_WORTH = 25;
/* Beyond this the orbit is so eccentric that the arc per pass stops falling the
   way the arithmetic says, and the waiting stops fitting in a window. */
const MAX_PASSES = 8;

/* What a burn costs flown in as many passes as earn their keep, and how many
   that is. Null where no number of passes brings the arc inside what the
   closed form stands behind. */
function splitBurn(dv: number, arc: number) {
  for (let n = 1; n <= MAX_PASSES; n++) {
    const here = finiteBurnDv(dv, arc / n);
    if (here === null) continue; // even split this far it sweeps too much
    let passes = n,
      applied = here;
    while (passes < MAX_PASSES) {
      const next = finiteBurnDv(dv, arc / (passes + 1));
      if (next === null || applied - next < PASS_WORTH) break;
      passes++;
      applied = next;
    }
    return { applied, passes };
  }
  return null;
}

/* The arc a burn sweeps, in radians. */
const burnArc = (omega: number, seconds: number) => omega * seconds;

/* What a stage has to carry to deliver `dv` over an arc of `arc` radians, and
   null where the arc is past what this stands behind. An arc of zero is the
   impulse the rest of the route assumes, and costs what it says. */
function finiteBurnDv(dv: number, arc: number) {
  if (!isFinite(arc) || arc < 0) return null;
  if (arc >= ARC_MAX) return null;
  if (arc === 0) return dv;
  const x = arc / ARC_FIT;
  return (dv * x) / Math.sin(x);
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
   — which is not a curve. A Map has no such properties to hit, and `curveFor`
   checks the shape of what it gets back. */
const REAL_CURVE: ReadonlyMap<string, Curve> = new Map(
  Object.entries(curvesData.REAL_CURVE as Record<string, Curve>),
);
const ispCut = (e: { ia: number; iv: number }) =>
  Math.min(12, Math.max(3, 3 + 9 * (e.ia / e.iv)));
/* Cache the value, not just the curve. This is called 124 million times across
   the design grid and has 116 distinct answers — the curve lookup was already
   cached, but the evaluation was not, and evaluating a Hermite spline is not
   free. Pure in (engine, pressure), so nothing here needs invalidating. */
const _ispVals = new Map<string, Map<number, number>>();
/* Engines and the stand-in parts a booster pool synthesises alike: all this
   needs is a name to key the cache on and the two Isp figures. */
/* The curve an engine's Isp follows against pressure, as data: its real
   atmosphereCurve where the config supplied one, else the three-key shape
   inferred from the two table figures. Data rather than a closure on purpose.
   The sizer and the simulator used to each build their own function — `ispAt`
   from the real keys, `buildVehicleFor` from the inferred cutoff — and agreed
   only below 1 atm, where the third key cannot reach; at Eve's 5 atm a Swivel
   was 26 s to one and 146 s to the other (#328). And a function looked up by
   part name and then called is the shape CodeQL's
   js/unvalidated-dynamic-method-call fires on, three alerts running; a curve
   looked up by name and handed to the one fixed evaluator is not. */
function curveFor(e: { n: string; iv: number; ia: number }): Curve {
  const real = REAL_CURVE.get(e.n);
  return real && Array.isArray(real) ? real : synthCurve(e.iv, e.ia, ispCut(e));
}
/* The same, as the function the simulator's FlightStage carries. */
function ispFnFor(e: { n: string; iv: number; ia: number }) {
  const c = curveFor(e);
  return (x: number) => Math.max(0, evalCurve(c, x));
}
const _curves = new Map<string, Curve>();
function ispAt(e: { n: string; iv: number; ia: number }, p: number) {
  if (!p) return e.iv;
  let byP = _ispVals.get(e.n);
  if (byP === undefined) {
    byP = new Map();
    _ispVals.set(e.n, byP);
  }
  const hit = byP.get(p);
  if (hit !== undefined) return hit;
  let c = _curves.get(e.n);
  if (!c) {
    c = curveFor(e);
    _curves.set(e.n, c);
  }
  const v = Math.max(0, evalCurve(c, p)); // one fixed evaluator; nothing looked up is called
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
  ARC_MAX,
  COUPLE_COST,
  COUPLE_PARTS,
  DECOUPLER_FUNDS,
  REAL_CURVE,
  STAGE_PRESSURE,
  TANK_FUNDS_DRY,
  TANK_FUNDS_PROP,
  MAX_PASSES,
  PASS_WORTH,
  burnArc,
  finiteBurnDv,
  splitBurn,
  ispAt,
  ispCut,
  ispFnFor,
  propellantFor,
  scoreOf,
  stageCost,
  stageParts,
};
export type { Objective };
