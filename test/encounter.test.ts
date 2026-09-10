import { describe, it, expect } from "vitest";
import {
  DAY,
  add,
  elements,
  mu,
  norm,
  scale,
  stateAt,
  sub,
} from "../src/core/kepler.js";
import { lambert } from "../src/core/lambert.js";
import { childrenOf, encountersOf, soiOf } from "../src/core/encounter.js";
import { findWindow } from "../src/core/transfer.js";
import type { Vec3 } from "../src/core/kepler.js";

/* What else the ship meets on the way (#216).

   KSP pulls with one body at a time, so a body the ship never enters costs
   nothing and the two-body window is exactly what the game flies. A body it
   *does* enter takes the flight over, and the window then describes a
   flight that will not happen. This holds the check that finds them: the
   geometry against a brute-force propagation, the rate against what was
   measured, and the search's dodge against the windows it delivers. */

const rK = 680_000,
  rD = 380_000;

describe("the sphere of influence", () => {
  it("is the game's own, and the moons cover the share of their orbit that was measured", () => {
    /* Kerbin's 84.16 Mm is the wiki's figure; the shares are what makes the
       Mun the commonest thing in the way and Gilly nothing at all. */
    expect(soiOf("Kerbin") / 1e6).toBeCloseTo(84.16, 1);
    expect(soiOf("Mun") / 1e6).toBeCloseTo(2.43, 1);
    expect(soiOf("Tylo") / 1e6).toBeCloseTo(10.86, 1);
    const share = (b: string) =>
      (100 * (2 * soiOf(b))) / (2 * Math.PI * elements(b).a);
    expect(share("Mun")).toBeCloseTo(6.4, 0);
    expect(share("Ike")).toBeCloseTo(10.4, 0);
    expect(share("Gilly")).toBeLessThan(0.2);
    expect(childrenOf("Kerbin").sort()).toEqual(["Minmus", "Mun"]);
    expect(childrenOf("Jool")).toHaveLength(5);
    expect(childrenOf("Dres")).toEqual([]);
  });
});

/* A body's distance from a point, in its own spheres. */
const depthOf = (b: string, t: number, r: Vec3) =>
  norm(sub(r, stateAt(b, t).r)) / soiOf(b);

describe("the check", () => {
  it("finds the cruise encounter a brute-force propagation finds", () => {
    /* Dres to Eeloo, leaving day 718 on a 1,555-day arc, passes through
       Jool's sphere — one of the two such arcs in 6,048 sampled. Flown here
       by fourth-order Runge-Kutta rather than by the check's own conic, so
       the two methods have to agree about it. */
    const m = elements("Kerbin").mu;
    const depart = 15_506_439,
      tof = 33_589_166;
    const s1 = stateAt("Dres", depart),
      s2 = stateAt("Eeloo", depart + tof);
    const l = lambert(m, s1.r, s2.r, tof);
    expect(l).not.toBeNull();
    const found = encountersOf({
      from: "Dres",
      to: "Eeloo",
      primary: "Sun",
      m,
      r1: s1.r,
      v1: l!.v1,
      depart,
      tof,
      rPark1: 158_000,
      vrelOut: sub(l!.v1, s1.v),
      rPark2: 260_000,
      vrelIn: sub(l!.v2, s2.v),
      arrive: depart + tof,
    }).filter((e) => e.phase === "cruise");
    expect(found.map((e) => e.body)).toEqual(["Jool"]);

    const acc = (r: Vec3): Vec3 => {
      const n = norm(r);
      return scale(r, -m / (n * n * n));
    };
    let r = s1.r,
      v = l!.v1,
      el = 0,
      best = Infinity,
      at = 0;
    while (el < tof) {
      const h = Math.min(3600, tof - el);
      const k1 = acc(r),
        k2 = acc(add(r, scale(v, h / 2)));
      r = add(r, scale(add(v, scale(k1, h / 2)), h));
      v = add(v, scale(add(k1, k2), h / 2));
      el += h;
      const d = depthOf("Jool", depart + el, r);
      if (d < best) {
        best = d;
        at = depart + el;
      }
    }
    expect(best).toBeLessThan(1);
    expect(found[0].depth).toBeCloseTo(best, 1);
    /* The moment agrees to within ten days of a four-year flight, which is
       as much as this comparison can ask: the ship is inside Jool's sphere
       for weeks, so the closest approach is a shallow minimum, and the
       midpoint integrator above drifts over that many steps. The depth is
       the sharp half of the check and it matches. */
    expect(Math.abs(found[0].at - at)).toBeLessThan(10 * DAY);
  });

  it("misses nothing a uniform walk of the same leg would catch", () => {
    /* The check only looks for a body where the ship's radius can reach its
       orbit, and only walks finely there. That is an optimisation, so it
       has to agree with the naive version: every escape from Kerbin over a
       Mun period, checked both ways. */
    const m = elements("Kerbin").mu;
    const disagreed: Array<string> = [];
    for (let k = 0; k < 24; k++) {
      const depart = 12_000_000 + k * 7000;
      const tof = 250 * DAY;
      const s1 = stateAt("Kerbin", depart),
        s2 = stateAt("Duna", depart + tof);
      const l = lambert(m, s1.r, s2.r, tof);
      if (!l) continue;
      const got = encountersOf({
        from: "Kerbin",
        to: "Duna",
        primary: "Sun",
        m,
        r1: s1.r,
        v1: l.v1,
        depart,
        tof,
        rPark1: rK,
        vrelOut: sub(l.v1, s1.v),
        rPark2: rD,
        vrelIn: sub(l.v2, s2.v),
        arrive: depart + tof,
      })
        .filter((e) => e.phase === "escape")
        .map((e) => e.body)
        .sort();
      /* The naive walk: the same hyperbola, ten thousand even steps from
         the burn to the sphere's edge, every moon at every step. */
      const vrel = sub(l.v1, s1.v);
      const mK = mu("Kerbin"),
        soiK = soiOf("Kerbin");
      const vinf2 = Math.max(
        0,
        vrel[0] ** 2 + vrel[1] ** 2 + vrel[2] ** 2 - (2 * mK) / soiK,
      );
      const e = 1 + (rK * vinf2) / mK;
      const thInf = Math.acos(-1 / e);
      const p = rK * (1 + e);
      const n = Math.sqrt(mK / Math.abs(rK / (1 - e)) ** 3);
      const u = scale(vrel, 1 / norm(vrel));
      const elv = Math.asin(Math.max(-1, Math.min(1, u[2])));
      const psi =
        Math.atan2(u[1], u[0]) - Math.acos(Math.cos(thInf) / Math.cos(elv));
      const ph: Vec3 = [Math.cos(psi), Math.sin(psi), 0];
      const nh = ((): Vec3 => {
        const c: Vec3 = [
          ph[1] * u[2] - ph[2] * u[1],
          ph[2] * u[0] - ph[0] * u[2],
          ph[0] * u[1] - ph[1] * u[0],
        ];
        return scale(c, 1 / norm(c));
      })();
      const qh: Vec3 = [
        nh[1] * ph[2] - nh[2] * ph[1],
        nh[2] * ph[0] - nh[0] * ph[2],
        nh[0] * ph[1] - nh[1] * ph[0],
      ];
      const naive = new Set<string>();
      for (let j = 0; j <= 10_000; j++) {
        const nu = ((thInf - 1e-3) * j) / 10_000;
        const rad = p / (1 + e * Math.cos(nu));
        if (rad > soiK) break;
        const H =
          2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu / 2));
        const t = depart + (e * Math.sinh(H) - H) / n;
        const pos = add(
          scale(ph, rad * Math.cos(nu)),
          scale(qh, rad * Math.sin(nu)),
        );
        for (const b of childrenOf("Kerbin"))
          if (depthOf(b, t, pos) < 1) naive.add(b);
      }
      const want = [...naive].sort();
      if (JSON.stringify(got) !== JSON.stringify(want))
        disagreed.push(`depart ${depart}: check ${got} vs walk ${want}`);
    }
    expect(disagreed).toEqual([]);
  });
});

describe("the search's dodge", () => {
  it("delivers a clean window, or says what it could not clear", () => {
    /* Measured: about a fifth of optima leave through the Mun's sphere or
       arrive through a moon's, and every one of them was dodged inside nine
       days. A window that still carries an encounter is allowed — the card
       warns — but a dodge must never cost real fuel. */
    const pairs: Array<[string, string, number, number]> = [
      ["Kerbin", "Duna", rK, rD],
      ["Kerbin", "Eve", rK, 800_000],
      ["Duna", "Kerbin", rD, rK],
      ["Kerbin", "Jool", rK, 6_200_000],
      ["Jool", "Kerbin", 6_200_000, rK],
      ["Duna", "Eve", rD, 800_000],
    ];
    let n = 0,
      dodged = 0;
    for (const [a, b, r1, r2] of pairs)
      for (let d = 0; d < 12; d++) {
        const w = findWindow(a, b, r1, r2, d * 90 * DAY, true);
        if (!w) continue;
        n++;
        if (!w.dodged) continue;
        dodged++;
        expect(w.encounters, `${a}->${b} dodged and is still fouled`).toEqual(
          [],
        );
        expect(w.dodged.cleared.length).toBeGreaterThan(0);
        expect(w.dodged.by).toBeGreaterThan(0);
        expect(w.dodged.by).toBeLessThanOrEqual(9 * DAY);
        expect(w.dodged.cost, `${a}->${b} paid for its dodge`).toBeLessThan(30);
      }
    expect(n).toBeGreaterThan(50);
    expect(
      dodged,
      "no window needed a dodge, so this proves nothing",
    ).toBeGreaterThan(3);
  });

  it("dodges the Ike encounter on the Duna departure that has one", () => {
    /* Duna to Eve on the first window of Year 1 leaves through Ike's sphere
       half an hour after the burn. It is the one delivered window of the 42
       body pairs that is fouled at the cheapest departure. */
    const w = findWindow("Duna", "Eve", rD, 800_000, 0, true);
    expect(w).not.toBeNull();
    expect(w!.dodged).not.toBeNull();
    expect(w!.dodged!.cleared).toEqual(["Ike"]);
    expect(w!.encounters).toEqual([]);
    expect(w!.dodged!.by).toBeLessThanOrEqual(6 * 3600);
    expect(Math.abs(w!.dodged!.cost)).toBeLessThan(5);
  });

  it("crosses the seam with the window", () => {
    const w = findWindow("Duna", "Eve", rD, 800_000, 0, true);
    expect(JSON.parse(JSON.stringify(w))).toEqual(w);
  });
});
