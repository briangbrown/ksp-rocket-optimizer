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
import { encountersOf } from "./encounter.js";
import type { Encounter } from "./encounter.js";
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
  /* The characteristic energy at each end, m²/s²: the speed relative to the
     body at its sphere of influence, squared, less the well still owed. Not
     an excess velocity, because for a moon it goes negative — see `c3Of`.
     `vinfOut`/`vinfIn` are its square root where one exists and zero where
     it does not, kept because the route prices its Hohmann legs on them. */
  c3Out: number;
  c3In: number;
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
  /* A cheaper window later in the search's second synodic period, where
     there is one worth more than a couple of percent: when it leaves and
     what it costs, for the card to offer. The window reported is the first
     from the start time, which is the one asked for. #199 */
  next: { depart: number; tof: number; total: number } | null;
  /* Every body this *delivered* flight passes inside on the way — the
     departure body's moons going out, another planet on the cruise, the
     arrival body's moons coming in (#216). KSP is patched-conic, so a body
     the ship never enters exerts nothing and none of this corrects a
     number; a body it does enter takes the flight over, and then the
     numbers describe a flight that will not happen. Normally empty: the
     search dodges what it can, and this is left non-empty only where it
     could not. */
  encounters: Array<Encounter>;
  /* What the search did about it: how far past the cheapest departure this
     window was moved, and what that cleared. A moon comes round every few
     days and the arc barely notices the shift — 0.4 m/s on average — so a
     dodge is much the better answer to a fouled optimum. Null when the
     cheapest departure was already clean, which is the usual case. */
  dodged: { by: number; cost: number; cleared: Array<string> } | null;
  /* The coarse search itself, for the plot (#213): `nt` departures from
     `t0` at `step` apart along the columns, `nf` flight times from `fLo` to
     `fHi` up the rows, and the total of every cell in whole m/s at
     `totals[i * nf + j]`, −1 where no arc solved. Plain numbers, so it
     crosses the seam with the rest. */
  plot: Grid;
};

/* A porkchop grid: `nt` departures from `t0` at `step` apart along the
   columns, `nf` flight times from `fLo` to `fHi` up the rows, the total of
   every cell at `totals[i * nf + j]`. With it, what pricing one takes — the
   far parking orbit, whether a capture is charged, the transfer type asked
   for — so the card can price the same span finer for the plot alone. */
type Grid = {
  from: string;
  to: string;
  rPark1: number;
  rPark2: number;
  capture: boolean;
  asked: "ballistic" | "plane" | "best";
  t0: number;
  step: number;
  fLo: number;
  fHi: number;
  nt: number;
  nf: number;
  totals: Array<number>;
};

/* Burn from a circular orbit of speed v onto a path of characteristic
   energy `c3`, or the reverse. The route's own `inject` written in energy
   rather than in excess velocity, which is the same number wherever the
   excess exists and is defined where it does not — see `c3Of`. */
const injectC3 = (v: number, c3: number) =>
  Math.sqrt(Math.max(0, 2 * v * v + c3)) - v;

const clamp1 = (x: number) => Math.max(-1, Math.min(1, x));

/* The characteristic energy the ship leaves the sphere of influence with:
   the square of its speed relative to the body there, less what it still
   owes the body's well. The Lambert arc's velocity relative to the body is
   the ship's at the sphere's edge, not at infinity — the game switches
   frames there — and between the edge and infinity there is 2μ/r_soi to
   climb. Ignoring that overstated Kerbin's ejection by 12 m/s and Eve's
   capture by 20 against alexmoon's planner, at the same cell.

   Signed, and that is the point. For a planet the term is small — Kerbin's
   boundary escape speed is 290 m/s against departures over 1,000 — and the
   energy is comfortably positive. For a moon it dominates: the Mun's sphere
   is a fifth of its orbit, its boundary escape speed 232 m/s, and a
   Mun → Minmus departure leaves *below* it. That is not an error to floor
   at zero; it is a ship on a bound ellipse which leaves anyway, because the
   sphere is where the game hands it over and not a place the ship has to
   out-climb. Taking the square root here and flooring it at zero was what
   collapsed every moon ejection to bare escape velocity. #223 */
const c3Of = (vrel: number, mu: number, rSoi: number) =>
  vrel * vrel - (2 * mu) / rSoi;

/* The departure from a circular equatorial parking orbit of radius r about
   a body of parameter mu, onto a path of energy c3 leaving the sphere
   `rSoi` in the direction `vrel`.

   The path's periapsis is the burn, so its plane and the parking orbit's
   share the burn's radius and differ by a turn i about it; the point where
   it crosses the sphere, ν_out past periapsis in that plane, then rises
   sin ν_out · sin i out of the equator, which is where the direction's own
   elevation fixes i. The burn is the periapsis velocity turned by i less
   the parking velocity: a prograde part and a normal part, and the
   resultant the card shows.

   ν_out is the asymptote wherever the path has one, so every planetary
   number is exactly what it was; it becomes the sphere crossing only on the
   negative-energy branch, which only a moon reaches. `soiAnomaly` has the
   reasoning. */
function ejection(vrel: Vec3, c3: number, mu: number, r: number, rSoi: number) {
  const vc = Math.sqrt(mu / r);
  const vpe = Math.sqrt(Math.max(0, c3 + (2 * mu) / r));
  const e = 1 + (r * c3) / mu;
  const nuOut = soiAnomaly(e, r, rSoi);
  const vr = norm(vrel);
  const el = Math.asin(clamp1(vr > 0 ? vrel[2] / vr : 0));
  const sn = Math.sin(nuOut);
  const i = Math.asin(clamp1(sn > 1e-9 ? Math.sin(el) / sn : 0));
  const pro = vpe * Math.cos(i) - vc;
  const nor = vpe * Math.sin(i);
  return { dv: Math.hypot(pro, nor), pro, nor };
}

/* How far past periapsis the ship is heading when it leaves.

   For a hyperbola that is the asymptote, acos(−1/e): the patched conic
   treats the sphere of influence as a point and the ship as leaving along
   the asymptote with its excess, which is the model every launch-window
   tool shares and the one our planetary numbers were checked against.

   A path of negative energy has no asymptote — it is an ellipse, and it
   leaves the sphere because the sphere is a boundary the game enforces, not
   because the ship out-climbed the well. There the angle is where the conic
   actually crosses `rSoi`, which is the nearest thing to an asymptote such a
   path has. Only moons reach that branch: it needs the sphere to be a large
   enough share of the orbit for the departure to sit below boundary escape,
   and no planet's is. #223 */
function soiAnomaly(e: number, r: number, rSoi: number) {
  if (e > 1) return Math.acos(-1 / e);
  const p = r * (1 + e);
  return Math.acos(clamp1(Math.abs(e) > 1e-12 ? (p / rSoi - 1) / e : 1));
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
  c3Out: number;
  c3In: number;
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
  soi1: number,
  mu2: number,
  soi2: number,
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
      const c3Out = c3Of(norm(sub(l.v1, s1.v)), mu1, soi1);
      const c3In = c3Of(norm(sub(l.v2, s2.v)), mu2, soi2);
      const ej = ejection(sub(l.v1, s1.v), c3Out, mu1, rPark1, soi1);
      const cap = capture ? injectC3(vc2, c3In) : 0;
      best = {
        total: ej.dv + cap,
        c3Out,
        c3In,
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
      const c3Out = c3Of(norm(sub(l.v1, s1.v)), mu1, soi1);
      const c3In = c3Of(norm(sub(v2, s2.v)), mu2, soi2);
      const ej = ejection(sub(l.v1, s1.v), c3Out, mu1, rPark1, soi1);
      const cap = capture ? injectC3(vc2, c3In) : 0;
      const total = ej.dv + g.f + cap;
      if (!best || total < best.total)
        best = {
          total,
          c3Out,
          c3In,
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

/* How far past the cheapest departure to look for a clean one, and how
   finely. Two hours is well inside the time a moon's sphere takes to cross,
   and nine days covers the Mun's 6.4-day round and Ike's 1.7. */
const DODGE_STEP = 2 * 3600;
const DODGE_REACH = 9 * 21600;

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

/* The two bodies' constants a cell needs: the primary's parameter, each
   body's, the spheres of influence, and the far parking orbit's speed. */
function system(from: string, to: string, rPark2: number) {
  const o1 = elements(from),
    o2 = elements(to);
  if (o1.parent !== o2.parent) return null;
  const m = o1.mu;
  const mu1 = mu(from),
    mu2 = mu(to);
  return {
    o1,
    o2,
    m,
    mu1,
    mu2,
    vc2: Math.sqrt(mu2 / rPark2),
    soi1: o1.a * Math.pow(mu1 / m, 0.4),
    soi2: o2.a * Math.pow(mu2 / m, 0.4),
  };
}

/* The plot's finer pass (#213): columns [i0, i1) of the grid `g` priced —
   the cells at `g`'s own spacing, whatever that is — column-major, −1
   where no arc solved. A run at a time, so the card can paint between
   runs: a cell is about five microseconds, and a grid three times finer
   than the search's each way is thirty-five thousand of them. */
function priceColumns(g: Grid, i0: number, i1: number): Array<number> {
  const sys = system(g.from, g.to, g.rPark2);
  const out: Array<number> = new Array(Math.max(0, i1 - i0) * g.nf).fill(-1);
  if (!sys) return out;
  for (let i = i0; i < i1; i++)
    for (let j = 0; j < g.nf; j++) {
      const c = price(
        g.from,
        g.to,
        sys.m,
        sys.mu1,
        g.rPark1,
        sys.soi1,
        sys.mu2,
        sys.soi2,
        sys.vc2,
        g.t0 + i * g.step,
        g.fLo + ((g.fHi - g.fLo) * j) / (g.nf - 1),
        g.capture,
        g.asked,
      );
      if (c) out[(i - i0) * g.nf + j] = Math.round(c.total);
    }
  return out;
}

/* ------------------------- out to your own moon ------------------------- */

/* One cell of a departure from the primary itself: low Kerbin orbit to the
   Mun, Duna's low orbit to Ike. Not a transfer between siblings — there is
   no sphere of influence to leave and both bodies are already in the same
   frame — so the ship simply raises its apoapsis to the moon's orbit and
   arrives as the moon does.

   The burn's place on the parking orbit is free: the ship goes round every
   half hour or so, far inside the grid's own step, so it can wait for the
   longitude it wants. That makes the cell a one-dimensional search over
   that longitude, and the Lambert solver prices each candidate. A coarse
   scan seeded half a turn back from the arrival, then golden section: the
   burn is smooth in the longitude near its minimum, and the seed is within
   a few degrees for anything close to a Hohmann. */
function raiseCell(
  moon: string,
  m: number,
  rPark: number,
  muMoon: number,
  soiMoon: number,
  vcMoon: number,
  t: number,
  tof: number,
  capture: boolean,
): RaiseCell | null {
  const s2 = stateAt(moon, t + tof);
  const vc = Math.sqrt(m / rPark);
  const at = (phi: number) => {
    const r1: Vec3 = [rPark * Math.cos(phi), rPark * Math.sin(phi), 0];
    /* Prograde on the equatorial parking orbit, counter-clockwise. */
    const vp: Vec3 = [-vc * Math.sin(phi), vc * Math.cos(phi), 0];
    const l = lambert(m, r1, s2.r, tof);
    if (!l) return null;
    const dv = sub(l.v1, vp);
    return { phi, r1, vp, l, burn: norm(dv) };
  };
  /* The whole circle, not a bracket about the Hohmann guess: the sweep from
     the burn to the arrival runs from a few degrees on a fast flight to most
     of a turn on a slow one, so the best longitude can be anywhere. Guessing
     half a turn back and searching ±90° found it for near-Hohmann flights
     and missed it everywhere else, which painted the plot's short-flight
     half as though no transfer existed there. */
  const N = 16;
  let best: ReturnType<typeof at> = null;
  for (let k = 0; k < N; k++) {
    const c = at((2 * Math.PI * k) / N);
    if (c && (!best || c.burn < best.burn)) best = c;
  }
  if (!best) return null;
  let lo = best.phi - (2 * Math.PI) / N,
    hi = best.phi + (2 * Math.PI) / N;
  const g = (Math.sqrt(5) - 1) / 2;
  let c1 = hi - g * (hi - lo),
    c2 = lo + g * (hi - lo);
  let f1 = at(c1),
    f2 = at(c2);
  for (let k = 0; k < 12; k++) {
    if ((f1?.burn ?? Infinity) < (f2?.burn ?? Infinity)) {
      hi = c2;
      c2 = c1;
      f2 = f1;
      c1 = hi - g * (hi - lo);
      f1 = at(c1);
    } else {
      lo = c1;
      c1 = c2;
      f1 = f2;
      c2 = lo + g * (hi - lo);
      f2 = at(c2);
    }
  }
  for (const c of [f1, f2]) if (c && c.burn < best.burn) best = c;
  const { r1, vp, l } = best;
  /* The burn, split the way an equatorial parking orbit feels it. */
  const dv = sub(l.v1, vp);
  const nHat = unit(cross(r1, vp));
  const nor = dot(dv, nHat);
  const pro = dot(dv, unit(vp));
  const c3In = c3Of(norm(sub(l.v2, s2.v)), muMoon, soiMoon);
  const cap = capture ? injectC3(vcMoon, c3In) : 0;
  return {
    total: best.burn + cap,
    burn: best.burn,
    pro,
    nor,
    capture: cap,
    c3In,
    r1,
    v1: l.v1,
    v2: l.v2,
    s2,
  };
}

type RaiseCell = {
  total: number;
  burn: number;
  pro: number;
  nor: number;
  capture: number;
  c3In: number;
  r1: Vec3;
  v1: Vec3;
  v2: Vec3;
  s2: { r: Vec3; v: Vec3 };
};

/* The cheapest such departure from `t0` on. The opportunity repeats with the
   moon's own period — the parking orbit's place in it is free — so the span
   is two of those rather than two synodic periods, and the flight times run
   from a third of the Hohmann to twice it, which is hours rather than
   months. */
function raiseSearch(
  from: string,
  moon: string,
  rPark: number,
  rParkMoon: number,
  t0: number,
  capture: boolean,
): Window | null {
  const o2 = elements(moon);
  const m = o2.mu;
  const muMoon = mu(moon);
  const soiMoon = o2.a * Math.pow(muMoon / m, 0.4);
  const vcMoon = Math.sqrt(muMoon / rParkMoon);
  const T = periodOf(moon);
  const hohmann = Math.PI * Math.sqrt(((rPark + o2.a) / 2) ** 3 / m);
  /* Coarser than a planetary search, and it can afford to be: the burn's
     place on the parking orbit is free, so every departure date is much of a
     muchness — the Mun's whole grid sits within 3% of its own minimum — and
     what the refine below is really finding is the flight time. The card
     draws no plot from this for the same reason. */
  const NT = 24,
    NF = 20;
  const first = 1.05 * T;
  const tSpan = 2.05 * T,
    fLo = 0.3 * hohmann,
    fHi = 2 * hohmann;
  const step = first / NT;
  const at = (t: number, tof: number) =>
    raiseCell(moon, m, rPark, muMoon, soiMoon, vcMoon, t, tof, capture);
  type Best = { t: number; tof: number; c: RaiseCell };
  let early: Best | null = null;
  const nt = Math.floor(tSpan / step) + 1,
    nf = NF + 1;
  const totals: Array<number> = new Array(nt * nf).fill(-1);
  for (let i = 0; i < nt; i++)
    for (let j = 0; j <= NF; j++) {
      const t = t0 + i * step;
      const tof = fLo + ((fHi - fLo) * j) / NF;
      const c = at(t, tof);
      if (!c) continue;
      totals[i * nf + j] = Math.round(c.total);
      if (t <= t0 + first && (!early || c.total < early.c.total))
        early = { t, tof, c };
    }
  if (!early) return null;
  let { t: bt, tof: bf, c: bc } = early;
  let ht = step,
    hf = (fHi - fLo) / NF;
  for (let round = 0; round < 9; round++) {
    let nt2 = bt,
      nf2 = bf,
      nc = bc;
    for (let i = -3; i <= 3; i++)
      for (let j = -3; j <= 3; j++) {
        const t = Math.max(t0, bt + (ht * i) / 3);
        const tof = Math.max(600, bf + (hf * j) / 3);
        const c = at(t, tof);
        if (c && c.total < nc.total) {
          nc = c;
          nt2 = t;
          nf2 = tof;
        }
      }
    bt = nt2;
    bf = nf2;
    bc = nc;
    ht *= 0.3;
    hf *= 0.3;
  }
  const depart = Math.round(bt),
    tof = Math.round(bf);
  const c = bc;
  const s2dep = stateAt(moon, depart);
  /* The phase angle a pilot times this by: from the burn point round to the
     moon, the way it is measured. */
  let phase =
    ((Math.atan2(s2dep.r[1], s2dep.r[0]) - Math.atan2(c.r1[1], c.r1[0])) *
      180) /
    Math.PI;
  phase = ((phase % 360) + 360) % 360;
  const vDir = unit2([-c.r1[1], c.r1[0]]);
  return {
    from,
    to: moon,
    depart,
    tof,
    arrive: depart + tof,
    c3Out: 0,
    c3In: c.c3In,
    vinfOut: 0,
    vinfIn: Math.sqrt(Math.max(0, c.c3In)),
    eject: c.burn,
    ejectPro: c.pro,
    ejectNor: c.nor,
    plane: null,
    capture: c.capture,
    total: c.total,
    type: "ballistic",
    /* The burn is prograde on the parking orbit; where to make it is the
       phase angle above, not an angle round from prograde. */
    angle: 0,
    ref: "prograde",
    phase,
    r1: xy(c.r1),
    r2dep: xy(s2dep.r),
    r2: xy(c.s2.r),
    arc: arcPoints(m, c.r1, c.v1, c.s2.r),
    vDir,
    burnDir: unit2(xy(c.r1)),
    soi: soiMoon,
    rPark,
    next: null,
    encounters: [],
    dodged: null,
    plot: {
      from,
      to: moon,
      rPark1: rPark,
      rPark2: rParkMoon,
      capture,
      asked: "best",
      t0,
      step,
      fLo,
      fHi,
      nt,
      nf,
      totals,
    },
  };
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
  /* Out to one of your own moons is a different problem with its own
     search: no sphere of influence to leave, and both bodies already in the
     one frame. #223 */
  if (elements(to).parent === from)
    return raiseSearch(from, to, rPark1, rPark2, t0, capture);
  const sys = system(from, to, rPark2);
  if (!sys) return null;
  const { o1, o2, m, mu1, mu2, vc2, soi1, soi2 } = sys;
  const T1 = periodOf(from),
    T2 = periodOf(to);
  const synodic = 1 / Math.abs(1 / T1 - 1 / T2);
  const hohmann = Math.PI * Math.sqrt(((o1.a + o2.a) / 2) ** 3 / m);
  /* Coarse: two synodic periods, against a third to twice the Hohmann
     time. The window reported is the cheapest cell of the first period —
     the first window from the start time, which is the one asked for —
     and the second period is searched for a cheaper one to mention: for
     Moho, Jool and Eeloo, whose windows differ a lot, it often is. A
     little over each, so a window straddling the far end is found whole. */
  const NT = 48,
    NF = 40;
  const first = 1.05 * synodic;
  const tSpan = 2.05 * synodic,
    fLo = 0.3 * hohmann,
    fHi = 2 * hohmann;
  /* The step is the first period's forty-eighth, so the first period is
     sampled exactly as it was when it was the whole search and the window
     reported does not move; the second period takes the same step. */
  const step = first / NT;
  const at = (t: number, tof: number) =>
    price(
      from,
      to,
      m,
      mu1,
      rPark1,
      soi1,
      mu2,
      soi2,
      vc2,
      t,
      tof,
      capture,
      type,
    );
  type Best = { t: number; tof: number; c: Cell };
  let early: Best | null = null,
    later: Best | null = null;
  const nt = Math.floor(tSpan / step) + 1,
    nf = NF + 1;
  const totals: Array<number> = new Array(nt * nf).fill(-1);
  for (let i = 0; i < nt; i++)
    for (let j = 0; j <= NF; j++) {
      /* Multiplied, not accumulated: the first period's samples are then
         the same numbers they were, to the bit. */
      const t = t0 + i * step;
      const tof = fLo + ((fHi - fLo) * j) / NF;
      const c = at(t, tof);
      if (!c) continue;
      totals[i * nf + j] = Math.round(c.total);
      if (t <= t0 + first) {
        if (!early || c.total < early.c.total) early = { t, tof, c };
      } else if (!later || c.total < later.c.total) later = { t, tof, c };
    }
  if (!early) return null;
  /* Refine: a 7×7 grid about the best, shrinking, nine rounds — from a
     step of days to one of seconds. */
  const refine = (b: Best): Best => {
    let { t: bt, tof: bf, c: bc } = b;
    let ht = step,
      hf = (fHi - fLo) / NF;
    for (let round = 0; round < 9; round++) {
      let nt = bt,
        nf = bf,
        nc: Cell = bc;
      for (let i = -3; i <= 3; i++)
        for (let j = -3; j <= 3; j++) {
          const t = Math.max(t0, bt + (ht * i) / 3);
          const tof = Math.max(3600, bf + (hf * j) / 3);
          const c = at(t, tof);
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
    return { t: bt, tof: bf, c: bc };
  };
  const best = refine(early);
  const tof = Math.round(best.tof);
  let depart = Math.round(best.t);
  let c = best.c;
  /* What the flight meets, and the dodge (#216). This is the one place a
     window looks at a body other than its two ends: the game pulls with one
     body at a time, so nothing here corrects a number — it decides whether
     the flight priced is the flight the game will fly. About a fifth of
     optima leave through the Mun's sphere or arrive through a moon's, and
     shifting the departure a few hours clears it for a metre a second or
     less, so the search takes the shift rather than reporting a flight that
     will not happen. */
  const encAt = (t: number, cell: Cell) =>
    encountersOf({
      from,
      to,
      primary: o1.parent,
      m,
      r1: cell.s1.r,
      v1: cell.v1,
      depart: t,
      tof,
      rPark1,
      vrelOut: sub(cell.v1, cell.s1.v),
      rPark2,
      vrelIn: capture ? sub(cell.v2, cell.s2.v) : null,
      arrive: t + tof,
    });
  let encounters = encAt(depart, c);
  let dodged: Window["dodged"] = null;
  if (encounters.length) {
    const was = [...new Set(encounters.map((e) => e.body))];
    const from0 = depart,
      cost0 = c.total;
    for (let dt = DODGE_STEP; dt <= DODGE_REACH; dt += DODGE_STEP) {
      const cand = at(from0 + dt, tof);
      /* A dodge that costs real fuel is not a dodge; where none is cheap
         enough the window stands and the card says what it meets. */
      if (!cand || cand.total > cost0 * 1.02) continue;
      if (encAt(from0 + dt, cand).length) continue;
      depart = Math.round(from0 + dt);
      c = cand;
      encounters = [];
      dodged = { by: depart - from0, cost: cand.total - cost0, cleared: was };
      break;
    }
  }
  /* Worth mentioning only where it is clearly cheaper: the grid is coarse
     and a percent is noise. */
  const next =
    later && later.c.total < c.total * 0.98
      ? (() => {
          const r = refine(later);
          return r.c.total < c.total * 0.98
            ? {
                depart: Math.round(r.t),
                tof: Math.round(r.tof),
                total: r.c.total,
              }
            : null;
        })()
      : null;
  /* The ejection point. The hyperbola that leaves with the excess `vinf`
     from radius `rPark` has eccentricity 1 + r·v∞²/μ, and its asymptote
     lies θ∞ = acos(−1/e) past periapsis; the burn is at periapsis, so it
     sits θ∞ behind the asymptote's direction around the prograde parking
     orbit. Measured from the body's prograde where the transfer goes
     outward and from retrograde where it goes inward, as the pilots' tools
     say it. */
  const vinf = sub(c.v1, c.s1.v);
  const u = unit2(xy(vinf));
  const eh = 1 + (rPark1 * c.c3Out) / mu(from);
  const thInf = soiAnomaly(eh, rPark1, soi1);
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
  const soi = soi1;
  return {
    from,
    to,
    depart,
    tof,
    arrive: depart + tof,
    c3Out: c.c3Out,
    c3In: c.c3In,
    vinfOut: Math.sqrt(Math.max(0, c.c3Out)),
    vinfIn: Math.sqrt(Math.max(0, c.c3In)),
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
    next,
    encounters,
    dodged,
    plot: {
      from,
      to,
      rPark1,
      rPark2,
      capture,
      asked: type,
      t0,
      step,
      fLo,
      fHi,
      nt,
      nf,
      totals,
    },
  };
}

/* Which transfer to fly: the inclination in the ejection, one burn with a
   normal part (ballistic); in the plane and one burn mid-course to tilt up
   to the target (plane), cheaper and harder to place in the game; or
   whichever is less. */
type TransferType = "ballistic" | "plane" | "best";

export { findWindow, price, priceColumns, soiAnomaly };
export type { Grid, TransferType };
export type { Window };
