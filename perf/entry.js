import { solveGroup } from "../src/core/solver.js";
import { DATA } from "../src/core/catalogue.js";
import { withDeps } from "../src/core/tech.js";

const tierUnlocks = (lvl) =>
  withDeps(
    DATA.nodes,
    new Set(
      Object.entries(DATA.nodes)
        .filter(([, v]) => v.lvl <= lvl)
        .map(([k]) => k),
    ),
  );

export function cases() {
  const out = [];
  for (const tier of [3, 5, 9]) {
    const unlocked = tierUnlocks(tier);
    const engines = DATA.engines.filter(
      (e) => unlocked.has(e.t) && !e.mh && !e.rs,
    );
    const tanks = DATA.tanks.filter(
      (t) => (!t.t || unlocked.has(t.t)) && !t.mh && !t.rs,
    );
    const srbs = engines.filter((e) => e.f.includes("SF") && e.fuelM > 0);
    for (const payload of [0.8, 3.5, 12])
      for (const dv of [3600, 5400, 9000])
        for (const objective of ["mass", "cost", "parts"])
          out.push({
            name: `tier${tier}-pay${payload}-dv${dv}-${objective}`,
            tier,
            objective,
            input: {
              dv,
              payload,
              engines,
              tanks,
              unlocked,
              excluded: new Set(),
              needGimbal: false,
              maxAspect: payload <= 1 ? 14 : Infinity,
              expansions: null,
              asparagus: false,
              g: 9.81,
              kind: "launch",
              bodyName: "Kerbin",
              boosters: true,
              srbs,
              objective,
              minK: 1,
              maxK: 3,
            },
          });
  }
  return out;
}

const rows = [];
for (const c of cases()) {
  const t0 = process.hrtime.bigint();
  const res = solveGroup(c.input);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  rows.push({
    name: c.name,
    tier: c.tier,
    objective: c.objective,
    ms,
    solved: !!res,
  });
}
console.log(JSON.stringify(rows));
