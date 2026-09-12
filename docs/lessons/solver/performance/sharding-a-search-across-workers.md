# Sharding a search across workers

**Syllabus:** [A12](../../README.md#part-2--algorithms-and-the-solver)

**Why it matters:** Sharding matters because a full-tech Mun solve takes
ten seconds on a phone on one thread and five on four, and the search
divides naturally into 33 independent units, one per stage count and Δv
split, that can run anywhere; but the pieces come back in whatever order
the threads finish, the fold that combines them keeps the first of equals,
and a fold that ran in completion order would hand a different rocket to a
phone than to a desktop on any tie, silently and rarely, so the contract is
that the pieces are put back in the order they were handed out, whatever
order they arrive.

**Before this:** [A1](../the-search/closed-form-first-simulation-last.md),
_The shape of the search: closed form first, simulation last_, and
[L5](../../README.md#part-3--languages-and-the-platform), _Web Workers:
messages, cancellation, and structured clone_.

## A worked case

The design search for one group tries every stage count from one to six
and, at each count, every way of splitting the group's Δv between the
stages that the share table allows:

| Stage count | Splits | Units |
| ----------- | ------ | ----- |
| 1           | 1      | 1     |
| 2           | 5      | 5     |
| 3           | 12     | 12    |
| 4           | 5      | 5     |
| 5           | 5      | 5     |
| 6           | 5      | 5     |
| All         |        | 33    |

Each unit builds every chain for its stage count and split and hands back
its candidates, and no unit reads anything another produced. That is what
makes them shards: the 33 can run on one thread in order, or on eight
threads in any order, and the search is the same search.

Measured on a Pixel 8, full-tech Mun, best of three:

| Threads | Time   | Speed-up |
| ------- | ------ | -------- |
| 1       | 10.5 s | 1.00×    |
| 4       | 5.1 s  | 2.06×    |
| 8       | 5.6 s  | 1.88×    |

Eight threads is slower than four. The phone has one big core, four mid and
four little, reports nine, and says nothing about which is which; the four
extra threads land on the little cores, take about three times as long over
a unit, and the pool waits on the slowest. On a container the pool is capped
at eight because past that the group runs out of units to hand out: 4.63× at
eight against 4.66× at twelve on eighteen cores.

The fold is the part that has to be exact. `better` compares two candidates
with a strict less-than, so equal candidates leave the incumbent in place
and the earlier one wins. If the pool folded results as they arrived, the
"earlier" candidate would be whichever thread happened to finish first, and
a tie would resolve differently from one run to the next. The pool therefore
stores each result at the index of the unit that produced it and folds the
array in unit order once every unit is back.

Because the solver is in TypeScript, the snippet is a test file. Save it as
`test/shard-try.test.ts` and run
`npx vitest run test/shard-try.test.ts --reporter=verbose`:

```ts
import { it } from "vitest";
import { solveGroup, solveGroupWith, solveUnit } from "../src/core/solver.js";
import { signature } from "../src/core/signature.js";
import { cases } from "./grid.js";
it("the same rocket, folded in any order", async () => {
  const input = cases().find(
    (c) => c.name === "tier9-pay3.5-dv5400-cost",
  )!.input;
  const serial = solveGroup(input); // one thread, units in order
  // a fake pool: finish the units in REVERSE, hand them back at their own indices
  const reversed = async (
    p: any,
    units: Array<{ k: number; shares: number[] }>,
  ) => {
    const out = new Array(units.length);
    for (let i = units.length - 1; i >= 0; i--)
      out[i] = solveUnit(p, units[i].k, units[i].shares);
    return out;
  };
  const sharded = await solveGroupWith(input, reversed);
  console.log(
    signature("x", sharded) === signature("x", serial)
      ? "identical designs"
      : "DIFFERENT designs",
  );
}, 120_000);
```

## The idea

A **Web Worker** is a background thread in the browser: it runs its own
script, shares no memory with the page, and is spoken to by messages whose
contents are copied across. [L5](../../README.md#part-3--languages-and-the-platform)
has the mechanics; what matters here is that a worker can only be given
plain data and can only give plain data back, which the `planMission` seam
already guarantees for everything the solver touches.

**Sharding** is splitting one search into independent pieces. A piece is
independent when it reads only its inputs and writes only its own result:
here a unit takes the group's prepared parameters, a stage count and a Δv
split, and returns candidates, touching nothing outside its arguments. Where
a search has that shape the pieces can run on any thread in any order, and
the only questions left are how to hand them out and how to put them back.

Handing out is dynamic, not partitioned in advance. The units are unequal,
one split at k = 1 against twelve at k = 3, and on a phone the cores are
unequal too, so a static division leaves the fast cores idle while a slow
one finishes its share. The pool primes every thread with one unit and gives
each thread its next unit as it reports back, so the work flows to whichever
core is free.

The **fold** is combining the pieces' answers into one: the best candidate
overall, the best at each stage count, and the runners-up behind each
([A7](../the-search/the-candidate-walk.md)). A fold is deterministic when its
result does not depend on the order the pieces arrive, and this one is not,
by design: `better` keeps the first of equals so that ties are stable, and
"first" means first in unit order. The pool's contract is therefore to fold
in unit order regardless of completion order, and the way it does that is
the simplest possible: each reply carries the index of its unit, is stored
at that index, and the fold runs over the array once the last reply is in.
The in-process path, one thread, units in order, and the eight-thread path
then agree to the bit, and the design snapshot, which runs in-process, is a
valid baseline for what a phone will deliver.

```
   orchestrator                    threads                       fold

   units 0..32 ─┬─► w0: init, then unit 0, 4, 9, …  ─┐
                ├─► w1: init, then unit 1, 5, 7, …  ─┤   out[i] = cands   (stored by unit index,
                ├─► w2: init, then unit 2, 6, 8, …  ─┤                     whatever order they arrive)
                └─► w3: init, then unit 3, 10, …    ─┘
                                                          then reduceUnits(out): best, byK, alts
                                                          — the same call the one-thread path makes
```

Two smaller design points follow the same principle of keeping the
sharded search identical to the serial one. The group's parameters are sent
to each thread once, with an init message, rather than with every unit,
because they carry the whole part roster and cloning a few hundred parts 33
times per group is work for nothing. And each thread keeps its own tally of
stages sized and flights flown and sends it back with each unit, so the
count the application reports describes the whole search and not the part
the orchestrator did itself; the fold adds the tallies as it adds the
candidates.

When workers cannot be created at all, nested workers being something some
older browsers refuse, the pool is null and the solver runs the units in
order on the thread it has: slower, and identical.

## In this codebase

`solveUnit` in [`src/core/solver.ts`](../../../../src/core/solver.ts) is
one shard: given the prepared group and a `(k, shares)` pair it builds every
chain for that split and returns the candidates, and its comment says the
contract, "touches nothing outside its arguments, which is what lets it
run" elsewhere. `unitsOf` lists the 33 units and `reduceUnits` is the fold;
`solveGroupWith` is the three lines that tie them to a pool:

```ts
async function solveGroupWith(input: GroupInput, fanOut: (p, units) => Promise<...>) {
  const p = prepare(input);
  const units = unitsOf(input.minK, input.maxK);
  return reduceUnits(await fanOut(p, units)); // folded in unit order, whatever order they finished
}
```

`fanOut` is supplied by the caller, because the core is not allowed to know
it has threads. [`src/ui/solver.worker.ts`](../../../../src/ui/solver.worker.ts)
builds the pool: `WANT` threads, one per core bar the orchestrator and
capped at eight on a desktop, half the cores between two and four on a phone
as `userAgentData.mobile` reports one, and `?threads=N` to override; its
`fanOut` primes every worker, hands out the next unit as each reports, and
stores each reply at `out[m.i]`. [`src/ui/unit.worker.ts`](../../../../src/ui/unit.worker.ts)
is one thread: it holds the parameters from the init message, runs
`solveUnit` for each unit it is sent, and posts back the candidates with its
tally.

## What made it real

[`test/shard.test.ts`](../../../../test/shard.test.ts) is the fold's
guard, and it runs the sharded path that jsdom otherwise never would, since
jsdom has no `Worker`. Its first test solves the tier-9, 3.5 t, 5,400 m/s
cost case through a fake pool that finishes every unit in reverse and hands
them back at their indices, and requires the design's signature to equal
the serial solve's. Its second test is why the contract is unit order and
not completion order: two made-up candidates that tie, folded in each order,
and the earlier unit must win both times. The test's comment records the
reason it uses made-up candidates: the heaviest grid case has no tie, so a
real-data version would pass whether or not the order were honoured, "which
is worse than no test."

The thread counts are measured in [`perf/README.md`](../../../../perf/README.md)
and in the pool's own comment: the Pixel 8 table above, the eight-thread
cap on a container, and the instruction to take the best of three on a
phone because single readings vary by 0.7 s, wider than the difference
being measured. The search line at the foot of the setup sheet reports the
thread count actually used, so a fallback to one thread cannot be mistaken
for a poor result.

## Where it breaks

- **Folding in completion order.** `better` keeps the first of equals; fold
  as replies arrive and "first" is whichever core was fastest, so a tie
  resolves differently on a phone than on a desktop and differently from
  run to run. Store by unit index, fold once.
- **Partitioning in advance.** Units are unequal and so are a phone's
  cores; a static split idles the big cores behind a little one. Hand out
  one at a time.
- **More threads than fast cores.** Eight threads on a Pixel 8 is slower
  than four, because the extra four land on cores three times slower and
  the pool waits on its tail. `hardwareConcurrency` counts cores, not
  speed.
- **A shard that reaches outside its arguments.** A module-level counter,
  the tally, is invisible across threads; it is sent back with each unit
  and folded in, or the application's search stats would describe only the
  orchestrator's share.
- **Cloning the roster per unit.** Structured clone copies everything; the
  parameters go once per group, the units after.

## Try it

Run the test file above and read "identical designs". Then change the fake
pool to fold as it goes, replacing `out[i] = …` with `out.push(…)` so the
reversed results land at the wrong indices, and run it again: the fold now
sees the units in reverse and, if any two candidates tie, the design moves;
on this case it does not, which is exactly why `test/shard.test.ts` also
tests the tie on made-up candidates. Then open the application with
`?threads=1` and `?threads=4` appended and compare the search line at the
foot of the setup sheet.

## Check yourself

<details><summary>What makes a `(k, shares)` unit a shard, and what would break if it read a module-level variable?</summary>

That it reads only its arguments and writes only its result, so it can run
on any thread in any order and the search is the same search. A
module-level variable exists once per thread: read on a worker it is the
worker's copy, and the tally is the example, which is why each unit sends
its counts back to be folded in.

</details>

<details><summary>Why must the pool fold results in unit order rather than as they arrive, when every unit is independent?</summary>

Because the fold is not order-independent: `better` keeps the first of
equals, so a tie between two units' candidates is resolved by which comes
first. Folding by arrival makes "first" mean "fastest core", and the design
would depend on the device. Storing each reply at its unit's index and
folding once makes the sharded search identical to the serial one.

</details>

<details><summary>A phone reports nine cores. Why does the pool ask for four threads there and up to eight on a desktop?</summary>

Because the phone's cores are unequal and the platform does not say which
is which. Threads beyond the fast cores land on cores about three times
slower, and the pool waits for the slowest unit; four threads gave 2.06×
and eight gave 1.88× on a Pixel 8. A desktop's cores are equal, and the cap
of eight is where the group runs out of units to hand out.

</details>

## Further reading

- The MDN reference for Web Workers and for the structured clone algorithm,
  for what a message can carry and what it costs.
- Maurice Herlihy and Nir Shavit, _The Art of Multiprocessor Programming_,
  the chapter on work distribution, for dynamic hand-out against static
  partitioning.

## Key takeaway

Split the search into units that touch nothing but their arguments, hand
them to threads one at a time as each frees up, and put every reply back at
the index of the unit that produced it before folding once, because the fold
keeps the first of equals and "first" must mean the same on a phone as on a
desktop; four threads halve a phone's solve, eight do not, and the serial
path and the sharded one agree to the bit.

_As of 2ecc64f._
