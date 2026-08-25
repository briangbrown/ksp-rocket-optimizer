import { DATA, withDeps } from '../src/ksp-mission-planner.jsx'

/* The grid the design snapshot solves.

   Kept separate from the test so the axes can be read and changed without
   scrolling past the signature machinery. Widening it is cheap in wall-clock
   but not free: every added combination is another design to re-bless by hand
   when a change is genuinely intended. */

/* Tech tiers, as the tech-tree slider produces them: every node at or below a
   level, plus whatever those nodes depend on. Level 3 is roughly early career,
   5 mid, 9 most of the tree unlocked. */
const tierUnlocks = (lvl) =>
  withDeps(
    DATA.nodes,
    new Set(
      Object.entries(DATA.nodes)
        .filter(([, v]) => v.lvl <= lvl)
        .map(([k]) => k),
    ),
  )

export const TIERS = [3, 5, 9]
export const PAYLOADS = [0.8, 3.5, 12]
export const DV_BUDGETS = [3600, 5400, 9000]
export const OBJECTIVES = ['mass', 'cost', 'parts']

/* Slenderness pairs with payload rather than multiplying out: a 14:1 limit is
   the interesting case on a light payload, where the solver wants a pencil, and
   uninteresting on a heavy one that is squat regardless. */
const aspectFor = (payload) => (payload <= 1 ? 14 : Infinity)

/* Stock parts only. Making History is excluded from the app entirely and
   ReStock+ is a user toggle; pinning both off keeps the snapshot a statement
   about the solver rather than about the part roster. */
const enginesFor = (unlocked) =>
  DATA.engines.filter((e) => unlocked.has(e.t) && !e.mh && !e.rs)

const tanksFor = (unlocked) =>
  DATA.tanks.filter((t) => (!t.t || unlocked.has(t.t)) && !t.mh && !t.rs)

/* One case per combination, named so a failure says which design moved. */
export function cases() {
  const out = []
  for (const tier of TIERS) {
    const unlocked = tierUnlocks(tier)
    const engines = enginesFor(unlocked)
    const tanks = tanksFor(unlocked)
    const srbs = engines.filter((e) => e.f.includes('SF') && e.fuelM > 0)
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
              excluded: new Set(),
              needGimbal: false,
              maxAspect: aspectFor(payload),
              expansions: null,
              asparagus: false,
              g: 9.81,
              kind: 'launch',
              bodyName: 'Kerbin',
              boosters: true,
              srbs,
              objective,
              minK: 1,
              maxK: 3,
            },
          })
        }
      }
    }
  }
  return out
}
