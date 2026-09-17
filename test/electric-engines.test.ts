import { describe, it, expect } from "vitest";
import { solveGroup } from "../src/core/solver.js";
import type { GroupInput } from "../src/core/solver.js";
import { DATA } from "../src/core/catalogue.js";
import { withDeps } from "../src/core/tech.js";
import { buildRoute, gOf } from "../src/core/orbits.js";
import type { Leg } from "../src/core/orbits.js";
import { manifestCost, manifestMass } from "../src/core/manifest.js";
import { stageCost, stageParts } from "../src/core/performance.js";

/* Electric propulsion, admitted on purpose.

   An ion engine is an engine flying on nothing until two things are paid
   for: the power plant that makes the charge it burns (#414), and the spiral
   — a Dawn cannot make any burn in a fraction of an orbit, so its burns are
   spirals over many revolutions and cost the spiral Δv, 2.4 times the impulse
   on an escape (#415). The 420 s clock kept ions out by accident, #410
   replaced the clock with an arc and the mass objective answered Eeloo with
   fourteen ion engines and no power system, #414 excluded them on purpose,
   and this is the exclusion lifted on purpose: the plant priced, the spiral
   paid, and the engine in the roster where the route lets both be known.

   Solids-only rosters and one-stage groups, as test/solid-restart.test.ts
   does: a chain exists if and only if the ion engine is allowed to fly the
   legs asked for, so nothing here passes on a chemical engine and says
   nothing. */

const unlocked = withDeps(
  DATA.nodes,
  new Set(
    Object.entries(DATA.nodes)
      .filter(([, v]) => v.lvl <= 9)
      .map(([k]) => k),
  ),
);
const ionOnly = DATA.engines.filter((e) => e.f.includes("Xe"));
const tanks = DATA.tanks.filter(
  (t) => !!t.t && unlocked.has(t.t) && !t.mh && !t.rs,
);

const route = buildRoute("Duna", "orbit", true, "Kerbin", false, false);
/* Eeloo's capture is 1,370 m/s at a slow moon, which is what it takes to
   make a capture burn a spiral under any cluster of Dawns. */
const eeloo = buildRoute("Eeloo", "orbit", true, "Kerbin", false, false);
const legsFor = (picked: ReadonlyArray<Leg>): GroupInput["legs"] => {
  const total = picked.reduce((a, l) => a + l.dv, 0);
  let acc = 0;
  return picked.map((l, i) => {
    acc += l.dv;
    return {
      end: i === picked.length - 1 ? 1 : acc / total,
      kind: l.kind,
      g: l.g ?? gOf(l.body),
      body: l.body,
      orbit: l.orbit ?? null,
      spiral: l.spiral !== undefined && l.dv > 0 ? l.spiral / l.dv : null,
      spiralAfter: !!l.spiralAfter,
    };
  });
};
const groupOf = (picked: ReadonlyArray<Leg>, more: Partial<GroupInput> = {}) =>
  solveGroup({
    dv: picked.reduce((a, l) => a + l.dv, 0),
    payload: 0.8,
    payloadDia: 1.25,
    engines: ionOnly,
    tanks,
    unlocked,
    excluded: null,
    needGimbal: false,
    maxAspect: 14,
    expansions: { mh: false, rs: false },
    asparagus: false,
    g: 9.81,
    kind: "space",
    boosters: false,
    srbs: [],
    minK: 1,
    maxK: 1,
    objective: "mass",
    legs: legsFor(picked),
    ...more,
  });

const escape = route.find((l) => /Kerbin escape$/.test(l.label))!;
const capture = eeloo.find((l) => l.kind === "capture")!;

describe("an ion engine", () => {
  it("is in the catalogue, with tanks and a tech node", () => {
    expect(ionOnly.length).toBe(1);
    expect(ionOnly[0].n).toMatch(/Dawn/);
    expect(DATA.tanks.filter((t) => t.xe > 0).length).toBeGreaterThan(0);
    expect(ionOnly[0].iv).toBeGreaterThan(4000);
  });

  it("flies an escape from low orbit as a spiral, at the spiral's price, with a plant", () => {
    /* Forty tonnes: even twelve Dawns, the most a column carries, burn for
       hours and many revolutions. On a probe of a tonne one engine makes the
       escape in a couple of periapsis kicks and is priced as a long impulse,
       and on six tonnes the solver clusters three rather than pay the
       spiral — which is the price doing its job. */
    const res = groupOf([escape], { payload: 40 });
    expect(res, "no ion stage for the escape").not.toBeNull();
    const sol = res!.chain[0].sol;
    expect(sol.engine.n).toMatch(/Dawn/);
    /* Many revolutions, so a spiral and not a long impulse; and the leg's
       whole spiral price is what the stage carries, not a penalty on 950. */
    expect(sol.finite?.spiral).toBe(true);
    expect(sol.finite?.passes).toBe(0);
    expect(sol.finite!.arc).toBeGreaterThan(2 * Math.PI);
    const spiral = escape.spiral!;
    expect(sol.dv).toBeGreaterThanOrEqual(spiral * 0.995);
    expect(sol.finite!.added).toBeCloseTo(spiral - escape.dv, -1);
    /* And it is fed: a plant, counted in the stage's mass, cost and parts,
       and agreeing with the bill of parts a reader is shown. */
    expect(sol.plant).not.toBeNull();
    expect(sol.plant!.m).toBeGreaterThan(0);
    expect(sol.dry).toBeGreaterThan(sol.plant!.m);
    expect(manifestMass(sol)).toBeCloseTo(sol.dry - 40, 6);
    expect(manifestCost(sol)).toBeCloseTo(stageCost(sol), 6);
    expect(stageParts(sol)).toBeGreaterThanOrEqual(
      sol.plant!.parts.reduce((a, x) => a + x.c, 0) + sol.n,
    );
    /* Its thrust floor is not the 0.5 a coast burn asks of a chemical stage:
       the spiral price is what low thrust costs. */
    expect(sol.twr).toBeLessThan(0.5);
  });

  it("may not begin its spiralling on a capture", () => {
    /* A capture priced from rest at the edge is what a craft that spiralled
       out to match the body arrives at. A stage that did not make that
       spiral itself arrives with an excess it cannot kill slowly. */
    expect(groupOf([capture], { payload: 25 })).toBeNull();
    /* The same capture after the transfer that matches speed is fine. */
    const helio = eeloo.find((l) => /escape → Eeloo transfer/.test(l.label))!;
    const both = groupOf([helio, capture], { payload: 25 });
    expect(both, "no ion stage for transfer and capture").not.toBeNull();
    expect(both!.chain[0].sol.finite?.spiral).toBe(true);
    /* And on a probe light enough to make the capture in a fraction of an
       orbit, the burn is a long impulse and needs nothing before it. */
    expect(groupOf([capture], { payload: 0.3 })).not.toBeNull();
  });

  it("is left out of a group solved without a route", () => {
    /* The design grid's path: no legs, so no orbit to spiral in and no sun
       to size a plant for. Nothing can price the engine, so it is not
       offered — which is what keeps that baseline where it is. */
    expect(groupOf([escape], { legs: undefined })).toBeNull();
  });

  it("is refused a stage that has to climb", () => {
    const ascent = route.find((l) => l.kind === "ascent")!;
    expect(
      groupOf([ascent], { kind: "launch", bodyName: "Kerbin" }),
    ).toBeNull();
  });
});
