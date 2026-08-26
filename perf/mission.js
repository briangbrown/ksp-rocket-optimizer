import { planMission } from "../src/core/plan.js";
import { DATA } from "../src/core/catalogue.js";
import { withDeps } from "../src/core/tech.js";
import { buildRoute } from "../src/core/orbits.js";

const unlocked = withDeps(
  DATA.nodes,
  new Set(
    Object.entries(DATA.nodes)
      .filter(([, v]) => v.lvl <= 9)
      .map(([k]) => k),
  ),
);
const engines = DATA.engines.filter((e) => unlocked.has(e.t) && !e.mh && !e.rs);
const tanks = DATA.tanks.filter(
  (t) => (!t.t || unlocked.has(t.t)) && !t.mh && !t.rs,
);

for (const dest of ["Mun", "Minmus", "Duna", "Jool", "Dres"]) {
  const route = buildRoute(dest, "land", true, "Kerbin", true, false);
  const input = {
    route,
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
  const t0 = process.hrtime.bigint();
  const r = await planMission(input);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(
    `${dest.padEnd(8)} ${ms.toFixed(0).padStart(6)} ms   ${r.stages.length} stages`,
  );
}
