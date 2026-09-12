# Plain data across a seam

**Syllabus:** [L1](../../README.md#part-3--language-and-platform)

**Why it matters:** The seam matters because the whole application is two
programs, a solver that takes seconds and a page that must stay responsive,
joined at one function call, and the only reason that call can today run on
a background thread, and could tomorrow run in Rust compiled to WebAssembly,
is that everything crossing it is plain data that survives being copied; one
`Set` in the input or one shared object reference in the output would break
that silently, with nothing failing until the day the solver moved, which is
why a test rather than a convention holds the line.

**Before this:** nothing.

## A worked case

The Mun landing from the seam test, 2.5 t at tier 5, goes across the
boundary and back:

| Direction | What crosses                                                       | Size as JSON | Copy time |
| --------- | ------------------------------------------------------------------ | ------------ | --------- |
| In        | 7 legs, 13 engines, 13 tanks, 21 tech nodes, and a dozen scalars   | 5.5 kB       | 0.03 ms   |
| Out       | 3 solved stages with their engines, tank lists, structure and legs | 6.2 kB       |           |

Serialise the input to JSON, parse it back, and plan from the copy: the
stages come out byte-identical to the plan from the original. Serialise the
result and parse it back: it is deep-equal to itself. That is the whole
contract, stated as two checks, and it is what a Web Worker actually does to
every message, so it is exactly the property the worker path depends on.

The property is easy to lose, and the way it was lost once is instructive.
The solver's groups used to arrive as arrays holding the very same leg
objects as the route, and one line asked `route.indexOf(legs[0])` to find
where a group began. In-process every caller passes the shared objects and
the lookup works. Across JSON the leg is copied, the copy is a different
object, `indexOf` returns −1, and the split-point lookup broke silently.
Nothing in the suite could see it, because in-process every caller passes
the shared objects. Plain data means not only no `Set` and no function but
no identity: two equal copies must be as good as one shared original.

```js
// what the seam test refuses, on small examples
const bad = (v, path = "input", up = new Set()) => {
  if (v === null || typeof v !== "object")
    return typeof v === "function"
      ? [`${path}: function`]
      : v === undefined
        ? [`${path}: undefined`]
        : typeof v === "number" && !Number.isFinite(v)
          ? [`${path}: ${v}`]
          : [];
  if (up.has(v)) return [`${path}: circular reference`];
  const seen = new Set(up).add(v);
  if (v instanceof Set) return [`${path}: Set`];
  if (v instanceof Map) return [`${path}: Map`];
  if (Array.isArray(v))
    return v.flatMap((x, i) => bad(x, `${path}[${i}]`, seen));
  if (Object.getPrototypeOf(v) !== Object.prototype)
    return [`${path}: class instance`];
  return Object.entries(v).flatMap(([k, x]) => bad(x, `${path}.${k}`, seen));
};
console.log(
  bad({
    payload: 2.5,
    unlocked: ["start", "basicRocketry"],
    splitBy: [[0, 3]],
  }),
); // []
console.log(
  bad({
    unlocked: new Set(["start"]),
    splitBy: new Map(),
    score: (x) => x,
    dv: NaN,
  }),
); // four paths named
class Roster {}
console.log(bad({ r: new Roster() })); // a class instance: its prototype does not survive a copy
// identity does not survive either
const leg = { kind: "ascent", dv: 3400 };
const before = { route: [leg], groups: [[leg]] };
const after = JSON.parse(JSON.stringify(before));
console.log(
  before.route.indexOf(before.groups[0][0]),
  after.route.indexOf(after.groups[0][0]),
); // 0 -1
```

## The idea

A **seam** is the one boundary in a program that everything crosses, kept
deliberately narrow so that what is on either side can be replaced without
the other side knowing. Here it is a single asynchronous function,
`planMission(input, options)`: a destination, a payload and a roster in, a
list of solved stages out. The page knows nothing of stage counts, Δv
splits, tank packing or the ascent simulator; the solver knows nothing of
React, the DOM or threads. Each can change, and each has, without the other
noticing. The seam is also where the program is measured: the design
snapshot, the mission sweep and the seam test all drive it, and a change on
either side that alters what crosses is visible there.

**Plain data** is values made only of numbers, strings, booleans, arrays and
objects whose prototype is `Object`: what JSON can write and read back
unchanged. That excludes a `Set` and a `Map`, which JSON turns into `{}`; a
`Date`; any class instance, whose methods and prototype are lost; any
function; `undefined` inside an array; and `NaN` or `Infinity`, which JSON
writes as `null`. It also excludes, less obviously, any dependence on
identity, on two references being the same object, because every copy makes
new objects. And it excludes a cycle, an object containing itself, which
cannot be written at all; a shared reference is not a cycle, and JSON simply
duplicates it, which is fine as long as nothing on the other side compares
by identity.

```
   page (React, DOM)                                   solver (pure, no DOM)
   ─────────────────                                   ───────────────────────
   brief → PlanInput ──── JSON-shaped ──── planMission(input, {signal, onYield, fanOut})
                                                            │
                                                     Sets and Maps rebuilt
                                                     on THIS side of the line
                                                            │
   stages ← Plan  ◄──── JSON-shaped ────────────────── solved stages, tally

   today:     in-process, or a Web Worker (structured clone each way)
   tomorrow:  a Rust solver compiled to WASM behind the same call
```

Why plain data is the price of portability is a fact about what can cross
a thread or a language boundary. A Web Worker shares no memory with the page
and receives messages by structured clone, the browser's deep copy, which
carries plain data and a few built-ins and drops functions and class
identity. **WebAssembly**, WASM, is a binary format the browser runs at
near-native speed, the target for a solver written in Rust, and a WASM
module has no view of JavaScript objects at all: what crosses into it is
bytes, in practice a serialised form such as JSON. A boundary that is
already JSON-shaped can be moved to either without the page changing; a
boundary that carries a `Set` or leans on identity has to be rewritten
first, at the moment the move is wanted, which is the worst moment.

So the solver takes its rosters as sorted arrays of strings and rebuilds the
`Set`s it wants on its own side; takes the forced stage counts as an array
of pairs rather than a `Map`; returns solutions that reference parts by
copy, not by shared record; and never looks up a leg by identity. Three
things exist in the call that the in-process version does not need and that
are kept because the portable version will: an `AbortSignal` so a superseded
run stops at its next yield, an `onYield` hook so the thread can be given
back to paint, and a `fanOut` hook so the search's units can run somewhere
else ([A12](../../solver/performance/sharding-a-search-across-workers.md)).

The last piece is that the property is held by a test and not by a
convention, because a convention fails silently and late. The test walks the
input and the result and reports every path holding something JSON cannot
carry, by name, then does the round trip and compares plans. "The input is
not serialisable" is not an actionable message; "input.unlocked: Set" is.

## In this codebase

`planMission` in [`src/core/plan.ts`](../../../../src/core/plan.ts) is the
seam, and the comment above its input type is the rule in one paragraph:

```ts
/* Plain data both ways. No `Set`, no `Map`, no object identity, no functions —
   `test/seam-contract.test.js` enforces it, and the reason is at the top of
   this file. The rosters arrive as arrays and are rebuilt into the Sets the
   solver wants on this side of the line. */
type PlanInput = {
  route: ReadonlyArray<Leg>;
  // ...
  unlocked: ReadonlyArray<string>; // a roster as a sorted array, not a Set
  /* Which segment is forced to how many stages, as pairs rather than a Map. */
  splitBy: ReadonlyArray<[number, number]>;
  // ...
};
```

[`test/seam-contract.test.ts`](../../../../test/seam-contract.test.ts) is
the contract: `unserialisable` walks a value and names every offending path,
distinguishing a shared reference, which JSON duplicates harmlessly, from a
cycle, which it cannot write; the first test plans from the input and from
its JSON round trip and requires identical stages; the second requires the
result to be its own round trip; the third requires an aborted signal to
return null at the next yield. [`src/ui/solver-client.ts`](../../../../src/ui/solver-client.ts)
is the seam's first customer: it posts `{ id, input, threads }` to
[`src/ui/solver.worker.ts`](../../../../src/ui/solver.worker.ts), which
calls `planMission` and posts the plan back, and structured clone copies
both ways. The `prepare` step in
[`src/core/solver.ts`](../../../../src/core/solver.ts) is where the arrays
become `Set`s again. The rule under _The seam duplicates rather than shares_
in [`.claude/rules/solver.md`](../../../../.claude/rules/solver.md) records
the identity bug.

## What made it real

The round trip is the measurement: 5.5 kB in, 6.2 kB out, and the plan from
the JSON copy byte-identical to the plan from the original, on every run of
the suite. The copy itself costs 0.03 ms either way, JSON or structured
clone, against a solve of seconds; the boundary is free, which is why it can
be crossed on every keystroke.

The identity bug is the measurement of what the test cannot see on its own.
The `indexOf` lookup passed every in-process test and failed only across a
copy, which is why the rule was written down as well and why the seam test
plans from the JSON copy rather than only checking that one exists: the
round trip exercises the solver on duplicated objects, and a second
identity dependence would fail there.

The worker is the proof that the property bought what it promised. The
solver moved off the page's thread and, later, spread its units across a
pool of threads, and `plan.ts` did not change for either; the two hooks it
already carried, `onYield` and `fanOut`, were filled in from the outside.

## Where it breaks

- **A `Set` or `Map` in the input.** JSON writes both as `{}`. The roster is
  an array and the split map is pairs for exactly this reason, and the test
  names the path if either comes back.
- **A dependence on identity.** `route.indexOf(legs[0])` across a copy is
  −1. Look things up by index or by a key that is data, never by reference.
- **A function or a class in the result.** A solution that carried a method
  or a live part record would lose it in the worker. Solutions carry copies
  of the parts they use.
- **A shared object mistaken for a cycle, or a cycle for a shared object.**
  The test tracks ancestors, not everything seen, so the same part appearing
  in three stages is fine and an object containing itself is not.
- **Checking serialisability without planning from the copy.** "It
  serialises" proves the shape; only planning from the round trip proves
  that nothing on the far side compared by identity.

## Try it

Run the snippet and read the four named paths, then the `0 -1`. Then run
`npx vitest run test/seam-contract.test.ts` and, in `plan.ts`, change the
`unlocked` field's type to `ReadonlySet<string>` and pass a `Set` from the
seam test's sample input: the first test names `input.unlocked: Set` and
fails before the solver runs. Put it back.

## Check yourself

<details><summary>Why does the seam test plan from the JSON round trip of the input rather than only checking that the input serialises?</summary>

Because serialising proves the shape and not the behaviour. A solver that
compared two legs by identity would accept a JSON-shaped input and then
misbehave on the copy, which is what the `indexOf` bug did. Planning from
the copy and requiring identical stages exercises the far side on
duplicated objects.

</details>

<details><summary>The same engine record appears in three solved stages of the result. Is that a problem for the seam?</summary>

No. A shared reference is duplicated by JSON and by structured clone, and
nothing on the page compares engines by identity, so three copies are as
good as one shared record. Only an object that contains itself, a cycle,
cannot be written, and only a comparison by identity notices the
duplication.

</details>

<details><summary>What do a Web Worker and a WASM module have in common that makes plain data the price of either?</summary>

Neither shares JavaScript objects with the page. A worker receives a
structured-clone copy of each message, which drops functions and class
identity; a WASM module receives bytes. A boundary that already carries
only what a copy preserves can be moved behind either without changing the
page, and one that does not has to be rewritten at the moment of the move.

</details>

## Further reading

- The MDN reference for the structured clone algorithm, for exactly what a
  worker message carries and what it drops.
- Michael Feathers, _Working Effectively with Legacy Code_, for the notion of
  a seam as the place where behaviour can be changed without editing the
  code on the other side.
- The MDN guide to WebAssembly and JavaScript interoperation, for why a
  WASM boundary carries bytes and not objects.

## Key takeaway

Everything that crosses `planMission` is JSON-shaped, no `Set`, no `Map`, no
function, no class and no reliance on two references being the same
object, and a test plans from the JSON copy to prove it; that is what let
the solver move to a worker and then to a pool of threads without the page
changing, and what would let it move to Rust, and it costs 0.03 ms to copy
5.5 kB each way.

_As of 0c470ce._
