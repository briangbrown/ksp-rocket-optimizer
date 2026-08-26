import bodiesData from "../data/bodies.json";
import { G0 } from "./constants.js";

/* ------------------------------- destinations -------------------------------
   Each destination is an ordered list of legs from the Kerbin launchpad, matching
   the community delta-v map. kind drives what each mission profile keeps.
   g = local surface gravity used for landing/ascent TWR checks.               */
const ASCENT = {
  label: "Launchpad → 80 km orbit",
  dv: 3400,
  kind: "ascent",
  body: "Kerbin",
  g: 9.81,
  atm: true,
};
const ESCAPE = {
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
const DEST = {
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

const PROFILES = bodiesData.PROFILES;

/* Build the leg list for a destination + profile, including return legs. */
/* Stock system, from the Kopernicus dump. mu = geeASL*g0*R^2.
   ascent = surface <-> low orbit, the one figure worth keeping tabulated
   because it is dominated by drag and gravity losses, not orbital mechanics. */
const SYS = bodiesData.SYS;
const mu = (b) => SYS[b].gee * G0 * SYS[b].R ** 2;
const lowAlt = (b) => (SYS[b].atm ? SYS[b].atm + 10000 : 10000);
const lowR = (b) => SYS[b].R + lowAlt(b);
const vCirc = (b) => Math.sqrt(mu(b) / lowR(b));
/* Synchronous orbit: the radius whose period matches the body's own rotation.
   It only exists if it clears the atmosphere and still sits inside the sphere of
   influence — which is why no tidally locked moon has one, since its synchronous
   radius is its own orbit around the planet. */
const syncR = (b) =>
  Math.cbrt((mu(b) * SYS[b].rot * SYS[b].rot) / (4 * Math.PI * Math.PI));
const soiR = (b) =>
  (SYS[b].parent && SYS[SYS[b].parent].sma !== undefined) || SYS[b].parent
    ? SYS[b].sma * Math.pow(mu(b) / mu(SYS[b].parent), 0.4)
    : Infinity;
function hasSync(b) {
  if (!SYS[b] || !SYS[b].rot) return false;
  const r = syncR(b);
  return r > SYS[b].R + (SYS[b].atm || 0) + 5000 && r < soiR(b) * 0.9;
}
const chainOf = (b) => {
  const c = [];
  for (let x = b; x; x = SYS[x].parent) c.push(x);
  return c;
};

/* Hohmann between two circular orbits around `centre`; returns the hyperbolic
   excess needed at each end. */
function hohmann(centre, r1, r2) {
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
const inject = (v, vinf) => Math.sqrt(2 * v * v + vinf * vinf) - v;

const RAD = Math.PI / 180;
/* Destination labels are not always body names: DEST offers "Jool orbit",
   "Low Kerbin Orbit" and "Keostationary orbit". Resolve to a real body, or null
   when the target is just an orbit and no plane change applies. */
function bodyKey(name) {
  if (SYS[name]) return name;
  return Object.keys(SYS).find((b) => name.startsWith(b + " ")) || null;
}
/* Relative inclination between two orbits about the same primary. With both
   inclinations and ascending nodes known this is exact rather than |i1-i2|. */
function relInc(a, b) {
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
function planeChanges(origin, dest) {
  const oB = bodyKey(origin),
    dB = bodyKey(dest);
  if (!oB || !dB || oB === dB) return [];
  const co = chainOf(oB),
    cd = chainOf(dB);
  const common = co.find((b) => cd.includes(b));
  const up = co.slice(0, co.indexOf(common));
  const down = cd.slice(0, cd.indexOf(common)).reverse();
  const out = [];
  const add = (deg, v, system, cheapV) => {
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
    add(SYS[b].inc || 0, Math.sqrt(mu(up[k + 1]) / SYS[b].sma), up[k + 1]);
  });

  // the main one, at the level both bodies share
  const upEnd = up.length ? up[up.length - 1] : oB;
  const dnEnd = down.length ? down[0] : dB;
  if (upEnd !== dnEnd) {
    const r1 = up.length ? SYS[upEnd].sma : lowR(oB);
    const r2 = down.length ? SYS[dnEnd].sma : lowR(dB);
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
    add(SYS[next].inc || 0, Math.sqrt(mu(b) / SYS[next].sma), b);
  });
  return out;
}

function transferDv(origin, dest) {
  const co = chainOf(origin),
    cd = chainOf(dest);
  const common = co.find((b) => cd.includes(b));
  const up = co.slice(0, co.indexOf(common));
  const down = cd.slice(0, cd.indexOf(common)).reverse();
  const rO = up.length ? SYS[up[up.length - 1]].sma : lowR(origin);
  const rD = down.length ? SYS[down[0]].sma : lowR(dest);
  const h = hohmann(common, rO, rD);
  const legs = [];
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
      const v = k === 0 ? vCirc(b) : Math.sqrt(mu(b) / SYS[up[k - 1]].sma);
      const vinf = k === up.length - 1 ? h.out : 0;
      legs.push({
        label: `Leave ${b}`,
        dv: Math.round(inject(v, vinf)),
        kind: "transfer",
        body: b,
      });
    });

  down.forEach((b, k) => {
    const last = k === down.length - 1;
    const vinf = k === 0 ? h.in : 0;
    if (!last) {
      /* Passing through on the way to a moon: capture only just enough to be
         bound, with periapsis down at the moon's orbit. Circularising here and
         climbing back out again is what made a Jool trip look like 3 km/s. */
      const rp = SYS[down[k + 1]].sma,
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

const gOf = (b) => (SYS[b] ? SYS[b].gee * G0 : 9.81);

/* Kerbin departures keep the tabulated map legs — they are what players check
   against and they have been validated end to end. Every other origin is built
   from Hohmann transfers through the body tree, which reproduces those same map
   figures to within about a percent. */
function computedLegs(origin, destName) {
  const dB = bodyKey(destName);
  if (!SYS[origin] || !dB || origin === dB) return [];
  const legs = [],
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

function buildRoute(
  destName,
  profile,
  chutes,
  origin = "Kerbin",
  returning = false,
  planeNow = false,
) {
  if (destName === "Low orbit" || destName === "Stationary orbit") {
    if (!SYS[origin] || !SYS[origin].ascent) return [];
    const legs = [
      {
        label: `${origin} surface → low orbit`,
        dv: SYS[origin].ascent,
        kind: "ascent",
        body: origin,
        g: gOf(origin),
        atm: !!SYS[origin].atm,
      },
    ];
    if (destName === "Stationary orbit" && hasSync(origin)) {
      const r2 = syncR(origin),
        h = hohmann(origin, lowR(origin), r2);
      legs.push({
        label: `Raise apoapsis to ${Math.round((r2 - SYS[origin].R) / 1000).toLocaleString()} km`,
        dv: Math.round(h.out),
        kind: "transfer",
        body: origin,
        g: gOf(origin),
      });
      legs.push({
        label: "Circularise, one orbit per day",
        dv: Math.round(h.in),
        kind: "capture",
        body: origin,
        g: gOf(origin),
      });
    }
    return legs;
  }
  const base =
    origin === "Kerbin" && DEST[destName]
      ? DEST[destName].legs.map((l) => ({ ...l }))
      : computedLegs(origin, destName);
  if (!base.length) return [];

  /* Inclination is charged as its own leg, placed just before capture, because
     unlike everything else in the budget its cost is set by when you burn it
     rather than how much you need. */
  const pcs = planeChanges(origin, destName);
  if (pcs.length) {
    const at = base.findIndex((l) => l.kind === "capture");
    const rows = pcs.map((pc) => ({
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
      body: bodyKey(destName) || origin,
      g: gOf(bodyKey(destName) || origin),
      plane: pc,
    }));
    base.splice(at < 0 ? base.length : at, 0, ...rows);
  }
  let legs = base;

  if (profile === "flyby")
    legs = legs.filter((l) => l.kind !== "capture" && l.kind !== "land");
  else if (profile === "orbit") legs = legs.filter((l) => l.kind !== "land");

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
    const landLeg = base.find((l) => l.kind === "land");
    const capLeg = base.find((l) => l.kind === "capture");
    const back = [];
    if (profile === "land" && landLeg)
      back.push({
        label: `Ascent from ${landLeg.body} surface`,
        dv: landLeg.dv,
        kind: "ascentBack",
        body: landLeg.body,
        g: landLeg.g,
      });
    else if (profile === "orbit" && capLeg)
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
    back.push({
      label:
        SYS[origin] && SYS[origin].atm
          ? `Aerobrake at ${origin} (heat shield)`
          : `Capture at ${origin}`,
      dv: SYS[origin] && SYS[origin].atm ? 0 : Math.round(vCirc(origin) * 0.41),
      kind: "aero",
      body: origin,
      g: gOf(origin),
      free: !!(SYS[origin] && SYS[origin].atm),
    });
    legs = legs.concat(back);
  }
  return legs;
}

function defaultCuts() {
  return new Set();
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
  gOf,
  hasSync,
  hohmann,
  inject,
  lowAlt,
  lowR,
  mu,
  planeChanges,
  relInc,
  soiR,
  syncR,
  transferDv,
  vCirc,
};
