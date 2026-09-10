import bodiesData from "../data/bodies.json";
import {
  add,
  cross,
  dot,
  elements,
  mu,
  norm,
  scale,
  stateAt,
  sub,
  unit,
} from "./kepler.js";
import type { SysBody } from "./orbits.js";
import type { Vec3 } from "./kepler.js";

/* What else the ship meets on the way (#213, #216).

   KSP is patched-conic: exactly one body pulls at a time, the one whose
   sphere of influence the ship is inside. A body the ship is not inside
   exerts nothing however close it passes — so a two-body arc between two
   planets is not an approximation of the game, it *is* the game, right up
   until the ship crosses some third body's sphere of influence. At that
   moment the game switches frames and the flight stops being the one the
   window priced.

   Three places that can happen, and this module checks all three against
   every body under the relevant primary:

     escape   the hyperbola out of the departure body, against its moons —
              a Kerbin ejection crosses the Mun's orbit on the way out, and
              the Mun's sphere covers 6.4% of that orbit. This is far the
              commonest of the three: about a fifth of delivered windows.
     cruise   the transfer arc, against the other planets. Rare — two of
              6,048 sampled arcs, both through Jool's enormous sphere.
     capture  the arrival hyperbola, against the arrival body's moons,
              where Tylo sits with the largest moon sphere in the game.

   Every trajectory here is a conic, so it is walked by true anomaly and
   never by an integrator: a node's time follows from its anomaly in closed
   form, which is the cheap direction of Kepler's equation. Two passes. The
   coarse one is the ship alone — no body positions, so it costs nothing —
   and only says which stretches come within reach of a body's orbit at all.
   The fine one re-walks those stretches at a step sized to the sphere being
   looked for, and only there asks where the body actually was. Without that
   split a Dres-sized sphere, crossed in under two hours on a thousand-day
   arc, needs a uniform step no arc can afford; with it a whole window's
   check is tens of microseconds. */

const SYS: Readonly<Record<string, SysBody>> = bodiesData.SYS;

/* What is met, and how deeply: `depth` is the closest approach in the met
   body's own sphere-of-influence radii, so under 1 is inside it. */
type Encounter = {
  body: string;
  /* Where on the flight: leaving, cruising, arriving. */
  phase: "escape" | "cruise" | "capture";
  /* UT of closest approach, and how far into that leg it falls. */
  at: number;
  since: number;
  depth: number;
};

/* The sphere of influence, as KSP computes it. */
const soiOf = (b: string) => {
  const o = elements(b);
  return o.a * Math.pow(mu(b) / o.mu, 0.4);
};

/* The bodies orbiting `b` — its moons, or the Sun's planets. */
const childrenOf = (b: string) =>
  Object.keys(SYS).filter((k) => SYS[k].parent === b);

/* A node on a conic: where the ship is at that anomaly, and when. */
type Node = { t: number; r: Vec3; rad: number };
/* A leg: its nodes by true anomaly, and that anomaly's bounds. */
type Leg = { nodeAt: (nu: number) => Node; lo: number; hi: number };

const COARSE = 240;
/* Samples to put across a sphere's diameter in the fine pass. Three catches
   a crossing and is cheap enough to run everywhere. */
const ACROSS = 3;
const FINE_CAP = 600;

/* ------------------------------ the conics ------------------------------ */

/* The transfer arc as a leg: the ellipse through `r1` with `v1` about a
   primary of parameter `m`, from departure to arrival. */
function arcLeg(
  m: number,
  r1: Vec3,
  v1: Vec3,
  t0: number,
  tof: number,
): Leg | null {
  const a = 1 / (2 / norm(r1) - dot(v1, v1) / m);
  if (!(a > 0)) return null;
  const h = cross(r1, v1);
  const hn = unit(h);
  const p = dot(h, h) / m;
  const ev = sub(scale(cross(v1, h), 1 / m), unit(r1));
  const e = norm(ev);
  if (!(e < 1)) return null;
  const ex = e > 1e-9 ? unit(ev) : unit(r1);
  const ey = cross(hn, ex);
  const n = Math.sqrt(m / a ** 3);
  /* Anomaly to mean anomaly: the cheap way round, and the only one used
     per node. */
  const meanOf = (nu: number) => {
    const E =
      2 *
      Math.atan2(
        Math.sqrt(1 - e) * Math.sin(nu / 2),
        Math.sqrt(1 + e) * Math.cos(nu / 2),
      );
    return E - e * Math.sin(E);
  };
  const nu0 = Math.atan2(dot(r1, ey), dot(r1, ex));
  const M0 = meanOf(nu0);
  /* Where the arc ends: the anomaly whose mean anomaly is `tof` on. One
     Newton solve, once, rather than one per node. */
  const M1 = M0 + n * tof;
  let E1 = M1;
  for (let i = 0; i < 40; i++) {
    const d = (E1 - e * Math.sin(E1) - M1) / (1 - e * Math.cos(E1));
    E1 -= d;
    if (Math.abs(d) < 1e-13) break;
  }
  const nu1raw =
    2 *
    Math.atan2(
      Math.sqrt(1 + e) * Math.sin(E1 / 2),
      Math.sqrt(1 - e) * Math.cos(E1 / 2),
    );
  /* Unwrapped, so a range that crosses periapsis still runs forwards. */
  const wrapsEnd = Math.round(
    (n * tof - (meanOf(nu1raw) - M0)) / (2 * Math.PI),
  );
  const nodeAt = (nu: number): Node => {
    const rad = p / (1 + e * Math.cos(nu));
    const laps = Math.floor((nu - nu0) / (2 * Math.PI));
    return {
      t: t0 + (meanOf(nu) - M0 + 2 * Math.PI * laps) / n,
      r: add(scale(ex, rad * Math.cos(nu)), scale(ey, rad * Math.sin(nu))),
      rad,
    };
  };
  return { nodeAt, lo: nu0, hi: nu1raw + 2 * Math.PI * wrapsEnd };
}

/* The escape hyperbola out of a circular equatorial parking orbit of radius
   `rPark` about `body`, leaving with the relative velocity `vrel` measured
   at the sphere of influence's edge — the geometry `ejection` in
   transfer.ts prices. The periapsis is the burn and lies in the equatorial
   plane, the asymptote acos(−1/e) ahead of it; of the two points that
   satisfy that, this takes the one the card draws, the projected excess
   turned back by that angle.

   `sign` walks forwards from periapsis for an escape and backwards into it
   for a capture, so the times fall on the right side of the burn. */
function hyperLeg(
  body: string,
  rPark: number,
  vrel: Vec3,
  tPeri: number,
  sign: 1 | -1,
): Leg | null {
  const m = mu(body);
  const soi = soiOf(body);
  const vinf2 = Math.max(0, dot(vrel, vrel) - (2 * m) / soi);
  const e = 1 + (rPark * vinf2) / m;
  if (!(e > 1.000001)) return null;
  const thInf = Math.acos(-1 / e);
  const p = rPark * (1 + e);
  const n = Math.sqrt(m / Math.abs(rPark / (1 - e)) ** 3);
  const u = unit(vrel);
  const el = Math.asin(Math.max(-1, Math.min(1, u[2])));
  const c = Math.cos(thInf) / Math.cos(el);
  if (Math.abs(c) > 1) return null;
  const psi = Math.atan2(u[1], u[0]) - Math.acos(c);
  const ph: Vec3 = [Math.cos(psi), Math.sin(psi), 0];
  const nh = unit(cross(ph, u));
  const qh = unit(cross(nh, ph));
  /* Where it leaves the sphere, so the walk stops at the patch rather than
     running out to the asymptote. */
  const cosOut = (p / soi - 1) / e;
  const nuOut =
    Math.abs(cosOut) <= 1 ? Math.acos(Math.max(-1, cosOut)) : thInf - 1e-3;
  const nodeAt = (nu: number): Node => {
    const rad = p / (1 + e * Math.cos(nu));
    const H = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu / 2));
    return {
      t: tPeri + sign * ((e * Math.sinh(H) - H) / n),
      r: add(scale(ph, rad * Math.cos(nu)), scale(qh, rad * Math.sin(nu))),
      rad,
    };
  };
  return { nodeAt, lo: 0, hi: Math.min(nuOut, thInf - 1e-3) };
}

/* ------------------------------- the scan ------------------------------- */

/* Every body under `centre` this leg passes inside. The coarse pass walks
   the ship alone; a body is looked for only where the ship's radius is
   within reach of its orbit, and there the walk is redone at a step that
   cannot stride over its sphere. */
function scanLeg(
  leg: Leg,
  centre: string,
  skip: ReadonlyArray<string>,
  phase: Encounter["phase"],
  legStart: number,
  out: Array<Encounter>,
) {
  const kids = childrenOf(centre).filter((b) => !skip.includes(b));
  if (!kids.length || !(leg.hi > leg.lo)) return;
  const span = leg.hi - leg.lo;
  const nodes: Array<Node> = [];
  for (let k = 0; k <= COARSE; k++)
    nodes.push(leg.nodeAt(leg.lo + (span * k) / COARSE));
  for (const b of kids) {
    const o = elements(b);
    const soi = soiOf(b);
    /* Reach: the body's orbit widened by its sphere. Outside this band of
       radii the ship cannot be inside it, whatever the phasing. */
    const near = o.a * (1 - o.e) - soi,
      far = o.a * (1 + o.e) + soi;
    let depth = Infinity,
      at = 0;
    for (let k = 0; k < COARSE; k++) {
      const p0 = nodes[k],
        p1 = nodes[k + 1];
      if (Math.max(p0.rad, p1.rad) < near || Math.min(p0.rad, p1.rad) > far)
        continue;
      /* A step small enough to put `ACROSS` samples across the sphere,
         given how much ground the ship covers over this stretch. */
      const moved = norm(sub(p1.r, p0.r));
      const steps = Math.max(
        2,
        Math.min(FINE_CAP, Math.ceil((moved * ACROSS) / (2 * soi))),
      );
      const nuA = leg.lo + (span * k) / COARSE;
      const nuB = leg.lo + (span * (k + 1)) / COARSE;
      for (let j = 0; j <= steps; j++) {
        const nd = leg.nodeAt(nuA + ((nuB - nuA) * j) / steps);
        const d = norm(sub(nd.r, stateAt(b, nd.t).r)) / soi;
        if (d < depth) {
          depth = d;
          at = nd.t;
        }
      }
    }
    if (depth < 1)
      out.push({ body: b, phase, at, since: at - legStart, depth });
  }
}

/* ------------------------------- the check ------------------------------- */

/* Every body the flight passes inside, in the order it meets them. The two
   ends are excluded from the cruise, being where it starts and finishes. */
function encountersOf(args: {
  from: string;
  to: string;
  primary: string;
  m: number;
  r1: Vec3;
  v1: Vec3;
  depart: number;
  tof: number;
  rPark1: number;
  vrelOut: Vec3;
  /* A fly-by arrival has no capture hyperbola to walk. */
  rPark2: number;
  vrelIn: Vec3 | null;
  arrive: number;
}): Array<Encounter> {
  const out: Array<Encounter> = [];
  const esc = hyperLeg(args.from, args.rPark1, args.vrelOut, args.depart, 1);
  if (esc) scanLeg(esc, args.from, [], "escape", args.depart, out);
  const arc = arcLeg(args.m, args.r1, args.v1, args.depart, args.tof);
  if (arc)
    scanLeg(
      arc,
      args.primary,
      [args.from, args.to],
      "cruise",
      args.depart,
      out,
    );
  if (args.vrelIn) {
    const cap = hyperLeg(args.to, args.rPark2, args.vrelIn, args.arrive, -1);
    if (cap) scanLeg(cap, args.to, [], "capture", args.arrive, out);
  }
  out.sort((a, b) => a.at - b.at);
  return out;
}

export { childrenOf, encountersOf, soiOf };
export type { Encounter };
