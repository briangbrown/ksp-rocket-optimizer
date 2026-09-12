# Greedy top-down staging, and when greed is wrong

**Syllabus:** [A6](../../README.md#part-2--algorithms-and-the-solver)

**Why it matters:** The order stages are solved in matters because a stage
cannot be sized until the mass it must lift is known, and that mass is every
stage above it, so the solver works from the payload down, taking the best
stage at each step and never revisiting; that is exactly right when the
objective is mass, because a lighter stage above is always better for the
stage below, and quietly wrong when it is cost or part count, because the
cheapest stage above can be the heaviest, and its extra mass is a cost the
stage below pays and the stage above never sees; left unfixed, the design
asked for as cheapest came back 6,500 funds dearer than the one asked for as
lightest.

**Before this:** [P4](../../physics/staging/staging-why-more-and-when-to-stop.md),
_Staging: why more, and when to stop_.

## A worked case

Design a two-stage rocket by hand for 8 t of payload: an upper stage of
1,800 m/s and a lower stage of 3,400 m/s under it. Take the tanks at the
FL-T family's ratio, one part dry to eight of propellant, at 200 funds per
tonne of propellant on the upper stage and 180 on the lower, and a Mainsail
under the lower stage. For the upper stage there are two engines to choose
between:

| Upper engine | Cost  | Mass   | Isp   | Propellant | Stage mass, with payload | Stage cost  |
| ------------ | ----- | ------ | ----- | ---------- | ------------------------ | ----------- |
| Reliant      | 1,100 | 1.25 t | 310 s | 8.31 t     | 18.60 t                  | 2,762 funds |
| Poodle       | 1,300 | 1.75 t | 350 s | 7.36 t     | 18.03 t                  | 2,771 funds |

Solved on its own, the Reliant stage is cheaper by 9 funds, so a search that
takes the cheapest stage and moves on takes the Reliant. But it is also 0.57
t heavier, and the Mainsail stage below it has to lift that:

| Under the … | Lower propellant | Lower stage cost | Whole rocket | Whole cost   |
| ----------- | ---------------- | ---------------- | ------------ | ------------ |
| Reliant     | 79.7 t           | 27,340 funds     | 114.2 t      | 30,102 funds |
| Poodle      | 77.8 t           | 27,006 funds     | 111.6 t      | 29,777 funds |

The 0.57 t of upper stage becomes 1.9 t of lower-stage propellant and 334
funds of tank, and the rocket with the dearer upper stage is 325 funds
cheaper. The stage-by-stage choice was wrong by 37 times its own margin,
and nothing in the upper stage's own numbers could have said so. Ask the
same question about mass and there is no trap: the Poodle stage is lighter,
the rocket under it is lighter, and the greedy answer is the right one.

```js
const g0 = 9.80665;
// a stage sized by the rocket equation, tanks one part dry to eight propellant
const stage = (payload, eng, dv, isp, fundsPerTonne) => {
  const r = Math.exp(dv / (isp * g0));
  const fixed = payload + eng.m;
  const prop = ((r - 1) * fixed) / (1 - (r - 1) / 8);
  return {
    mass: fixed + prop + prop / 8,
    cost: eng.cost + fundsPerTonne * prop,
    prop,
  };
};
const reliant = { m: 1.25, cost: 1100, isp: 310 },
  poodle = { m: 1.75, cost: 1300, isp: 350 },
  mainsail = { m: 6, cost: 13000 };
for (const up of [reliant, poodle]) {
  const u = stage(8, up, 1800, up.isp, 200); // the upper stage on its own
  const l = stage(u.mass, mainsail, 3400, 290, 180); // the lower stage under it
  console.log(
    u.cost.toFixed(0),
    u.mass.toFixed(2),
    (u.cost + l.cost).toFixed(0),
    l.mass.toFixed(1),
  );
}
// 2762 18.60 30102 114.2  ← the Reliant: cheaper stage, dearer rocket
// 2771 18.03 29777 111.6  ← the Poodle
```

## The idea

A **greedy algorithm** takes the best local choice at each step and never
revisits it. It is fast, because it makes one pass, and it is correct
whenever the local choice cannot make a later choice worse: whenever the
problem has the property that the best whole is made of the best parts.
Solving a rocket from the top down is greedy in the stage: the payload is
given, the top stage is sized to carry it, that stage's mass becomes the
payload of the one below, and so on to the pad. The order is forced, because
no stage can be sized before the mass above it is known, and the greed is a
choice: at each stage, take the best stage for that payload and move on.

The **objective** is the quantity being minimised, and this application
offers three: the rocket's mass on the pad, its cost in funds, and its part
count. Whether greed is right depends on which.

A **compounding objective** is one where each stage's choice changes the
cost of the stages under it. Mass compounds: a heavier upper stage is a
heavier payload for every stage below, and each of those grows by the rocket
equation to lift it. Because the thing being minimised, mass, is also the
thing that compounds, a greedy pass on mass is right: the lightest stage at
each step is also the one that makes every stage below it lightest, so the
best rocket is the best stages stacked. Cost and part count do not compound
on their own terms, but they ride on something that does. A stage's cost
does not change the cost of the stage below it; its mass does. So the
cheapest stage above can be the heaviest, and the price of its mass is paid
in propellant and tanks by a stage that was never asked. The Reliant above
is 9 funds cheaper and 325 funds dearer.

```
   solve from the top down                the compounding the top cannot see

   payload  8.0 t                         Reliant: +0.57 t here
      ↓                                        ↓
   upper stage  ← sized for 8 t           becomes +1.9 t of propellant here
      ↓ 18.6 t or 18.0 t                       ↓
   lower stage  ← sized for what           and +334 funds of tanks the upper
      ↓ is above it                         stage's price never included
   pad  114 t or 112 t
```

There are two ways to repair a greedy pass, and the solver uses both. One is
to make the local score see the downstream effect: charge every stage a
little for its mass even when the objective is cost, so that a heavy cheap
stage scores worse than a light dear one when the difference in mass is
worth more below than the difference in price. That is the coupling term of
[A15](../../README.md#part-2--algorithms-and-the-solver), _[Objectives, tie-breaks, and the coupling term](objectives-tie-breaks-and-the-coupling-term.md)_, fitted by sweeping missions, and it
bounds the myopia without removing it. The other is to stop trusting the
local choice: build the whole chain more than one way, under different local
rules, and judge the chains on the real objective, which is the only thing
that actually knows. A chain built by the cheapest-stage rule and a chain
built by the fewest-parts rule are both complete rockets with real costs,
and whichever costs less is the answer, whatever rule produced it. And at
the top level, the same idea once more: plan the lightest rocket as well and
deliver whichever of the two measures better on the objective asked for, so
that "cheapest" can never come back dearer than "lightest".

## In this codebase

`solveUnit` in [`src/core/solver.ts`](../../../../src/core/solver.ts) builds
the chain for one stage count and one set of Δv shares, from the top:

```ts
let carried = payload, ok = true;
for (let i = k - 1; i >= 0; i--) {
  // solve top down
  const above = i + 1 < k ? chain[i + 1] : null; // already solved
  let s = solveStage({ dv: sdv, payload: carried, ... });
  // ...
  carried = s.total; // this stage's mass is the next one's payload
}
```

Around that loop are the two repairs. The comment above it says the first
plainly: "a greedy pass that takes the cheapest stage every time can miss
the cheapest rocket, which is how a fewest-parts design ended up costing
less than a cost-optimised one. So build the chain under each heuristic and
keep whichever comes out best on the objective actually asked for." Under
the cost objective `picks` is `["cost", "parts"]`, so every split is built
twice, and four build variants on top of that remove options that score well
as a stage and badly as a stack: liquid radial columns, engine plates, and
clusters above four. Under mass and parts one chain per split is built,
because the sweep showed the extra chains never win there. The local score
itself is `scoreOf` in [`src/core/performance.ts`](../../../../src/core/performance.ts),
whose comment is the shortest statement of this lesson: "selection is greedy
per stage: a cheap-but-heavy upper stage makes everything below it bigger,
and a stage cannot see that while it is being sized."

`planMission` in [`src/core/plan.ts`](../../../../src/core/plan.ts) is the
top-level repair. For the cost and parts objectives it plans the mission
twice, once as asked and once as lightest, and delivers whichever measures
better on the objective asked for:

```ts
const own = await planFor(input, opts, input.objective);
if (!own || input.objective === "mass") return own;
const alt = await planFor(input, opts, "mass"); // the lightest design as well
// ... deliver whichever measures better on cost, or on parts
```

Twice the work for two of the three objectives, and the comment records
what it bought: a floor under "cheapest".

## What made it real

The Minmus mission of #169 is the measurement: 6.5 t landed and returned,
cut after the descent. Asked for the cheapest design it came back at 48,761
funds; asked for the lightest, 42,235, cheaper by 6,526. The cost objective
had minimised group by group and been charged nothing for the mass it handed
down. [`test/flown-cost.test.ts`](../../../../test/flown-cost.test.ts) holds
that mission now: the design delivered as cheapest costs no more than the
one delivered as lightest, and the one delivered as fewest parts has no more
parts.

The three objectives on one mission show what each is buying. The 20 t Mun
mission in the sweep, planned three ways:

| Asked for | Mass on the pad | Cost          | Parts | Stages                                  |
| --------- | --------------- | ------------- | ----- | --------------------------------------- |
| Mass      | 397.7 t         | 228,319 funds | 52    | 3 Vector, Rhino, 6 Dart, 2 Dart, Poodle |
| Cost      | 522.8 t         | 120,521 funds | 38    | Mammoth, 4 Poodle, 3 Terrier            |
| Parts     | 519.2 t         | 139,375 funds | 16    | Mammoth, Rhino, Poodle                  |

The cheapest rocket is 31% heavier and 47% cheaper than the lightest; the
fewest-parts rocket has a third of the parts of the lightest. Each column is
minimised down its own diagonal, and the design snapshot's 81 cases hold
each objective's picks against a baseline, three objectives by three
payloads by three budgets by three tiers.

## Where it breaks

- **Greed on a non-compounding objective.** The whole lesson: 9 funds
  better as a stage, 325 worse as a rocket. The chain comparison and the
  coupling term exist because the stage cannot see below itself.
- **Trusting the coupling term alone.** It is a fitted constant, 1,500 funds
  per tonne, and the comment on `scoreOf` says it bounds the myopia rather
  than removing it; the sweep that fitted it found the cost objective still
  losing to mass on two of six missions before the chain comparison was
  added.
- **Building one chain per split under cost.** The rule under _`best` is
  not what the user gets_ in
  [`.claude/rules/solver.md`](../../../../.claude/rules/solver.md) records
  that dropping the cluster-cap variant looked free by the snapshot and
  moved 11 of 128 real missions, nine of them dearer. Variants that never
  win in the grid still win in the walk.
- **Planning once for cost.** Even with the chain comparison, the group
  boundary is a place the objective cannot see across: a cut puts a cheap
  heavy lander in one group and the rocket that lifts it in another. The
  double plan is the floor; without it "cheapest" could be dearer than
  "lightest" again.
- **Reading top-down as a choice.** The order is forced by the physics; the
  greed is the choice. A stage cannot be sized before its payload is known,
  so any search over stages solves from the top, and the question is only
  whether it revisits.

## Try it

Run the snippet, then change the payload from 8 to 3 t: the Reliant stage
is now cheaper by 153 funds and the rocket under it cheaper too, by 291,
because at 3 t the Poodle's extra engine mass outweighs its Isp. Greed is
right here and wrong at 8 t, and the only way to know is to build both
rockets, which is what the chain comparison does. Then run
`npx vitest run test/flown-cost.test.ts` and read the invariant it holds.

## Check yourself

<details><summary>Why is solving from the top down the right order, and why is that a separate question from whether the greedy choice is right?</summary>

Because a stage's size depends on the mass above it, so the top stage is
the only one that can be sized first; the order is forced. Greed is the
further choice to take the best stage at each step and never revisit, and
that is right only when a locally better stage cannot make a lower stage
worse, which is true of mass and false of cost and parts.

</details>

<details><summary>The Reliant upper stage is 9 funds cheaper than the Poodle one. Why does the rocket built on it cost 325 funds more?</summary>

Because it is 0.57 t heavier, and the Mainsail stage below must lift that
mass through 3,400 m/s: 1.9 t more propellant and 334 funds more tank. The
upper stage's price does not include the mass it hands down, and the stage
below is never asked which upper stage it would prefer.

</details>

<details><summary>How does the solver make sure a design asked for as cheapest is never dearer than one asked for as lightest?</summary>

It plans both. For the cost and parts objectives `planMission` plans the
mission as asked and again as lightest, measures both on the objective
asked for, and delivers the better. Inside a group the chain comparison
does the same thing one level down, building the chain under more than one
local rule and judging on the real objective.

</details>

## Further reading

- Thomas Cormen et al., _Introduction to Algorithms_, the chapter on greedy
  algorithms, for the greedy-choice property and optimal substructure, which
  are exactly what mass has and cost lacks here.
- Howard Curtis, _Orbital Mechanics for Engineering Students_, the section on
  multistage rockets in the chapter on rocket vehicle dynamics, for why mass
  compounds through the stages.

## Key takeaway

Stages are solved from the payload down because nothing else is possible,
and taking the best stage at each step is right for mass, which compounds
on its own terms, and wrong for cost and parts, which ride on mass without
being charged for it; the fix is to stop trusting the local choice, build
the chain more than one way and judge on the real objective, and at the
top plan the lightest design too, so that cheapest is never dearer than
lightest.

_As of 2ecc64f._
