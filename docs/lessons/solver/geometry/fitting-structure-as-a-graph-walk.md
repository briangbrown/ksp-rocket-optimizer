# Fitting structure as a graph walk

**Syllabus:** [A10](../../README.md#part-2--algorithms-and-the-solver)

**Why it matters:** Structure fitting matters because an engine and a tank
do not make a stage: four engines need a coupler to gather them under one
tank, a coupler wider than the tank needs adapters to span the gap, a stage
needs a decoupler at its top unless the stage above brought a plate, and
every one of those is a real part with a mass and a price that the closed
form has to include for its sizing to be honest; the parts are chosen by
walking a small graph of diameters from narrow to wide, and because two
solvers ask the same question, the walk is written once, after five bugs
came from fixing one copy and not the other, and the whole adapter branch
once sat dead for want of one comparison's direction.

**Before this:** [A8](../tank-packing/packing-propellant-into-tanks.md),
_Packing propellant into tanks_.

## A worked case

Put four Terriers, 1.25 m engines, under a 2.5 m tank, with another stage
below. What holds them on?

| Question                                                               | Answer                                 | Mass   |
| ---------------------------------------------------------------------- | -------------------------------------- | ------ |
| Four engines under one tank: what gathers them                         | TVR-400L Stack Quad-Adapter, a coupler | 0.20 t |
| Is the coupler wider than the tank                                     | No, both 2.5 m: no adapter needed      |        |
| Four engine bells above the stage below: what rejoins them to one node | the same quad coupler, upside down     | 0.20 t |
| What lets the spent stage go                                           | TD-25 Decoupler, one, at the top       | 0.16 t |
| Structural mass, all in                                                |                                        | 0.56 t |

Change the question and the answer changes shape. One Terrier under the
same tank needs no coupler and no rejoin: a narrower engine bolts straight
onto a wider tank, because the game's node sizes are advisory, so the
structure is one decoupler, 0.16 t. Three Vectors under a 3.75 m tank take
a tri-coupler and a rejoin and the 3.75 m decoupler, 0.66 t; the same three
Vectors as the bottom of the rocket, with nothing below to rejoin to, 0.51
t. Four Sparks under a 1.25 m tank cannot be built at all in the stock
game, because every stock coupler has 1.25 m outlets and a Spark is 0.625
m; the ReStock+ engine plates are what make a cluster of small engines
possible.

Now the other direction. A coupler or an engine wider than its tank needs
an adapter, and stock adapters are themselves small tanks, each spanning
one step of the size ladder:

| Span            | Chain                       | Dry mass | Propellant carried |
| --------------- | --------------------------- | -------- | ------------------ |
| 0.625 to 1.25 m | NCS Adapter                 | 0.10 t   | 0.4 t              |
| 1.25 to 2.5 m   | C7 Brand Adapter            | 0.57 t   | 4 t                |
| 2.5 to 3.75 m   | Kerbodyne ADTP-2-3          | 1.88 t   | 15 t               |
| 1.25 to 3.75 m  | C7, then ADTP-2-3           | 2.44 t   | 19 t               |
| 0.625 to 3.75 m | NCS, then C7, then ADTP-2-3 | 2.54 t   | 19.4 t             |
| 0.625 to 5 m    | nothing spans it: no chain  |          |                    |

No single stock part spans two steps, so a wide gap is a chain of hops, and
the walk finds the lightest chain of up to three. The propellant an adapter
carries counts toward the stage only if the engine can burn it; an
adapter full of liquid fuel and oxidiser under a solid-fuel part is mass,
not range.

Because the parts tables are in TypeScript, the snippet is a test file.
Save it as `test/structure-try.test.ts` and run
`npx vitest run test/structure-try.test.ts --reporter=verbose`:

```ts
import { it } from "vitest";
import { adapterChain, fitStructure } from "../src/core/tanks.js";
import { DATA } from "../src/core/catalogue.js";
import { withDeps } from "../src/core/tech.js";
it("what holds a stage together", () => {
  const unlocked = withDeps(DATA.nodes, new Set(Object.keys(DATA.nodes))); // everything researched
  const tanks = DATA.tanks.filter(
    (t) => (!t.t || unlocked.has(t.t)) && !t.mh && !t.rs,
  ); // stock parts
  const chain = adapterChain(tanks, 0.625, 3.75)!;
  console.log(
    chain.parts.map((p) => p.n).join(" then "),
    chain.dry.toFixed(2),
    "t",
  ); // three hops, 2.54 t
  const terrier = DATA.engines.find((e) => /Terrier/.test(e.n))!;
  const fit = fitStructure({
    engine: terrier,
    n: 4,
    stackD: 2.5,
    tanks,
    unlocked,
    excluded: null,
    expansions: { mh: false, rs: false },
    hasStageBelow: true,
  })!;
  console.log(fit.coup?.n, fit.rejoin?.n, fit.dec.n, fit.dry.toFixed(2), "t"); // quad coupler, quad coupler, TD-25, 0.56 t
});
```

## The idea

Five kinds of part make a stage out of engines and tanks. A **coupler**
joins engines to the tank above them: one node on top, two, three or four
below, and it exists because a tank has one attachment node and a cluster
needs several. An **adapter** joins two diameters, and in the stock game
every adapter is also a small tank. An **engine plate** is a coupler that
also separates the stage below: the engines hang inside its shroud and it
carries the decoupling module itself, so a plated stage buys no separate
decoupler. A **shroud** is the cover over an engine until its stage lights,
sized by the engine's height, which the plates provide and which this
solver picks by measured engine height rather than leaving to the player. A
**decoupler** is the part that lets a spent stage go: one per stage, at its
top, on the axis.

The rules that connect them are few and each was learned. A narrower part
under a wider one needs nothing, so an adapter is only ever needed from
narrow to wide, going up: from the engine's or coupler's top diameter to the
tank's. A cluster presents one node per engine at its bottom, so a clustered
stage sitting on another stage needs the same coupler again, inverted, to
gather those nodes back to one, unless a plate is doing it. The joint
between two stages is paid by the stage below it, so a stage under a plated
stage pays for no decoupler: the plate is the joint. And a stage with
parallel columns needs one coupler and one set of adapters per column, not
per stage, because each column has its own tank to gather onto.

```
      ┌──────────────┐  tank, 2.5 m
      │              │
      ├──────────────┤  ← adapter(s) here only if what is below is WIDER than the tank
      │  coupler     │  one node up, four down
      ├──┬──┬──┬──┬──┤
      │▼ │▼ │▼ │▼ │  │  four engines: four bottom nodes
      ├──┴──┴──┴──┴──┤
      │  rejoin      │  the same coupler inverted, to present one node to the stage below
      ├──────────────┤  ← the stage below's decoupler sits here, at ITS top (or a plate above does the job)
      │  next stage  │
```

The adapters are the graph. Its nodes are the diameters the parts come in,
0.625, 1.25, 1.875, 2.5, 3.75 and 5 m, and there is an edge from a smaller
to a larger diameter for every part that has one at each end, keeping the
lightest where several span the same pair. A span from one diameter to
another is then a path from the smaller node to the larger through
increasing diameters, and the lightest chain of at most three parts is
found by walking every such path and keeping the cheapest by dry mass. The
graph is tiny, a handful of nodes and edges, and the walk is exhaustive, so
this is a graph search only in shape; what matters is that it is one
function, keyed one way, from narrow to wide.

That direction is the whole of one bug. The graph's edges are keyed
small-to-large and the walk only ever moves up, so the caller must ask for
the tank's diameter up to the wider part's, not down from the tank to the
engine. Asked the other way, the function hits its guard for a span that
needs nothing, from ≥ to, and returns an empty chain, correctly by its
contract and uselessly for the caller. For a long time that was exactly how
it was called, so no design in the snapshot ever carried an adapter, and
nothing looked wrong, because a subsystem that always answers "nothing
needed" fails silently.

The other lesson is about having one copy. The plain stage solver and the
boosted-ascent solver both need the same structure for an engine, a count, a
column count and a tank diameter, and each once answered it for itself.
Five bugs followed from fixing one and not the other: couplers, the thrust
limiter, the gimbal check, the cluster cap and a missing decoupler
quantity. The fix was not to be more careful; it was to have one function
both call.

## In this codebase

`fitStructure` in [`src/core/tanks.ts`](../../../../src/core/tanks.ts) is
the one function, and its body is the rules above in order: the coupler
from `couplerFor`, the plate and its shroud, the adapter chain only when
what is under the tank is wider than it, the rejoin only when the stage is
clustered and has a stage below and no plate, the decoupler zeroed when a
plate above makes the joint, and the per-column multiplication:

```ts
const under = coup ? coup.top : diaOf(engine);
const adapt = under > stackD // wider than the tank: adapters, walked narrow to wide
  ? usableAdapterProp(adapterChain(tanks, stackD, under), engine)
  : { parts: [], prop: 0, dry: 0, cost: 0 };
// ...
const split = coup && hasStageBelow;
const rejoin = split && !plated ? coup : null; // gather the cluster's nodes back to one
const nDec = plateAbove ? 0 : 1; // the plate above is the joint
// ...
dry: stacks * (adapt.dry + coupM) + dec.m + (rejoin ? rejoin.m : 0) + joins, // one set per column
```

`adapterGraph` builds the edge map from the tank list, keyed
`"small>large"` and keeping the lightest part per pair; `adapterChain` is
the walk, a depth-first search over increasing diameters with a depth of
three, memoised per roster. `couplerFor`, `shroudFor` and `decouplerFor` in
[`src/core/parts.ts`](../../../../src/core/parts.ts) pick from the real part
tables in [`src/data/couplers.json`](../../../../src/data/couplers.json) and
[`src/data/structure.json`](../../../../src/data/structure.json), by
diameter among what is researched, cheapest first, with the decoupler's
fallback rule for a diameter no researched part fits: the largest researched
part no wider than the stack, as a player would use a TD-25 under a 5 m tank.
The result is cached, which is [A11](../../README.md#part-2--algorithms-and-the-solver),
_Memoisation, and what a cache key is_.

## What made it real

The tests in [`test/adapters.test.ts`](../../../../test/adapters.test.ts)
are the ones that would have caught the dead subsystem, and their header
says so. One asks for the 1.25 to 2.5 m chain and gets the C7; asks for the
same span backward and gets the empty sentinel, "which is why it never
fitted an adapter to anything". One asks for 0.625 to 3.75 m and requires
three hops. One asks for a span nothing covers and requires null. And one
builds the graph for a tier-3 roster, which has no adapters, then for tier
9, and requires the second to find a chain the first could not: the caches
were once a bare `let` and a bare `Map`, built from whichever roster asked
first, and an empty `Map` is truthy, so a first roster with no adapters
pinned the graph empty for the life of the module.

The five bugs are the measurement for the shared function, and the rule
under _`fitStructure` is shared between `solveStage` and `boostedAscent`_
in [`.claude/rules/solver.md`](../../../../.claude/rules/solver.md) names
them. The decoupler count is #78: it was `split ? perEng * stacks : stacks`,
and both branches disagreed with the rocket the model draws, a plated stage
paying one decoupler per engine for the joint its own plate makes. The
per-column charge is #60: one coupler for a three-column stage made it
lighter and cheaper on paper than the rocket you would have to build.

## Where it breaks

- **Asking the walk downhill.** The graph is keyed narrow to wide and the
  guard returns an empty chain for from ≥ to. A caller that asks tank-to-engine
  instead of tank-to-coupler gets "nothing needed" every time, and no test
  that only checks designs will notice.
- **A cache that outlives its roster.** The adapter graph and chain memos
  are keyed on the tank array, like the pools; a module-level `let` filled
  by the first roster is a graph for the wrong game.
- **Two copies of the fit.** Any structural rule that lives in two places is
  a bug waiting for the second place. `fitStructure` exists so there is one.
- **Counting nodes at the wrong end.** A cluster's bottom nodes are what the
  rejoin gathers; the decoupler is one part at the top. Confusing the two
  charged a plated stage four decouplers for a joint it did not have.
- **Charging per stage what is per column.** Couplers and adapters belong
  to a column's tank; a stage of three columns has three sets, and the
  drawing shows all three.

## Try it

Run the test file above, then change the fit's `hasStageBelow` to `false`:
the rejoin goes away and the structural mass falls from 0.56 to 0.41 t,
because a cluster at the bottom of the rocket has nothing to present one
node to. Then change `n` to 1: no coupler, no rejoin, 0.16 t. Then ask
`adapterChain(tanks, 2.5, 1.25)` and see the empty sentinel, the answer the
whole subsystem once gave to everything.

## Check yourself

<details><summary>A Terrier is 1.25 m and sits under a 2.5 m tank. Does the stage need an adapter?</summary>

No. Node sizes are advisory in the game, so a narrower part bolts straight
onto a wider one; an adapter is needed only when the part under the tank is
wider than the tank, a coupler or a big engine, and then the chain runs from
the tank's diameter up to the wider part's.

</details>

<details><summary>Why does a clustered stage that has a stage below it pay for its coupler twice?</summary>

Because a cluster presents one bottom node per engine, and the stage below
has one top node. The coupler that gathered the engines under the tank is
needed again, inverted, to gather their bottoms back to one, unless an
engine plate is doing the job, in which case the plate already presents one
node and is the joint besides.

</details>

<details><summary>How could the whole adapter subsystem be broken for a long time without a single test or design showing it?</summary>

Because its failure was silence. Asked backward, `adapterChain` returned
the empty chain the contract specifies for a span that needs nothing, so
every stage was built without adapters and looked like a stage that needed
none. The tests that catch it ask the function directly, in both directions,
and for a roster that has adapters after one that does not.

</details>

## Further reading

- Thomas Cormen et al., _Introduction to Algorithms_, the chapter on
  elementary graph algorithms, for depth-first search on a small directed
  graph, which is all the adapter walk is.
- The Kerbal Space Program wiki's pages on structural parts and adapters, for
  the diameters, masses and the fact that stock adapters carry fuel.

## Key takeaway

A stage's structure is a coupler to gather the cluster, adapters only where
what is below is wider than the tank, the coupler again to present one node
to the stage below, and one decoupler at the top unless a plate above is
the joint; the adapters are the lightest path up a tiny graph of diameters,
asked from narrow to wide or not at all, and the whole fit is one function
because two copies of it produced five bugs.

_As of 2ecc64f._
