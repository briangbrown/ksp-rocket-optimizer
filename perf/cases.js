import { DATA } from "../src/core/catalogue.js";
import { withDeps } from "../src/core/tech.js";
import { buildRoute } from "../src/core/orbits.js";

/* Inputs for the benchmarks.

   The grid is not defined here — it is imported from test/grid.js, so the
   thing being timed is exactly the thing the design snapshot pins. If the two
   drifted apart, a measured improvement would stop meaning the designs were
   unchanged, which is the only reason these numbers can be trusted. */

export const tierUnlocks = (lvl) =>
  withDeps(
    DATA.nodes,
    new Set(
      Object.entries(DATA.nodes)
        .filter(([, v]) => v.lvl <= lvl)
        .map(([k]) => k),
    ),
  );

const roster = (lvl) => {
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
export function missionInput(dest, lvl) {
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
