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

  it("holds the invariant on a flight that never runs dry", () => {
    const r = optimiseTurn(TORCH_FULL, 80000);
    expect(r && r.ok, "the rocket did not fly").toBeTruthy();
    if (!r || !r.ok) return;
    expect(r.circStaged).toBe(false);
    expect(r.circShort).toBe(false);
    expect(r.total).toBeGreaterThanOrEqual(floor(r));
  });
});
