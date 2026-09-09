import {
  add,
  cross,
  dot,
  elements,
  mu,
  norm,
  periodOf,
  scale,
  stateAt,
  sub,
  unit,
} from "./kepler.js";
import { lambert, speed } from "./lambert.js";
import type { Vec3 } from "./kepler.js";

/* The transfer window: when to leave one planet for another, and what the
   burns cost when you do. A porkchop search — departure time against time
   of flight, a Lambert solution in every cell — coarse over two synodic
   periods and then refined around the cheapest cell until the departure is
   known to the second. Each cell prices the three burns of a patched-conic
   transfer: ejection from a circular parking orbit through the hyperbolic
   excess the Lambert arc asks for, a mid-course plane change where that is
   cheaper than flying the inclination ballistically, and capture into the
   parking orbit at the far end. Everything here is plain numbers, so a
   window crosses the seam as it is.

   The parking orbits are the route's: the departure body's low orbit, or a
   moon's orbit about it where the mission starts on a moon; the same at the
   arrival. The burns then match what the route already charged for a
   Hohmann leg, with the Hohmann's excess replaced by the window's. */

type Window = {
  from: string;
  to: string;
  /* UT seconds. */
  depart: number;
  tof: number;
  arrive: number;
  /* Hyperbolic excess at each end, m/s. */
  vinfOut: number;
  vinfIn: number;
  /* The burns, m/s: from the parking orbit, the mid-course plane change if
     one is flown, and into the parking orbit at the far end. The ejection
     is flown from the parking orbit in the body's equatorial plane, which
     is the ecliptic for every stock body, so an excess that leaves the
     plane takes a normal component: `ejectPro` along prograde, `ejectNor`
     along normal (negative for anti-normal), and `eject` their resultant.
     Launching into a parking orbit already inclined to the escape saves the
     normal part; the route prices the equatorial one. */
  eject: number;
  ejectPro: number;
  ejectNor: number;
  plane: { dv: number; at: number; deg: number } | null;
  capture: number;
  total: number;
  /* Whether the inclination is paid in the ejection or mid-course. */
  type: "ballistic" | "plane";
  /* The ejection point on the parking orbit as the pilot finds it: the
     angle from the departure body's prograde (or retrograde, for a transfer
     inward) to the burn, and the phase angle from departure body to arrival
     body about the Sun at departure. Degrees. */
  angle: number;
  ref: "prograde" | "retrograde";
  phase: number;
  /* For the drawing, in the Sun's frame, ecliptic projection: the two
     bodies at departure and the arrival body at arrival, the transfer arc,
     the departure body's velocity direction, and the burn point's
     direction from it. Metres and unit vectors. */
  r1: [number, number];
  r2dep: [number, number];
  r2: [number, number];
  arc: Array<[number, number]>;
  vDir: [number, number];
  burnDir: [number, number];
  soi: number;
  rPark: number;
};

/* Burn from a circular orbit of speed v to leave with excess vinf, or the
   reverse. The route's own `inject`, repeated here so core/transfer does
   not import core/orbits, which imports it. */
const inject = (v: number, vinf: number) =>
  Math.sqrt(2 * v * v + vinf * vinf) - v;

/* The ejection from a circular equatorial parking orbit of radius r about
   a body of parameter mu, to leave with the excess vector vinf. The
   hyperbola's periapsis is the burn, so its plane and the parking orbit's
   share the burn's radius and differ by a turn i about it; the asymptote,
   θ∞ past periapsis in that plane, then rises sin θ∞ · sin i out of the
   equator, which is where the excess's own elevation fixes i. The burn is
   the periapsis velocity turned by i less the parking velocity: a prograde
   part and a normal part, and the resultant the route charges. */
function ejection(vinf: Vec3, mu: number, r: number) {
  const vm = norm(vinf);
  const vc = Math.sqrt(mu / r);
  const vpe = Math.sqrt(vm * vm + (2 * mu) / r);
  const e = 1 + (r * vm * vm) / mu;
  const thInf = Math.acos(-1 / e);
  const clamp = (x: number) => Math.max(-1, Math.min(1, x));
  const el = Math.asin(clamp(vm > 0 ? vinf[2] / vm : 0));
  const i = Math.asin(clamp(Math.sin(el) / Math.sin(thInf)));
  const pro = vpe * Math.cos(i) - vc;
  const nor = vpe * Math.sin(i);
  return { dv: Math.hypot(pro, nor), pro, nor };
}

const xy = (a: Vec3): [number, number] => [a[0], a[1]];
const unit2 = (a: [number, number]): [number, number] => {
  const n = Math.hypot(a[0], a[1]) || 1;
  return [a[0] / n, a[1] / n];
};
const rot2 = (a: [number, number], th: number): [number, number] => [
  a[0] * Math.cos(th) - a[1] * Math.sin(th),
  a[0] * Math.sin(th) + a[1] * Math.cos(th),
];

/* Rodrigues: rotate `v` about the unit axis `k` by `th`. */
function rotate(v: Vec3, k: Vec3, th: number): Vec3 {
  const c = Math.cos(th),
    s = Math.sin(th);
  const kxv = cross(k, v);
  const kdv = dot(k, v);
  return add(add(scale(v, c), scale(kxv, s)), scale(k, kdv * (1 - c)));
}

/* Golden-section minimum of f on [lo, hi]. */
function goldenMin(f: (x: number) => number, lo: number, hi: number) {
  const g = (Math.sqrt(5) - 1) / 2;
  let a = lo,
    b = hi;
  let c = b - g * (b - a),
    d = a + g * (b - a);
  let fc = f(c),
    fd = f(d);
  for (let i = 0; i < 40; i++) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - g * (b - a);
      fc = f(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + g * (b - a);
      fd = f(d);
    }
  }
  const x = (a + b) / 2;
  return { x, f: f(x) };
}

type Cell = {
  total: number;
  vinfOut: number;
  vinfIn: number;
  eject: number;
  ejectPro: number;
  ejectNor: number;
  capture: number;
  plane: { dv: number; at: number; deg: number } | null;
  v1: Vec3;
  v2: Vec3;
  s1: { r: Vec3; v: Vec3 };
  s2: { r: Vec3; v: Vec3 };
};

/* One cell of the porkchop: leave `from` at `t`, arrive at `to` after `tof`.
   Ballistic: the Lambert arc straight to the arrival body, the inclination
   paid in the excess at each end. Plane: the arc flown in the departure
   body's own orbital plane to the arrival body's foot in that plane, and
   one burn on the way that tilts the arc up to the body — 2·v·sin(δ/2) at
   the point where v is slowest, found by golden section — with the arrival
   excess taken from the tilted arc. The cheaper of the two is the cell's. */
function price(
  from: string,
  to: string,
  m: number,
  mu1: number,
  rPark1: number,
  vc2: number,
  t: number,
  tof: number,
  capture: boolean,
  type: "ballistic" | "plane" | "best",
): Cell | null {
  const s1 = stateAt(from, t);
  const s2 = stateAt(to, t + tof);
  let best: Cell | null = null;
  if (type !== "plane") {
    const l = lambert(m, s1.r, s2.r, tof);
    if (l) {
      const vinfOut = norm(sub(l.v1, s1.v));
      const vinfIn = norm(sub(l.v2, s2.v));
      const ej = ejection(sub(l.v1, s1.v), mu1, rPark1);
      const cap = capture ? inject(vc2, vinfIn) : 0;
      best = {
        total: ej.dv + cap,
        vinfOut,
        vinfIn,
        eject: ej.dv,
        ejectPro: ej.pro,
        ejectNor: ej.nor,
        capture: cap,
        plane: null,
        v1: l.v1,
        v2: l.v2,
        s1,
        s2,
      };
    }
  }
  if (type !== "ballistic") {
    const n = unit(cross(s1.r, s1.v));
    const off = dot(s2.r, n);
    const r2p = sub(s2.r, scale(n, off));
    const l = lambert(m, s1.r, r2p, tof);
    if (l) {
      /* The arc's elements, for where along it the tilt is cheapest. */
      const h = cross(s1.r, l.v1);
      const p = dot(h, h) / m;
      const r1 = norm(s1.r);
      const a = 1 / (2 / r1 - dot(l.v1, l.v1) / m);
      const ev = sub(scale(cross(l.v1, h), 1 / m), unit(s1.r));
      const e = norm(ev);
      const hn = unit(h);
      const nuOf = (r: Vec3) => {
        const c = dot(ev, r) / (e * norm(r) || 1);
        let nu = Math.acos(Math.max(-1, Math.min(1, c)));
        if (dot(cross(ev, r), hn) < 0) nu = 2 * Math.PI - nu;
        return nu;
      };
      const nu1 = nuOf(s1.r);
      let nu2 = nuOf(r2p);
      if (nu2 < nu1) nu2 += 2 * Math.PI;
      const rel = Math.atan2(off, norm(r2p));
      const tilt = (dnu: number) =>
        Math.abs(Math.atan(Math.tan(rel) / Math.sin(dnu)));
      const rAt = (nu: number) => p / (1 + e * Math.cos(nu));
      const cost = (dnu: number) =>
        2 * speed(m, rAt(nu2 - dnu), a) * Math.sin(tilt(dnu) / 2);
      const span = nu2 - nu1;
      const g = goldenMin(cost, span * 0.02, span * 0.98);
      const dnu = g.x;
      const deg = (tilt(dnu) * 180) / Math.PI;
      const nuB = nu2 - dnu;
      /* Time from departure to the burn: Kepler's equation the other way. */
      const E = (nu: number) =>
        2 *
        Math.atan2(
          Math.sqrt(1 - e) * Math.sin(nu / 2),
          Math.sqrt(1 + e) * Math.cos(nu / 2),
        );
      const M = (nu: number) => {
        const x = E(nu);
        return x - e * Math.sin(x);
      };
      const nmot = Math.sqrt(m / a ** 3);
      const wrap = (x: number) =>
        ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const at = t + wrap(M(wrap(nuB)) - M(wrap(nu1))) / nmot;
      /* The arrival velocity of the tilted arc: the in-plane one rotated
         about the burn's radius, which is what the burn does. */
      const rB = unit(rotate(unit(ev), hn, nuB));
      const v2 = rotate(l.v2, rB, off >= 0 ? tilt(dnu) : -tilt(dnu));
      const vinfOut = norm(sub(l.v1, s1.v));
      const vinfIn = norm(sub(v2, s2.v));
      const ej = ejection(sub(l.v1, s1.v), mu1, rPark1);
      const cap = capture ? inject(vc2, vinfIn) : 0;
      const total = ej.dv + g.f + cap;
      if (!best || total < best.total)
        best = {
          total,
          vinfOut,
          vinfIn,
          eject: ej.dv,
          ejectPro: ej.pro,
          ejectNor: ej.nor,
          capture: cap,
          plane: g.f > 0.5 ? { dv: g.f, at, deg } : null,
          v1: l.v1,
          v2,
          s1,
          s2,
        };
    }
  }
  return best;
}

/* Points along the arc from r1 with v1 to r2, ecliptic projection. */
function arcPoints(m: number, r1: Vec3, v1: Vec3, r2: Vec3, n = 48) {
  const h = cross(r1, v1);
  const hn = unit(h);
  const p = dot(h, h) / m;
  const ev = sub(scale(cross(v1, h), 1 / m), unit(r1));
  const e = norm(ev);
  const ex = e > 1e-9 ? unit(ev) : unit(r1);
  const ey = cross(hn, ex);
  const nuOf = (r: Vec3) => {
    let nu = Math.atan2(dot(r, ey), dot(r, ex));
    if (nu < 0) nu += 2 * Math.PI;
    return nu;
  };
  const nu1 = nuOf(r1);
  let nu2 = nuOf(r2);
  if (nu2 <= nu1) nu2 += 2 * Math.PI;
  const out: Array<[number, number]> = [];
  for (let k = 0; k <= n; k++) {
    const nu = nu1 + ((nu2 - nu1) * k) / n;
    const r = p / (1 + e * Math.cos(nu));
    const pt = add(scale(ex, r * Math.cos(nu)), scale(ey, r * Math.sin(nu)));
    out.push(xy(pt));
  }
  return out;
}

const cache = new Map<string, Window | null>();

/* The cheapest window from `t0` on, leaving a circular orbit of radius
   `rPark1` about `from` for one of radius `rPark2` about `to` (the capture
   burn priced only where `capture`). Both bodies orbit the same primary. */
function findWindow(
  from: string,
  to: string,
  rPark1: number,
  rPark2: number,
  t0: number,
  capture: boolean,
  type: "ballistic" | "plane" | "best" = "best",
): Window | null {
  const key = [from, to, rPark1, rPark2, t0, capture, type].join("|");
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const w = search(from, to, rPark1, rPark2, t0, capture, type);
  cache.set(key, w);
  return w;
}

function search(
  from: string,
  to: string,
  rPark1: number,
  rPark2: number,
  t0: number,
  capture: boolean,
  type: "ballistic" | "plane" | "best",
): Window | null {
  const o1 = elements(from),
    o2 = elements(to);
  if (o1.parent !== o2.parent) return null;
  const m = o1.mu;
  const mu1 = mu(from);
  const vc2 = Math.sqrt(mu(to) / rPark2);
  const T1 = periodOf(from),
    T2 = periodOf(to);
  const synodic = 1 / Math.abs(1 / T1 - 1 / T2);
  const hohmann = Math.PI * Math.sqrt(((o1.a + o2.a) / 2) ** 3 / m);
  /* Coarse: one synodic period, in which there is exactly one window — the
     first from the start time, which is the one asked for, not the
     cheapest of the next several years — against a third to twice the
     Hohmann time. A little over, so a window straddling the far end is
     still found whole. */
  const NT = 48,
    NF = 40;
  const tSpan = 1.05 * synodic,
    fLo = 0.3 * hohmann,
    fHi = 2 * hohmann;
  let bt = NaN,
    bf = NaN,
    found: Cell | null = null;
  for (let i = 0; i <= NT; i++)
    for (let j = 0; j <= NF; j++) {
      const t = t0 + (tSpan * i) / NT;
      const tof = fLo + ((fHi - fLo) * j) / NF;
      const c = price(from, to, m, mu1, rPark1, vc2, t, tof, capture, type);
      if (c && (!found || c.total < found.total)) {
        found = c;
        bt = t;
        bf = tof;
      }
    }
  if (!found) return null;
  let bc: Cell = found;
  /* Refine: a 7×7 grid about the best, shrinking, nine rounds — from a
     step of days to one of seconds. */
  let ht = tSpan / NT,
    hf = (fHi - fLo) / NF;
  for (let round = 0; round < 9; round++) {
    let nt = bt,
      nf = bf,
      nc: Cell = bc;
    for (let i = -3; i <= 3; i++)
      for (let j = -3; j <= 3; j++) {
        const t = Math.max(t0, bt + (ht * i) / 3);
        const tof = Math.max(3600, bf + (hf * j) / 3);
        const c = price(from, to, m, mu1, rPark1, vc2, t, tof, capture, type);
        if (c && c.total < nc.total) {
          nc = c;
          nt = t;
          nf = tof;
        }
      }
    bt = nt;
    bf = nf;
    bc = nc;
    ht *= 0.3;
    hf *= 0.3;
  }
  const depart = Math.round(bt),
    tof = Math.round(bf);
  const c = bc;
  /* The ejection point. The hyperbola that leaves with the excess `vinf`
     from radius `rPark` has eccentricity 1 + r·v∞²/μ, and its asymptote
     lies θ∞ = acos(−1/e) past periapsis; the burn is at periapsis, so it
     sits θ∞ behind the asymptote's direction around the prograde parking
     orbit. Measured from the body's prograde where the transfer goes
     outward and from retrograde where it goes inward, as the pilots' tools
     say it. */
  const vinf = sub(c.v1, c.s1.v);
  const u = unit2(xy(vinf));
  const eh = 1 + (rPark1 * c.vinfOut ** 2) / mu(from);
  const thInf = Math.acos(-1 / eh);
  const burnDir = rot2(u, -thInf);
  const vDir = unit2(xy(c.s1.v));
  const out = u[0] * vDir[0] + u[1] * vDir[1] >= 0;
  const refDir: [number, number] = out ? vDir : [-vDir[0], -vDir[1]];
  const angle =
    (Math.acos(
      Math.max(
        -1,
        Math.min(1, burnDir[0] * refDir[0] + burnDir[1] * refDir[1]),
      ),
    ) *
      180) /
    Math.PI;
  const s2dep = stateAt(to, depart);
  let phase =
    ((Math.atan2(s2dep.r[1], s2dep.r[0]) - Math.atan2(c.s1.r[1], c.s1.r[0])) *
      180) /
    Math.PI;
  phase = ((phase % 360) + 360) % 360;
  const soi = o1.a * Math.pow(mu(from) / m, 0.4);
  return {
    from,
    to,
    depart,
    tof,
    arrive: depart + tof,
    vinfOut: c.vinfOut,
    vinfIn: c.vinfIn,
    eject: c.eject,
    ejectPro: c.ejectPro,
    ejectNor: c.ejectNor,
    plane: c.plane,
    capture: c.capture,
    total: c.total,
    type: c.plane ? "plane" : "ballistic",
    angle,
    ref: out ? "prograde" : "retrograde",
    phase,
    r1: xy(c.s1.r),
    r2dep: xy(s2dep.r),
    r2: xy(c.s2.r),
    arc: arcPoints(m, c.s1.r, c.v1, c.s2.r),
    vDir,
    burnDir,
    soi,
    rPark: rPark1,
  };
}

export { findWindow, price };
export type { Window };
