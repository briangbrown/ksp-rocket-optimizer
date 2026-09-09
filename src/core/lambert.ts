import { cross, norm, scale, unit } from "./kepler.js";
import type { Vec3 } from "./kepler.js";

/* Lambert's problem: the orbit through two positions in a given time. Izzo's
   2015 formulation ("Revisiting Lambert's problem", Celest. Mech. Dyn.
   Astron. 121), single revolution, prograde: the time of flight is a function
   of one variable x on (−1, ∞), smooth enough that Householder's third-order
   iteration from his initial guess lands in three or four steps. Written
   from the paper; the tests hold it to a Kepler orbit's own velocities.

   Returns the departure and arrival velocities, or null where the geometry
   has no answer — the two positions coincide, or the time is not positive. */
function lambert(
  mu: number,
  r1v: Vec3,
  r2v: Vec3,
  tof: number,
): { v1: Vec3; v2: Vec3 } | null {
  if (!(tof > 0)) return null;
  const r1 = norm(r1v),
    r2 = norm(r2v);
  const cv: Vec3 = [r2v[0] - r1v[0], r2v[1] - r1v[1], r2v[2] - r1v[2]];
  const c = norm(cv);
  if (!(c > 0) || !(r1 > 0) || !(r2 > 0)) return null;
  const s = (r1 + r2 + c) / 2;
  const ir1 = unit(r1v),
    ir2 = unit(r2v);
  let ih = cross(ir1, ir2);
  const hn = norm(ih);
  /* A transfer through 180° has no plane of its own: take the ecliptic's,
     which is where every stock transfer very nearly lies. */
  ih = hn < 1e-9 ? [0, 0, 1] : scale(ih, 1 / hn);
  let lambda = Math.sqrt(1 - c / s);
  let it1: Vec3, it2: Vec3;
  if (ih[2] < 0) {
    /* Retrograde geometry about +z: swing the plane so the solution is the
       prograde one. */
    lambda = -lambda;
    it1 = cross(ir1, ih);
    it2 = cross(ir2, ih);
  } else {
    it1 = cross(ih, ir1);
    it2 = cross(ih, ir2);
  }
  const T = Math.sqrt((2 * mu) / s ** 3) * tof;
  const x = findX(T, lambda);
  if (x === null) return null;
  const gamma = Math.sqrt((mu * s) / 2);
  const rho = (r1 - r2) / c;
  const sigma = Math.sqrt(1 - rho * rho);
  const y = Math.sqrt(1 - lambda * lambda * (1 - x * x));
  const vr1 = (gamma * (lambda * y - x - rho * (lambda * y + x))) / r1;
  const vr2 = (-gamma * (lambda * y - x + rho * (lambda * y + x))) / r2;
  const vt = gamma * sigma * (y + lambda * x);
  const v1: Vec3 = [
    vr1 * ir1[0] + (vt / r1) * it1[0],
    vr1 * ir1[1] + (vt / r1) * it1[1],
    vr1 * ir1[2] + (vt / r1) * it1[2],
  ];
  const v2: Vec3 = [
    vr2 * ir2[0] + (vt / r2) * it2[0],
    vr2 * ir2[1] + (vt / r2) * it2[1],
    vr2 * ir2[2] + (vt / r2) * it2[2],
  ];
  return { v1, v2 };
}

/* Hypergeometric 2F1(3, 1, 5/2, z) by its series, for the near-parabolic
   time of flight where the closed forms lose digits. */
function hyperF(z: number) {
  let Sj = 1,
    Cj = 1,
    j = 0;
  for (;;) {
    Cj *= ((3 + j) * (1 + j)) / (2.5 + j) / (j + 1) / 1;
    Cj *= z;
    Sj += Cj;
    j++;
    if (Math.abs(Cj) < 1e-11 || j > 200) break;
  }
  return Sj;
}

/* The non-dimensional time of flight at x, single revolution. */
function tofOf(x: number, lambda: number) {
  const battin = 0.01,
    lagrange = 0.2;
  const dist = Math.abs(x - 1);
  if (dist < lagrange && dist > battin) {
    const a = 1 / (1 - x * x);
    if (a > 0) {
      const alpha = 2 * Math.acos(x);
      let beta = 2 * Math.asin(Math.sqrt((lambda * lambda) / a));
      if (lambda < 0) beta = -beta;
      return (
        (a *
          Math.sqrt(a) *
          (alpha - Math.sin(alpha) - (beta - Math.sin(beta)))) /
        2
      );
    }
    const alpha = 2 * Math.acosh(x);
    let beta = 2 * Math.asinh(Math.sqrt(-(lambda * lambda) / a));
    if (lambda < 0) beta = -beta;
    return (
      (-a *
        Math.sqrt(-a) *
        (beta - Math.sinh(beta) - (alpha - Math.sinh(alpha)))) /
      2
    );
  }
  const E = x * x - 1;
  const rho = Math.abs(E);
  const z = Math.sqrt(1 + lambda * lambda * E);
  if (dist < battin) {
    const eta = z - lambda * x;
    const S1 = 0.5 * (1 - lambda - x * eta);
    const Q = (4 / 3) * hyperF(S1);
    return (eta ** 3 * Q + 4 * lambda * eta) / 2;
  }
  const y = Math.sqrt(rho);
  const g = x * z - lambda * E;
  let d: number;
  if (E < 0) d = Math.acos(g);
  else d = Math.log(y * (z - lambda * x) + g);
  return (x - lambda * z - d / y) / E;
}

/* Householder's method on T(x) − T, from Izzo's initial guess. */
function findX(T: number, lambda: number): number | null {
  const T0 = Math.acos(lambda) + lambda * Math.sqrt(1 - lambda * lambda);
  const T1 = (2 / 3) * (1 - lambda ** 3);
  let x: number;
  if (T >= T0) x = (T0 / T) ** (2 / 3) - 1;
  else if (T <= T1) x = ((5 / 2) * (T1 / T) * (T1 - T)) / (1 - lambda ** 5) + 1;
  else x = (T0 / T) ** (Math.LN2 / Math.log(T1 / T0)) - 1;
  for (let it = 0; it < 15; it++) {
    const tof = tofOf(x, lambda);
    const y = Math.sqrt(1 - lambda * lambda * (1 - x * x));
    const l2 = lambda * lambda,
      l3 = l2 * lambda,
      l5 = l3 * l2;
    const um = 1 - x * x;
    /* At x = 1 the derivatives are singular; the guess never lands there
       exactly, but a step can. Nudge. */
    if (Math.abs(um) < 1e-12) x += 1e-6;
    const DT = (3 * tof * x - 2 + (2 * l3 * x) / y) / um;
    const DDT = (3 * tof + 5 * x * DT + (2 * (1 - l2) * l3) / y ** 3) / um;
    const DDDT = (7 * x * DDT + 8 * DT - (6 * (1 - l2) * l5 * x) / y ** 5) / um;
    const f = tof - T;
    const dx =
      (f * (DT * DT - (f * DDT) / 2)) /
      (DT * (DT * DT - f * DDT) + (DDDT * f * f) / 6);
    x -= dx;
    if (!isFinite(x)) return null;
    if (Math.abs(dx) < 1e-12) break;
  }
  return isFinite(x) ? x : null;
}

/* Vis-viva and friends, shared with the transfer search. */
const speed = (mu: number, r: number, a: number) =>
  Math.sqrt(mu * (2 / r - 1 / a));

export { lambert, speed };
