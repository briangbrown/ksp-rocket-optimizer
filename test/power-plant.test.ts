import { describe, it, expect } from "vitest";
import { darkFraction, sizePlant } from "../src/core/power.js";
import { SYS } from "../src/core/orbits.js";
import { DATA } from "../src/core/catalogue.js";
import { withDeps } from "../src/core/tech.js";
import power from "../src/data/power.json";

/* Sizing the plant an electric engine flies on. #414

   Nothing chooses one yet — electric propulsion is refused in `solveStage`
   until #415 — so this is where the model is exercised. The numbers below are
   the ones that decide whether an ion stage is ever worth building, and the
   answer turns almost entirely on how far from the sun the burn is made. */

const tier = (n: number) =>
  new Set(
    withDeps(
      DATA.nodes,
      Object.keys(DATA.nodes).filter((k) => DATA.nodes[k].lvl <= n),
    ),
  );
const all = tier(9);
const dawn = power.engines.find((e) => /Dawn/.test(e.n))!;
const fluxAt = (body: string) => (SYS.Kerbin.sma! / SYS[body].sma!) ** 2;
/* A low orbit of a body, as the route's own legs are measured. */
const lowOrbit = (b: string) => {
  const R = SYS[b].R;
  const r = R + (SYS[b].atm ? SYS[b].atm + 10000 : 10000);
  const mu = SYS[b].gee * 9.80665 * R * R;
  return {
    r,
    period: 2 * Math.PI * Math.sqrt(r ** 3 / mu),
    dark: darkFraction(R, r),
  };
};

describe("a body's shadow", () => {
  it("is a third of a low Kerbin orbit", () => {
    const k = lowOrbit("Kerbin");
    expect(k.dark).toBeCloseTo(0.344, 2);
    expect((k.period * k.dark) / 60).toBeCloseTo(10.7, 0);
  });

  it("is less the higher the orbit", () => {
    const R = SYS.Kerbin.R;
    expect(darkFraction(R, R * 2)).toBeLessThan(darkFraction(R, R * 1.1));
    expect(darkFraction(R, R * 100)).toBeLessThan(0.01);
  });
});

describe("sizing a plant", () => {
  it("is set by where the burn is, until something that ignores distance caps it", () => {
    /* Three things came out of this that I did not expect going in.

       Near the sun and on a burn short enough to be timed for daylight, a
       solar plant is tiny: 38 small panels, two thirds of a tonne.

       Far from it, panels are hopeless — at Eeloo they would be 111 Gigantors
       and thirty-three tonnes — but a fuel cell does not care where it is, and
       it caps what distance can cost. The Eeloo plant is 1.3 t, not 33.

       And on a burn long enough to cross the planet's shadow, the cell wins at
       Kerbin too, because it is indifferent to eclipse as well. An ion burn is
       always long, so the plant for a real ion stage is much the same wherever
       it flies. Power alone therefore does *not* rule ions out, which is what
       I expected it to do. #415's spiral Δv is what will. */
    const ec = 7 * dawn.draw;
    const rows: Array<string> = [];
    const noCells = new Set([
      ...power.cells.map((c) => c.n),
      ...power.generators.map((g) => g.n),
    ]);
    for (const seconds of [300, 1483]) {
      for (const body of ["Kerbin", "Eeloo"]) {
        const o = lowOrbit(body);
        const d = {
          ec,
          seconds,
          flux: fluxAt(body),
          dark: o.dark,
          period: o.period,
        };
        const p = sizePlant(d, all, null, "mass")!;
        const solar = sizePlant(d, all, noCells, "mass");
        expect(p, `${body} ${seconds}`).not.toBeNull();
        rows.push(
          `${String(seconds).padStart(5)} s at ${body.padEnd(7)} sun ${(100 * fluxAt(body)).toFixed(1).padStart(5)}%  ${p.how.padEnd(9)} ${p.m.toFixed(2).padStart(6)} t  ${Math.round(p.cost).toLocaleString("en-US").padStart(8)} funds  ` +
            `(solar only: ${solar ? `${solar.m.toFixed(1)} t` : "none"})  ${p.parts.map((x) => `${x.c}x ${x.n}`).join(" + ")}`,
        );
      }
    }
    console.log(`${ec.toFixed(1)} charge a second:\n  ` + rows.join("\n  "));

    const at = (body: string, seconds: number) => {
      const o = lowOrbit(body);
      return sizePlant(
        { ec, seconds, flux: fluxAt(body), dark: o.dark, period: o.period },
        all,
        null,
        "mass",
      )!;
    };
    /* Short burn near the sun: solar, and light. */
    expect(at("Kerbin", 300).how).toBe("panels");
    /* Short burn far from it: not solar, and the cell keeps the penalty small
       where panels alone would have been fifty times the mass. */
    const far = at("Eeloo", 300);
    expect(far.how).not.toBe("panels");
    expect(far.m / at("Kerbin", 300).m).toBeGreaterThan(1.5);
    expect(far.m / at("Kerbin", 300).m).toBeLessThan(5);
    const solarOnly = sizePlant(
      { ec, seconds: 300, flux: fluxAt("Eeloo"), dark: 0, period: 0 },
      all,
      noCells,
      "mass",
    )!;
    expect(solarOnly.m / far.m, "the cell is what caps it").toBeGreaterThan(20);
    /* Long burn: distance stops mattering, because nothing solar is chosen. */
    expect(at("Kerbin", 1483).how).toBe("cell");
    expect(at("Eeloo", 1483).m).toBeCloseTo(at("Kerbin", 1483).m, 3);
  });

  it("stops using panels once the sun is too far to be worth carrying", () => {
    const ec = 7 * dawn.draw;
    const near = sizePlant(
      { ec, seconds: 600, flux: 1, dark: 0, period: 0 },
      all,
      null,
      "mass",
    )!;
    const far = sizePlant(
      { ec, seconds: 600, flux: fluxAt("Eeloo"), dark: 0, period: 0 },
      all,
      null,
      "mass",
    )!;
    expect(near.how).toBe("panels");
    expect(far.how).not.toBe("panels");
  });

  it("charges a fuel cell for what it drinks, so a long burn turns it away", () => {
    /* A cell does not care how far out it is, only how long it runs. Its mass
       grows with the burn where a generator's does not, so there is a duration
       past which the heavier, dearer generator is the lighter answer. */
    const ec = 7 * dawn.draw;
    const at = (seconds: number) =>
      sizePlant(
        { ec, seconds, flux: fluxAt("Eeloo"), dark: 0, period: 0 },
        all,
        null,
        "mass",
      )!;
    const short = at(600);
    const long = at(200_000);
    console.log(
      `at Eeloo: a 600 s burn takes ${short.how} at ${short.m.toFixed(2)} t; a 200,000 s burn takes ${long.how} at ${long.m.toFixed(2)} t`,
    );
    expect(short.how).toBe("cell");
    expect(long.how).toBe("generator");
  });

  it("carries batteries only when the burn cannot dodge the shadow", () => {
    const ec = 7 * dawn.draw;
    const o = lowOrbit("Kerbin");
    const brief = sizePlant(
      { ec, seconds: 300, flux: 1, ...o },
      all,
      null,
      "mass",
    )!;
    const long = sizePlant(
      { ec, seconds: 5000, flux: 1, ...o },
      all,
      null,
      "mass",
    )!;
    expect(brief.parts.length, "a short burn can be timed for daylight").toBe(
      1,
    );
    expect(long.parts.length, "a long one cannot").toBeGreaterThan(1);
    expect(long.m).toBeGreaterThan(brief.m);
  });

  it("answers by the objective it is asked on", () => {
    const ec = 7 * dawn.draw;
    const d = { ec, seconds: 1483, flux: fluxAt("Eeloo"), dark: 0, period: 0 };
    const light = sizePlant(d, all, null, "mass")!;
    const cheap = sizePlant(d, all, null, "cost")!;
    expect(cheap.cost).toBeLessThanOrEqual(light.cost);
    expect(light.m).toBeLessThanOrEqual(cheap.m);
  });

  it("refuses where the roster has nothing to build one from", () => {
    expect(
      sizePlant(
        { ec: 10, seconds: 100, flux: 1, dark: 0, period: 0 },
        new Set(),
        null,
        "mass",
      ),
    ).toBeNull();
    expect(
      sizePlant(
        { ec: 0, seconds: 100, flux: 1, dark: 0, period: 0 },
        all,
        null,
        "mass",
      ),
    ).toBeNull();
  });
});
