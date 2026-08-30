import curvesData from "../data/curves.json";
import bodiesData from "../data/bodies.json";

/* A KSP FloatCurve as the game stores it: one key per row, each
   [x, value, inTangent, outTangent]. The rows stay plain number arrays because
   that is what the JSON is; a fixed-length tuple would have to be asserted into
   place at the import and would check nothing. */
type Curve = ReadonlyArray<ReadonlyArray<number>>;

/* A body with air: radius, surface gravity, rotation period, the altitude the
   atmosphere ends at, molar mass, and the pressure and temperature curves. */
type AtmoBody = {
  R: number;
  g0: number;
  rot: number;
  top: number;
  M: number;
  P: Curve;
  T: Curve;
};

const BODY: Readonly<Record<string, AtmoBody>> = bodiesData.BODY;

/* ---------- Hermite / FloatCurve ---------- */
function evalCurve(keys: Curve, x: number) {
  const n = keys.length;
  if (x <= keys[0][0]) return keys[0][1];
  if (x >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0;
  while (i < n - 2 && x > keys[i + 1][0]) i++;
  const [x0, y0, , m0] = keys[i],
    [x1, y1, m1] = [keys[i + 1][0], keys[i + 1][1], keys[i + 1][2]];
  const h = x1 - x0,
    t = (x - x0) / h,
    t2 = t * t,
    t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * y0 +
    (t3 - 2 * t2 + t) * h * m0 +
    (-2 * t3 + 3 * t2) * y1 +
    (t3 - t2) * h * m1
  );
}
const Rgas = 8.31446;

/* Precomputed atmosphere: pressure (kPa), density (kg/m3), speed of sound (m/s) */
function makeAtmo(b: AtmoBody) {
  const step = 20,
    n = Math.ceil(b.top / step) + 2;
  const P = new Float64Array(n),
    D = new Float64Array(n),
    A = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const h = i * step;
    const p = h >= b.top ? 0 : Math.max(0, evalCurve(b.P, h));
    const T = Math.max(1, evalCurve(b.T, Math.min(h, b.top)));
    P[i] = p;
    D[i] = (p * 1000 * b.M) / (Rgas * T);
    A[i] = Math.sqrt((1.4 * Rgas * T) / b.M);
  }
  const get = (arr: Float64Array, h: number) => {
    if (h <= 0) return arr[0];
    if (h >= b.top) return 0;
    const f = h / step,
      i = f | 0;
    return arr[i] + (arr[i + 1] - arr[i]) * (f - i);
  };
  return {
    p: (h: number) => get(P, h),
    rho: (h: number) => get(D, h),
    a: (h: number) => Math.max(1, get(A, Math.min(h, b.top - 1))),
    P0: P[0],
  };
}

/* ---------- engine Isp curve ----------
   KSP stores atmosphereCurve as key=<atm> <Isp>; with the value-only form the
   tangents are zero, giving an ease-in/out spline rather than a straight line.
   Third key is the pressure at which the engine quits (3-12 atm in stock).  */
function ispCurve(ispVac: number, ispAsl: number, cutoff = 6) {
  const k = [
    [0, ispVac, 0, 0],
    [1, ispAsl, 0, 0],
    [cutoff, 0.001, 0, 0],
  ];
  return (patm: number) => Math.max(0, evalCurve(k, patm));
}

/* ---------- drag ----------
   KSP bakes six drag cubes per part and occludes faces between attached parts.
   A clean serial stack behaves close to a single body of the widest attached
   diameter, so we take the max cross-section of everything not yet staged away
   and add radial boosters, which are never occluded. Cd follows the stock
   transonic hump. */
/* ---------------------------- drag, as KSP does it ----------------------------
   From Physics.cfg. A face's drag cube Cd is mapped through DRAG_CD, raised to
   DRAG_CD_POWER(mach), scaled by DRAG_TIP(mach) for the face meeting the
   airflow, then by DRAG_MULTIPLIER(mach) and DRAG_PSEUDOREYNOLDS(density x
   speed), and finally by the two global constants. Faces behind the leading one
   go through DRAG_SURFACE instead, which is 0.02 or less — negligible, so only
   the frontal area is counted.

   This replaced a hand-calibrated curve that ran about a third of the real value
   transonic. Cube Cd itself comes from PartDatabase: 0.85 for a cylindrical tank
   face, 0.94 for a booster. */
const DRAG_TIP: Curve = curvesData.DRAG_TIP;
const DRAG_MULT: Curve = curvesData.DRAG_MULT;
const DRAG_CD: Curve = curvesData.DRAG_CD;
const DRAG_CD_POWER: Curve = curvesData.DRAG_CD_POWER;
const DRAG_REYNOLDS: Curve = curvesData.DRAG_REYNOLDS;
const DRAG_GLOBAL = 8.0 * 0.1;
const CUBE_CD_STACK = 0.85; // a cylindrical tank face, from PartDatabase

/* Only the leading face counts: everything behind it is occluded and goes
   through DRAG_SURFACE, which tops out at 0.02. Radial boosters sit outside the
   core's shadow, so they add their own. */
/* Only what this reads of a stage in flight. The whole thing is built in
   ascent.js, which imports this module — asking for no more than the two fields
   used keeps the dependency pointing one way. */
type DragStage = {
  area: number;
  boosters?: { n: number; area: number } | null;
};

function frontalArea(
  stages: ReadonlyArray<DragStage>,
  iStage: number,
  boostersOn: boolean,
  payloadArea = 0,
  boostersLeft: number | null = null,
) {
  /* The payload counts. On a small rocket it is often the widest thing aboard —
     a 1.25 m probe on 0.625 m tanks presents four times the tankage's area — and
     leaving it out understated drag badly on exactly the builds where drag hurts
     most. */
  let A = payloadArea;
  for (let i = iStage; i < stages.length; i++) A = Math.max(A, stages[i].area);
  const b = stages[iStage] && stages[iStage].boosters;
  /* Count the stacks that are actually still bolted on. Under asparagus the ring
     thins out as pairs go, and the drag has to thin with it — crediting the mass
     saving while still paying the full ring's drag would be worse than modelling
     neither. */
  if (b && boostersOn)
    A += (boostersLeft == null ? b.n : boostersLeft) * b.area * 0.85;
  return A;
}

function cdOf(mach: number, rhoV = 100, cubeCd = CUBE_CD_STACK) {
  const base = Math.pow(
    evalCurve(DRAG_CD, cubeCd),
    evalCurve(DRAG_CD_POWER, mach),
  );
  return (
    base *
    evalCurve(DRAG_TIP, mach) *
    evalCurve(DRAG_MULT, mach) *
    evalCurve(DRAG_REYNOLDS, rhoV) *
    DRAG_GLOBAL
  );
}

type Atmo = ReturnType<typeof makeAtmo>;

const _atmoCache: Record<string, Atmo> = {};
const atmoFor = (n: string) => (_atmoCache[n] ||= makeAtmo(BODY[n]));
/* Low orbit sits just clear of the air: 80 km at Kerbin, 60 at Duna and Laythe,
   100 at Eve. atmosphereDepth + 10 km reproduces all four. */
const orbitAlt = (n: string) => BODY[n].top + 10000;

/* Masses in the solver include everything stacked above, so strip the payload
   back out to get each stage on its own. Used for both the pad ascent and the
   climb back off whatever you landed on. */

export {
  BODY,
  CUBE_CD_STACK,
  DRAG_CD,
  DRAG_CD_POWER,
  DRAG_GLOBAL,
  DRAG_MULT,
  DRAG_REYNOLDS,
  DRAG_TIP,
  Rgas,
  atmoFor,
  cdOf,
  evalCurve,
  frontalArea,
  ispCurve,
  makeAtmo,
  orbitAlt,
};
export type { Atmo, AtmoBody, Curve, DragStage };
