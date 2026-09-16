import { describe, it, expect } from "vitest";
import { solveGroup } from "../src/core/solver.js";
import type { GroupInput } from "../src/core/solver.js";
import { DATA } from "../src/core/catalogue.js";
import { withDeps } from "../src/core/tech.js";
import { lowOrbit, gOf } from "../src/core/orbits.js";

/* A solid burns once.

   It cannot be throttled, shut down or relit: the grain lights and burns to
   depletion. So a stage whose own engine is a solid can fly exactly one burn,
   and a stage covering two legs is covering two ignitions with a coast between
   them. The solver used to offer a Pol return as a single Kickback flying a
   landing, a climb off Pol, a transfer out of the Jool system and an
   aerobrake. #435

   Neither of the two big checks could see it. The design snapshot solves with
   no legs at all, so it cannot express how many burns a stage makes; the
   mission sweep had exactly one solid among 169 delivered stages, and that one
   covered a single burn. Hence a test on the arithmetic, and the Pol mission
   added to the sweep beside it. */

const unlocked = withDeps(
  DATA.nodes,
  new Set(
    Object.entries(DATA.nodes)
      .filter(([, v]) => v.lvl <= 9)
      .map(([k]) => k),
  ),
);

/* Solids only, so a chain exists if and only if a solid is allowed to fly the
   legs asked for. With a liquid in the pool the test would pass on a liquid
   and say nothing. */
const solidsOnly = DATA.engines.filter(
  (e) => e.f.includes("SF") && unlocked.has(e.t) && !e.mh && !e.rs,
);

const base: GroupInput = {
  dv: 1600,
  payload: 2.5,
  payloadDia: 1.25,
  engines: solidsOnly,
  tanks: DATA.tanks.filter((t) => !!t.t && unlocked.has(t.t) && !t.mh && !t.rs),
  unlocked,
  excluded: null,
  needGimbal: false,
  maxAspect: 14,
  expansions: { mh: false, rs: false },
  asparagus: false,
  g: gOf("Pol"),
  kind: "space",
  boosters: false,
  srbs: [],
  /* One stage, so the stage's slice is the whole group and the legs below are
     the burns it has to make. With the count free, a three-stage chain can put
     each stage inside one leg and be perfectly legitimate — which is the rule
     working, not a hole in it, and no test of the rule at all. */
  minK: 1,
  maxK: 1,
};

/* One burn's worth of Δv either way, so the two cases differ in how the route
   is cut up and in nothing else. */
const pol = lowOrbit("Pol");
const oneLeg = [
  { end: 1, kind: "transfer", g: gOf("Pol"), body: "Pol", orbit: pol },
];
const twoLegs = [
  { end: 0.5, kind: "transfer", g: gOf("Pol"), body: "Pol", orbit: pol },
  { end: 1, kind: "plane", g: gOf("Pol"), body: "Pol", orbit: pol },
];
/* Two climbs off the same body run one into the other with nothing shut down
   between them, so they are one ignition however the route names them. */
const twoClimbs = [
  { end: 0.5, kind: "ascentBack", g: gOf("Pol"), body: "Pol", orbit: null },
  { end: 1, kind: "ascentBack", g: gOf("Pol"), body: "Pol", orbit: null },
];

const solidsIn = (legs: GroupInput["legs"]) => {
  const res = solveGroup({ ...base, legs });
  return res
    ? res.chain.filter((s) => s.sol.engine.f.includes("SF")).length
    : 0;
};

describe("a solid flies one burn", () => {
  it("takes a leg of its own", () => {
    expect(solidsIn(oneLeg)).toBeGreaterThan(0);
  });

  it("is refused a stage that has to light twice", () => {
    expect(solidsIn(twoLegs)).toBe(0);
  });

  it("is allowed two climbs off the same body, which are one burn", () => {
    expect(solidsIn(twoClimbs)).toBeGreaterThan(0);
  });
});
