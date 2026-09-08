import { describe, it, expect } from "vitest";
import { flyAscent, optimiseTurn } from "../src/core/ascent.js";
import { BODY, atmoFor, ispCurve } from "../src/core/atmosphere.js";
import { ispCut } from "../src/core/performance.js";
import { DATA } from "../src/core/catalogue.js";
import type { FlightStage, Vehicle } from "../src/core/ascent.js";

/* The simulator, flown directly (#7), on vehicles small enough to read.

   What is held here is the accounting, not the trajectory: the design
   snapshot and the mission sweep pin what the simulator makes the solver
   choose, and this pins what a flight is allowed to say about itself. */

const engine = (re: RegExp) => {
  const e = DATA.engines.find((x) => re.test(x.n));
  if (!e) throw new Error(`no engine ${re}`);
  return e;
};
const stage = (
  e: ReturnType<typeof engine>,
  n: number,
  prop: number,
  dry: number,
  dia: number,
): FlightStage => ({
  mdot: (n * e.fv) / (e.iv * 9.80665),
  isp: ispCurve(e.iv, e.ia, ispCut(e)),
  prop,
  dry,
  wet: prop + dry,
  dia,
  area: (Math.PI / 4) * dia * dia,
  boosters: null,
});
const kerbin = (stages: Array<FlightStage>, payload: number): Vehicle => ({
  body: BODY.Kerbin,
  atmo: atmoFor("Kerbin"),
  bodyName: "Kerbin",
  payload,
  stages,
  payloadArea: (Math.PI / 4) * 0.625 * 0.625,
});

/* The rocket #170 was found on: two Torches on an FL-T800, a Spark on an
   Oscar-E and a PRBE-9, a tonne on top. Flown lofted it reaches apoapsis
   slow, the Torch stage runs dry 232 m/s into an 1,839 m/s circularisation,
   and the Spark above has 1,511 m/s — short by a hundred. That flight used
   to report 2,313 m/s, under the physical minimum for the orbit, because the
   burn was costed at what one stage had spent; the turn search preferred it
   for exactly that reason, and the design passed as carrying its flight. */
const TORCH = kerbin(
  [
    stage(engine(/Torch/), 2, 4.0, 1.17, 1.25),
    stage(engine(/Spark/), 1, 0.77, 0.24, 0.625),
  ],
  1,
);
/* The same rocket with a Spark that has the Δv to finish. */
const TORCH_FULL = kerbin(
  [
    stage(engine(/Torch/), 2, 4.0, 1.17, 1.25),
    stage(engine(/Spark/), 1, 1.2, 0.283, 0.625),
  ],
  1,
);
/* Six Hammers on a Mainsail under three Poodles and a Reliant, 17.8 t on
   top: the Minmus design of #167, #168 and #10's latest case. */
const HAMMER = engine(/Hammer/);
const STALL: Vehicle = {
  ...kerbin(
    [
      {
        ...stage(engine(/Mainsail/), 1, 80.9 - 6 * HAMMER.fuelM, 14.3, 2.5),
        boosters: {
          n: 6,
          mdot: HAMMER.fv / (HAMMER.iv * 9.80665),
          isp: ispCurve(HAMMER.iv, HAMMER.ia, ispCut(HAMMER)),
          prop: HAMMER.fuelM,
          dry: HAMMER.dry,
          wet: HAMMER.m,
          dia: 1.25,
          area: ((1.16 * Math.PI) / 4) * 1.25 ** 2,
          asparagus: false,
          solid: true,
          pairProp: 2 * HAMMER.fuelM,
          pairDry: 2 * HAMMER.dry,
          pairArea: ((2 * 1.16 * Math.PI) / 4) * 1.25 ** 2,
        },
      },
      /* Three Poodle columns: the drag area `stageSize` gives the stage. */
      { ...stage(engine(/Poodle/), 3, 48, 11.4, 2.5), area: 3 * 4.9 },
      stage(engine(/Reliant/), 1, 8.3, 2.3, 1.25),
    ],
    17.8,
  ),
  payloadArea: 1.2,
};

/* A late, shallow kick: the lofted arrival that runs the live stage dry. */
const LOFTED = { target: 80000, vKick: 130, kick: (2 * Math.PI) / 180 };
/* Circular at the apoapsis reached, less what it arrived with, is the least
   any circularisation can cost; an ascent's total is that plus the climb. */
const floor = (r: { dvUsed: number; vCirc: number; vApo: number }) =>
  r.dvUsed + r.vCirc - r.vApo - 1;

describe("a flown ascent", () => {
  it("costs a burn that runs the vehicle dry at what the orbit needs", () => {
    const r = flyAscent(TORCH, LOFTED);
    expect(r.ok, "the lofted Torch did not fly").toBe(true);
    if (!r.ok) return;
    expect(r.circStaged, "the Torch stage should run dry and stage").toBe(true);
    expect(r.circShort, "the Spark should run dry too").toBe(true);
    expect(r.circ).toBeGreaterThanOrEqual(r.vCirc - r.vApo - 1);
    expect(r.total).toBeGreaterThanOrEqual(floor(r));
    /* Nothing reaches an 80 km Kerbin orbit for less than about 3,200 m/s. */
    expect(r.total).toBeGreaterThan(3200);
  });

  it("stages up through the burn and finishes on the stage above where it can", () => {
    const r = flyAscent(TORCH_FULL, LOFTED);
    expect(r.ok, "the lofted rocket did not fly").toBe(true);
    if (!r.ok) return;
    expect(r.circStaged).toBe(true);
    expect(r.circShort).toBe(false);
    expect(r.total).toBeGreaterThanOrEqual(floor(r));
  });

  it("no longer prefers the flight that falls short, since it is no longer cheaper", () => {
    /* With the burn costed honestly the turn search finds a steeper flight
       that circularises on the Torch stage alone, and reports it under what
       the rocket was built to carry. */
    const r = optimiseTurn(TORCH, 80000);
    expect(r && r.ok, "the Torch rocket did not fly").toBeTruthy();
    if (!r || !r.ok) return;
    const lofted = flyAscent(TORCH, LOFTED);
    expect(r.total).toBeGreaterThanOrEqual(floor(r));
    expect(r.total).toBeGreaterThan(3200);
    if (lofted.ok) expect(r.total).toBeLessThanOrEqual(lofted.total);
    expect(r.circShort).toBe(false);
  });

  it("flies the classic gravity turn when no lead is asked for", () => {
    const plain = flyAscent(TORCH, LOFTED);
    const zero = flyAscent(TORCH, { ...LOFTED, lead: 0 });
    expect(zero).toEqual(plain);
  });

  it("holds the nose above prograde where that flies a stack cheaper", () => {
    /* Six Hammers on a Mainsail, 187.5 t, TWR 1.40 for 24 s and 0.88 after:
       the stack #10's latest case was found on. Following prograde, the only
       turn that reaches orbit is the latest, shallowest kick on the grid;
       with the nose held above prograde an earlier, larger kick survives. */
    const r = optimiseTurn(STALL, 80000);
    const plain = optimiseTurn(STALL, 80000, 40000, []);
    expect(
      r && r.ok && plain && plain.ok,
      "the stack did not fly",
    ).toBeTruthy();
    if (!r || !r.ok || !plain || !plain.ok) return;
    expect(plain.lead).toBe(0);
    expect(r.lead).toBeGreaterThan(0);
    expect(r.total).toBeLessThan(plain.total - 50);
    expect(r.gLoss).toBeLessThan(plain.gLoss);
  });

  it("holds the invariant on a flight that never runs dry", () => {
    const r = optimiseTurn(TORCH_FULL, 80000);
    expect(r && r.ok, "the rocket did not fly").toBeTruthy();
    if (!r || !r.ok) return;
    expect(r.circStaged).toBe(false);
    expect(r.circShort).toBe(false);
    expect(r.total).toBeGreaterThanOrEqual(floor(r));
  });
});
