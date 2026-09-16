import { describe, it, expect } from "vitest";
import power from "../src/data/power.json";
import { DATA } from "../src/core/catalogue.js";
import { SYS } from "../src/core/orbits.js";

/* The parts that make and store electric charge, measured from the install by
   tools/power-parts.mjs.

   Nothing reads them yet — #414 is what prices a power plant and #415 is what
   admits an ion engine on the strength of it. These hold the table to the same
   bar the rest of src/data/ is held to: every part gated on a node the tree
   actually has, every number the kind of number it claims to be. #413

   The gates fail closed, so a tech node the tree does not have hides a part
   for good rather than erroring — which is how a coupler stayed hidden for
   months (#191), and why the first of these matters most. The config writes
   `largeElectrics` where the tree says "High-Power Electrics", and the two are
   not a transformation of each other. */

type Part = {
  id: string;
  n: string;
  m: number;
  cost: number;
  t: string | null;
};
const kinds = [
  "panels",
  "cells",
  "batteries",
  "generators",
  "engines",
] as const;
const every = (): Array<Part & Record<string, unknown>> =>
  kinds.flatMap((k) => power[k] as Array<Part>);

describe("the power parts", () => {
  it("are gated on nodes the tech tree has", () => {
    const tree = new Set(Object.keys(DATA.nodes));
    const bad = every()
      .filter((p) => p.t !== null && !tree.has(p.t))
      .map((p) => `${p.n}: ${p.t}`);
    expect(bad, "tech nodes the tree does not have").toEqual([]);
    /* And every part is gated on something: an ungated part is free from the
       first launch, which no electrical part is. */
    expect(
      every()
        .filter((p) => p.t === null)
        .map((p) => p.n),
    ).toEqual([]);
  });

  it("carry a mass and a price", () => {
    for (const p of every()) {
      expect(p.m, `${p.n} mass`).toBeGreaterThan(0);
      expect(p.cost, `${p.n} cost`).toBeGreaterThan(0);
      expect(p.n.startsWith("#"), `${p.n} is an unresolved string key`).toBe(
        false,
      );
    }
  });

  it("know what each kind is for", () => {
    for (const p of power.panels) {
      expect(p.rate, `${p.n}`).toBeGreaterThan(0);
      expect(typeof p.tracks).toBe("boolean");
    }
    for (const p of power.batteries) expect(p.stored).toBeGreaterThan(0);
    for (const p of power.generators) expect(p.rate).toBeGreaterThan(0);
    for (const p of power.cells) {
      expect(p.rate).toBeGreaterThan(0);
      expect(p.burns.length, `${p.n} burns nothing`).toBeGreaterThan(0);
    }
    for (const p of power.engines) expect(p.draw).toBeGreaterThan(0);
  });

  it("agree with the numbers the game shows", () => {
    /* Four the community quotes, as a check on the reader rather than on the
       install. The engine's draw is the one that is not in the file at all:
       it is a propellant ratio, and 1.8 against xenon's 0.1 at a density of
       0.0001 is what comes out as 8.74 charge a second. */
    const find = <T extends { n: string }>(
      rows: ReadonlyArray<T>,
      re: RegExp,
    ) => rows.find((p) => re.test(p.n))!;
    expect(find(power.panels, /Gigantor/).rate).toBeCloseTo(24.4, 2);
    expect(find(power.generators, /PB-NUK/).rate).toBeCloseTo(0.75, 3);
    expect(find(power.cells, /^Fuel Cell$/).rate).toBeCloseTo(1.5, 3);
    expect(find(power.engines, /Dawn/).draw).toBeCloseTo(8.74, 2);
  });

  it("says what a panel's rate is quoted at", () => {
    /* Without this the falloff with distance is an assumption. 1360 W/m² is
       the flux at the homeworld's orbital distance, which is where a panel
       makes its rated output; everywhere else it goes as the inverse square. */
    expect(power.sun.solarLuminosityAtHome).toBeGreaterThan(0);
    /* Read from the system table rather than guarded past it: a guard here
       would make this pass by finding nothing, which is the trap V4 is about. */
    expect(SYS.Kerbin.sma, "the homeworld's distance").toBeGreaterThan(1e9);
  });

  it("is enough to size a plant for the design that wanted one", () => {
    /* The Eeloo ion stage #410 produced before electric propulsion was shut
       off: seven Dawns, so 61 charge a second, at 90.1 Gm where the sun is a
       fiftieth of its strength at Kerbin's 13.6 Gm. The arithmetic the table
       now supports, and the reason it will not be chosen once #414 prices it. */
    const dawn = power.engines.find((e) => /Dawn/.test(e.n))!;
    const gig = power.panels.find((p) => /Gigantor/.test(p.n))!;
    const rtg = power.generators[0];
    const demand = 7 * dawn.draw;
    const flux = (SYS.Kerbin.sma! / SYS.Eeloo.sma!) ** 2;
    const panels = Math.ceil(demand / (gig.rate * flux));
    const gens = Math.ceil(demand / rtg.rate);
    console.log(
      `7 Dawns draw ${demand.toFixed(1)} EC/s. At Eeloo the sun is ${(100 * flux).toFixed(1)}% of Kerbin's, so that is ` +
        `${panels} Gigantors (${(panels * gig.m).toFixed(1)} t, ${(panels * gig.cost).toLocaleString("en-US")} funds) ` +
        `or ${gens} generators (${(gens * rtg.m).toFixed(1)} t, ${(gens * rtg.cost).toLocaleString("en-US")} funds).`,
    );
    expect(panels).toBeGreaterThan(50);
    expect(gens).toBeGreaterThan(50);
  });
});
