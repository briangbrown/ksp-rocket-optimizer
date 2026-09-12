# Objectives, tie-breaks, and the coupling term

**Syllabus:** [A15](../../README.md#part-2--algorithms-and-the-solver)

**Why it matters:** The objective matters because the solver can minimise
the rocket's mass, its cost or its part count, and a stage that is best on
one is rarely best on another, so every comparison in the search has to say
which quantity it is minimising, what decides between equals, and how much
of a stage's mass to charge against its price when the objective is not
mass; and the relations between the three answers, that the cheapest design
is never dearer than the lightest and the fewest-parts design never has more
parts, are not facts about optimisation but invariants the tests hold,
because a fitted coupling term and a per-stage score can and did break them.

**Before this:** [A6](greedy-top-down-staging.md), _Greedy top-down staging,
and when greed is wrong_.

## A worked case

Take the two upper stages of [A6](greedy-top-down-staging.md), each sized
for 8 t of payload and 1,800 m/s, and score them the three ways the solver
can:

| Stage         | Mass    | Cost        | Parts | Mass score | Cost score                     | Parts score         |
| ------------- | ------- | ----------- | ----- | ---------- | ------------------------------ | ------------------- |
| Reliant stage | 18.60 t | 2,762 funds | 4     | 19.05      | 2,762 + 1,500 × 18.60 = 30,662 | 4 + 18.60/20 = 4.93 |
| Poodle stage  | 18.03 t | 2,771 funds | 4     | 18.46      | 2,771 + 1,500 × 18.03 = 29,816 | 4 + 18.03/20 = 4.90 |

On raw cost the Reliant stage wins by 9 funds. On the cost score it loses
by 846, because the score charges every stage 1,500 funds for each tonne it
weighs, and the Poodle stage is 0.57 t lighter. That charge is the
coupling term: it stands in for the propellant and tanks the stage below
will need to lift the extra mass, which in A6's example came to 334 funds,
and the constant 1,500 is not that case's number but an average fitted by
sweeping missions. On parts the two tie at four, and the mass term breaks
the tie toward the lighter one. On mass the score is the mass with a small
addition per part, 0.6% each, so that two stages of equal mass are ordered
by how many pieces they are.

Then the whole mission, which is where the invariants live. The 20 t Mun
mission of the sweep, planned three times:

| Asked for | Mass on the pad | Cost          | Parts |
| --------- | --------------- | ------------- | ----- |
| Mass      | 397.7 t         | 228,319 funds | 52    |
| Cost      | 522.8 t         | 120,521 funds | 38    |
| Parts     | 519.2 t         | 139,375 funds | 16    |

Read down each column and the minimum is on the diagonal: the lightest is
lightest, the cheapest cheapest, the fewest-parts fewest. That is what the
invariants say, and it did not always hold: a Minmus mission asked for as
cheapest once came back at 48,761 funds against 42,235 asked for as
lightest, and the tests now hold that the diagonal is the minimum.

```js
const COUPLE_COST = 1500,
  COUPLE_PARTS = 20;
const score = (s, objective) =>
  objective === "cost"
    ? s.cost + s.total * COUPLE_COST
    : objective === "parts"
      ? s.parts + s.total / COUPLE_PARTS
      : s.total * (1 + 0.006 * (s.n + s.tanks)); // the solver's scoreOf, in miniature
const reliant = { total: 18.6, cost: 2762, parts: 4, n: 1, tanks: 3 };
const poodle = { total: 18.03, cost: 2771, parts: 4, n: 1, tanks: 3 };
for (const o of ["mass", "cost", "parts"])
  console.log(
    o,
    score(reliant, o).toFixed(2),
    score(poodle, o).toFixed(2),
    score(reliant, o) < score(poodle, o) ? "Reliant" : "Poodle",
  );
// the ordering the walk uses: constraint first, then score, and the first of equals stays
const better = (x, y) =>
  !y || (x.slim !== y.slim ? x.slim : x.chainScore < y.chainScore);
console.log(
  better({ slim: true, chainScore: 100 }, { slim: false, chainScore: 90 }),
  better({ slim: true, chainScore: 100 }, { slim: true, chainScore: 100 }),
); // true false
```

## The idea

An objective is the quantity being minimised, and this solver offers three:
pad mass, funds, and part count. They are not interchangeable views of one
answer; the table above shows the cheapest Mun rocket 31% heavier than the
lightest and the fewest-parts rocket with a third of the lightest's parts.
So the objective is threaded through every choice, from which tank set
covers a tonnage ([A8](../tank-packing/packing-propellant-into-tanks.md)) to
which stage wins a slot to which chain is delivered, and each choice needs a
score that says what "best" means under it.

A **tie-break** is a second quantity that decides between equal firsts.
Part counts are small integers and tie constantly; costs tie whenever two
stages use the same parts in different arrangements; so each score carries
a small term in another quantity, and the mass score's is the part count,
0.6% per engine or tank, which orders two stages of equal mass by their
piece count without ever outweighing a real difference in mass. Where even
the score ties, the ordering keeps the first of equals, which is why the
order candidates are compared in is part of the answer
([A12](../performance/sharding-a-search-across-workers.md)).

A **coupling term** is a small addition to the score that ties one
objective to another, and it exists because of the compounding that
[A6](greedy-top-down-staging.md) explained: a stage's mass is a cost to
every stage below it that the stage's own price does not show. The cost
score adds 1,500 funds per tonne and the parts score a twentieth of a part
per tonne, so that a heavier stage looks worse than its price says by about
what its mass will cost downstream. The constants were fitted by sweeping
missions: without them the cost objective came out dearer than the mass
objective on two of six test missions, and a moderate mass term also helped
the part count, because lighter stages need fewer tanks. A coupling term is
a heuristic, and its author's comment says so: it bounds the greedy pass's
myopia rather than removing it, and the chain comparison and the double
plan of A6 exist because a constant cannot be right for every mission.

```
   objective   score of one stage                 score of a chain             what breaks ties
   mass        total · (1 + 0.006·(n + tanks))    the final mass, compounded   fewer parts
   cost        cost + 1500·total                  Σ stage cost                 (the mass term, then order)
   parts       parts + total/20                   Σ stage parts                (the mass term, then order)

   and above all three: slim before score, first of equals stays
```

An **invariant** is a relation that must hold whatever the input, and the
three objectives have two that are worth writing down because they are not
automatic. The design asked for as cheapest must cost no more than the
design asked for as lightest, and the design asked for as fewest parts must
have no more parts than the lightest. Nothing in a per-stage score with a
fitted constant guarantees either; they held only after the chain
comparison and the double plan, which measure the finished rockets on the
objective asked for and deliver the better. So they are tests, not
theorems, and a change to a score, a constant or a heuristic is checked
against them.

## In this codebase

`scoreOf` in [`src/core/performance.ts`](../../../../src/core/performance.ts)
is the per-stage score, three lines under a comment that is the shortest
statement of the coupling term:

```ts
const COUPLE_COST = 1500,
  COUPLE_PARTS = 20;
function scoreOf(c: Solution, objective: Objective) {
  if (objective === "cost") return stageCost(c) + c.total * COUPLE_COST;
  if (objective === "parts") return stageParts(c) + c.total / COUPLE_PARTS;
  return c.total * (1 + 0.006 * (c.n + (c.tanks ? c.tanks.count : 0)));
}
```

`stageCost` and `stageParts` in the same file add up what a stage is made
of, engines, tanks, coupler, adapters, decoupler, joiners and packing
brackets, so that the score counts the parts the structure fit
([A10](../geometry/fitting-structure-as-a-graph-walk.md)) added. In
[`src/core/solver.ts`](../../../../src/core/solver.ts) the chain's score is
the final mass under the mass objective, because mass compounds, and the sum
of the stages' costs or parts under the others, with the comment "compare
whole chains on the chosen measure, not just the final mass — otherwise
splitting a segment always looks free in cost or part terms." `better` is
the ordering: the slenderness constraint first
([A13](../geometry/slenderness-as-a-constraint.md)), then the chain score
with a strict less-than, so the first of equals stays. The tank packer's
`rank` in [`src/core/tanks.ts`](../../../../src/core/tanks.ts) is the same
idea one level down, propellant then count for mass, funds then count for
cost, count then propellant for parts.

## What made it real

[`test/flown-cost.test.ts`](../../../../test/flown-cost.test.ts) holds the
two invariants on the Minmus mission that broke them: 6.5 t landed and
returned, cut after the descent, planned three ways, and the cheapest must
cost no more than the lightest and the fewest-parts have no more parts. The
case's numbers are in the plan's comment, 48,761 against 42,235, and the
fix was not to the score but to the plan: for the cost and parts objectives
the lightest design is planned too and the better delivered
([A6](greedy-top-down-staging.md)).

The design snapshot holds the scores themselves: 81 cases, three
objectives by three payloads by three budgets by three tiers, each pinned to
a baseline, so a change to `COUPLE_COST` or to the 0.6% moves a line. The
comment on `scoreOf` records how the constants were found and what they
fixed: "without them the cost objective came out dearer than the mass
objective on two of six test missions."

The Mun table above is the measurement that the diagonal is the minimum on
a real mission today, and the mission sweep pins the three 20 t Mun designs,
one per objective, so that a change that moved any of them is seen.

## Where it breaks

- **A score with no tie-break.** Part counts tie constantly, and a tie
  resolved by chance is a design that depends on iteration order. The
  mass term in every score and the first-of-equals rule make ties stable.
- **A coupling constant taken as truth.** 1,500 funds per tonne is an
  average over missions; in A6's example the true downstream cost of the
  extra 0.57 t was 334 funds, not 855. The chain comparison and the double
  plan exist because the constant is wrong for any particular rocket.
- **Reading the invariant as automatic.** Cheapest came back 6,526 funds
  dearer than lightest with the scores in place. The relation is held by a
  test and a plan-level comparison, not by the score.
- **Comparing chains on the final mass under cost.** Splitting a segment
  looks free in cost or parts if only the final mass is compared; the chain
  score sums the stages' cost or parts.
- **Ordering the constraint after the score.** Slenderness is asked first
  in `better`, whatever the objective; a pencil that is 10% lighter is not
  a better rocket ([A13](../geometry/slenderness-as-a-constraint.md)).

## Try it

Run the snippet, then change `COUPLE_COST` to 10: the Reliant stage now
wins the cost score by 3 funds, because its extra 0.57 t is charged under 6,
and the solver would take the stage that A6 showed makes the dearer rocket.
At 500 the Poodle still wins by 276, so the term does not need to be right
to be useful; it needs to be within a factor of a few of the truth. Then
run `npx vitest run test/flown-cost.test.ts` and read the invariant it
holds; then change the constant in `performance.ts` the same way and run
`npm test`, and watch the design snapshot move on the cost cases. Put it
back.

## Check yourself

<details><summary>Why does the cost score charge a stage 1,500 funds per tonne when funds are what is being minimised?</summary>

Because a stage's mass is a cost to every stage below it that the stage's
own price does not show: propellant and tanks to lift it. The coupling term
prices that downstream effect into the per-stage comparison so a greedy
pass is less myopic. It is a fitted average, which is why the chain
comparison judges the finished rockets on real cost as well.

</details>

<details><summary>What does the mass score's 0.6% per part do, and when could it change a design?</summary>

It breaks ties. Two stages of equal mass are ordered by how many pieces
they are, so the simpler one wins and the choice does not depend on
iteration order. It could only change a design where the mass difference
between two stages is smaller than 0.6% per part of difference, which is a
near-tie by construction.

</details>

<details><summary>Why is "cheapest is never dearer than lightest" a test rather than a consequence of the cost objective?</summary>

Because the cost objective minimises with a per-stage score and a fitted
constant, group by group, and none of that guarantees the finished rocket
costs less than the one the mass objective finds; it once cost 6,526 funds
more. The relation holds because the plan measures both finished rockets
on cost and delivers the cheaper, and the test is what keeps it holding.

</details>

## Further reading

- Jorge Nocedal and Stephen Wright, _Numerical Optimization_, the
  introduction, for objectives, constraints and why a penalty term is a
  heuristic stand-in for a constraint or a coupled cost.
- Kaisa Miettinen, _Nonlinear Multiobjective Optimization_, the opening
  chapters, for what it means that mass, cost and parts have no single
  optimum.

## Key takeaway

Every comparison names its objective, breaks ties on a second quantity so
the design does not depend on order, and charges a stage a fitted 1,500
funds or a twentieth of a part per tonne for the mass it hands down; the
relations between the three answers, cheapest no dearer than lightest and
fewest parts no more numerous, are invariants held by a test and by
planning the lightest design as well, because a score with a constant in it
does not hold them on its own.

_As of 2ecc64f._
