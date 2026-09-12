# Packing propellant into tanks

**Syllabus:** [A8](../../README.md#part-2--algorithms-and-the-solver)

**Why it matters:** Tank packing matters because the rocket equation
answers in tonnes of propellant and the game sells tanks in fixed sizes, so
every stage's tonnage has to become a list of parts, and that list is
typically half to three quarters of the stage's cost and a third to two
thirds of its parts; the choice between two tanks and three, or one big tank
that overshoots and two that fit, is made hundreds of thousands of times in
a solve, and a rule that walks past the tank that would have finished the
job hands the reader a rocket with a part and a few hundred funds it did not
need.

**Before this:** [P1](../../physics/staging/dv-and-the-rocket-equation.md),
_Δv and the rocket equation_.

## A worked case

A 2.5 m stage needs 23 t of propellant, and the 2.5 m tanks on offer are
the Rockomax family: 32, 16, 8 and 4 t, at 5,750, 3,000, 1,550 and 800
funds. Four simple rules give four answers:

| Rule                                                        | Tanks chosen | Propellant | Parts | Cost        |
| ----------------------------------------------------------- | ------------ | ---------- | ----- | ----------- |
| Largest first, while it still fits; cover the rest          | 16 + 4 + 4   | 24 t       | 3     | 4,600 funds |
| Fewest parts: whole big tanks, then one tank to cover       | 32           | 32 t       | 1     | 5,750 funds |
| Best value first: cheapest funds per tonne, while it fits   | 16 + 4 + 4   | 24 t       | 3     | 4,600 funds |
| Largest first, but stop as soon as one tank covers the rest | 16 + 8       | 24 t       | 2     | 4,550 funds |

The first rule is the obvious one and it is wrong here: after the 16 t tank
it needs 7 t more, an 8 t tank would finish the job, but 8 is more than 7 so
the rule skips it and takes two 4 t tanks instead, a part and 50 funds worse
than the fourth rule for the same 24 t. The second rule is right if parts
are all that matter and wrong otherwise: one tank, but 8 t of propellant the
stage will carry and never burn, and 1,200 funds more. Which answer is right
depends on the objective, so the packer computes all four and ranks them on
the objective asked for. Asked for mass or cost it delivers 16 + 8; asked
for parts, the single 32.

Then a pass over the winner: any two tanks that a single tank could replace
are replaced, for nothing, when the single tank holds exactly the same
propellant, because within a family every tank has the same dry mass per
tonne. Two 4 t tanks are an 8 t tank, one part fewer at the same mass; the
16 + 4 + 4 answer would have been tidied to 16 + 8 even if it had won.

```js
const T = require("./src/data/parts.json").tanks;
const pool = T.filter((t) => /Rockomax (X200|Jumbo)/.test(t.n)).sort(
  (a, b) => b.prop - a.prop,
); // 32, 16, 8, 4
const need = 23;
const cover = (x) => [...pool].reverse().find((t) => t.prop >= x - 1e-9); // the smallest tank that covers x
const fill = (order, stopEarly) => {
  const out = [];
  let left = need;
  for (const t of order) {
    while (left > t.prop * 0.999 && out.length < 12) {
      out.push(t);
      left -= t.prop;
      if (stopEarly && left > 1e-4 && cover(left)) {
        out.push(cover(left));
        left = 0;
      }
    }
  }
  if (left > 1e-4) out.push(cover(left));
  return out;
};
const show = (list) =>
  `${list.map((t) => t.prop).join("+")} = ${list.reduce((a, t) => a + t.prop, 0)} t, ${list.length} parts, ${list.reduce((a, t) => a + t.cost, 0)} funds`;
console.log("greedy ", show(fill(pool, false)));
const whole = Math.floor(need / pool[0].prop);
console.log(
  "fewest ",
  show([
    ...Array(whole).fill(pool[0]),
    ...(need - whole * pool[0].prop > 1e-6
      ? [cover(need - whole * pool[0].prop)]
      : []),
  ]),
);
console.log(
  "cheap  ",
  show(
    fill(
      [...pool].sort((a, b) => a.cost / a.prop - b.cost / b.prop),
      false,
    ),
  ),
);
console.log("tidy   ", show(fill(pool, true)));
```

## The idea

The problem is a small knapsack turned round: not how much fits in a fixed
space, but the fewest, lightest or cheapest fixed sizes that cover a given
amount. Exact answers exist, by trying every combination, and are not worth
their price here: the packer runs for every engine, every cluster count,
every column layout and every tank family in the search, several hundred
thousand times a solve, and a tank family has at most a dozen sizes. What is
wanted is a rule that is nearly always right and always fast.

A **heuristic** is such a rule: one that finds a good answer quickly without
guaranteeing the best. Each of the four above is a heuristic, and each fails
in a way the others do not. Largest-first minimises the overshoot but can
fragment the tail; fewest-parts never fragments but can overshoot by a whole
tank; best-value-first knows that a big stock tank is cheaper per tonne than
a small one, 180 funds against 200, but not that some small tanks beat that;
largest-first-with-an-early-finish repairs the fragmenting but inherits the
rest. None is right for all three objectives, and rather than pick one the
packer runs all four, which costs four dozen comparisons, and ranks the
results by the objective: least propellant then fewest parts for mass, fewest
funds then fewest parts for cost, fewest parts then least propellant for
parts.

```
   need 23 t                largest first          early finish            fewest parts
                            ┌────┐                 ┌────┐                  ┌────────┐
   32 ─ too big             │ 16 │                 │ 16 │                  │        │
   16 ─ take it, 7 left     ├────┤                 ├────┤                  │   32   │
    8 ─ 8 > 7, skip ──────► │ 4  │   ◄─ or ─►      │  8 │  ◄─ 8 covers 7   │        │
    4 ─ take it, 3 left     ├────┤                  └────┘                  └────────┘
        cover 3 with a 4    │ 4  │                  24 t, 2 parts           32 t, 1 part
                            └────┘
                             24 t, 3 parts
```

A **consolidation pass** is a second pass that merges small parts into fewer
large ones. It exists because every heuristic can leave two tanks where one
would do, and because within a tank family the merge is free: all the
Rockomax tanks have the same dry mass per tonne of propellant, so an 8 t
tank weighs exactly what two 4 t tanks weigh and costs less. The pass walks
the winning list, tries to replace every pair with the smallest single tank
that holds at least their sum, and accepts the replacement when it is
exactly the same propellant, or when it overshoots but the objective says
the trade is worth it: always for parts, when it is cheaper for cost, never
for mass. Up to six rounds, since one merge can enable another.

Two limits shape the answers. A stage may have at most twelve tanks, eight
in a parallel column, because a taller stack is a stack that falls over,
which is [A13](../../README.md#part-2--algorithms-and-the-solver),
_Slenderness as a constraint on the whole rocket_. And the packer covers
the tonnage it is asked for, never falling short, because the tonnage is
already the smallest that closes the budget ([A3](../numerics/bracketing-and-root-finding.md)):
a tank that is slightly too big is a heavier rocket, and one that is slightly
too small is a rocket that does not reach orbit.

## In this codebase

`pickTanksRaw` in [`src/core/tanks.ts`](../../../../src/core/tanks.ts) is
the four heuristics, the ranking and the consolidation, in that order. The
pool it receives is one tank family sorted largest first, built once by
`poolsFor` from the tanks the roster allows at a diameter. The early-finish
rule is the one whose comment records the case:

```ts
/* Greedy plus an early finish: take the largest tank while it still fits, but
   the moment one tank can cover what is left, use it and stop. Without this the
   greedy walks past a tank that would have finished the job — needing 23 t it
   took an X200-32 then two X200-8s, where an X200-32 and an X200-16 carry the
   same 24 t in one part fewer and for less money. */
```

and the ranking is the objective in three lines:

```ts
const rank = (a: TankSet, b: TankSet) =>
  objective === "parts"
    ? a.count - b.count || a.prop - b.prop
    : objective === "cost"
      ? funds(a) - funds(b) || a.count - b.count
      : a.prop - b.prop || a.count - b.count;
```

`simplify` is the consolidation pass, applied to the winner and kept only if
it ranks no worse. Around the raw function sits `pickTanksMemo`, which is
[A11](../../README.md#part-2--algorithms-and-the-solver), _Memoisation, and
what a cache key is_: the same tonnage is asked for by many candidates, and
the memo hangs off the pool array itself, one small map per objective and
tank limit, capped at 20,000 entries because tonnages are continuous and a
long search would otherwise fill the heap. The propellant asked for comes
from `propellantFor` in [`src/core/performance.ts`](../../../../src/core/performance.ts),
the rocket equation solved for propellant, and the packer's answer feeds
back into the stage's dry mass, which is why the two are iterated rather
than called once.

## What made it real

The 23 t case is the comment's own, and the packer's output today is the
table above: asked for mass or cost, X200-32 and X200-16 at 24 t in two
parts for 4,550 funds; asked for parts, one Jumbo-64 at 32 t. The design
snapshot pins the tank list of every one of its 81 designs, so a change to
any of the four rules or to the ranking shows as a moved line.

The share of a stage that is tanks is measured from the mission sweep's
delivered designs. On the 0.8 t launch's single stage of three Twitches the
one tank is 78% of the cost; on the Duna 3.5 t mission's Swivel stage seven
tanks are 58% of the parts and 72% of the cost; on the Tylo 3.5 t mission's
Mammoth stage fourteen tanks are 41% of 34 parts and, against seven
Mammoths at 39,000 funds each, still a third of the cost. Across the sweep's
launch stages the tanks are between a third and four fifths of the cost and
between a tenth and two thirds of the parts.

The cost of the packer itself was measured too: a heap profile put
`simplify` at 84% of everything the solver allocates, 676 MB of 804 MB
across a grid run, against half a percent of the CPU time, and the comment
in the function records the rewrites that did not move that number. The
allocation lives somewhere in the pass; the search for it is #28.

## Where it breaks

- **Walking past the finisher.** 16 + 4 + 4 where 16 + 8 would do. The
  early-finish rule exists for it, and the consolidation pass would catch it
  afterwards anyway.
- **Least overshoot as a proxy for cheapest.** Big stock tanks are cheaper
  per tonne, 180 against 200, and some small ones beat both; the best-value
  rule is the third heuristic because the first two cannot see price.
- **Consolidating on mass when the merge overshoots.** Merging two 4 t
  tanks into an 8 is free; merging 16 + 8 into a 32 is 8 t of dead
  propellant. The pass asks the objective before it overshoots.
- **Writing to a shared solution.** Stage solutions are shared between
  candidate chains, and the packing pass copies before it writes; the rule
  under _Stage solutions are shared_ in
  [`.claude/rules/solver.md`](../../../../.claude/rules/solver.md) records
  the leak.
- **A tank list with no cap.** Twelve tanks in a stack, eight in a column;
  past that the rocket is a pencil, whatever its Δv. The cap is a
  slenderness rule wearing a tank count.

## Try it

Run the snippet, then change `need` to 7: all four rules now agree on a
single 8 t tank, because the smallest covering tank is also the fewest
parts, the least overshoot and the cheapest. Then set it to 37.5: largest
first takes 32 and covers 5.5 with an 8, two parts and 40 t, and so does the
early finish, while fewest parts takes 32 and an 8 too, so the rules agree
again; the cases where they differ are the ones where a mid-sized tank
covers a remainder that the largest-first rule fragments.

## Check yourself

<details><summary>Why does the packer run four heuristics and rank the results rather than pick the best rule once?</summary>

Because no one rule is right for all three objectives. Largest-first
minimises overshoot but fragments; fewest-parts never fragments but
overshoots; best-value knows prices but not everything about them; the
early finish repairs the fragmenting. Four candidates cost a few dozen
comparisons, and the ranking on the objective asked for is what picks.

</details>

<details><summary>Two 4 t Rockomax tanks are replaced by one 8 t tank. Why is that free, and when would the same kind of merge not be?</summary>

Because within a tank family the dry mass is the same fraction of the
propellant for every size, so the 8 t tank weighs exactly what the two 4 t
tanks weigh and costs less, one part instead of two. Merging 16 + 8 into a
32 is not free: it carries 8 t of propellant the stage never burns, so the
pass makes that merge only for the parts objective, or for cost if it is
cheaper.

</details>

<details><summary>The rocket equation says a stage needs 23.0 t. Why does the packer never deliver 22.9?</summary>

Because 23.0 is already the smallest tonnage that closes the budget, found
by the root finder of A3, and a stage that carries less does not reach
orbit. Overshooting costs a slightly heavier rocket; undershooting costs the
mission. The packer always covers what it is asked for.

</details>

## Further reading

- Thomas Cormen et al., _Introduction to Algorithms_, the section on the
  knapsack problem and the discussion of greedy versus dynamic-programming
  solutions, for why a greedy fill can miss and when it cannot.
- Silvano Martello and Paolo Toth, _Knapsack Problems_, for the exact
  methods this packer deliberately does not use and what they cost.

## Key takeaway

A tonnage becomes a tank list by four fast rules, largest first, fewest
parts, best value, and largest first with an early finish, ranked on the
objective asked for and then tidied by merging any pair a single tank can
replace for free; it is a heuristic because it runs hundreds of thousands of
times a solve over a dozen sizes, and the 23 t case that takes three tanks
where two would do is why there are four rules and not one.

_As of 2ecc64f._
