import { DATA } from "../src/core/catalogue.js";
import { withDeps } from "../src/core/tech.js";
import { buildRoute } from "../src/core/orbits.js";
import type { PlanInput } from "../src/core/plan.js";

/* Inputs for the benchmarks.

   The grid is not defined here — it is imported from test/grid.js, so the
   thing being timed is exactly the thing the design snapshot pins. If the two
   drifted apart, a measured improvement would stop meaning the designs were
   unchanged, which is the only reason these numbers can be trusted. */

export const tierUnlocks = (lvl: number) =>
  withDeps(
    DATA.nodes,
    new Set(
      Object.entries(DATA.nodes)
        .filter(([, v]) => v.lvl <= lvl)
        .map(([k]) => k),
    ),
  );

const roster = (lvl: number) => {
  const unlocked = tierUnlocks(lvl);
  return {
    unlocked,
    engines: DATA.engines.filter((e) => unlocked.has(e.t) && !e.mh && !e.rs),
    tanks: DATA.tanks.filter(
      (t) => (!t.t || unlocked.has(t.t)) && !t.mh && !t.rs,
    ),
  };
};

/* A whole mission through the seam, the way the application asks for it —
   defaults from ui/app.jsx: 2.5 t payload, land and return, cost, 10% margin.
   This is the number a user actually waits for; the grid is a CI-shaped
   workload and is roughly an order of magnitude larger. */
export function missionInput(dest: string, lvl: number): PlanInput {
  const { unlocked, engines, tanks } = roster(lvl);
  return {
    route: buildRoute(dest, "land", true, "Kerbin", true, false),
    cuts: [],
    payload: 2.5,
    payloadDia: 1.25,
    margin: 10,
    extraDv: 0,
    engines,
    tanks,
    unlocked: [...unlocked],
    excluded: [],
    needGimbal: true,
    maxAspect: 14,
    expansions: { mh: false, rs: false },
    asparagus: false,
    objective: "cost",
    origin: "Kerbin",
    splitBy: [],
    boosters: true,
  };
}

export const MISSIONS = ["Mun", "Minmus", "Duna", "Dres", "Jool"];

/* The same mission expressed as a string the app's "Load configuration" accepts.

   Clicking a tech tier and trusting the defaults is close, but close is not what
   a comparison against container numbers needs — one different setting and the
   two are measuring different searches. test/perf-config.test.js checks this
   still round-trips through parseConfig, because a silently rejected field would
   send someone off to measure the wrong thing. */
export function missionConfig(lvl = 9, dest = "Mun") {
  return (
    "KSP-PLANNER " +
    JSON.stringify({
      origin: "Kerbin",
      dest,
      profile: "land",
      returning: true,
      payload: 2.5,
      payloadDia: 1.25,
      margin: 10,
      extraDv: 0,
      objective: "cost",
      boosters: true,
      chutes: true,
      needGimbal: true,
      planeNow: false,
      asparagus: false,
      maxAspect: 14,
      expansions: { mh: false, rs: false },
      tech: [...tierUnlocks(lvl)].sort(),
      excluded: [],
      cuts: null,
      splits: [],
    })
  );
}
