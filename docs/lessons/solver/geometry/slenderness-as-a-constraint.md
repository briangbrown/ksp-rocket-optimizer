# Slenderness as a constraint on the whole rocket

**Syllabus:** [A13](../../README.md#part-2--algorithms-and-the-solver)

**Why it matters:** Slenderness matters because a rocket that is too tall
for its width wobbles on the pad and flips in the upper atmosphere in the
game whatever its Δv says, so the solver must refuse such designs rather
than merely prefer wider ones; treated as a tie-break it once let a 30.6:1
pencil through under a 14:1 limit, and measured on a segment of the rocket
rather than the whole of it, it passed a 9.5:1 vehicle whose four segments
each read under 8, because the thing that leaves the pad is the whole
stack, and the whole stack is the only thing the game's verdict applies to.

**Before this:** [A9](packing-circles-clusters-and-rings.md), _Packing
circles: clusters and rings_.

## A worked case

Plan the Duna 3.5 t landing and return from the test grid, with the
slenderness limit at four settings:

| Limit | Pad mass | Cost         | Stages                                                          |
| ----- | -------- | ------------ | --------------------------------------------------------------- |
| 6:1   | 143.5 t  | 45,172 funds | Mainsail, then nine Terriers in three columns, Reliant, Terrier |
| 8:1   | 143.5 t  | 45,172 funds | the same                                                        |
| 14:1  | 141.4 t  | 41,267 funds | Mainsail, two Swivels, two Terriers, Terrier                    |
| 30:1  | 141.4 t  | 41,267 funds | the same                                                        |

At the default of 14:1 the best rocket is a single tall stack. Tighten the
limit to 8:1 and that rocket is no longer allowed, so the solver delivers
one 2.1 t heavier and 3,905 funds, 9%, dearer: the second stage becomes
nine Terriers in three parallel columns, which is height traded for width.
Loosen it to 30:1 and nothing changes, because the 14:1 rocket was not
touching the limit; tighten it to 6:1 and nothing changes either, because
the 8:1 rocket was already under 6. The limit is a wall, not a slope: on
one side of it the design is what it would have been anyway, and on the
other the solver builds a different rocket to get under it.

Two designs on record are why it is a wall. Under a 14:1 limit the
candidate walk once delivered a 30.6:1 stack, because slenderness was a
tie-break in the ordering and every compliant candidate had failed to fly;
the walk fell through to the pencils. And on the Eeloo mission cut into four
segments, each segment read 6.2, 4.6, 2.3 and 1.7 against a limit of 8, all
under, for a rocket that was 9.5:1, because each segment was measured as
though it were the whole rocket with a pod on its nose.

Because the plan is in TypeScript, the snippet is a test file. Save it as
`test/slender-try.test.ts` and run
`npx vitest run test/slender-try.test.ts --reporter=verbose`:

```ts
import { it } from "vitest";
import { planMission } from "../src/core/plan.js";
import { stackGeometry } from "../src/core/geometry.js";
import { missionCases } from "./grid.js";
it("the same mission under two slenderness limits", async () => {
  const c = missionCases().find((x) => x.name === "Duna-pay3.5")!;
  for (const maxAspect of [8, 14]) {
    const plan = (await planMission(
      { ...c.input, maxAspect },
      { onYield: () => Promise.resolve() },
    ))!;
    const solved = plan.stages.filter((s) => s.sol);
    const { ar } = stackGeometry(solved, c.input.payload, c.input.payloadDia);
    console.log(
      maxAspect,
      solved[0].sol!.total.toFixed(1),
      "t",
      solved.reduce((a, s) => a + s.sol!.cost, 0),
      "funds",
      ar.toFixed(1),
      ":1",
    );
  }
}, 120_000);
```

## The idea

**Slenderness** is a stack's height over its width, and it is the one
number the solver has for whether a rocket can be built and flown in the
game at all. A tall thin stack flexes at its joints on the pad and, once
the air is thin and the nose is pitched over, the aerodynamic forces on its
length overcome its control and it flips. Nothing in the rocket equation
sees this: a pencil of small tanks under a small engine can have excellent
Δv. So the limit is an input from the player, 14:1 by default, and it is
measured on the whole vehicle: every stage stacked, plus the payload, whose
height is taken as 0.8 of its diameter because the pod on the nose is
load-bearing in the count, over the widest thing in the stack, boosters
excluded because they stage away.

A **constraint** is a limit a design must satisfy, as against a quantity it
is scored on. The distinction is what an optimiser does when the two
conflict. A score is traded: a rocket 10% lighter and 10% taller may win on
score. A constraint is not: a rocket over the limit is out, however light,
and only if no design under the limit exists is the best of the rest
offered, marked as over, so that the reader is never left with no design at
all and is never quietly handed one they ruled out. The comparison that
orders candidates therefore asks about the constraint first and the score
second: two compliant candidates are ordered by score; a compliant one beats
a non-compliant one whatever their scores.

```
   14:1 limit                          8:1 limit

       ▐▌  payload                         ▐▌
       ██  Terrier                         ██
       ██  2× Terrier                    ▐████▌  9 Terriers in 3 columns:
       ██                                ▐████▌  the same propellant, a third
       ██  2× Swivel                       ██    the height, three times the width
       ██                                  ██
      ████ Mainsail                       ████
     ──────                              ──────
     141.4 t, 41,267 funds              143.5 t, 45,172 funds
     one tall stack: allowed at 14      over 8, so height is traded for width
```

Because the constraint is on the whole rocket and the solver works a group
at a time, the whole rocket has to be carried to where each group is
judged. Groups are solved from the top of the stack downward, so when a
group is sized everything above it is already known; the solver carries
that down as a height and a width, adds the group's own chain and the
payload, and judges the sum. The group that reaches the pad, the last one
solved, therefore judges the vehicle that leaves it, which is the one
judgement that gates delivery. A mission with no cuts is one group, and
there the segment and the vehicle are the same thing, which is why neither
baseline saw the four-segment case until it was cut.

And because the limit is a wall, the solver has a way to get under it that
costs almost nothing in propellant: packing. A run of identical tanks need
not be a single column; four can ring a fifth, one tank tall at three times
the width. Nothing about the propellant changes, only a few kilograms of
brackets, so it is applied after a chain is complete, when what is below
each stage is known, and only where there is width to spare, since frontal
area is a maximum over the stack and widening a stage inside the widest
thing already there costs no drag. The Duna rocket's three Terrier columns
at 8:1 are that trade made.

## In this codebase

The judgement is at the end of `solveUnit` in
[`src/core/solver.ts`](../../../../src/core/solver.ts), once the chain is
complete and packed:

```ts
const ar = stackGeometry(chain, payload, payloadDia, above).ar; // the whole stack, not this segment
const cand = {
  chain,
  total: carried,
  k,
  chainScore,
  ar,
  slim: ar <= maxAspect,
};
```

and the ordering is `better`, two lines that say constraint first, score
second:

```ts
const better = (x: ChainCandidate, y: ChainCandidate | null | undefined) =>
  !y || (x.slim !== y.slim ? x.slim : x.chainScore < y.chainScore);
```

`stackGeometry` in [`src/core/geometry.ts`](../../../../src/core/geometry.ts)
adds `above`, the height and width of the groups already solved, to the
chain's own and the payload's, with `PAYLOAD_ASPECT` at 0.8; `stackOf` in
[`src/core/plan.ts`](../../../../src/core/plan.ts) is what carries the
solved stages down from group to group. The walk in `planMission` filters
its pool to the compliant candidates first and falls back to the rest only
when none exist, with the comment: "slenderness is a constraint the user
set, not a tie-break." `packFor`, in the geometry module, is the
height-for-width trade, run over the finished chain from the top down with
the room below each stage as its limit, and copying each stage before it
writes, because stage solutions are shared between candidate chains.

## What made it real

[`test/slenderness.test.ts`](../../../../test/slenderness.test.ts) is the
whole-rocket guard: it plans the Eeloo mission cut into segments, requires
that the cuts produced more than one, and requires the stacked geometry of
every solved stage together to be within the limit, which is the assertion
the four-segment case failed. Its header carries the numbers: 6.2, 4.6, 2.3
and 1.7 against 8, for a 9.5:1 vehicle.

The tie-break case is the rule under _Slenderness is a constraint, not a
tie-break_ in [`.claude/rules/solver.md`](../../../../.claude/rules/solver.md):
the walk fell through every compliant design and returned a 30.6:1 stack
under a 14:1 limit. The candidate walk's pool is filtered to compliant
designs first because of it, and the 128-mission sweep that measured the
cluster-cap variant ran at two slenderness limits for the same reason: the
limit changes which rocket is delivered, so a solver change has to be
checked at more than one.

The Duna table above is the measurement of what the wall costs: 2.1 t and
9% of the price at 8:1, nothing at 30:1, and the packed three-column stage
as the shape of the trade.

## Where it breaks

- **A constraint ordered as a score.** Any comparison that puts slenderness
  after the objective, or weights it, lets a pencil through when the
  compliant candidates fail for another reason. `better` asks `slim` first.
- **Measuring a segment.** Each group alone can pass while the stack fails;
  `above` is carried down and the pad group judges the vehicle.
- **Forgetting the payload.** The pod on the nose is height; leaving it out
  passed stacks that were over the limit with their payload on.
  `PAYLOAD_ASPECT` is the line that puts it in.
- **Recomputing the geometry locally.** Width, height and packing are
  computed once in `stageGeom` and `stageSize`, and the rule under their
  names records the three times a local copy drifted and the drawing
  described a different rocket from the one being judged.
- **Packing onto a shared solution.** Writing the packed ring onto a stage
  leaked one chain's geometry into another, and the "already packed" guard
  then skipped re-checking it against different room below; three stages
  ended up wider than the stage they sat on. Copy first.

## Try it

Run the test file above and read the two lines: about 143.5 t and 45,172
funds under 8:1, 141.4 t and 41,267 under 14:1, with the whole-rocket
slenderness of each. Then set the limit to 4 and watch the solver either
find a wider arrangement or, if none exists, deliver the best it has and
report it over the limit; in the application the same design's slenderness
figure turns amber on the build view.

## Check yourself

<details><summary>Why is slenderness a constraint rather than a term in the score?</summary>

Because the game's verdict is not a trade. A rocket over the limit flips,
however light, so no saving in mass or funds is worth crossing it; and a
score term can always be outweighed. `better` orders compliant candidates
ahead of non-compliant ones whatever their scores, and only when no
compliant design exists is the best of the rest offered, marked as over.

</details>

<details><summary>Four segments of a cut mission each read under 8:1 and the rocket was 9.5:1. How?</summary>

Because each segment was judged as though it were the whole rocket with a
payload on top, and a segment is shorter than the stack it sits in. The
vehicle that leaves the pad is every segment stacked, so the solver now
carries the solved groups' height and width down and judges the sum at the
group that reaches the pad.

</details>

<details><summary>Why does tightening the limit from 14:1 to 8:1 change the Duna rocket, while tightening from 30:1 to 14:1 does not?</summary>

Because a constraint only acts where it binds. The 14:1 rocket is well
under 30 and is delivered unchanged at either; at 8 it is over, so the
solver must find a different arrangement, and the cheapest one under the
wall is a stage packed into three columns, 2.1 t heavier and 9% dearer.

</details>

## Further reading

- Jorge Nocedal and Stephen Wright, _Numerical Optimization_, the
  introduction to constrained optimisation, for why a feasibility
  constraint is handled differently from an objective.
- The Kerbal Space Program wiki's page on aerodynamics, for what a tall
  narrow stack does in the upper atmosphere and why players widen them.

## Key takeaway

Slenderness is height over width of the whole rocket, payload included, and
it is a wall the design must be under, not a quantity it is scored on: the
comparison asks compliance before score, the judgement is made on the
stack that leaves the pad rather than on the segment being solved, and
when the wall binds the solver trades height for width by packing tanks
into a ring, which on the Duna mission costs 2.1 t and 9% at 8:1 and
nothing at all at 14:1.

_As of 2ecc64f._
