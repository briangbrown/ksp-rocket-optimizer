import bodiesData from "../data/bodies.json";
import { findWindow } from "./transfer.js";
import type { TransferType, Window } from "./transfer.js";
import { G0 } from "./constants.js";

/* ------------------------------ what a leg is ------------------------------

   One line of the delta-v budget. `kind` is what the profile filters on and
   what the solver reads to decide whether a leg can be flown, so it is a fixed
   set rather than a string — a mistyped one would silently stop matching and
   the leg would simply never be dropped or charged.

   The optional half is per-kind rather than per-leg: `atm` is meaningful on an
   ascent or a landing, `plane` only on a plane change, `chuted` only on a leg
   the parachutes have already discounted. */
type LegKind =
  "ascent" | "ascentBack" | "transfer" | "capture" | "land" | "plane" | "aero";

type PlaneChange = {
  deg: number;
  system: string;
  cheap: number;
  costly: number;
  /* The radii the two prices are quoted at, about `system`: the costly one in
     the low orbit you are already in, the cheap one out at apoapsis where the
     same turn costs less. Which of them a leg is flying decides the arc its
     burn sweeps, and they are as far apart as the prices are. #418 */
  rCostly: number;
  rCheap: number;
};

type Leg = {
  label: string;
  dv: number;
  kind: LegKind;
  body: string;
  g?: number;
  atm?: boolean;
  free?: boolean;
  chuted?: boolean;
  note?: string;
  planeNow?: boolean;
  cheap?: number;
  costly?: number;
  plane?: PlaneChange;
  /* On the leg that leaves one planet for another: the window it was priced
     on — when, the burn, the drawing. `at` is the burn's UT on any leg that
     has a time, the mid-course plane change included. */
  window?: Window;
  at?: number;
  /* Where this leg's burn is made, for pricing it above the impulse it is
     budgeted as. Absent on an ascent, a landing and an aerobrake. */
  orbit?: BurnOrbit;
  /* What the leg costs flown as a spiral over many revolutions rather than as
     an impulse — the low-thrust price, which an engine too weak to make the
     burn in a fraction of an orbit pays instead of `dv`. Absent where the leg
     has no orbit to spiral in. `spiralOf` below has the forms. #415 */
  spiral?: number;
  /* Set where that price presumes the leg before it was flown as a spiral by
     the same craft: a capture from rest at the body's edge, which only a
     craft that has already matched the body's speed arrives at; a raise from
     the distance a spiral capture stopped at; a return that skips the escape
     the leg before it made. A stage that starts spiralling on such a leg has
     an excess the price does not include. */
  spiralAfter?: true;
};

/* A tabulated destination: the colour the route draws it in, its surface
   gravity where it has one, and the legs from the Kerbin launchpad. */
type Dest = {
  color: string;
  g?: number;
  atm?: boolean;
  legs: Array<Leg>;
};

/* A body in the stock system. Only the Sun has no parent and no orbit of its
   own, which is why the orbital elements are optional and the physical ones
   are not. `atm` is the atmosphere's depth in metres, absent where there is
   none; `ascent` is the tabulated surface-to-orbit figure. */
type SysBody = {
  parent: string | null;
  R: number;
  gee: number;
  rot?: number;
  inc?: number;
  lan?: number;
  sma?: number;
  /* The rest of the orbit, for an ephemeris: eccentricity, argument of
     periapsis in degrees, mean anomaly at epoch in radians — the epoch being
     UT 0, Year 1 Day 1 00:00:00, where every stock body's elements are
     given. Absent on the Sun, which orbits nothing. */
  ecc?: number;
  ape?: number;
  m0?: number;
  ascent?: number;
  atm?: number;
  noLand?: boolean;
};

type Profile = { name: string; note: string };

/* ------------------------------- destinations -------------------------------
   Each destination is an ordered list of legs from the Kerbin launchpad, matching
   the community delta-v map. kind drives what each mission profile keeps.
   g = local surface gravity used for landing/ascent TWR checks.               */
/* Stock system, from the Kopernicus dump. mu = geeASL*g0*R^2.
   ascent = surface <-> low orbit, the one figure worth keeping tabulated
   because it is dominated by drag and gravity losses, not orbital mechanics. */
const SYS: Readonly<Record<string, SysBody>> = bodiesData.SYS;

/* The Sun orbits nothing, so it carries neither of these; every caller below
   has already walked past it by the time it asks. Reading them through one
   place says that once rather than at each of a dozen sites, and lets a genuine
   gap arrive as NaN rather than being asserted out of existence. */
const smaOf = (b: string) => SYS[b].sma ?? NaN;
const rotOf = (b: string) => SYS[b].rot ?? NaN;
const mu = (b: string) => SYS[b].gee * G0 * SYS[b].R ** 2;
const lowAlt = (b: string) => (SYS[b].atm ? SYS[b].atm + 10000 : 10000);
const lowR = (b: string) => SYS[b].R + lowAlt(b);
const vCirc = (b: string) => Math.sqrt(mu(b) / lowR(b));
/* The angular rate of a circular orbit of radius `r` about `b`, which is what
   turns a burn's duration into the arc it sweeps and so into what it costs
   above an impulse — `finiteBurnDv` in performance.ts. The Sun carries R and
   gee like any other body, so a burn made out in solar orbit is asked for the
   same way, and answers with an arc small enough to be free. #409 */
const omegaAt = (b: string, r: number) => Math.sqrt(mu(b) / r ** 3);
/* Synchronous orbit: the radius whose period matches the body's own rotation.
   It only exists if it clears the atmosphere and still sits inside the sphere of
   influence — which is why no tidally locked moon has one, since its synchronous
   radius is its own orbit around the planet. */
const syncR = (b: string) =>
  Math.cbrt((mu(b) * rotOf(b) * rotOf(b)) / (4 * Math.PI * Math.PI));

/* ------------------------- where a burn is made -------------------------

   A leg's Δv is priced as an impulse. What a real burn costs above that is set
   by the arc it sweeps, and the arc is its duration against the orbit it is
   made in — `finiteBurnDv` in performance.ts, and #409 for the reasoning.

   Which orbit that is cannot be read off a leg's `body`, because the two route
   builders mean opposite things by it: a computed transfer names the body it
   departs, a tabulated one names the body it is headed for, so `LKO → Mun
   intercept` says Mun and burns at Kerbin. Nor can it be read off `kind`:
   `Circularize at 2 868 km` is a capture about Kerbin at stationary radius,
   twelve times the period of the low orbit a rule would have assumed.

   So every leg that makes an orbital burn carries where it makes it. An
   ascent, a landing and an aerobrake carry nothing: the first two are not
   spread impulses at all, and the pad keeps its own cap. #418 */
type BurnOrbit = { body: string; r: number };

const lowOrbit = (b: string): BurnOrbit => ({ body: b, r: lowR(b) });
const syncOrbit = (b: string): BurnOrbit => ({ body: b, r: syncR(b) });
const orbitAt = (body: string, r: number): BurnOrbit => ({ body, r });
/* Out between the planets, where a burn of any length sweeps nothing. */
const solarAt = (r: number): BurnOrbit => ({ body: "Sun", r });
const omegaOf = (o: BurnOrbit) => omegaAt(o.body, o.r);

const ASCENT: Leg = {
  label: "Launchpad → 80 km orbit",
  dv: 3400,
  kind: "ascent",
  body: "Kerbin",
  g: 9.81,
  atm: true,
};
const ESCAPE: Leg = {
  label: "LKO → Kerbin escape",
  dv: 950,
  kind: "transfer",
  body: "Kerbin",
  orbit: lowOrbit("Kerbin"),
  g: 9.81,
};

/* Colours are literals rather than references to the UI palette: core must not
   import from ui. The field is in fact dead — nothing reads DEST[x].color — so
   it can go entirely, but removing it is a shape change and this step only
   moves code. */
const DEST: Readonly<Record<string, Dest>> = {
  "Low Kerbin Orbit": { color: "#4A9BE0", legs: [ASCENT] },
  "Keostationary orbit": {
    color: "#4A9BE0",
    legs: [
      ASCENT,
      {
        label: "LKO → keostationary transfer",
        dv: 1115,
        kind: "transfer",
        body: "Kerbin",
        orbit: lowOrbit("Kerbin"),
        g: 9.81,
      },
      {
        label: "Circularize at 2 868 km",
        dv: 1030,
        kind: "capture",
        body: "Kerbin",
        orbit: syncOrbit("Kerbin"),
        g: 9.81,
      },
    ],
  },
  Mun: {
    color: "#F5A623",
    g: 1.63,
    legs: [
      ASCENT,
      {
        label: "LKO → Mun intercept",
        dv: 860,
        kind: "transfer",
        body: "Mun",
        orbit: lowOrbit("Kerbin"),
        g: 1.63,
      },
      {
        label: "Capture → low Mun orbit",
        dv: 280,
        kind: "capture",
        body: "Mun",
        orbit: lowOrbit("Mun"),
        g: 1.63,
      },
      {
        label: "Descent to Mun surface",
        dv: 580,
        kind: "land",
        body: "Mun",
        g: 1.63,
      },
    ],
  },
  Minmus: {
    color: "#4FD1A5",
    g: 0.491,
    legs: [
      ASCENT,
      {
        label: "LKO → Minmus intercept",
        dv: 930,
        kind: "transfer",
        body: "Minmus",
        orbit: lowOrbit("Kerbin"),
        g: 0.491,
      },
      {
        label: "Capture → low Minmus orbit",
        dv: 160,
        kind: "capture",
        body: "Minmus",
        orbit: lowOrbit("Minmus"),
        g: 0.491,
      },
      {
        label: "Descent to Minmus surface",
        dv: 180,
        kind: "land",
        body: "Minmus",
        g: 0.491,
      },
    ],
  },
  Duna: {
    color: "#E2603F",
    g: 2.94,
    atm: true,
    legs: [
      ASCENT,
      ESCAPE,
      {
        label: "Kerbin escape → Duna transfer",
        dv: 130,
        kind: "transfer",
        body: "Duna",
        orbit: solarAt(smaOf("Kerbin")),
        g: 2.94,
      },
      {
        label: "Capture → low Duna orbit",
        dv: 250,
        kind: "capture",
        body: "Duna",
        orbit: lowOrbit("Duna"),
        g: 2.94,
      },
      {
        label: "Descent to Duna surface",
        dv: 1450,
        kind: "land",
        body: "Duna",
        g: 2.94,
        atm: true,
      },
    ],
  },
  Ike: {
    color: "#E2603F",
    g: 1.1,
    legs: [
      ASCENT,
      ESCAPE,
      {
        label: "Kerbin escape → Duna transfer",
        dv: 130,
        kind: "transfer",
        body: "Duna",
        orbit: solarAt(smaOf("Kerbin")),
        g: 2.94,
      },
      {
        label: "Duna capture",
        dv: 250,
        kind: "capture",
        body: "Duna",
        orbit: lowOrbit("Duna"),
        g: 2.94,
      },
      {
        label: "Duna orbit → Ike intercept",
        dv: 30,
        kind: "transfer",
        body: "Ike",
        orbit: lowOrbit("Duna"),
        g: 1.1,
      },
      {
        label: "Capture → low Ike orbit",
        dv: 180,
        kind: "capture",
        body: "Ike",
        orbit: lowOrbit("Ike"),
        g: 1.1,
      },
      {
        label: "Descent to Ike surface",
        dv: 390,
        kind: "land",
        body: "Ike",
        g: 1.1,
      },
    ],
  },
  Eve: {
    color: "#A177DB",
    g: 16.7,
    atm: true,
    legs: [
      ASCENT,
      ESCAPE,
      {
        label: "Kerbin escape → Eve transfer",
        dv: 90,
        kind: "transfer",
        body: "Eve",
        orbit: solarAt(smaOf("Kerbin")),
        g: 16.7,
      },
      {
        label: "Capture → low Eve orbit",
        dv: 1330,
        kind: "capture",
        body: "Eve",
        orbit: lowOrbit("Eve"),
        g: 16.7,
      },
      {
        label: "Eve surface ↔ low orbit",
        dv: 8000,
        kind: "land",
        body: "Eve",
        g: 16.7,
        atm: true,
      },
    ],
  },
  Gilly: {
    color: "#A177DB",
    g: 0.049,
    legs: [
      ASCENT,
      ESCAPE,
      {
        label: "Kerbin escape → Eve transfer",
        dv: 90,
        kind: "transfer",
        body: "Eve",
        orbit: solarAt(smaOf("Kerbin")),
        g: 16.7,
      },
      {
        label: "Eve capture",
        dv: 80,
        kind: "capture",
        body: "Eve",
        orbit: lowOrbit("Eve"),
        g: 16.7,
      },
      {
        label: "Eve orbit → Gilly intercept",
        dv: 60,
        kind: "transfer",
        body: "Gilly",
        orbit: lowOrbit("Eve"),
        g: 0.049,
      },
      {
        label: "Capture → low Gilly orbit",
        dv: 410,
        kind: "capture",
        body: "Gilly",
        orbit: lowOrbit("Gilly"),
        g: 0.049,
      },
      {
        label: "Descent to Gilly surface",
        dv: 30,
        kind: "land",
        body: "Gilly",
        g: 0.049,
      },
    ],
  },
  Moho: {
    color: "#E85D75",
    g: 2.7,
    legs: [
      ASCENT,
      ESCAPE,
      {
        label: "Kerbin escape → Moho transfer",
        dv: 760,
        kind: "transfer",
        body: "Moho",
        orbit: solarAt(smaOf("Kerbin")),
        g: 2.7,
      },
      {
        label: "Capture → low Moho orbit",
        dv: 2410,
        kind: "capture",
        body: "Moho",
        orbit: lowOrbit("Moho"),
        g: 2.7,
      },
      {
        label: "Descent to Moho surface",
        dv: 870,
        kind: "land",
        body: "Moho",
        g: 2.7,
      },
    ],
  },
  Dres: {
    color: "#B9A06B",
    g: 1.13,
    legs: [
      ASCENT,
      ESCAPE,
      {
        label: "Kerbin escape → Dres transfer",
        dv: 610,
        kind: "transfer",
        body: "Dres",
        orbit: solarAt(smaOf("Kerbin")),
        g: 1.13,
      },
      {
        label: "Capture → low Dres orbit",
        dv: 1290,
        kind: "capture",
        body: "Dres",
        orbit: lowOrbit("Dres"),
        g: 1.13,
      },
      {
        label: "Descent to Dres surface",
        dv: 430,
        kind: "land",
        body: "Dres",
        g: 1.13,
      },
    ],
  },
  "Jool orbit": {
    color: "#86B24A",
    g: 7.85,
    legs: [
      ASCENT,
      ESCAPE,
      {
        label: "Kerbin escape → Jool transfer",
        dv: 980,
        kind: "transfer",
        body: "Jool",
        orbit: solarAt(smaOf("Kerbin")),
        g: 7.85,
      },
      {
        label: "Capture into Jool orbit",
        dv: 160,
        kind: "capture",
        body: "Jool",
        orbit: lowOrbit("Jool"),
        g: 7.85,
      },
    ],
  },
  Laythe: {
    color: "#86B24A",
    g: 7.85,
    atm: true,
    legs: [
      ASCENT,
      ESCAPE,
      {
        label: "Kerbin escape → Jool transfer",
        dv: 980,
        kind: "transfer",
        body: "Jool",
        orbit: solarAt(smaOf("Kerbin")),
        g: 7.85,
      },
      {
        label: "Jool capture",
        dv: 160,
        kind: "capture",
        body: "Jool",
        orbit: lowOrbit("Jool"),
        g: 7.85,
      },
      {
        label: "Jool orbit → Laythe intercept",
        dv: 930,
        kind: "transfer",
        body: "Laythe",
        orbit: lowOrbit("Jool"),
        g: 7.85,
      },
      {
        label: "Descent to Laythe surface",
        dv: 2900,
        kind: "land",
        body: "Laythe",
        g: 7.85,
        atm: true,
      },
    ],
  },
  Tylo: {
    color: "#86B24A",
    g: 7.85,
    legs: [
      ASCENT,
      ESCAPE,
      {
        label: "Kerbin escape → Jool transfer",
        dv: 980,
        kind: "transfer",
        body: "Jool",
        orbit: solarAt(smaOf("Kerbin")),
        g: 7.85,
      },
      {
        label: "Jool capture",
        dv: 160,
        kind: "capture",
        body: "Jool",
        orbit: lowOrbit("Jool"),
        g: 7.85,
      },
      {
        label: "Jool orbit → Tylo intercept",
        dv: 400,
        kind: "transfer",
        body: "Tylo",
        orbit: lowOrbit("Jool"),
        g: 7.85,
      },
      {
        label: "Descent to Tylo surface",
        dv: 2270,
        kind: "land",
        body: "Tylo",
        g: 7.85,
      },
    ],
  },
  Vall: {
    color: "#86B24A",
    g: 2.31,
    legs: [
      ASCENT,
      ESCAPE,
      {
        label: "Kerbin escape → Jool transfer",
        dv: 980,
        kind: "transfer",
        body: "Jool",
        orbit: solarAt(smaOf("Kerbin")),
        g: 7.85,
      },
      {
        label: "Jool capture",
        dv: 160,
        kind: "capture",
        body: "Jool",
        orbit: lowOrbit("Jool"),
        g: 7.85,
      },
      {
        label: "Jool orbit → Vall intercept",
        dv: 620,
        kind: "transfer",
        body: "Vall",
        orbit: lowOrbit("Jool"),
        g: 2.31,
      },
      {
        label: "Descent to Vall surface",
        dv: 860,
        kind: "land",
        body: "Vall",
        g: 2.31,
      },
    ],
  },
  Pol: {
    color: "#86B24A",
    g: 0.373,
    legs: [
      ASCENT,
      ESCAPE,
      {
        label: "Kerbin escape → Jool transfer",
        dv: 980,
        kind: "transfer",
        body: "Jool",
        orbit: solarAt(smaOf("Kerbin")),
        g: 7.85,
      },
      {
        label: "Jool capture",
        dv: 160,
        kind: "capture",
        body: "Jool",
        orbit: lowOrbit("Jool"),
        g: 7.85,
      },
      {
        label: "Jool orbit → Pol intercept",
        dv: 160,
        kind: "transfer",
        body: "Pol",
        orbit: lowOrbit("Jool"),
        g: 0.373,
      },
      {
        label: "Descent to Pol surface",
        dv: 130,
        kind: "land",
        body: "Pol",
        g: 0.373,
      },
    ],
  },
  Eeloo: {
    color: "#6FD7E8",
    g: 1.69,
    legs: [
      ASCENT,
      ESCAPE,
      {
        label: "Kerbin escape → Eeloo transfer",
        dv: 1140,
        kind: "transfer",
        body: "Eeloo",
        orbit: solarAt(smaOf("Kerbin")),
        g: 1.69,
      },
      {
        label: "Capture → low Eeloo orbit",
        dv: 1370,
        kind: "capture",
        body: "Eeloo",
        orbit: lowOrbit("Eeloo"),
        g: 1.69,
      },
      {
        label: "Descent to Eeloo surface",
        dv: 620,
        kind: "land",
        body: "Eeloo",
        g: 1.69,
      },
    ],
  },
};

const PROFILES: Readonly<Record<string, Profile>> = bodiesData.PROFILES;

/* Build the leg list for a destination + profile, including return legs. */
/* The test used to read `(parent && SYS[parent].sma !== undefined) || parent`,
   whose second half makes the first dead: whenever there is a parent the whole
   disjunction is true regardless. What is left is the parent alone, which is
   the real question — a body with nothing to orbit has no sphere of influence
   to be bounded by. */
const soiR = (b: string) => {
  const p = SYS[b].parent;
  return p ? smaOf(b) * Math.pow(mu(b) / mu(p), 0.4) : Infinity;
};

/* ------------------------- the low-thrust price of a leg -------------------------

   An impulse and a spiral are different manoeuvres with different prices, and
   the second is not a correction to the first. `finiteBurnDv` in
   performance.ts prices a burn that sweeps part of an orbit as an impulse
   plus a penalty; that form is a perturbation, and it stops meaning anything
   once the burn is longer than the orbit. A burn that goes on for many
   revolutions — an ion engine's, always — is a spiral, and a spiral's Δv is
   set by the circular speeds at its two ends:

   - Between two circular orbits about one body it costs |v₁ − v₀|, the
     difference of the circular speeds (Hohmann charges less, because the
     impulses are made where the speed is highest).
   - Out to escape it costs the whole circular speed v₀, against the
     (√2 − 1)·v₀ ≈ 0.414·v₀ of an impulsive escape — a factor of 2.4, and the
     reason an ion ejection from low Kerbin orbit is 2,280 m/s where the map
     says 950. Down from escape into a circular orbit costs the same the other
     way.
   - A plane change of Δi at constant speed v costs Edelbaum's
     2·v·sin(π·Δi/4), against the impulsive 2·v·sin(Δi/2) — about π/2 times
     as much for a small angle, because the thrust is spent all round the
     orbit rather than at the node where it counts.

   Each leg's spiral is read off its own orbit and where it is going, with the
   body tree in between: leaving a moon for another planet is an escape from
   the moon, an escape from the planet made at the moon's distance, and then a
   circular-to-circular spiral about the Sun. Arrival is the capture leg's
   own; a return with nothing but an aerobrake at the end spirals all the way
   down, since a spiral has no excess speed for the air to take. #415 */
const vCircAt = (b: string, r: number) => Math.sqrt(mu(b) / r);
/* The body and everything it orbits, innermost first. */
const chainUp = (b: string): Array<string> => {
  const out = [b];
  for (let p = SYS[b]?.parent; p; p = SYS[p].parent) out.push(p);
  return out;
};
/* The Edelbaum turn that costs `dv` impulsively at circular speed `v`:
   Δi from 2·v·sin(Δi/2) = dv, then 2·v·sin(π·Δi/4). */
const spiralTurn = (v: number, dv: number) => {
  const di = 2 * Math.asin(Math.min(1, dv / (2 * v)));
  return 2 * v * Math.sin((Math.PI * di) / 4);
};
/* The body on `d`'s chain that orbits `b` directly, where `d` is under `b`. */
const childOf = (b: string, d: string) => {
  const down = chainUp(d);
  const at = down.indexOf(b);
  return at > 0 ? down[at - 1] : undefined;
};
/* The leg after `i` that is not a plane change — a plane change is made on
   the way and says nothing about where the way ends. */
const after = (legs: ReadonlyArray<Leg>, i: number) => {
  for (let k = i + 1; k < legs.length; k++)
    if (legs[k].kind !== "plane") return legs[k];
  return undefined;
};
const before = (legs: ReadonlyArray<Leg>, i: number) => {
  for (let k = i - 1; k >= 0; k--) if (legs[k].kind !== "plane") return legs[k];
  return undefined;
};
const capturesAbout = (l: Leg | undefined, b: string) =>
  l?.kind === "capture" && l.orbit?.body === b;

type Spiral = { dv: number; after: boolean };
function spiralOf(legs: ReadonlyArray<Leg>, i: number): Spiral | undefined {
  const l = legs[i];
  const o = l.orbit;
  if (!o || !SYS[o.body]) return undefined;
  const B = o.body;
  const v0 = vCircAt(B, o.r);
  if (l.kind === "plane") return { dv: spiralTurn(v0, l.dv), after: false };
  const prev = before(legs, i);
  const next = after(legs, i);
  if (l.kind === "capture") {
    /* Circularising after a transfer about the same body — up to a
       stationary orbit — is already done by the transfer's own spiral, which
       ends circular. Otherwise a spiral down from rest at the edge: to the
       distance of the moon the route goes on to, where it goes on to one —
       the impulsive route captures low and climbs back out, and a spiral has
       no reason to — and to this orbit where it does not. From rest, because
       the transfer before it matched the body's speed; hence `after`. */
    if (prev?.kind === "transfer" && prev.orbit?.body === B)
      return { dv: 0, after: true };
    const on =
      next?.kind === "transfer" && next.orbit?.body === B
        ? childOf(B, next.body)
        : undefined;
    return { dv: on ? vCircAt(B, smaOf(on)) : v0, after: true };
  }
  if (l.kind !== "transfer") return undefined;
  const D = l.body;
  if (!SYS[D]) return undefined;
  if (D === B) {
    /* Named for the body it stays about: a raise to a higher orbit where a
       capture about the same body follows, an escape where nothing does. */
    return {
      dv: capturesAbout(next, B)
        ? Math.abs(vCircAt(B, next!.orbit!.r) - v0)
        : v0,
      after: false,
    };
  }
  /* Where the leg ends up: about `D` itself, put there by a capture leg
     where the route has one, and otherwise spiralled all the way down to the
     low orbit the next leg starts from. Not before an aerobrake: a spiral
     arrives with no excess, and a fall from rest at the edge into the air is
     the same entry an impulsive arrival makes, so the air still does the
     capture for nothing. */
  const descent = (into: string) =>
    into === D && !(next && (capturesAbout(next, D) || next.kind === "aero"))
      ? vCircAt(into, lowR(into))
      : 0;
  const up = chainUp(B);
  const C = up.find((a) => chainUp(D).includes(a));
  if (!C) return undefined;
  if (C === B) {
    /* Out to a body that orbits this one, at that body's distance — from
       here, or from that distance already where the capture before this leg
       spiralled down to it. */
    const d1 = childOf(B, D)!;
    const fromCapture = capturesAbout(prev, B);
    const from = fromCapture ? smaOf(d1) : o.r;
    return {
      dv: Math.abs(vCircAt(B, smaOf(d1)) - vCircAt(B, from)) + descent(d1),
      after: fromCapture,
    };
  }
  /* Climb out: an escape from each body below the common one, made at the
     distance the body below it orbits. A leg that only undoes a capture
     stands immediately before this one on a return from orbit and has made
     the first of those escapes already. */
  const escapedAlready =
    prev?.kind === "transfer" && prev.orbit?.body === B && prev.body === B;
  let dv = 0;
  let r = o.r;
  for (let k = 0; up[k] !== C; k++) {
    if (!(k === 0 && escapedAlready)) dv += vCircAt(up[k], r);
    r = smaOf(up[k]);
  }
  /* Then about the common body: to the distance of whatever on the way down
     orbits it, or, where the destination is that body itself, down to its
     low orbit. */
  const dSide = childOf(C, D);
  if (dSide !== undefined)
    return {
      dv:
        dv +
        Math.abs(vCircAt(C, smaOf(dSide)) - vCircAt(C, r)) +
        descent(dSide),
      after: escapedAlready,
    };
  return {
    dv:
      dv +
      (capturesAbout(next, C)
        ? 0
        : Math.abs(vCircAt(C, lowR(C)) - vCircAt(C, r))),
    after: escapedAlready,
  };
}
/* Every leg with a spiral price, priced. Applied once to a finished route,
   because a leg's spiral depends on its neighbours — what follows a transfer
   says whether it is an escape or a raise. */
const withSpirals = (legs: Array<Leg>): Array<Leg> =>
  legs.map((l, i) => {
    const s = spiralOf(legs, i);
    return s === undefined
      ? l
      : {
          ...l,
          spiral: Math.round(s.dv),
          ...(s.after ? { spiralAfter: true as const } : {}),
        };
  });
function hasSync(b: string) {
  if (!SYS[b] || !SYS[b].rot) return false;
  const r = syncR(b);
  return r > SYS[b].R + (SYS[b].atm || 0) + 5000 && r < soiR(b) * 0.9;
}
const chainOf = (b: string) => {
  const c: Array<string> = [];
  for (let x: string | null = b; x; x = SYS[x].parent) c.push(x);
  return c;
};

/* Hohmann between two circular orbits around `centre`; returns the hyperbolic
   excess needed at each end. */
function hohmann(centre: string, r1: number, r2: number) {
  const m = mu(centre),
    at = (r1 + r2) / 2;
  const v1 = Math.sqrt(m / r1),
    v2 = Math.sqrt(m / r2);
  const vp = Math.sqrt(m * (2 / r1 - 1 / at)),
    va = Math.sqrt(m * (2 / r2 - 1 / at));
  return { out: Math.abs(vp - v1), in: Math.abs(v2 - va) };
}
/* Burn from a circular orbit of speed v to leave with excess vinf (or the
   reverse, capturing from vinf into that circular orbit). */
const inject = (v: number, vinf: number) =>
  Math.sqrt(2 * v * v + vinf * vinf) - v;

/* The same burn priced from energy rather than from an excess velocity, so
   it is defined where a moon's departure sits below its own boundary escape
   and the excess does not exist. `c3Of` in core/transfer.ts has the why;
   with c3 = vinf² this is `inject` written out. #223 */
const injectC3 = (v: number, c3: number) =>
  Math.sqrt(Math.max(0, 2 * v * v + c3)) - v;

const RAD = Math.PI / 180;
/* Destination labels are not always body names: DEST offers "Jool orbit",
   "Low Kerbin Orbit" and "Keostationary orbit". Resolve to a real body, or null
   when the target is just an orbit and no plane change applies. */
function bodyKey(name: string) {
  if (SYS[name]) return name;
  return Object.keys(SYS).find((b) => name.startsWith(b + " ")) || null;
}
/* Relative inclination between two orbits about the same primary. With both
   inclinations and ascending nodes known this is exact rather than |i1-i2|. */
function relInc(a: string, b: string) {
  const i1 = (SYS[a].inc || 0) * RAD,
    i2 = (SYS[b].inc || 0) * RAD;
  const dl = ((SYS[a].lan || 0) - (SYS[b].lan || 0)) * RAD;
  return (
    Math.acos(
      Math.min(
        1,
        Math.max(
          -1,
          Math.cos(i1) * Math.cos(i2) +
            Math.sin(i1) * Math.sin(i2) * Math.cos(dl),
        ),
      ),
    ) / RAD
  );
}

/* A plane change costs 2·v·sin(Δi/2), so the only thing that matters is how
   slowly you are moving when you make it. At the transfer orbit's apoapsis you
   are crawling; down in low orbit you are not. Minmus is 5 m/s one way and
   239 m/s the other — the same manoeuvre.

   A route can need one at every level it passes through: reaching Bop means
   matching Jool's 1.3° against Kerbol and then Bop's 15° against Jool. */
function planeChanges(origin: string, dest: string) {
  const oB = bodyKey(origin),
    dB = bodyKey(dest);
  if (!oB || !dB || oB === dB) return [];
  const co = chainOf(oB),
    cd = chainOf(dB);
  /* Every chain is walked up to the Sun, so two of them always meet. The guard
     is for the type rather than for the data — but returning no plane changes
     is a better answer to an impossible case than indexing the body table with
     `undefined`, which is what happened before. */
  const common = co.find((b) => cd.includes(b));
  if (!common) return [];
  const up = co.slice(0, co.indexOf(common));
  const down = cd.slice(0, cd.indexOf(common)).reverse();
  const out: Array<PlaneChange> = [];
  const add = (
    deg: number,
    v: number,
    system: string,
    r: number,
    cheapV?: number,
    cheapR?: number,
  ) => {
    if (deg < 0.15) return;
    const half = Math.sin((deg / 2) * RAD);
    out.push({
      deg,
      system,
      cheap: Math.round(2 * (cheapV ?? v) * half),
      costly: Math.round(2 * v * half),
      rCostly: r,
      rCheap: cheapR ?? r,
    });
  };

  // shedding the origin's own inclination on the way out
  up.forEach((b, k) => {
    if (k === up.length - 1) return;
    add(
      SYS[b].inc || 0,
      Math.sqrt(mu(up[k + 1]) / smaOf(b)),
      up[k + 1],
      smaOf(b),
    );
  });

  // the main one, at the level both bodies share
  const upEnd = up.length ? up[up.length - 1] : oB;
  const dnEnd = down.length ? down[0] : dB;
  if (upEnd !== dnEnd) {
    const r1 = up.length ? smaOf(upEnd) : lowR(oB);
    const r2 = down.length ? smaOf(dnEnd) : lowR(dB);
    const m = mu(common),
      at = (r1 + r2) / 2;
    add(
      relInc(upEnd, dnEnd),
      Math.sqrt(m / Math.min(r1, r2)),
      common,
      Math.min(r1, r2),
      Math.sqrt(m * (2 / Math.max(r1, r2) - 1 / at)),
      Math.max(r1, r2),
    );
  }

  // and matching each moon's plane on the way down
  down.forEach((b, k) => {
    const next = down[k + 1];
    if (!next) return;
    add(SYS[next].inc || 0, Math.sqrt(mu(b) / smaOf(next)), b, smaOf(next));
  });
  return out;
}

function transferDv(
  origin: string,
  dest: string,
  t0?: number,
  transfer: TransferType = "best",
) {
  const co = chainOf(origin),
    cd = chainOf(dest);
  /* As in planeChanges: the chains always meet at the Sun if nowhere sooner. */
  const common = co.find((b) => cd.includes(b));
  if (!common) return [];
  const up = co.slice(0, co.indexOf(common));
  const down = cd.slice(0, cd.indexOf(common)).reverse();
  const rO = up.length ? smaOf(up[up.length - 1]) : lowR(origin);
  const rD = down.length ? smaOf(down[0]) : lowR(dest);
  const h = hohmann(common, rO, rD);
  /* Between planets, with a start time: the excess at each end is the
     window's rather than the Hohmann's, and the window rides on the leg
     that leaves. The parking orbits are where the route actually burns —
     the planet's low orbit, or a moon's orbit about it when the mission
     comes up from a moon — and the same at the far end. */
  /* Any shared primary, not only the Sun: Mun → Minmus is the same problem
     about Kerbin that Kerbin → Duna is about the Sun, and until #223 it was
     refused for no reason but the name of the centre. A departure from the
     primary itself — Kerbin → Mun — is a different problem and still has no
     window here; `up` is empty for it. */
  const w =
    t0 !== undefined && down.length
      ? findWindow(
          up.length ? up[up.length - 1] : common,
          down[0],
          up.length
            ? up.length > 1
              ? smaOf(up[up.length - 2])
              : lowR(up[0])
            : lowR(common),
          down.length > 1 ? smaOf(down[1]) : lowR(down[0]),
          t0,
          true,
          transfer,
        )
      : null;
  /* The energies the burns are priced from. A window's are its own; without
     one they are the Hohmann excesses squared, which is the same number the
     old excess-velocity form produced. Energy rather than excess because a
     moon's departure can sit below its own boundary escape and still be a
     real transfer — `c3Of` in core/transfer.ts has the reasoning. #223 */
  let c3out = h.out * h.out,
    c3in = h.in * h.in;
  if (w) {
    h.out = w.vinfOut;
    h.in = w.vinfIn;
    c3out = w.c3Out;
    c3in = w.c3In;
  }
  const legs: Array<Leg> = [];
  /* Staying inside one system means no SOI to climb out of, so the Hohmann burn
     is the whole cost — running it through inject() would charge escape velocity
     on top and inflate a Mun trip by a quarter. */
  if (!up.length) {
    /* Straight out to a moon of the body we are already circling: one burn
       that raises apoapsis to meet it, priced on the window where there is
       one. #223 */
    legs.push({
      label: w
        ? `Leave ${common} orbit for ${down[0]}`
        : `Low ${origin} orbit → ${dest} transfer`,
      dv: Math.round(w ? w.eject : h.out),
      kind: "transfer",
      body: dest,
      /* `up` is empty, so the burn is made in the low orbit of the body the
         route is already circling, which is the origin and the centre both. */
      orbit: lowOrbit(origin),
      ...(w ? { window: w, at: w.depart } : {}),
    });
  } else
    up.forEach((b, k) => {
      const v = k === 0 ? vCirc(b) : Math.sqrt(mu(b) / smaOf(up[k - 1]));
      const c3 = k === up.length - 1 ? c3out : 0;
      const leaves = w && k === up.length - 1;
      /* Down to the body we are circling: no `down` chain, so `w` is null
         above; the window is its own. */
      legs.push({
        label: leaves ? `Leave ${b} for ${down[0]}` : `Leave ${b}`,
        dv: Math.round(injectC3(v, c3)),
        kind: "transfer",
        body: b,
        /* The same radius `v` above was taken at: low orbit on the first rung
           of the climb, and the rung below's own orbit on every one after. */
        orbit: orbitAt(b, k === 0 ? lowR(b) : smaOf(up[k - 1])),
        ...(leaves ? { window: w, at: w.depart } : {}),
        ...(leaves && w.next
          ? {
              note: `A cheaper window follows, ${Math.round(w.total - w.next.total)} m/s less — the card under How to fly it has it`,
            }
          : {}),
      });
    });
  /* The window's mid-course plane change, where it flies one; a ballistic
     window pays its inclination in the excess above. */
  if (w && w.plane)
    legs.push({
      label:
        w.plane.deg >= 0.1
          ? `Plane change ${w.plane.deg.toFixed(1)}° mid-course`
          : "Plane change mid-course",
      dv: Math.round(w.plane.dv),
      kind: "plane",
      body: down[0],
      at: w.plane.at,
      /* Out on the transfer ellipse about the shared primary. `system` below
         says "Sun", which is wrong for a moon-to-moon window and is not this
         change's to fix; `common` is the centre either way. */
      orbit: orbitAt(common, (rO + rD) / 2),
      plane: {
        deg: w.plane.deg,
        system: "Sun",
        cheap: Math.round(w.plane.dv),
        costly: Math.round(w.plane.dv),
        rCostly: (rO + rD) / 2,
        rCheap: (rO + rD) / 2,
      },
    });

  down.forEach((b, k) => {
    const last = k === down.length - 1;
    const c3 = k === 0 ? c3in : 0;
    if (!last) {
      /* Passing through on the way to a moon: capture only just enough to be
         bound, with periapsis down at the moon's orbit. Circularising here and
         climbing back out again is what made a Jool trip look like 3 km/s. */
      const rp = smaOf(down[k + 1]),
        m2 = mu(b);
      const dv =
        Math.sqrt(Math.max(0, c3 + (2 * m2) / rp)) - Math.sqrt((2 * m2) / rp);
      legs.push({
        label: `Capture into ${b} system`,
        dv: Math.round(dv),
        kind: "capture",
        body: b,
        /* Periapsis is down at the moon's orbit, not at low orbit: that is the
           whole point of capturing only just enough to be bound. */
        orbit: orbitAt(b, rp),
      });
      const hh = hohmann(b, rp, rp); // already at the moon's radius
      void hh;
    } else if (!up.length && k === 0) {
      legs.push({
        label: w ? `Capture → low ${b} orbit` : `Circularise at ${b}`,
        dv: Math.round(w ? w.capture : h.in),
        kind: "capture",
        body: b,
        orbit: lowOrbit(b),
      });
    } else {
      legs.push({
        label: `Capture → low ${b} orbit`,
        dv: Math.round(injectC3(vCirc(b), c3)),
        kind: "capture",
        body: b,
        orbit: lowOrbit(b),
      });
    }
  });
  /* Dropping from a moon to the planet it orbits: the destination is the centre
     we are already circling, so the arrival burn is just the circularisation. */
  if (!down.length)
    legs.push({
      label: `Circularise at ${dest}`,
      dv: Math.round(h.in),
      kind: "capture",
      body: dest,
      orbit: lowOrbit(dest),
    });
  /* And the leg that leaves carries the drawing of it. The figures stay the
     Hohmann ones they were — this is a picture, not a re-pricing. #223 */
  if (t0 !== undefined && !down.length && up.length === 1) {
    const drop = findWindow(up[0], common, lowR(up[0]), lowR(common), t0, true);
    const leg = legs.find((l) => l.kind === "transfer" && l.body === up[0]);
    if (drop && leg) leg.window = drop;
  }
  return legs;
}

const gOf = (b: string) => (SYS[b] ? SYS[b].gee * G0 : 9.81);

/* Kerbin departures keep the tabulated map legs — they are what players check
   against and they have been validated end to end. Every other origin is built
   from Hohmann transfers through the body tree, which reproduces those same map
   figures to within about a percent. */
function computedLegs(origin: string, destName: string) {
  const dB = bodyKey(destName);
  if (!SYS[origin] || !dB || origin === dB) return [];
  const legs: Array<Leg> = [],
    o = SYS[origin],
    d = SYS[dB];
  if (o.ascent)
    legs.push({
      label: `${origin} surface → low orbit`,
      dv: o.ascent,
      kind: "ascent",
      body: origin,
      g: gOf(origin),
      atm: !!o.atm,
    });
  transferDv(origin, dB).forEach((l) => legs.push({ ...l, g: gOf(l.body) }));
  if (d.ascent && !d.noLand)
    legs.push({
      label: `Descent to ${dB} surface`,
      dv: d.ascent,
      kind: "land",
      body: dB,
      g: gOf(dB),
      atm: !!d.atm,
    });
  return legs;
}

/* ------------------------------ the mission model ------------------------------

   A mission is an endpoint to an endpoint: a body and a state at each end,
   and whether it comes back. The From end can be a body's surface, its low
   orbit or its stationary orbit; the To end those three or a fly-by. That is
   every mission there is, and it subsumes what the app used to spell three
   ways — a destination table, two pseudo-destinations for the origin's own
   orbits, and a "profile" that was really the arrival state. #188 */
type State = "surface" | "low" | "sync" | "flyby";
type Endpoint = { body: string; state: State };
const STATES: ReadonlyArray<State> = ["surface", "low", "sync", "flyby"];

/* Whether a pair of endpoints is a mission, and if not, why — the sentence
   the disabled chip carries, so the UI and the tests read one rule. */
/* The From end on its own, and the To end against it: the brief disables a
   state chip with the sentence, so each side answers for itself. */
function fromReason(from: Endpoint): true | string {
  const f = SYS[from.body];
  if (!f) return `${from.body} is not a body`;
  if (from.state === "flyby") return "A mission cannot start in a fly-by";
  if (from.state === "surface" && !f.ascent)
    return `${from.body} has no surface to start from`;
  if (from.state === "sync" && !hasSync(from.body))
    return `${from.body} has no stationary orbit`;
  return true;
}
function toReason(from: Endpoint, to: Endpoint): true | string {
  const t = SYS[to.body];
  if (!t) return `${to.body} is not a body`;
  if (to.state === "surface" && (!t.ascent || t.noLand))
    return `${to.body} has no surface to land on`;
  if (to.state === "sync" && !hasSync(to.body))
    return `${to.body} has no stationary orbit`;
  if (to.state === "flyby" && to.body === from.body)
    return `A fly-by of ${to.body} from ${to.body} is not a journey`;
  if (to.body === from.body && to.state === from.state)
    return "That is where the mission starts";
  return true;
}
function possible(from: Endpoint, to: Endpoint): true | string {
  const f = fromReason(from);
  return f === true ? toReason(from, to) : f;
}

/* The two legs between a body's low orbit and its stationary one, either
   way up: a Hohmann in the body's own field, labelled as the app always
   labelled its stationary-orbit destination. */
function syncLegs(b: string, up: boolean): Array<Leg> {
  const r2 = syncR(b);
  const h = hohmann(b, lowR(b), r2);
  const km = Math.round((r2 - SYS[b].R) / 1000).toLocaleString();
  return up
    ? [
        {
          label: `Raise apoapsis to ${km} km`,
          dv: Math.round(h.out),
          kind: "transfer",
          body: b,
          g: gOf(b),
          orbit: lowOrbit(b),
        },
        {
          label: "Circularise, one orbit per day",
          dv: Math.round(h.in),
          kind: "capture",
          body: b,
          g: gOf(b),
          orbit: syncOrbit(b),
        },
      ]
    : [
        {
          label: `Lower periapsis to low ${b} orbit`,
          dv: Math.round(h.in),
          kind: "transfer",
          body: b,
          g: gOf(b),
          orbit: syncOrbit(b),
        },
        {
          label: `Circularise in low ${b} orbit`,
          dv: Math.round(h.out),
          kind: "capture",
          body: b,
          g: gOf(b),
          orbit: lowOrbit(b),
        },
      ];
}

/* How a return arrives at its origin: an aerobrake where there is air over a
   surface one could stand on — Kerbol's atmosphere and Jool's are not places
   to shed speed, so a return to either is a capture. Every origin the app had
   before had a surface. */
const arrival = (b: string): Leg => {
  const air = !!(SYS[b].atm && SYS[b].ascent && !SYS[b].noLand);
  return {
    label: air ? `Aerobrake at ${b} (heat shield)` : `Capture at ${b}`,
    dv: air ? 0 : Math.round(vCirc(b) * 0.41),
    kind: "aero",
    body: b,
    g: gOf(b),
    free: air,
    ...(air ? {} : { orbit: lowOrbit(b) }),
  };
};

const ascentLeg = (b: string): Leg => ({
  label: `${b} surface → low orbit`,
  dv: SYS[b].ascent ?? 0,
  kind: "ascent",
  body: b,
  g: gOf(b),
  atm: !!SYS[b].atm,
});
const landLeg = (b: string): Leg => ({
  label: `Descent to ${b} surface`,
  dv: SYS[b].ascent ?? 0,
  kind: "land",
  body: b,
  g: gOf(b),
  atm: !!SYS[b].atm,
});

/* Kerbin departures keep the tabulated map legs — they are what players check
   against and they have been validated end to end. `DEST` is keyed by the
   destination's name, with Jool, which has no surface, as "Jool orbit". */
const tabulated = (body: string) =>
  DEST[body]
    ? DEST[body]
    : DEST[`${body} orbit`]
      ? DEST[`${body} orbit`]
      : null;

/* The legs of a mission from one endpoint to another. Every route the app
   built before this existed comes out of here leg for leg — test/routes.test.ts
   holds all 5,904 of them — and the endpoints the app could not express before
   (a start in orbit, an arrival in stationary orbit, Kerbol at either end) come
   out of the same arithmetic. */
function routeFor(
  from: Endpoint,
  to: Endpoint,
  chutes: boolean,
  returning: boolean,
  planeNow: boolean,
  t0?: number,
  stay = 0,
  transfer: TransferType = "best",
): Array<Leg> {
  if (possible(from, to) !== true) return [];
  const origin = from.body;

  /* Up to the From body's low orbit. */
  const climb: Array<Leg> = [];
  if (from.state === "surface") climb.push(ascentLeg(origin));
  else if (from.state === "sync") climb.push(...syncLegs(origin, false));

  /* The same body: no transfer, only what lies between the two states. */
  if (to.body === origin) {
    let legs = [...climb];
    if (to.state === "sync") legs.push(...syncLegs(origin, true));
    else if (to.state === "surface") legs.push(landLeg(origin));
    if (chutes)
      legs = legs.map((l) =>
        l.kind === "land" && l.atm
          ? { ...l, dv: Math.round(l.dv * 0.18), chuted: true }
          : l,
      );
    if (returning) {
      /* Back to where it began: down from stationary or off the surface,
         then the arrival every return has — the aerobrake where there is air
         over a surface, a capture where there is not — and up again to a
         stationary start. The landing itself is uncharged, as on every other
         return. */
      if (to.state === "sync") legs.push(...syncLegs(origin, false));
      else if (to.state === "surface")
        legs.push({
          ...ascentLeg(origin),
          kind: "ascentBack",
          label: `Ascent from ${origin} surface`,
        });
      if (from.state === "surface") legs.push(arrival(origin));
      else if (from.state === "sync") legs.push(...syncLegs(origin, true));
    }
    return withSpirals(legs);
  }

  /* Another body. From Kerbin's surface or low orbit the map's own legs; from
     anywhere else, Hohmann transfers through the body tree. Either way the
     base is the way to the To body's low orbit and, where it has one, its
     surface — the To state then keeps or drops the last of those. */
  /* With a start time, a transfer between planets is priced on its window,
     which the table cannot be; the table keeps Kerbin's own moons. */
  const table =
    origin === "Kerbin" &&
    from.state !== "sync" &&
    (t0 === undefined || chainOf(to.body).includes("Kerbin"))
      ? tabulated(to.body)
      : null;
  let base: Array<Leg>;
  if (table) {
    base = table.legs.map((l) => ({ ...l }));
    /* The table starts on the launchpad; a start in orbit is past that. */
    if (from.state !== "surface")
      base = base.filter((l) => l.kind !== "ascent");
    /* Out to one of Kerbin's own moons the table's figures stand — they are
       the community map's and are what players check against — but the leg
       gains the window it is flown on, for its date and its drawing. #223 */
    if (t0 !== undefined && SYS[to.body] && SYS[to.body].parent === origin) {
      const w = findWindow(
        origin,
        to.body,
        lowR(origin),
        lowR(to.body),
        t0,
        true,
      );
      const leg = base.find((l) => l.kind === "transfer" && l.body === to.body);
      if (w && leg) {
        leg.window = w;
        leg.at = w.depart;
      }
    }
  } else {
    const d = SYS[to.body];
    base = [...climb];
    transferDv(origin, to.body, t0, transfer).forEach((l) =>
      base.push({ ...l, g: gOf(l.body) }),
    );
    if (d.ascent && !d.noLand) base.push(landLeg(to.body));
  }
  if (!base.length) return [];

  /* Inclination is charged as its own leg, placed just before capture, because
     unlike everything else in the budget its cost is set by when you burn it
     rather than how much you need. A window has already paid the Sun-level
     one, in the excess or mid-course, so only the moons' remain. */
  const windowed = base.some((l) => l.window);
  const pcs = planeChanges(origin, to.body).filter(
    (pc) => !(windowed && pc.system === "Sun"),
  );
  if (pcs.length) {
    const at = base.findIndex((l) => l.kind === "capture");
    const rows: Array<Leg> = pcs.map((pc) => ({
      label: `Plane change ${pc.deg.toFixed(1)}° in the ${pc.system} system`,
      /* "Burn it at apoapsis" was misleading: arrive uncorrected and you are
         thousands of kilometres off the target's plane, far outside its sphere of
         influence, so there is nothing to arrive at. What actually happens is
         that you never leave the equatorial plane — you time the ejection so the
         encounter falls on the target's ascending or descending node, where the
         two orbits already cross. The few m/s is the residual trim near apoapsis
         once the encounter is visible, not a plane rotation. */
      /* Two clocks have to line up: the target must be at a node when you get
         there, and you must be at the right point in the parking orbit to leave.
         The second is easy — a low orbit comes round every half hour against a
         transfer measured in days, so there are hundreds of chances per node
         crossing and you are never more than a quarter of an orbit from one.
         What that leaves is a small along-track error, which is what the trim
         actually pays for. */
      note: planeNow
        ? `burn it out of low orbit and leave whenever you like — ${pc.costly} m/s ` +
          `against ${pc.cheap} m/s if you wait for a node instead`
        : pc.cheap < pc.costly
          ? `the target crosses your plane at two nodes; aim the encounter at one. ` +
            `Leave one transfer time before it gets there — the parking orbit comes ` +
            `round every half hour, so the departure point is never the binding ` +
            `constraint. ${pc.cheap} m/s trims what is left near apoapsis, against ` +
            `${pc.costly} m/s to match planes in low orbit instead`
          : `${pc.cheap} m/s; cheaper from a high elliptical orbit if you can wait for the node`,
      /* Two ways to pay for inclination, and which one you want depends on
         whether you have a launch window to wait for. Node timing is nearly free
         but ties departure to the target's schedule; burning it out of low orbit
         costs many times more and goes whenever you like. */
      dv: planeNow ? pc.costly : pc.cheap,
      planeNow,
      cheap: pc.cheap,
      costly: pc.costly,
      kind: "plane",
      body: to.body,
      g: gOf(to.body),
      plane: pc,
      /* Whichever of the two prices this row is flying, taken at the radius
         that price was quoted at: low orbit when it goes now, apoapsis when it
         waits for a node. */
      orbit: orbitAt(pc.system, planeNow ? pc.rCostly : pc.rCheap),
    }));
    base.splice(at < 0 ? base.length : at, 0, ...rows);
  }
  let legs = base;

  /* The To state: a fly-by never captures, an orbit never lands, and a
     stationary orbit climbs on from the low one. */
  if (to.state === "flyby")
    legs = legs.filter((l) => l.kind !== "capture" && l.kind !== "land");
  else if (to.state !== "surface") legs = legs.filter((l) => l.kind !== "land");
  if (to.state === "sync") legs = legs.concat(syncLegs(to.body, true));

  // Parachutes / aerobraking credit on descent through an atmosphere.
  if (chutes)
    legs = legs.map((l) =>
      l.kind === "land" && l.atm
        ? { ...l, dv: Math.round(l.dv * 0.18), chuted: true }
        : l,
    );

  /* Coming home is independent of how far in you went. What it costs depends on
     where you stopped: off the surface you must climb back to orbit, out of orbit
     you must break the capture burn again, and after a flyby you were never bound
     in the first place, so there is nothing to undo. */
  if (returning) {
    const land = base.find((l) => l.kind === "land");
    const capLeg = base.find((l) => l.kind === "capture");
    /* The window the way home is searched from — an interplanetary one.
       A moon of the origin gets a window for its date and its drawing
       (#223), but the way back from one is the tabulated mirror it always
       was: letting a Mun window pick the computed return here quietly
       changed the default mission's total by 549 m/s, which is a solver
       change and not a drawing one. */
    const out = base.find(
      (l) => l.window && SYS[l.window.to]?.parent !== origin,
    )?.window;
    /* When the way home may start: after the outward flight has landed and
       the stay is served. Every return window is searched from here — one
       that leaves before it has arrived is not a return. */
    const outward = base.find((l) => l.window)?.window;
    const homeFrom = outward ? outward.arrive + stay : (t0 ?? 0);
    const back: Array<Leg> = [];
    if (to.state === "sync") back.push(...syncLegs(to.body, false));
    if (to.state === "surface" && land)
      back.push({
        label: `Ascent from ${land.body} surface`,
        dv: land.dv,
        kind: "ascentBack",
        body: land.body,
        g: land.g,
      });
    if (out && to.state !== "flyby") {
      /* Home on its own window, searched from the arrival plus the stay:
         the same chain walked the other way, whose first leg is the escape
         from the parking orbit and whose capture the arrival below already
         is. */
      transferDv(to.body, origin, out.arrive + stay, transfer)
        .filter((l) => l.kind !== "capture")
        .forEach((l) => back.push({ ...l, g: gOf(l.body) }));
    } else {
      if ((to.state === "low" || to.state === "sync") && capLeg)
        back.push({
          label: `Escape ${capLeg.body} orbit`,
          dv: capLeg.dv,
          kind: "transfer",
          body: capLeg.body,
          g: capLeg.g,
          /* Undoing the capture, so it is burnt where the capture was — which
             for a stationary arrival is nowhere near the low orbit a rule
             from `kind` would have assumed. */
          ...(capLeg.orbit ? { orbit: capLeg.orbit } : {}),
        });
      const home = base
        .filter((l) => l.kind === "transfer" || l.kind === "plane")
        .reduce((s, l) => s + l.dv, 0);
      /* Coming home from a moon of the origin, the leg gains the window it
         is flown on — where in the moon's orbit to burn, and the way down —
         while keeping the tabulated figure it has always carried.

         Searched from the arrival plus the stay, never from the mission's
         own start: a return that leaves before it has got there is not a
         return. It showed on Gilly, whose eccentric orbit is the one case
         where this window carries a date at all — arriving Y1 D23 and
         leaving Y1 D7. #223 */
      const down =
        t0 !== undefined && SYS[to.body] && SYS[to.body].parent === origin
          ? findWindow(
              to.body,
              origin,
              lowR(to.body),
              lowR(origin),
              homeFrom,
              true,
            )
          : null;
      back.push({
        label: `Return transfer to ${origin}`,
        dv: home,
        kind: "transfer",
        body: origin,
        g: gOf(origin),
        ...(down ? { window: down } : {}),
        /* Named for where it is going and burnt where it is leaving: out of
           the low orbit of the body being departed, which is where the leg
           above has just put the craft. */
        orbit: lowOrbit(to.body),
      });
    }
    back.push(arrival(origin));
    /* A start in stationary orbit climbs back up to it. A start on the
       surface ends where the app always ended a return: captured, with the
       landing itself uncharged — through air it is the aerobrake, and on an
       airless body it never was charged. */
    if (from.state === "sync") back.push(...syncLegs(origin, true));
    legs = legs.concat(back);
  }
  return withSpirals(legs);
}

/* The app's old way of asking — a destination name, a profile, an origin —
   mapped onto the endpoints. Kept so every caller and every saved
   configuration still works, and so test/routes.test.ts can hold the new
   builder to the old routes. */
function endpointsOf(destName: string, profile: string, origin: string) {
  const from: Endpoint = { body: origin, state: "surface" };
  if (destName === "Low orbit")
    return { from, to: { body: origin, state: "low" } as Endpoint };
  if (destName === "Stationary orbit")
    return { from, to: { body: origin, state: "sync" } as Endpoint };
  const body = bodyKey(destName);
  if (!body) return null;
  const canLand = !!SYS[body].ascent && !SYS[body].noLand;
  const state: State =
    destName === "Keostationary orbit"
      ? "sync"
      : profile === "flyby"
        ? "flyby"
        : profile === "land" && canLand
          ? "surface"
          : "low";
  return { from, to: { body, state } };
}

/* ------------------- a stage's slice of the route, leg by leg -------------------

   A stage is given a contiguous slice of the group's Δv, and the slice is not
   cut on leg boundaries: the shares are chosen by the search, so a stage takes
   whatever legs its slice lands on and often only part of them. Three shapes
   come out of that, and a burn is priced differently in each:

   - one stage, one leg — `first && last`, and the stage flies the whole of it;
   - several stages sharing one leg — each gets a part, and they burn one after
     another, so the arcs they sweep run on from each other;
   - one stage, several legs — several burns in several orbits, which is the
     case the single `burn` figure in `solveStage` cannot express at all: on
     Mun 12 t a 392 s Nerv stage is 31 s of transfer, 79 s of capture, 155 s of
     descent and 113 s of climbing back out.

   `scale` is what the budget was multiplied by on the way in — the margin —
   so the caller can hand over the raw legs and its own slice bounds. #418 */
type BurnPortion = {
  leg: Leg;
  /* What this slice flies of the leg, and what the whole leg is, both scaled. */
  dv: number;
  legDv: number;
  /* Whether this slice opens the leg and whether it closes it. Both true is a
     leg flown whole; either false and another stage flies the rest. */
  first: boolean;
  last: boolean;
};

function burnPortions(
  legs: ReadonlyArray<Leg>,
  lo: number,
  hi: number,
  scale = 1,
): Array<BurnPortion> {
  const out: Array<BurnPortion> = [];
  const eps = 1e-9;
  let start = 0;
  for (const leg of legs) {
    const legDv = leg.dv * scale;
    const end = start + legDv;
    const a = Math.max(lo, start);
    const b = Math.min(hi, end);
    if (b - a > eps)
      out.push({
        leg,
        dv: b - a,
        legDv,
        first: a <= start + eps,
        last: b >= end - eps,
      });
    start = end;
  }
  return out;
}

function buildRoute(
  destName: string,
  profile: string,
  chutes: boolean,
  origin = "Kerbin",
  returning = false,
  planeNow = false,
): Array<Leg> {
  const e = endpointsOf(destName, profile, origin);
  if (!e) return [];
  /* The origin's own orbits never had a return leg; a return to where you
     already are is the new model's to give. */
  const same = destName === "Low orbit" || destName === "Stationary orbit";
  return routeFor(e.from, e.to, chutes, same ? false : returning, planeNow);
}

/* No cuts to begin with: the whole mission is solved as one span and the stage
   count is found automatically. Cuts are the user's tool for saying "this part
   flies on its own hardware", not something to presume. */
function defaultCuts() {
  return new Set<number>();
}

export {
  ASCENT,
  DEST,
  ESCAPE,
  PROFILES,
  RAD,
  SYS,
  bodyKey,
  buildRoute,
  burnPortions,
  chainOf,
  computedLegs,
  defaultCuts,
  endpointsOf,
  fromReason,
  gOf,
  hasSync,
  hohmann,
  inject,
  lowAlt,
  lowOrbit,
  lowR,
  mu,
  omegaAt,
  omegaOf,
  planeChanges,
  possible,
  relInc,
  routeFor,
  soiR,
  spiralOf,
  STATES,
  syncR,
  toReason,
  transferDv,
  vCirc,
};
export type {
  BurnOrbit,
  BurnPortion,
  Dest,
  Endpoint,
  Leg,
  LegKind,
  PlaneChange,
  Profile,
  State,
  SysBody,
};
