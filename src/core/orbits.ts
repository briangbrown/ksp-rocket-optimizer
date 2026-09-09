import bodiesData from "../data/bodies.json";
import { findWindow } from "./transfer.js";
import type { Window } from "./transfer.js";
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
        g: 9.81,
      },
      {
        label: "Circularize at 2 868 km",
        dv: 1030,
        kind: "capture",
        body: "Kerbin",
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
        g: 1.63,
      },
      {
        label: "Capture → low Mun orbit",
        dv: 280,
        kind: "capture",
        body: "Mun",
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
        g: 0.491,
      },
      {
        label: "Capture → low Minmus orbit",
        dv: 160,
        kind: "capture",
        body: "Minmus",
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
        g: 2.94,
      },
      {
        label: "Capture → low Duna orbit",
        dv: 250,
        kind: "capture",
        body: "Duna",
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
        g: 2.94,
      },
      {
        label: "Duna capture",
        dv: 250,
        kind: "capture",
        body: "Duna",
        g: 2.94,
      },
      {
        label: "Duna orbit → Ike intercept",
        dv: 30,
        kind: "transfer",
        body: "Ike",
        g: 1.1,
      },
      {
        label: "Capture → low Ike orbit",
        dv: 180,
        kind: "capture",
        body: "Ike",
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
        g: 16.7,
      },
      {
        label: "Capture → low Eve orbit",
        dv: 1330,
        kind: "capture",
        body: "Eve",
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
        g: 16.7,
      },
      { label: "Eve capture", dv: 80, kind: "capture", body: "Eve", g: 16.7 },
      {
        label: "Eve orbit → Gilly intercept",
        dv: 60,
        kind: "transfer",
        body: "Gilly",
        g: 0.049,
      },
      {
        label: "Capture → low Gilly orbit",
        dv: 410,
        kind: "capture",
        body: "Gilly",
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
        g: 2.7,
      },
      {
        label: "Capture → low Moho orbit",
        dv: 2410,
        kind: "capture",
        body: "Moho",
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
        g: 1.13,
      },
      {
        label: "Capture → low Dres orbit",
        dv: 1290,
        kind: "capture",
        body: "Dres",
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
        g: 7.85,
      },
      {
        label: "Capture into Jool orbit",
        dv: 160,
        kind: "capture",
        body: "Jool",
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
        g: 7.85,
      },
      {
        label: "Jool capture",
        dv: 160,
        kind: "capture",
        body: "Jool",
        g: 7.85,
      },
      {
        label: "Jool orbit → Laythe intercept",
        dv: 930,
        kind: "transfer",
        body: "Laythe",
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
        g: 7.85,
      },
      {
        label: "Jool capture",
        dv: 160,
        kind: "capture",
        body: "Jool",
        g: 7.85,
      },
      {
        label: "Jool orbit → Tylo intercept",
        dv: 400,
        kind: "transfer",
        body: "Tylo",
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
        g: 7.85,
      },
      {
        label: "Jool capture",
        dv: 160,
        kind: "capture",
        body: "Jool",
        g: 7.85,
      },
      {
        label: "Jool orbit → Vall intercept",
        dv: 620,
        kind: "transfer",
        body: "Vall",
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
        g: 7.85,
      },
      {
        label: "Jool capture",
        dv: 160,
        kind: "capture",
        body: "Jool",
        g: 7.85,
      },
      {
        label: "Jool orbit → Pol intercept",
        dv: 160,
        kind: "transfer",
        body: "Pol",
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
        g: 1.69,
      },
      {
        label: "Capture → low Eeloo orbit",
        dv: 1370,
        kind: "capture",
        body: "Eeloo",
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
/* Synchronous orbit: the radius whose period matches the body's own rotation.
   It only exists if it clears the atmosphere and still sits inside the sphere of
   influence — which is why no tidally locked moon has one, since its synchronous
   radius is its own orbit around the planet. */
const syncR = (b: string) =>
  Math.cbrt((mu(b) * rotOf(b) * rotOf(b)) / (4 * Math.PI * Math.PI));
/* The test used to read `(parent && SYS[parent].sma !== undefined) || parent`,
   whose second half makes the first dead: whenever there is a parent the whole
   disjunction is true regardless. What is left is the parent alone, which is
   the real question — a body with nothing to orbit has no sphere of influence
   to be bounded by. */
const soiR = (b: string) => {
  const p = SYS[b].parent;
  return p ? smaOf(b) * Math.pow(mu(b) / mu(p), 0.4) : Infinity;
};
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
  const add = (deg: number, v: number, system: string, cheapV?: number) => {
    if (deg < 0.15) return;
    const half = Math.sin((deg / 2) * RAD);
    out.push({
      deg,
      system,
      cheap: Math.round(2 * (cheapV ?? v) * half),
      costly: Math.round(2 * v * half),
    });
  };

  // shedding the origin's own inclination on the way out
  up.forEach((b, k) => {
    if (k === up.length - 1) return;
    add(SYS[b].inc || 0, Math.sqrt(mu(up[k + 1]) / smaOf(b)), up[k + 1]);
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
      Math.sqrt(m * (2 / Math.max(r1, r2) - 1 / at)),
    );
  }

  // and matching each moon's plane on the way down
  down.forEach((b, k) => {
    const next = down[k + 1];
    if (!next) return;
    add(SYS[next].inc || 0, Math.sqrt(mu(b) / smaOf(next)), b);
  });
  return out;
}

function transferDv(origin: string, dest: string, t0?: number) {
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
  const w =
    t0 !== undefined && common === "Sun" && up.length && down.length
      ? findWindow(
          up[up.length - 1],
          down[0],
          up.length > 1 ? smaOf(up[up.length - 2]) : lowR(up[0]),
          down.length > 1 ? smaOf(down[1]) : lowR(down[0]),
          t0,
          true,
        )
      : null;
  if (w) {
    h.out = w.vinfOut;
    h.in = w.vinfIn;
  }
  const legs: Array<Leg> = [];
  /* Staying inside one system means no SOI to climb out of, so the Hohmann burn
     is the whole cost — running it through inject() would charge escape velocity
     on top and inflate a Mun trip by a quarter. */
  if (!up.length) {
    legs.push({
      label: `Low ${origin} orbit → ${dest} transfer`,
      dv: Math.round(h.out),
      kind: "transfer",
      body: dest,
    });
  } else
    up.forEach((b, k) => {
      const v = k === 0 ? vCirc(b) : Math.sqrt(mu(b) / smaOf(up[k - 1]));
      const vinf = k === up.length - 1 ? h.out : 0;
      const leaves = w && k === up.length - 1;
      legs.push({
        label: leaves ? `Leave ${b} for ${down[0]}` : `Leave ${b}`,
        dv: Math.round(inject(v, vinf)),
        kind: "transfer",
        body: b,
        ...(leaves ? { window: w, at: w.depart } : {}),
      });
    });
  /* The window's mid-course plane change, where it flies one; a ballistic
     window pays its inclination in the excess above. */
  if (w && w.plane)
    legs.push({
      label: `Plane change ${w.plane.deg.toFixed(1)}° mid-course`,
      dv: Math.round(w.plane.dv),
      kind: "plane",
      body: down[0],
      at: w.plane.at,
      plane: {
        deg: w.plane.deg,
        system: "Sun",
        cheap: Math.round(w.plane.dv),
        costly: Math.round(w.plane.dv),
      },
    });

  down.forEach((b, k) => {
    const last = k === down.length - 1;
    const vinf = k === 0 ? h.in : 0;
    if (!last) {
      /* Passing through on the way to a moon: capture only just enough to be
         bound, with periapsis down at the moon's orbit. Circularising here and
         climbing back out again is what made a Jool trip look like 3 km/s. */
      const rp = smaOf(down[k + 1]),
        m2 = mu(b);
      const dv =
        Math.sqrt(vinf * vinf + (2 * m2) / rp) - Math.sqrt((2 * m2) / rp);
      legs.push({
        label: `Capture into ${b} system`,
        dv: Math.round(dv),
        kind: "capture",
        body: b,
      });
      const hh = hohmann(b, rp, rp); // already at the moon's radius
      void hh;
    } else if (!up.length && k === 0) {
      legs.push({
        label: `Circularise at ${b}`,
        dv: Math.round(h.in),
        kind: "capture",
        body: b,
      });
    } else {
      legs.push({
        label: `Capture → low ${b} orbit`,
        dv: Math.round(inject(vCirc(b), vinf)),
        kind: "capture",
        body: b,
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
    });
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
        },
        {
          label: "Circularise, one orbit per day",
          dv: Math.round(h.in),
          kind: "capture",
          body: b,
          g: gOf(b),
        },
      ]
    : [
        {
          label: `Lower periapsis to low ${b} orbit`,
          dv: Math.round(h.in),
          kind: "transfer",
          body: b,
          g: gOf(b),
        },
        {
          label: `Circularise in low ${b} orbit`,
          dv: Math.round(h.out),
          kind: "capture",
          body: b,
          g: gOf(b),
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
    return legs;
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
  } else {
    const d = SYS[to.body];
    base = [...climb];
    transferDv(origin, to.body, t0).forEach((l) =>
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
    const out = base.find((l) => l.window)?.window;
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
      transferDv(to.body, origin, out.arrive + stay)
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
        });
      const home = base
        .filter((l) => l.kind === "transfer" || l.kind === "plane")
        .reduce((s, l) => s + l.dv, 0);
      back.push({
        label: `Return transfer to ${origin}`,
        dv: home,
        kind: "transfer",
        body: origin,
        g: gOf(origin),
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
  return legs;
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
  lowR,
  mu,
  planeChanges,
  possible,
  relInc,
  routeFor,
  soiR,
  STATES,
  syncR,
  toReason,
  transferDv,
  vCirc,
};
export type {
  Dest,
  Endpoint,
  Leg,
  LegKind,
  PlaneChange,
  Profile,
  State,
  SysBody,
};
