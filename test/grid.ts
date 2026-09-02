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
  /* One of them cut into segments, which none of the twelve above are.

     Cuts are how a user says "this part flies on its own hardware", and until
     #102 they were also the only way to reach a whole branch of the
     slenderness constraint: a segment was judged as though it were the whole
     rocket with a pod on its nose, so four segments reading 6.2, 4.6, 2.3 and
     1.7 against a limit of 8 came back as a vehicle that is 9.5:1. Eeloo has
     enough legs to cut three times and a budget that makes the limit bind. */
  out.push({
    name: "Eeloo-pay2.5-cut",
    input: {
      route: buildRoute("Eeloo", "land", true, "Kerbin", true, false),
      cuts: [0, 1, 2],
      payload: 2.5,
      payloadDia: 1.25,
      margin: 10,
      extraDv: 0,
      engines: enginesFor(unlocked),
      tanks: tanksFor(unlocked),
      unlocked: [...unlocked],
      excluded: [],
      needGimbal: true,
      maxAspect: 8,
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

/* What the mission sweep pins: every mission above, and the same one again with
   crossfeed on, once per objective.

   Its own list rather than three more rows in `missionCases`, because that is
   read by `test/model.test.ts` too — which builds the model of every mission at
   every staging step, and which carries a note about a worker running out of
   memory when they were built twice. Three more missions there costs what the
   note warns about; here it costs a second and a half.

   One asparagus row would not do. Two of the three defects this branch has
   produced were objective-specific: #93's NaN price could only be seen on cost,
   because every comparison against NaN is false and the stage simply never won,
   and #97's phantom part only on parts, because that is the only objective that
   counts them. #125 */
export function sweepCases() {
  return [
    ...missionCases(),
    ...OBJECTIVES.map((objective) => ({
      name: `Mun-pay20-asparagus-${objective}`,
      input: asparagusInput(objective),
    })),
  ];
}

/* A mission the drop-tank pool actually builds for.

   Asparagus is what turns that pool on, and nothing else turned it on: the grid
   above never sets it and the mission sweep pinned it off. So a stage built from
   drop tanks was solved by no check at all until #93, which is how the stand-in
   part for one came to carry no price. Twelve tonnes was not enough to reach for
   them; twenty is.

   The sweep carries three of these now — see `sweepCases` — because checking a
   design against itself is not the same as pinning what the solver delivers, and
   this branch had produced three defects before anything looked at it. #125 */
export function asparagusInput(objective: Objective): PlanInput {
  const unlocked = tierUnlocks(9);
  return {
    route: buildRoute("Mun", "land", true, "Kerbin", true, false),
    cuts: [],
    payload: 20,
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
    asparagus: true,
    objective,
    origin: "Kerbin",
    splitBy: [],
    boosters: true,
  };
}
