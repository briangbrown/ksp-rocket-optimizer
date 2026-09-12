# Memoisation, and what a cache key is

**Syllabus:** [A11](../../README.md#part-2--algorithms-and-the-solver)

**Why it matters:** Memoisation matters because the solver asks the same
few questions an enormous number of times, an engine's Isp at a pressure 124
million times for 116 distinct answers across the design grid, a stage's
structural parts 30 million times for 4,679, and the difference between a
second and a minute is whether those answers are remembered; but a
remembered answer is only right if the key it is filed under names
everything the answer depends on, and the caches here have been wrong both
ways, a key too coarse that returned another roster's answer for the life
of the module, and a key so expensive to build that the cache gained under
one percent.

**Before this:** [A1](../the-search/closed-form-first-simulation-last.md),
_The shape of the search: closed form first, simulation last_.

## A worked case

Three caches in the solver, and what each is keyed on:

| Function       | Calls across the design grid | Distinct answers | Key                                                               |
| -------------- | ---------------------------- | ---------------- | ----------------------------------------------------------------- |
| `ispAt`        | 124 million                  | 116              | engine name, then pressure                                        |
| `couplerFor`   | 54 million                   | a few hundred    | roster, exclusions and engine by identity, then a number          |
| `fitStructure` | 30.1 million                 | 4,679            | three roster objects by identity, engine, diameter, then a number |

Each ratio is a million to one or better, which is the shape of a function
worth remembering. The first attempt at the second one did not work: a
cache keyed on a string built from the engine name, the count and a flag
gained under one percent, because building the string allocated on every
one of 54 million calls and cost about what the lookup saved. Keyed on a
number instead, `n * 16 + (noPlate ? 8 : 0) + expansion bits`, under a map
found by the roster's and engine's identity, the same cache took the
function from 22% of the solve to 0.8%.

The adapter caches show the other failure. They were once a bare `let` and
a bare `Map` at module level, built from whichever roster asked first. A
tier-3 roster has no adapter-capable tanks, so it built an empty graph;
the code checked `if (cached)`, and an empty `Map` is truthy, so every
later roster, including tier 9 with three adapters, was answered from the
empty graph. Nothing was wrong with the memoisation. The key was missing a
thing the answer depended on, the roster, and a cache with too coarse a key
is not slow, it is wrong.

```js
// a key that names the roster by identity: two rosters, two answers
const byRoster = new WeakMap();
const lookup = (roster, span, compute) => {
  let m = byRoster.get(roster);
  if (!m) byRoster.set(roster, (m = new Map()));
  if (!m.has(span)) m.set(span, compute(roster, span));
  return m.get(span);
};
const tier3 = [],
  tier9 = ["NCS Adapter", "C7 Brand Adapter", "Kerbodyne ADTP-2-3"];
const chain = (roster, span) =>
  roster.filter((p) => span.includes(p.split(" ")[0]));
console.log(lookup(tier3, "NCS C7", chain), lookup(tier9, "NCS C7", chain)); // [] then two parts: the second roster is not answered from the first
// the same key, by value: a fresh but equal array is a different roster to a WeakMap, the same to a string
console.log(byRoster.has([]), byRoster.has(tier3)); // false true
// what a string key costs at fifty million calls, against a number
let t = performance.now(),
  sink = 0;
for (let i = 0; i < 5e7; i++)
  sink += ("LV-909|" + (i & 7) + "|" + (i & 1)).length;
const strMs = performance.now() - t;
t = performance.now();
for (let i = 0; i < 5e7; i++) sink += (i & 7) * 16 + (i & 1) * 8;
console.log(
  Math.round(strMs),
  "ms of string keys against",
  Math.round(performance.now() - t),
  "ms of numeric ones",
  sink > 0,
);
```

## The idea

**Memoisation** is remembering a function's result for the arguments it
was called with, so the next call with the same arguments returns the
stored answer instead of computing it again. It is correct for a pure
function, one whose result depends on nothing but its arguments, and it
pays when the function is called far more often than it has distinct
answers. The ratio is the test: `ispAt` at a million to one is a candidate;
a function called once per distinct input is not, however slow.

The **cache key** is what the cache compares to decide that two calls are
the same. It must name every input the answer depends on, and only those. A
key that omits an input is too coarse: two calls that should differ collide,
and the second is answered with the first's result. A key that includes
something the answer does not depend on is too fine: calls that should hit
miss, and the cache fills with duplicates. And a key that is expensive to
build can cost more than the computation it saves, which is the third way to
lose.

**Identity** is two references to the very same object, as against two
objects that are equal. A JavaScript `Map` or `WeakMap` keyed on an object
compares by identity: the same array hits, an equal copy misses. That is
exactly the right behaviour for a roster, a tank list or an engine record,
provided the caller hands back the same object each time, which inside one
solve it does; the roster is built once per tech-tree change and the same
array flows through every call. It is exactly the wrong behaviour across a
boundary that copies, and the `planMission` seam copies everything, because
structured clone and JSON both produce equal objects with new identities.

```
   call:  fitStructure(engine, n=4, stackD=2.5, tanks, unlocked, excluded)

   key, level by level:
     unlocked  ─┐
     excluded  ─┼─ by identity (WeakMap): the roster objects themselves
     tanks     ─┘
     engine    ─── by identity (Map on the engine record)
     stackD    ─── by value (a measured diameter, not a multiple of anything)
     n, stacks, noPlate, plateAbove, hasStageBelow, expansions
               ─── packed into ONE number: (((n·8 + stacks)·2 + noPlate)·2 + plateAbove)·2 + hasStageBelow)·8 + bits

   too coarse: leave out `unlocked` → tier 9 answered with tier 3's parts
   too dear:   join the scalars into "LV-909|4|false|…" → an allocation per call, 54 million times
```

Three design rules follow, and the solver's caches are examples of each.
Key on identity for the big immutable inputs, because a reference
comparison is the cheapest test there is and the objects do not change
inside a solve. Key on a number for the scalars, packed into one integer,
because a numeric `Map` lookup allocates nothing. And where several inputs
are almost always the same from one call to the next, remember the last
key and skip the lookup entirely: `fitStructure` keeps the last roster
triple and its bucket in three variables, so thirty million calls inside one
solve pay three reference comparisons instead of three `WeakMap` gets.

Two more concerns are about the store rather than the key. A cache on a
continuous input never stops growing, because propellant tonnages are real
numbers and a long search asks for endless distinct ones; the tank memo is
capped at 20,000 entries and cleared whole when it fills, which is crude and
right for its access pattern, hot within a pass and cold after. And a cache
whose key is an object that will be thrown away should be a `WeakMap`, so
that when the roster changes the old roster's answers can be collected with
it; a plain `Map` keyed on rosters would hold every roster the user had ever
built.

## In this codebase

`ispAt` in [`src/core/performance.ts`](../../../../src/core/performance.ts)
is the simplest: a `Map` from engine name to a `Map` from pressure to Isp,
never invalidated, because the answer is pure in the two arguments. The
comment carries the count: "called 124 million times across the design grid
and has 116 distinct answers." `couplerFor` in
[`src/core/parts.ts`](../../../../src/core/parts.ts) is the numeric-key
lesson:

```ts
/* Numeric key, no string. Building `e.n + "|" + n + "|" + noPlate` allocated
   on every one of 54 million calls and cost about what the lookup saved —
   measured at 0.8% against 22% for this. */
const ck = n * 16 + (noPlate ? 8 : 0) + expBits(expansions);
```

`fitStructure` in [`src/core/tanks.ts`](../../../../src/core/tanks.ts) is
the layered key drawn above, three `WeakMap`s by roster identity, a `Map` by
engine, a `Map` by diameter, then one packed integer, with `fitScope`
remembering the last roster triple. The comment says why every input is in
the key and none is inferred: "no assumption about how the caller derives
one from another — `tanks` looks like a proxy for the roster, and relying
on that would be a claim about a caller made inside the solver." `poolsFor`
and the adapter graph and chain memos in the same file are keyed on the tank
array by identity, so a tech-tree change, which builds a new array, gets a
new cache. `pickTanksMemo` hangs its memo off the pool array itself as a
property, one small `Map` per objective and tank limit, capped at
`TANK_MEMO_MAX`, because the pool is already cached and a property read is
cheaper than a hash.

`simCached` in [`src/core/ascent.ts`](../../../../src/core/ascent.ts) is
the one string key that is worth its cost: a flight takes most of a
millisecond, so a key built from the vehicle's description, body, target,
payload and each stage's flow, propellant, dry mass, area and boosters to a
few decimals, costs nothing by comparison, and it is what stops the
candidate walk and the re-solve flying the same vehicle twice.

## What made it real

The counts are the measurement, and [`perf/README.md`](../../../../perf/README.md)
records how to take them: a module-level counter and a set of keys added
inside the function, printed at the end of a grid run and reverted before
committing, because "a counter on a hot path costs what it measures." It
also records the negative result: `couplerFor` had a repeat factor of
101,000 and a string-keyed cache still gained under 1%. "How a memo is
keyed matters as much as whether it exists." The numeric key took the
function from 22% of the profile to 0.8%.

The wrong-answer case is in [`test/adapters.test.ts`](../../../../test/adapters.test.ts):
build the adapter graph for tier 3 and find nothing, then for tier 9 and
find a chain. Before the caches were keyed on the tank array that test
fails, because the second roster was answered from the first's empty graph.
The rule under _The adapter caches are keyed on the tank array_ in
[`.claude/rules/solver.md`](../../../../.claude/rules/solver.md) records
it, and the rule under _The seam duplicates rather than shares_ records the
identity trap at the boundary: `route.indexOf(legs[0])` depended on the leg
objects being the same objects, JSON made them equal copies, and the lookup
returned −1 silently.

The design snapshot is the guard for all of them. A cache that returns a
stale or wrong answer moves designs; every cache change here was made
against 81 unchanged lines, and the perf notes insist on the order: baseline
on `main`, compare on the branch, then run the snapshot and confirm nothing
moved, because a faster solver that picks different rockets is a different
solver.

## Where it breaks

- **A key too coarse.** The adapter graph without the roster: an empty
  `Map` is truthy, and tier 9 got tier 3's answer for the life of the
  module. Every input the answer depends on goes in the key, inferred from
  nothing.
- **A key too dear.** A string built per call at 54 million calls costs the
  saving. Pack the scalars into a number and key the objects by identity.
- **Identity across a copy.** Structured clone and JSON produce equal
  objects with new identities. A cache or a lookup that depends on identity
  is right inside a solve and wrong across the `planMission` seam, which is
  why nothing crossing it is a `Map`, a `Set` or a shared reference.
- **A cache on a continuous input.** Tonnages are real numbers; without a
  cap the tank memo grew until the heap gave out on a deep stack.
- **A cache that outlives its key.** Rosters change; a plain `Map` keyed on
  them keeps every one. `WeakMap` lets the old answers go with the old
  roster.

## Try it

Run the snippet and read the last line: fifty million string keys against
fifty million numeric ones, on your machine. Then, in `couplerFor`, change
the numeric key back to the string the comment quotes and run
`npm run perf` before and after, following the recipe in `perf/README.md`;
then run `npm test` and confirm the design snapshot has not moved, which is
the check every cache change is made against. Put it back.

## Check yourself

<details><summary>`ispAt` is called 124 million times and has 116 distinct answers. Why is that ratio, rather than the function's cost, the test of whether to memoise it?</summary>

Because memoisation trades a computation for a lookup, and pays only when
the same computation would otherwise be repeated. A function called once
per distinct input gains nothing however slow it is; one called a million
times per answer gains a million computations for the price of a million
lookups, provided the lookup is cheaper than the computation, which a
numeric map read is and a string build may not be.

</details>

<details><summary>The adapter cache was correctly memoising a pure function. How did it return wrong answers?</summary>

Because its key omitted the roster. The function's answer depended on
which tanks were available, and the cache, a module-level `let`, was filled
by the first roster and checked with `if (cached)`; an empty `Map` passes
that check, so every later roster was answered from the first's graph. A
key that leaves out an input the answer depends on returns another
question's answer.

</details>

<details><summary>Why are the roster objects keyed by identity in a `WeakMap` while the diameter is keyed by value?</summary>

Because a roster is a large immutable object that is the same reference on
every call inside a solve, so a reference comparison is the cheapest
correct test, and a `WeakMap` lets the old roster's answers be collected
when a new roster replaces it. A diameter is a measured number from a drag
cube, not a multiple of anything, so it cannot be packed into the integer
key with the other scalars and gets its own level, compared by value.

</details>

## Further reading

- Brian Kernighan and Rob Pike, _The Practice of Programming_, the chapter on
  performance, for measure-first and the cost of hidden allocation.
- The MDN reference for `WeakMap`, for keys held weakly and why a cache
  keyed on objects should usually be one.
- Donald Michie, "Memo functions and machine learning" (Nature, 1968), the
  paper that named the technique.

## Key takeaway

Remember a function's answer when it is asked a million times for a hundred
answers, and file it under a key that names every input the answer depends
on and costs nothing to build: the big immutable objects by identity, the
scalars packed into one number, and never a string assembled per call; a
key too coarse returns another roster's rocket, and a key too dear returns
the right one no faster.

_As of 2ecc64f._
