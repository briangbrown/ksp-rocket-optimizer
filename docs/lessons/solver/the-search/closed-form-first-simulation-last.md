# The shape of the search: closed form first, simulation last

**Syllabus:** [A1](../../README.md#part-2--algorithms-and-the-solver)

**Why it matters:** The shape of the search matters because sizing a stage
with the rocket equation takes about a microsecond and flying one through the
atmosphere takes about a millisecond, a thousand to one, so a solver that
wants to consider a million rockets in the second a person will wait can fly
only a few hundred of them; everything about how the solver is arranged, what
it computes in closed form, what it checks cheaply before spending anything,
and what it saves the simulator for, follows from that ratio.

**Before this:** [P1](../../physics/staging/dv-and-the-rocket-equation.md),
_Δv and the rocket equation_, and
[P4](../../physics/staging/staging-why-more-and-when-to-stop.md), _Staging_.

## A worked case

Ask the tool for a rocket to put 0.8 t into low Kerbin orbit, and count what it
does on the way to an answer:

| What the solver did                  | How many times | How long each       |
| ------------------------------------ | -------------- | ------------------- |
| Sized a plain stage in closed form   | 226,758        | about a microsecond |
| Sized a boosted stage in closed form | 867,919        | about a microsecond |
| Assembled a complete chain of stages | 159            |                     |
| Flew a rocket through the atmosphere | 550            | 1.2 ms              |
| Answered                             | 1              | 1.57 s in all       |

A million rockets sized; five hundred and fifty flown. The flights are a
twentieth of a percent of the rockets considered and about forty percent of
the time. If the solver had flown each rocket it sized, the answer would have
taken over twenty minutes.

The two costs are easy to measure on their own. One call to `flyAscent` on the
delivered design takes 1.18 ms: nine thousand steps of a tenth of a second
each, with drag, thrust and gravity computed at every one. One call to
`propellantFor`, the rocket equation solved for propellant, takes about
sixteen microseconds, and most of a stage sizing is cheaper than that because
the stage is rejected before the tanks are chosen. Three more missions from
the test grid tell the same story:

| Mission                            | Stages sized | Flights | Time   |
| ---------------------------------- | ------------ | ------- | ------ |
| 3.5 t to low orbit                 | 752,306      | 632     | 1.21 s |
| 12 t to low orbit                  | 447,504      | 265     | 0.91 s |
| 6.5 t to Minmus and back, cut once | 367,813      | 600     | 1.29 s |

The shape is the same every time: a wide, cheap search over designs, then a
narrow, expensive check of the few that won.

## The idea

A search has to be wide, because the space of rockets is large and the good
ones are not where a rule of thumb would put them, and it has to be honest,
because a rocket that the rocket equation says will reach orbit may not when
the air and gravity are integrated. Those two demands pull against each other
when the honest check is a thousand times the price of the wide one.

The resolution is to separate what a **closed form** can decide from what only
a **simulation** can. A closed form is an answer computed directly from a
formula: given a Δv, an engine's Isp and a payload, the rocket equation says
how much propellant and how heavy the stage. A simulation steps the physics
forward through time and reports what happened: this rocket, on this turn,
through this air, reached orbit having spent this much. The closed form is
approximate, because it prices an ascent at the map's average and knows
nothing of drag or a turn; the simulation is exact for what it models and
cannot be asked a million times.

So the search is arranged as a funnel. At the wide end, the closed form sizes
every combination the roster allows, engine by engine, cluster by cluster,
stage count by stage count, and rejects most of them with a comparison before
any tank is chosen: not enough thrust to lift the payload it must carry, a
burn too long, an engine dead at this pressure. What survives is packed into
tanks, fitted with structure and scored, and the best chain at each stage
count is kept, with a few runners-up behind it. Only at the narrow end, and
only for a launch through air, does the simulator fly anything: the best
chains, cheapest first, until one flies within what it carries.

Two consequences follow, and both shape the code.

The order of the cheap checks is the order of their price. A thrust floor is a
division; a tank packing is a search of its own; a structure fit walks a
graph. The solver does the division first and skips the rest when it fails,
and the comment on the pre-filter says why in numbers: before it, the boosted
search made 89 million rocket-equation calls across 2.7 million combinations.
Rejecting early is not an optimisation of the search; it is what makes the
search possible at the width it has.

And the simulation is a check, not a search. It is not asked "what is the best
rocket" but "does this rocket, which the closed form liked, actually fly to the
budget it was built for". When the answer is no, the closed form is asked again
with a bigger number, not the simulator. The flown cost feeds back into the
sizing; the sizing does not move into the simulator. That keeps the expensive
tool at the narrow end, and it is why the flight card can show both the Δv a
rocket was built to carry and the Δv its flight actually needed.

The funnel has a cost of its own, which the syllabus's later rows take up. A
closed form that is wrong in a way the simulator cannot see is never caught,
because the simulator only flies what the closed form liked
([A7](../../README.md#part-2--algorithms-and-the-solver)). And the design
snapshot pins the closed form's favourite, not the delivered rocket, so a
change can leave the favourite untouched and still change what the user gets
([V1](../../README.md#part-4--verification)).

## In this codebase

`docs/optimiser-flow.mermaid` is the funnel drawn, and this lesson was written
against it. Read top to bottom: the route is arithmetic, `solveGroup` is the
combinatorial walk over stage counts and Δv shares, `solveStage` and
`boostedAscent` are the closed forms, and the simulation is the last block,
entered only for the launch group of a body with air.

The wide end is in `src/core/solver.ts`. `solveStage` loops engine, then
cluster count, then columns, then tank group, and its first real check is the
one that costs least:

```ts
const thrust1 = e.fv * (ispAt(e, pSurf) / e.iv);
if (n < Math.ceil((twrMin * (payload + extra) * g) / thrust1)) continue; // one division, before any tank
```

`propellantFor` in `src/core/performance.ts` is the closed form that sizes
what survives, and `fitStructure` and `pickTanks` are the more expensive steps
it earns. `TALLY`, in `src/core/tally.ts`, counts the sizings and the flights
per solve so the width of the search is visible rather than only felt; the
tables above are its counters.

The narrow end is in `src/core/plan.ts`. After `solveGroup` returns the best
chain at each stage count and the runners-up, the walk sorts them by score,
flies them cheapest first through `simCached`, and stops at the first that
flies within its share, or when the next candidate's score cannot beat the
best estimate so far:

```ts
const all = [...solved.byK, ...solved.alts];
const order = pool.sort((x, y) => x.chainScore - y.chainScore);
for (const cand of order) {
  if (cand.chainScore >= bestEst) break; // nothing behind can win
  const veh = buildVehicleFor(cand.chain.map(...), () => true, bodyName);
  const r = veh && simCached(veh, orbitAlt(bodyName)); // the one expensive call
  // ...
}
```

Then the feedback: if the flown ascent costs more than the chain carries for
the climb, `solveGroup` is called again with the group's Δv grown by the
shortfall, up to three passes, and the simulator only checks the result.
`simCached` memoises flights on the vehicle's description, so a chain the walk
has already flown is not flown twice.

## What made it real

The counts are the measurement, and `TALLY` exists so they can be taken. On
the 0.8 t case: 1,094,677 sizings, 159 chains, 550 flights, 1.57 s. One flight
at 1.18 ms, one `propellantFor` at about sixteen microseconds, and a whole
plain-stage sizing cheaper than that on average because most are rejected at
the thrust floor.

The pre-filter's comment records what the funnel looked like before its
cheapest check was moved to the front: 89 million rocket-equation evaluations
across 2.7 million boosted combinations, for a search that now evaluates
under a million. And `perf/README.md` records the cost of the whole grid: the
81-case design snapshot runs in about thirty seconds, which is only possible
because almost none of those 81 solves' work is simulation.

The flights are not free either. Before `simCached`, the candidate walk and
the re-solve could fly the same vehicle several times; the cache keys on the
vehicle's stages and their propellant, so a repeat costs a lookup.

## Where it breaks

- **A closed form the simulator cannot correct.** The simulator flies what the
  closed form liked. A stage the closed form wrongly rejects is never flown,
  and a chain it wrongly ranks last is flown only if everything ahead of it
  fails. `.claude/rules/solver.md` under _`best` is not what the user gets_
  is the record of a change that left the closed form's favourite untouched
  and moved eleven delivered missions.
- **Simulation creeping wide.** Each extra flight is a millisecond. A search
  that flew every chain at every stage count, or refined the turn on a grid
  instead of round a seed, would take minutes, and the interface solves on
  every keystroke. The turn search's own comment prices a full fine grid at
  ~550 trajectories and most of a second.
- **A cheap check that is not cheap.** The thrust prefilter is a division;
  the tank packer is not. Putting an expensive check before a cheap one
  spends the expensive one on candidates the cheap one would have killed.
- **Counting without a tally.** A search that grows a factor of three wider
  is invisible until the interface feels slow. The counters make the width a
  number that a change can be measured against, which is what the perf
  scripts do.

## Try it

Run `npm run perf:mission`, which solves one whole mission the way a reader
waits for it and prints its time. Then read `TALLY` after a solve of your own:
in a test or a scratch script, call `planMission` on any case from
`test/grid.ts` and print `plan.tally`. Change the payload by a factor of ten
and watch the sizings change by a factor of two or three and the flights stay
in the hundreds. The funnel's shape does not depend on the mission.

## Check yourself

<details><summary>The solver sized a million stages and flew 550 rockets in 1.57 s. Roughly how long would it have taken to fly every rocket it sized?</summary>

Over twenty minutes: a million flights at 1.2 ms each is around 1,300 s. The
ratio of the two costs is what makes the search possible at all.

</details>

<details><summary>Why is the thrust-to-weight check done before the tanks are chosen, and what would change if it were done after?</summary>

Because it is a division and the tank packing is a search. A stage that
cannot lift its payload with n engines cannot lift it with any tanks either,
so checking first skips the packing for every failing count. Done after, the
packer would run on candidates that were doomed, and the pre-filter's comment
records the size of that waste: 89 million rocket-equation calls.

</details>

<details><summary>When the simulator finds a rocket cannot fly to its budget, why is the closed form re-run rather than the simulator asked to find a better turn or a better rocket?</summary>

Because the simulator is a check, not a search: it answers whether this
rocket flies, at a millisecond a question. The closed form is what searches,
at a microsecond a candidate, so the flown cost is fed back into the sizing
and the sizing produces a new candidate for the simulator to check.

</details>

## Further reading

- The flow diagram, `docs/optimiser-flow.mermaid`, which is this lesson as a
  picture.
- `perf/README.md`, for how the width of the search is measured and compared
  across changes.
- Any text on branch-and-bound or generate-and-test search, for the general
  pattern of a cheap bound that prunes before an expensive evaluation.

## Key takeaway

Size in closed form at a microsecond a candidate, reject with the cheapest
check first, and fly only the few winners at a millisecond each; the funnel
is what lets a million rockets be considered in the second a person will wait,
and the simulator's answer feeds back into the sizing rather than replacing
it.

_As of c8ed809._
