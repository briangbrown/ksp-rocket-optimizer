# The candidate walk

**Syllabus:** [A7](../../README.md#part-2--algorithms-and-the-solver)

**Why it matters:** The candidate walk matters because the closed form's
favourite rocket is not always one that flies: sized to the map's 3,400 m/s,
a stack can come out of the simulator needing 4,062, and a rocket that
cannot reach orbit is not a cheap rocket but no rocket; so the solver keeps
a few runners-up at every stage count, flies them cheapest first, judges
each by what it would cost once grown to what it actually flew at, and
stops when no candidate behind can win; every choice in that sentence, how
many to keep, how to rank them and when to stop, has a failure on record,
and the design snapshot sees none of them, because it pins the favourite
and the reader gets the walk's pick.

**Before this:** [A1](closed-form-first-simulation-last.md), _The shape of
the search: closed form first, simulation last_, and
[A6](greedy-top-down-staging.md), _Greedy top-down staging, and when greed
is wrong_.

## A worked case

Plan the 0.8 t low-orbit launch from the test grid and read the tally the
plan carries back:

| Counted                        | This mission |
| ------------------------------ | ------------ |
| Stages sized in closed form    | 1,094,677    |
| Complete chains assembled      | 159          |
| Flights through the atmosphere | 550          |
| Wall-clock                     | 1.6 s        |

The mission is asked for as cheapest, so it is planned twice, once as
cheapest and once as lightest ([A6](greedy-top-down-staging.md)), and the
tally covers both. A hundred and fifty-nine chains came out of the two
searches, the best at each stage count and two runners-up behind each, and
the walk flew about five of them: a turn search is about 109 flights
([A2](grid-search-then-seeded-refinement.md)), so 550 flights is five
vehicles taken through the simulator, out of 159 that could have been. The
rocket delivered is a single stage of three Twitches at 7.28 t. Duna at 3.5
t assembles 197 chains and flies about five; the walk is short because it
stops as soon as nothing behind can win.

What the walk is for is on record in three issues, each a rocket the reader
would have got without it. #167: a Duna launch was compared with the whole
group's Δv, capture and descent included, and passed as carrying its flight
while 238 m/s short of orbit; sized against the climb alone it went from
131 to 149 t. #168: taking the first candidate that flew handed back a light
chain that then had to be grown a great deal, when the one behind flew
nearly to budget; taking the first that fitted handed back a heavy chain
when a lighter one needed a little growing. #169: with one candidate per
stage count, the mass objective's lightest two-stage chain on a 1 t brief
could not be flown to budget, and the 7.2 t Torch chain that could, which
the cost objective had found, was never in the list.

Because the plan is in TypeScript, the snippet is a test file. Save it as
`test/walk-try.test.ts` and run
`npx vitest run test/walk-try.test.ts --reporter=verbose`:

```ts
import { it } from "vitest";
import { planMission } from "../src/core/plan.js";
import { missionCases } from "./grid.js";
it("what the walk did for the 0.8 t launch", async () => {
  const plan = (await planMission(missionCases()[0].input, {
    onYield: () => Promise.resolve(),
  }))!;
  const launch = plan.stages.filter((s) => s.isLaunch && s.sol);
  console.log(plan.tally); // stages, boosted, chains, flights
  console.log(Math.round(plan.tally.flights / 109), "vehicles flown, roughly"); // 5
  console.log(
    launch.map((s) => `${s.sol!.n}x ${s.sol!.engine.n}`).join(" | "),
    launch[0].sol!.total.toFixed(2),
    "t",
  );
}, 60_000);
```

## The idea

A **candidate** is a design the closed form has sized and the simulator may
fly: a complete chain of stages with a score on the objective. The closed
form produces many, because it searches every stage count and every way of
splitting the Δv between stages, and it ranks them by score. The simulator
is the judge of whether a candidate actually reaches orbit, at a thousand
times the price, so it cannot judge them all; the walk is the rule for
which it judges, in what order, and when it stops.

A **runner-up** is a candidate kept in case the one ahead of it fails. At
each stage count the search keeps its best chain and the two behind it,
because the best by the closed form's score is the one most likely to have
been sized to the edge, and the edge is where the simulator disagrees. The
count is a trade: one runner-up was too few, as #169 showed, and every
extra costs a flight only when the ones ahead of it fail.

```
   the closed form's ranking          the walk

   k=1  ●  ○  ○                       pool: every ● and ○, sorted by score
   k=2  ●  ○  ○                          ↓
   k=3  ●  ○  ○                       fly the cheapest ─→ fails: next
   k=4  ●  ○  ○                       fly the next ────→ flies 238 m/s over: est = score × e^(over/2500)
                                      fly the next ────→ flies within budget: est = score
   ● best at each stage count            ↓
   ○ runners-up, two per count        stop when the next score ≥ best est
```

Three rules make the walk. **Cheapest first**: the pool is sorted by score,
so the first candidate that would win if it flew is flown first. **Judge as
grown, not as built**: a candidate that flies over what it carries for the
climb will be re-solved heavier, and the rocket equation says by how much,
so its score is scaled by exp(over / 2,500) before it is compared, with
2,500 m/s standing for a typical exhaust velocity; a candidate that flies
within what it carries stands at its score. Taking the first that flew, or
the first that fitted, are the two ways of ignoring this, and each handed
back the wrong rocket. **Stop when nothing behind can win**: the pool is
sorted by score and an estimate is never below its score, so once the next
candidate's score is at or above the best estimate so far, no candidate
after it can beat it either, and the walk ends. That is why five vehicles
fly out of a hundred and fifty-nine chains.

What a candidate carries for the climb is its own subtlety. A launch group
can hold more than the ascent: a cut can put a plane change, a capture and
a descent in the same group, and the simulator flies none of those. The
comparison is therefore between the flown ascent and the ascent's share of
the group, margin included, plus whatever the chain's tanks rounded the
group up to; comparing with the whole group let a rocket 600 m/s short of
orbit pass as carrying its flight. And when the pick does fly over, the
group's Δv is grown by the shortfall and the closed form asked again, up to
three times, with the other legs kept whole: the simulator's answer feeds
back into the sizing, as [A1](closed-form-first-simulation-last.md) said,
rather than the sizing moving into the simulator.

## In this codebase

`reduceUnits` in [`src/core/solver.ts`](../../../../src/core/solver.ts)
folds the search's units into the pool the walk reads: `byK`, the best at
each stage count, and `alts`, the two behind each, `ALTS_PER_K` being three
in all. The walk is in `planMission` in
[`src/core/plan.ts`](../../../../src/core/plan.ts):

```ts
const all = [...solved.byK, ...solved.alts];
const order = pool.sort((x, y) => x.chainScore - y.chainScore); // cheapest first
let pick = null, bestEst = Infinity;
for (const cand of order) {
  if (cand.chainScore >= bestEst) break; // nothing behind can win
  const veh = buildVehicleFor(cand.chain.map(...), () => true, bodyName, payloadDia);
  const flown = veh && simCached(veh, orbitAlt(bodyName)); // the expensive call
  if (!flown || !flown.ok) continue; // it did not reach orbit: next
  const carries = carriedFor(cand, groupDv, share); // what its tanks hold for the climb
  const over = flown.total > carries ? flown.total * (1 + margin / 100) - carries : 0;
  const est = cand.chainScore * Math.exp(over / GROW_VE); // judged as it would be once grown
  if (est < bestEst) { bestEst = est; pick = cand; }
}
```

`ascentShareOf` is the ascent legs' share of the group with the margin;
`carriedFor` adds what the chain's tanks rounded the group up to; `GROW_VE`
is 2,500. `simCached` memoises the flight on the vehicle's description, so
a chain the walk and the re-solve both reach is flown once. The re-solve
follows the walk: up to three passes of growing the group by the shortfall
and calling `solve` again, stopping as soon as the flown ascent is within
what the vehicle carries, and the flight card shows both numbers, built and
flown.

The pool is filtered before it is walked. Candidates within the slenderness
limit come first and the over-limit ones are offered only if nothing
compliant exists, which is [A13](../../README.md#part-2--algorithms-and-the-solver),
_Slenderness as a constraint on the whole rocket_; and the whole walk runs
only for a launch group on a body with an atmosphere, since there is nothing
to simulate elsewhere.

## What made it real

Each rule has a number. The re-solve: 3,740 m/s built against 4,062 needed
is the case in the comment, a rocket sized to the map that could not reach
orbit. The share: Duna at 3.5 t went from 131 to 149 t when the flown
ascent was compared with the climb instead of the group, its old design
flying 238 m/s over what it carried. The runners-up: the 7.2 t Torch chain
that only the cost objective's list contained. The judging rule: the two
wrong rockets of #168, one grown a great deal and one heavy from the start.
[`test/flown-cost.test.ts`](../../../../test/flown-cost.test.ts) holds the
share and the re-solve on the Minmus mission that showed all three faults at
once, and the mission sweep in
[`test/mission-sweep.test.ts`](../../../../test/mission-sweep.test.ts) pins
what the walk delivers for sixteen missions.

The measurement that gives the walk its name in the rules is about what the
snapshot cannot see. The design snapshot drives `solveGroup` and pins
`best`, the closed form's favourite; the reader gets the walk's pick. A
change that left `best` byte-identical, dropping one of the build variants,
moved 11 of 128 real missions, nine of them dearer on the objective asked
for, one by 21%. The rule under _`best` is not what the user gets_ in
[`.claude/rules/solver.md`](../../../../.claude/rules/solver.md) is that
measurement, and the mission sweep exists because of it.

## Where it breaks

- **Reading `best` as the answer.** The snapshot pins the favourite; the
  walk delivers whichever candidate wins after flying. A solver change with
  a green snapshot can still move the rocket, and 11 of 128 did. The sweep
  covers sixteen; a change you cannot explain deserves a wider one.
- **One candidate per stage count.** The favourite at a count is the one
  sized closest to the edge, and the edge is where the simulator disagrees.
  Two runners-up cost a flight only when they are needed.
- **First that flew, first that fitted.** Both are ways of not estimating
  growth. The rocket equation says what a candidate will weigh once grown to
  what it flew at, and that is the only fair comparison between a light
  chain that needs growing and a heavy one that does not.
- **Comparing with the whole group.** A launch group can carry legs the
  simulator does not fly. The flown ascent is compared with the ascent's
  share, or a rocket 600 m/s short passes.
- **A variant that improves `best` and degrades the pick.** The cluster-cap
  variant wins the walk on a 0.8 t launch with a design 7.9% dearer than
  what the search returns without it. More candidates are not monotonically
  better once the walk chooses among them; the sweep is the check.

## Try it

Run the test file above, then change `missionCases()[0]` to
`missionCases()[7]`, Duna at 3.5 t: the tally shows 197 chains and about
five vehicles flown, and the delivered launch is four stages from a Mainsail
up.
Then open the application on the default mission and read the flight card:
the ascent Δv the rocket was built to carry and the Δv its flight actually
needed are both shown, and the second is what the walk judged it by.

## Check yourself

<details><summary>The closed form produced 159 chains for the 0.8 t launch, over two plans, and the walk flew about five. What stopped it?</summary>

The sort and the estimate. Candidates are flown cheapest first, a candidate
that flies within what it carries stands at its score, and an estimate is
never below a score; so once the next candidate's score is at or above the
best estimate so far, nothing behind it can win, and the walk ends. A few
flights per plan found a candidate that flew within budget and cheaper than
everything left.

</details>

<details><summary>Why is a candidate that flies over budget scored by exp(over / 2,500) rather than skipped, or rather than taken as it is?</summary>

Because it will be re-solved heavier, and the rocket equation says by how
much: growing a stage by a Δv shortfall scales its mass by that
exponential, with 2,500 m/s standing for a typical exhaust velocity. Skipping
it takes a heavier chain that needed nothing; taking it as it is takes a
light chain that will be grown a great deal. Estimating the growth compares
both as what the reader will actually get.

</details>

<details><summary>Why does the design snapshot not catch a change that moves what the reader is given?</summary>

Because it drives `solveGroup` and pins `best`, the closed form's
favourite, and the reader gets the candidate the walk picks after flying.
The two differ whenever the favourite does not fly to budget or a runner-up
estimates better once grown. Dropping a build variant left every snapshot
line unchanged and moved 11 of 128 missions; the mission sweep is the check
that runs the walk.

</details>

## Further reading

- Jon Kleinberg and Éva Tardos, _Algorithm Design_, the chapter on greedy
  algorithms and the section on branch and bound in the chapter on
  intractability, for the general pattern of a cheap ranking, an expensive
  check, and a bound that ends the search early.
- The project's `README.md`, _What it gets right, and what it does not_, for
  the flown-in-game comparison the simulator's verdict is checked against.

## Key takeaway

Keep the best chain at each stage count and two behind it, fly them
cheapest first, judge each by its score scaled by exp(over / 2,500) for the
growth its flight will force, and stop when the next score cannot beat the
best estimate; the closed form's favourite is pinned by the snapshot, the
walk's pick is what the reader gets, and the two differ often enough that
the mission sweep exists to watch the difference.

_As of 2ecc64f._
