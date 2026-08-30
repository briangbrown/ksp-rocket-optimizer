import { DATA } from "../src/core/catalogue.js";
import { withDeps } from "../src/core/tech.js";
import { buildRoute } from "../src/core/orbits.js";
import type { Objective } from "../src/core/performance.js";
import type { PlanInput } from "../src/core/plan.js";
import type { GroupInput } from "../src/core/solver.js";

/* The grid the design snapshot solves.

   Kept separate from the test so the axes can be read and changed without
   scrolling past the signature machinery. Widening it is cheap in wall-clock
   but not free: every added combination is another design to re-bless by hand
   when a change is genuinely intended. */

/* Tech tiers, as the tech-tree slider produces them: every node at or below a
   level, plus whatever those nodes depend on. Level 3 is roughly early career,
   5 mid, 9 most of the tree unlocked. */
const tierUnlocks = (lvl: number) =>
  withDeps(
    DATA.nodes,
    new Set(
      Object.entries(DATA.nodes)
        .filter(([, v]) => v.lvl <= lvl)
        .map(([k]) => k),
    ),
  );

export const TIERS = [3, 5, 9];
export const PAYLOADS = [0.8, 3.5, 12];
export const DV_BUDGETS = [3600, 5400, 9000];
export const OBJECTIVES: ReadonlyArray<Objective> = ["mass", "cost", "parts"];

/* Slenderness pairs with payload rather than multiplying out: a 14:1 limit is
   the interesting case on a light payload, where the solver wants a pencil, and
   uninteresting on a heavy one that is squat regardless. */
const aspectFor = (payload: number) => (payload <= 1 ? 14 : Infinity);

/* Stock parts only. Making History is excluded from the app entirely and
   ReStock+ is a user toggle; pinning both off keeps the snapshot a statement
   about the solver rather than about the part roster. */
const enginesFor = (unlocked: ReadonlySet<string>) =>
  DATA.engines.filter((e) => unlocked.has(e.t) && !e.mh && !e.rs);

const tanksFor = (unlocked: ReadonlySet<string>) =>
  DATA.tanks.filter((t) => (!t.t || unlocked.has(t.t)) && !t.mh && !t.rs);

/* One case per combination, named so a failure says which design moved. */
export function cases() {
  const out: Array<{ name: string; input: GroupInput }> = [];
  for (const tier of TIERS) {
    const unlocked = tierUnlocks(tier);
    const engines = enginesFor(unlocked);
    const tanks = tanksFor(unlocked);
    const srbs = engines.filter((e) => e.f.includes("SF") && e.fuelM > 0);
    for (const payload of PAYLOADS) {
      for (const dv of DV_BUDGETS) {
        for (const objective of OBJECTIVES) {
          out.push({
            name: `tier${tier}-pay${payload}-dv${dv}-${objective}`,
            input: {
              dv,
              payload,
              engines,
              tanks,
              unlocked,
              excluded: new Set<string>(),
              needGimbal: false,
              maxAspect: aspectFor(payload),
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
      }
    }
  }
  return out;
}

/* The missions the walk sweep solves.

   A different question from the grid above, one layer out. That one drives
   `solveGroup` and reads `best`; the application does not. For an
   auto-stage-count launch, `planMission` walks `byK` cheapest-first through the
   ascent simulator and delivers the first candidate that flies, and nothing
   pinned that above the default roster — which is how a solver change measured
   as invisible turned out to move eleven real missions. #45.

   Tier 9 because that is where the walk has candidates to choose between: a
   thin roster produces one buildable stack and no decision to get wrong.
   Destinations spread across the delta-v range, since the stage count the walk
   is choosing among follows the budget, and payloads spread because the pool it
   walks is per stage count and the payload is what moves between them.

   Deliberately small. This is a regression net, not a survey — the 128-case
   sweep that found the original problem took 90 seconds, and a check nobody
   wants to run is not a check. */
export const MISSIONS = ["Low orbit", "Mun", "Duna", "Tylo"];
export const MISSION_PAYLOADS = [0.8, 3.5, 12];

/* The application's own defaults, so a difference here is a difference a user
   would see. ui/app.jsx is the authority for every one of these. */
export function missionCases() {
  const unlocked = tierUnlocks(9);
  const out: Array<{ name: string; input: PlanInput }> = [];
  for (const dest of MISSIONS)
    for (const payload of MISSION_PAYLOADS)
      out.push({
        name: `${dest}-pay${payload}`,
        input: {
          route: buildRoute(dest, "land", true, "Kerbin", true, false),
          cuts: [],
          payload,
          payloadDia: 1.25,
          margin: 10,
          extraDv: 0,
          engines: enginesFor(unlocked),
          tanks: tanksFor(unlocked),
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
        },
      });
  return out;
}
