import { describe, it, expect } from "vitest";
import {
  DAY,
  YEAR,
  elements,
  kerbalDate,
  mu,
  norm,
  periodOf,
  stateAt,
  sub,
  utOf,
} from "../src/core/kepler.js";
import { must } from "./must.js";
import { lambert } from "../src/core/lambert.js";
import { findWindow, priceColumns } from "../src/core/transfer.js";
import { SYS, routeFor } from "../src/core/orbits.js";

/* The transfer window (#197): an ephemeris on the stock elements, a Lambert
   solver, and a porkchop search that finds the first window from a start
   time and prices its burns. Held to what is known: Kerbin's own year, a
   Kepler orbit's own velocities, and the numbers every launch-window tool
   gives for the classic Kerbin departures. */

const rK = 680_000; // Kerbin's 80 km parking orbit
const rD = 380_000; // Duna's 60 km

describe("the ephemeris", () => {
  it("runs on the game's clock and Kerbin's own year", () => {
    /* 9,203,544.6 s is the sidereal year the wiki gives; the calendar's 426
       days are 45,145 s short of it, which is why dates and orbits are
       kept apart. */
    expect(periodOf("Kerbin")).toBeCloseTo(9_203_544.6, 0);
    expect(YEAR).toBe(426 * DAY);
    expect(kerbalDate(0)).toEqual({ year: 1, day: 1, h: 0, m: 0, s: 0 });
    expect(kerbalDate(utOf(3, 235, 4, 12, 7))).toEqual({
      year: 3,
      day: 235,
      h: 4,
      m: 12,
      s: 7,
    });
  });
  it("puts the planets where their elements say at epoch", () => {
    /* Every stock planet starts at mean anomaly 3.14 — opposite its
       periapsis — so at UT 0 Kerbin is at 180° and Duna at its node plus
       180°, and the phase angle between them is Duna's node, 135.5°. */
    const ang = (b: string, t: number) => {
      const r = stateAt(b, t).r;
      return ((Math.atan2(r[1], r[0]) * 180) / Math.PI + 360) % 360;
    };
    expect(ang("Kerbin", 0)).toBeCloseTo(180, 0);
    expect(((ang("Duna", 0) - ang("Kerbin", 0) + 360) % 360).toFixed(1)).toBe(
      "135.5",
    );
    /* A circular orbit at Kerbin's distance moves at 9,285 m/s. */
    expect(norm(stateAt("Kerbin", 0).v)).toBeCloseTo(9285, -1);
    /* And a full period later it is back. */
    const T = periodOf("Kerbin");
    expect(
      norm(sub(stateAt("Kerbin", T).r, stateAt("Kerbin", 0).r)),
    ).toBeLessThan(100);
  });
});

describe("the Lambert solver", () => {
  it("returns a Kepler orbit's own velocities between two of its points", () => {
    /* Eeloo, the most eccentric planet: two points a third of a period
       apart must be joined by Eeloo's own orbit, so the departure and
       arrival velocities are the ephemeris's to a millimetre a second. */
    const T = periodOf("Eeloo");
    for (const [t1, frac] of [
      [1e6, 0.3],
      [5e7, 0.45],
      [2e7, 0.1],
    ] as const) {
      const s1 = stateAt("Eeloo", t1);
      const s2 = stateAt("Eeloo", t1 + frac * T);
      const l = lambert(mu("Sun"), s1.r, s2.r, frac * T);
      expect(l).not.toBeNull();
      expect(norm(sub(l!.v1, s1.v))).toBeLessThan(1e-3);
      expect(norm(sub(l!.v2, s2.v))).toBeLessThan(1e-3);
    }
  });
  it("tends to the Hohmann transfer as the arc tends to a half-orbit", () => {
    const m = mu("Sun");
    const a1 = 13_599_840_256,
      a2 = 20_726_155_264;
    const th = Math.PI * Math.sqrt(((a1 + a2) / 2) ** 3 / m);
    const l = lambert(
      m,
      [a1, 0, 0],
      [-a2 * Math.cos(1e-3), a2 * Math.sin(1e-3), 0],
      th,
    )!;
    const vh = Math.sqrt(m * (2 / a1 - 2 / (a1 + a2)));
    expect(norm(l.v1)).toBeCloseTo(vh, -1);
  });
});

describe("the window search", () => {
  it("finds the classic Duna departure from a new save", () => {
    /* What every launch-window tool says for Kerbin → Duna from Year 1
       Day 1: leave in the 230s, about a thousand m/s from low orbit,
       a hundred and fifty degrees round from prograde, the phase angle in
       the forties, nine months in flight. */
    const w = findWindow("Kerbin", "Duna", rK, rD, 0, true)!;
    expect(w).not.toBeNull();
    const d = kerbalDate(w.depart);
    expect(d.year).toBe(1);
    expect(d.day).toBeGreaterThanOrEqual(225);
    expect(d.day).toBeLessThanOrEqual(240);
    expect(w.eject).toBeGreaterThan(1000);
    expect(w.eject).toBeLessThan(1100);
    expect(w.capture).toBeGreaterThan(600);
    expect(w.capture).toBeLessThan(700);
    expect(w.ref).toBe("prograde");
    expect(w.angle).toBeGreaterThan(145);
    expect(w.angle).toBeLessThan(160);
    expect(w.phase).toBeGreaterThan(35);
    expect(w.phase).toBeLessThan(48);
    expect(w.tof / DAY).toBeGreaterThan(250);
    expect(w.tof / DAY).toBeLessThan(300);
    expect(w.arrive).toBe(w.depart + w.tof);
    expect(w.eject).toBeCloseTo(Math.hypot(w.ejectPro, w.ejectNor), 6);
    expect(Math.abs(w.ejectNor)).toBeLessThan(30);
    /* Everything the drawing needs is there and finite. */
    expect(w.arc.length).toBeGreaterThan(10);
    for (const p of [...w.arc, w.r1, w.r2, w.r2dep, w.vDir, w.burnDir])
      for (const x of p) expect(isFinite(x)).toBe(true);
  });
  it("goes inward to Eve from retrograde, and out to Jool and Moho", () => {
    const eve = findWindow("Kerbin", "Eve", rK, 800_000, 0, true)!;
    expect(eve.ref).toBe("retrograde");
    expect(eve.eject).toBeGreaterThan(1000);
    expect(eve.eject).toBeLessThan(1200);
    const jool = findWindow("Kerbin", "Jool", rK, 6_210_000, 0, true)!;
    expect(jool.eject).toBeGreaterThan(1900);
    expect(jool.eject).toBeLessThan(2100);
    expect(jool.tof / DAY).toBeGreaterThan(900);
    /* Moho is the inclined one: the ballistic transfer and the mid-course
       plane change are both priced and the cheaper taken. */
    const moho = findWindow("Kerbin", "Moho", rK, 260_000, 0, true)!;
    /* The ejection is priced from an equatorial parking orbit, so an excess
       that leaves the plane costs a normal component: Moho's seven degrees
       are hundreds of m/s of it on a ballistic transfer, and the resultant
       is what the route charges. */
    const balMoho = findWindow(
      "Kerbin",
      "Moho",
      rK,
      260_000,
      0,
      true,
      "ballistic",
    )!;
    expect(Math.abs(balMoho.ejectNor)).toBeGreaterThan(500);
    expect(balMoho.eject).toBeCloseTo(
      Math.hypot(balMoho.ejectPro, balMoho.ejectNor),
      6,
    );
    const bal = findWindow(
      "Kerbin",
      "Moho",
      rK,
      260_000,
      0,
      true,
      "ballistic",
    )!;
    const pl = findWindow("Kerbin", "Moho", rK, 260_000, 0, true, "plane")!;
    expect(moho.total).toBeLessThanOrEqual(Math.min(bal.total, pl.total) + 1);
    expect(pl.plane).not.toBeNull();
    expect(pl.plane!.at).toBeGreaterThan(pl.depart);
    expect(pl.plane!.at).toBeLessThan(pl.arrive);
  });
  it("reports the first window, and names a clearly cheaper one after it", () => {
    /* Moho's windows differ by hundreds of m/s from one to the next; the
       first from a new save is Year 1 Day 97, and the one alexmoon's
       planner picks as cheapest, Day 269, is offered. Duna's next is no
       cheaper, and nothing is said. */
    const moho = findWindow("Kerbin", "Moho", rK, 260_000, 0, true)!;
    expect(kerbalDate(moho.depart).day).toBeLessThan(150);
    expect(moho.next).not.toBeNull();
    expect(kerbalDate(moho.next!.depart)).toMatchObject({ year: 1 });
    expect(kerbalDate(moho.next!.depart).day).toBeGreaterThan(250);
    expect(moho.next!.total).toBeLessThan(moho.total * 0.98);
    const duna = findWindow("Kerbin", "Duna", rK, rD, 0, true)!;
    expect(duna.next).toBeNull();
  });
  it("starts where it is told, and the next window is a synodic period on", () => {
    const first = findWindow("Kerbin", "Duna", rK, rD, 0, true)!;
    const later = findWindow(
      "Kerbin",
      "Duna",
      rK,
      rD,
      first.depart + 30 * DAY,
      true,
    )!;
    const synodic = 1 / Math.abs(1 / periodOf("Kerbin") - 1 / periodOf("Duna"));
    expect(later.depart).toBeGreaterThan(first.depart + 30 * DAY);
    expect(Math.abs(later.depart - first.depart - synodic)).toBeLessThan(
      40 * DAY,
    );
  });
});

describe("a route priced on its windows", () => {
  const K = { body: "Kerbin", state: "surface" } as const;
  it("carries the window on the leg that leaves, and the way home on its own", () => {
    const legs = routeFor(
      K,
      { body: "Duna", state: "surface" },
      true,
      true,
      false,
      0,
      0,
    );
    const out = legs.find((l) => l.window)!;
    expect(out.label).toBe("Leave Kerbin for Duna");
    expect(out.dv).toBe(Math.round(out.window!.eject));
    expect(out.at).toBe(out.window!.depart);
    const cap = legs.find((l) => l.kind === "capture")!;
    expect(cap.dv).toBeGreaterThan(600);
    const home = legs.filter((l) => l.window)[1]!;
    expect(home.label).toBe("Leave Duna for Kerbin");
    expect(home.window!.depart).toBeGreaterThan(out.window!.arrive);
    /* A stay pushes the window home out. */
    const stayed = routeFor(
      K,
      { body: "Duna", state: "surface" },
      true,
      true,
      false,
      0,
      800 * DAY,
    );
    const home2 = stayed.filter((l) => l.window)[1]!;
    expect(home2.window!.depart).toBeGreaterThanOrEqual(
      out.window!.arrive + 800 * DAY,
    );
    /* Without a start time the route is the tabulated one it always was. */
    const legacy = routeFor(
      K,
      { body: "Duna", state: "surface" },
      true,
      true,
      false,
    );
    expect(legacy.some((l) => l.window)).toBe(false);
    expect(legacy.reduce((a, l) => a + l.dv, 0)).toBe(7521);
  });
  it("prices a moon's mission through its planet's window", () => {
    const legs = routeFor(
      K,
      { body: "Ike", state: "low" },
      true,
      false,
      false,
      0,
      0,
    );
    const out = legs.find((l) => l.window)!;
    expect(out.window!.to).toBe("Duna");
    /* Kerbol's own plane change is the window's; only the moons' remain. */
    expect(legs.filter((l) => /in the Sun system/.test(l.label))).toEqual([]);
    /* A fly-by never captures, and the window stays. */
    const fly = routeFor(
      K,
      { body: "Jool", state: "flyby" },
      true,
      false,
      false,
      0,
      0,
    );
    expect(fly.some((l) => l.window)).toBe(true);
    expect(fly.some((l) => l.kind === "capture")).toBe(false);
  });
});

describe("the plot", () => {
  it("is the search's own grid, with the window in its cheapest cell", () => {
    /* #213: the coarse grid the search prices is kept on the window as
       plain numbers, rounded. Its cheapest cell in the first synodic period
       is the one the refinement started from, so it lies within a cell of
       the window reported and prices no lower than it. */
    const w = findWindow("Kerbin", "Duna", rK, rD, 0, true);
    expect(w).not.toBeNull();
    const p = w!.plot;
    expect(p.nf).toBe(41);
    expect(p.nt).toBeGreaterThan(90);
    expect(p.totals.length).toBe(p.nt * p.nf);
    for (const v of p.totals) {
      expect(Number.isFinite(v)).toBe(true);
      expect(Number.isInteger(v)).toBe(true);
    }
    expect(p.totals.filter((v) => v > 0).length).toBeGreaterThan(
      0.98 * p.totals.length,
    );
    const T1 = periodOf("Kerbin"),
      T2 = periodOf("Duna");
    const first = 1.05 / Math.abs(1 / T1 - 1 / T2);
    let best = -1;
    p.totals.forEach((v, k) => {
      const i = Math.floor(k / p.nf);
      if (i * p.step > first || v <= 0) return;
      if (best < 0 || v < p.totals[best]) best = k;
    });
    const i = Math.floor(best / p.nf),
      j = best % p.nf;
    expect(Math.abs(p.t0 + i * p.step - w!.depart)).toBeLessThanOrEqual(p.step);
    expect(
      Math.abs(p.fLo + (j * (p.fHi - p.fLo)) / (p.nf - 1) - w!.tof),
    ).toBeLessThanOrEqual((p.fHi - p.fLo) / (p.nf - 1));
    expect(p.totals[best]).toBeGreaterThanOrEqual(Math.floor(w!.total));
    expect(p.totals[best]).toBeLessThan(1.1 * w!.total);
    /* And it crosses the seam as it is. */
    expect(JSON.parse(JSON.stringify(w))).toEqual(w);
  });
  it("prices the same cells again, to the number, a run of columns at a time", () => {
    /* The card's finer pass: at the search's own spacing it is the search. */
    const w = findWindow("Kerbin", "Duna", rK, rD, 0, true)!;
    const p = w.plot;
    const again = [
      ...priceColumns(p, 0, 5),
      ...priceColumns(p, 5, 60),
      ...priceColumns(p, 60, p.nt),
    ];
    expect(again).toEqual(p.totals);
    /* Three times finer: the same span, every third column the old one. */
    const fine = { ...p, step: p.step / 3, nt: (p.nt - 1) * 3 + 1 };
    const cols = priceColumns(fine, 0, 4);
    expect(cols.length).toBe(4 * p.nf);
    expect(cols.slice(0, p.nf)).toEqual(p.totals.slice(0, p.nf));
    expect(cols.slice(3 * p.nf)).toEqual(p.totals.slice(p.nf, 2 * p.nf));
  });
  it("places the cheaper later window on the grid too", () => {
    const w = findWindow("Kerbin", "Moho", rK, 280_000, 0, true);
    expect(w?.next).toBeTruthy();
    const p = w!.plot;
    expect(w!.next!.depart).toBeGreaterThan(p.t0);
    expect(w!.next!.depart).toBeLessThan(p.t0 + p.nt * p.step);
    expect(w!.next!.tof).toBeGreaterThan(0.8 * p.fLo);
    expect(w!.next!.tof).toBeLessThan(1.2 * p.fHi);
  });
});

describe("inside one system", () => {
  /* Mun → Minmus is the same problem about Kerbin that Kerbin → Duna is
     about the Sun, and it was refused for no reason but the name of the
     centre (#223). Its numbers also needed the patched conic written in
     energy rather than in excess velocity: the Mun's sphere of influence is
     a fifth of its orbit, so the departure leaves below boundary escape and
     the old excess floored at zero. */
  const rMun = 210_000,
    rMin = 110_000;

  it("finds a window between two moons of the same planet", () => {
    const w = findWindow("Mun", "Minmus", rMun, rMin, 0, true);
    expect(w).not.toBeNull();
    expect(w!.tof / DAY).toBeGreaterThan(1);
    expect(w!.phase).toBeGreaterThan(0);
    expect(w!.arc.length).toBeGreaterThan(2);
    for (const v of [w!.eject, w!.capture, w!.total])
      expect(Number.isFinite(v)).toBe(true);
    expect(JSON.parse(JSON.stringify(w))).toEqual(w);
  });

  it("leaves the Mun below its own boundary escape, and says so in the energy", () => {
    const w = must(
      findWindow("Mun", "Minmus", rMun, rMin, 0, true),
      "a window",
    );
    /* Boundary escape at the sphere is 232 m/s, and bare escape from this
       parking orbit is what the old floor collapsed every moon ejection to.
       The real departure is cheaper: it leaves on a bound ellipse and the
       game hands it to Kerbin at the boundary. */
    const muMun = mu("Mun");
    const bareEscape = Math.sqrt((2 * muMun) / rMun) - Math.sqrt(muMun / rMun);
    expect(w.c3Out).toBeLessThan(0);
    expect(w.eject).toBeLessThan(bareEscape);
    expect(w.eject).toBeGreaterThan(0.5 * bareEscape);
    /* And the energy is the boundary speed less the well still owed. */
    const soi = elements("Mun").a * Math.pow(muMun / elements("Mun").mu, 0.4);
    const vEdge = Math.sqrt(w.c3Out + (2 * muMun) / soi);
    expect(vEdge).toBeGreaterThan(0);
    expect(vEdge).toBeLessThan(Math.sqrt((2 * muMun) / soi));
  });

  it("names the centre the two moons go round, not Kerbol", () => {
    /* The drawings are the same drawings about a different centre, and the
       label follows the departure body's own parent. */
    const w = must(
      findWindow("Mun", "Minmus", rMun, rMin, 0, true),
      "a window",
    );
    expect(SYS[w.from].parent).toBe("Kerbin");
    expect(SYS["Laythe"].parent).toBe("Jool");
    expect(SYS["Kerbin"].parent).toBe("Sun");
  });

  it("prices the route's leg on that window", () => {
    const legs = routeFor(
      { body: "Mun", state: "low" },
      { body: "Minmus", state: "low" },
      true,
      false,
      false,
      0,
      0,
      "best",
    );
    const leaves = legs.find((l) => l.window);
    expect(leaves, "no leg carried a window").toBeTruthy();
    expect(leaves!.label).toMatch(/Leave Mun for Minmus/);
    expect(leaves!.dv).toBeGreaterThan(100);
    expect(leaves!.dv).toBeLessThan(260);
  });

  it("leaves a planetary window exactly where it was", () => {
    /* The energy rewrite may not move a planet by so much as a metre per
       second: the floor it removed never fired there. Kerbin → Duna's first
       window, to the second and to the whole m/s. */
    const w = must(findWindow("Kerbin", "Duna", rK, rD, 0, true), "a window");
    expect(w.depart).toBe(4_972_697);
    expect(w.tof).toBe(5_844_838);
    expect(w.eject).toBeCloseTo(1042.3387085153304, 6);
    expect(w.capture).toBeCloseTo(647.6913780650539, 6);
    expect(w.total).toBeCloseTo(1696.982886723008, 6);
    expect(w.angle).toBeCloseTo(153.1881446712204, 6);
    expect(w.phase).toBeCloseTo(38.61483031195843, 6);
    /* And there the energy is a true excess, positive and matching it. */
    expect(w.c3Out).toBeGreaterThan(0);
    expect(Math.sqrt(w.c3Out)).toBeCloseTo(w.vinfOut, 9);
  });
});
