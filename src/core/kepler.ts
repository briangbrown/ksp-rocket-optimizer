import bodiesData from "../data/bodies.json";
import type { SysBody } from "./orbits.js";

/* Where every body is, when. The stock elements are given at epoch UT 0 —
   Year 1 Day 1 00:00:00 — in one frame for the whole system: each moon's
   inclination and node against its planet's equator, each planet's against
   the Sun's, and every equator parallel to the ecliptic, since no stock body
   is tilted. So one right-handed frame serves, prograde counter-clockwise
   about +z, and the position of a body about its parent at any time is
   Kepler's equation and three rotations.

   Kerbal time is the game's clock, not Kerbin's orbit: a day is six hours
   and a calendar year 426 days, 9,158,400 s, where Kerbin's sidereal year is
   9,203,545 s. Dates are printed on the calendar; orbits run on the
   elements. */

const SYS: Readonly<Record<string, SysBody>> = bodiesData.SYS;
const RAD = Math.PI / 180;
const DAY = 21600;
const YEAR = 426 * DAY;

/* The game's own g₀, not the 9.81 the solver rounds Isp with: the dump
   gives each body's surface gravity in gees, and 9.80665 is what KSP
   multiplies it by to get back to the gravitational parameter it was
   derived from. At 9.81 Kerbin's year came out 1,600 s short, which is an
   hour of drift in the dates by the second window. */
const G0_KSP = 9.80665;
const mu = (b: string) => SYS[b].gee * G0_KSP * SYS[b].R ** 2;

type Vec3 = [number, number, number];
type StateVec = { r: Vec3; v: Vec3 };

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3) => Math.sqrt(dot(a, a));
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const unit = (a: Vec3): Vec3 => scale(a, 1 / norm(a));

/* Kepler's equation, M = E − e·sin E, by Newton. Converges in a handful of
   steps for every stock eccentricity (Gilly's 0.55 is the largest); the
   guard is for a caller handing in something the tree does not hold. */
function eccentricAnomaly(M: number, e: number) {
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 30; i++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-13) break;
  }
  return E;
}

/* The orbit as numbers the maths wants: metres, radians, and the parent's
   gravitational parameter. */
function elements(b: string) {
  const s = SYS[b];
  if (!s.parent || s.sma === undefined)
    throw new Error(`${b} has no orbit to compute`);
  return {
    parent: s.parent,
    mu: mu(s.parent),
    a: s.sma,
    e: s.ecc ?? 0,
    i: (s.inc ?? 0) * RAD,
    lan: (s.lan ?? 0) * RAD,
    ape: (s.ape ?? 0) * RAD,
    m0: s.m0 ?? 0,
  };
}

const periodOf = (b: string) => {
  const o = elements(b);
  return 2 * Math.PI * Math.sqrt(o.a ** 3 / o.mu);
};

/* Perifocal to the parent's frame: rotate by the argument of periapsis,
   tilt by the inclination, then swing by the node — the usual three. */
function toFrame(o: { i: number; lan: number; ape: number }) {
  const cO = Math.cos(o.lan),
    sO = Math.sin(o.lan),
    ci = Math.cos(o.i),
    si = Math.sin(o.i),
    cw = Math.cos(o.ape),
    sw = Math.sin(o.ape);
  return (x: number, y: number, z: number): Vec3 => [
    (cO * cw - sO * sw * ci) * x + (-cO * sw - sO * cw * ci) * y + sO * si * z,
    (sO * cw + cO * sw * ci) * x + (-sO * sw + cO * cw * ci) * y - cO * si * z,
    sw * si * x + cw * si * y + ci * z,
  ];
}

/* Position and velocity of a body about its parent at UT `t`. */
function stateAt(b: string, t: number): StateVec {
  const o = elements(b);
  const n = Math.sqrt(o.mu / o.a ** 3);
  const M = o.m0 + n * t;
  const E = eccentricAnomaly(
    ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI),
    o.e,
  );
  const nu =
    2 *
    Math.atan2(
      Math.sqrt(1 + o.e) * Math.sin(E / 2),
      Math.sqrt(1 - o.e) * Math.cos(E / 2),
    );
  const p = o.a * (1 - o.e * o.e);
  const r = p / (1 + o.e * Math.cos(nu));
  const k = Math.sqrt(o.mu / p);
  const R = toFrame(o);
  return {
    r: R(r * Math.cos(nu), r * Math.sin(nu), 0),
    v: R(-k * Math.sin(nu), k * (o.e + Math.cos(nu)), 0),
  };
}

/* Points along an orbit about its parent over one period, for a drawing. */
function orbitPoints(b: string, n = 90): Array<Vec3> {
  const T = periodOf(b);
  const out: Array<Vec3> = [];
  for (let k = 0; k <= n; k++) out.push(stateAt(b, (T * k) / n).r);
  return out;
}

/* The calendar. Year 1 Day 1 00:00:00 is UT 0; days and years count from
   one, as the game's clock does. */
type KerbalDate = {
  year: number;
  day: number;
  h: number;
  m: number;
  s: number;
};
function kerbalDate(ut: number): KerbalDate {
  const x = Math.max(0, Math.floor(ut));
  const year = Math.floor(x / YEAR);
  const day = Math.floor((x % YEAR) / DAY);
  const rest = x % DAY;
  return {
    year: year + 1,
    day: day + 1,
    h: Math.floor(rest / 3600),
    m: Math.floor((rest % 3600) / 60),
    s: rest % 60,
  };
}
const utOf = (year: number, day: number, h = 0, m = 0, s = 0) =>
  (year - 1) * YEAR + (day - 1) * DAY + h * 3600 + m * 60 + s;

export {
  DAY,
  YEAR,
  add,
  cross,
  dot,
  eccentricAnomaly,
  elements,
  kerbalDate,
  mu,
  norm,
  orbitPoints,
  periodOf,
  scale,
  stateAt,
  sub,
  unit,
  utOf,
};
export type { KerbalDate, StateVec, Vec3 };
