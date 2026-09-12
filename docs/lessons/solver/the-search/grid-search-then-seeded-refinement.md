# Grid search, then a seeded local refinement

**Syllabus:** [A2](../../README.md#part-2--algorithms-and-the-solver)

**Why it matters:** The grid-then-refine pattern matters because the turn
that flies a rocket to orbit cheapest is found by trying turns, each try is a
flight of most of a millisecond, and the cost surface has cliffs where a
turn falls over or breaks the pressure cap, so a search that descends from a
guess falls off an edge and a search that tries everything finely takes two
seconds per vehicle, twenty on a phone; a coarse grid that sees the whole
surface, then a fine search round its best cell, finds a turn within one
percent of the best in a hundred flights, and that ratio is what keeps a
solve interactive.

**Before this:** [P9](../../physics/ascent/the-gravity-turn.md), _The gravity
turn_.

## A worked case

The 0.8 t low-orbit launch from the test grid is a single stage of 4.8 t. A
gravity turn for it has two numbers to choose, the speed at which to kick the
nose over and the angle to kick it to, and a third, how far above prograde to
hold the nose, that matters only for a weak stack. Here is what four ways of
choosing them cost, measured on that vehicle:

| Search                                           | Flights | Time     | Best turn found        | Ascent Δv |
| ------------------------------------------------ | ------- | -------- | ---------------------- | --------- |
| Coarse grid alone: 6 kick speeds × 6 kick angles | 36      | 20 ms    | 110 m/s, 3°            | 3,875 m/s |
| Coarse grid, then a fine grid round its best     | 109     | 61 ms    | 120 m/s, 4°, no lead   | 3,762 m/s |
| Everything fine: 27 speeds × 27 angles × 5 leads | 3,645   | 1,991 ms | 75 m/s, 8°, 6° of lead | 3,722 m/s |
| One flight                                       | 1       | 0.56 ms  |                        |           |

The coarse grid is 3% off the best turn there is. Refining round its best
cell recovers 113 of those 153 m/s for 73 more flights. The full fine grid
recovers the last 40 m/s, one percent, for 3,536 more flights and thirty
times the wall-clock. A phone runs this code about eleven times slower than
the machine these were measured on, so the full grid is twenty seconds a
vehicle there, and the solver flies a few hundred vehicles per mission.

The surface itself says why a grid rather than a descent. Hold the kick speed
at 120 m/s and vary the angle:

| Kick angle | 2°    | 3°    | 4°    | 5° and beyond      |
| ---------- | ----- | ----- | ----- | ------------------ |
| Ascent Δv  | 4,194 | 3,939 | 3,762 | no flight survives |

Three angles fly and the cost falls steeply toward a cliff; at 5° the turn
falls over or breaks the pressure cap. Along the other axis, at 4°, only kick
speeds of 120 m/s and above fly at all. A method that follows the slope would
step off the cliff on its first move. A grid does not care about slopes; it
sees every cell that flies and picks the cheapest, and only then looks
closely.

Because the simulator is in TypeScript, the snippet is a test file. Save it
as `test/turn-try.test.ts` and run
`npx vitest run test/turn-try.test.ts --reporter=verbose`:

```ts
import { it } from "vitest";
import {
  flyAscent,
  optimiseTurn,
  buildVehicleFor,
} from "../src/core/ascent.js";
import { planMission } from "../src/core/plan.js";
import { missionCases } from "./grid.js";
it("coarse grid alone, then grid and refinement", async () => {
  const plan = (await planMission(missionCases()[0].input, {
    onYield: () => Promise.resolve(),
  }))!;
  const veh = buildVehicleFor(plan.stages, (s) => s.isLaunch, "Kerbin")!;
  let coarse = Infinity;
  for (let vK = 30; vK <= 140; vK += 20)
    for (let kd = 3; kd <= 25; kd += 4) {
      const r = flyAscent(veh, {
        target: 80000,
        vKick: vK,
        kick: (kd * Math.PI) / 180,
      });
      if (r.ok && r.maxQ <= 40000) coarse = Math.min(coarse, r.total);
    }
  const t = performance.now();
  const best = optimiseTurn(veh)!;
  console.log(
    Math.round(coarse),
    Math.round(best.total),
    `${(performance.now() - t).toFixed(0)} ms`,
  ); // 3875 3762, about 60 ms
}, 60_000);
```

## The idea

A **grid search** tries every combination of a few values for each parameter
and keeps the best. It is the simplest search there is, it needs no
derivative and no assumption about the shape of the surface, and it cannot be
fooled by a cliff, a plateau or a second valley, because it looks everywhere.
Its cost is the product of the counts: six by six is thirty-six, and a third
parameter at five values makes it a hundred and eighty. Its weakness is
resolution: the answer is only as fine as the grid, and a grid fine enough to
be the answer costs its square.

A **refinement** is a second, finer search confined to the neighbourhood of
the best coarse point. If the surface is smooth near its minimum, and cost
surfaces usually are even when they have cliffs elsewhere, the fine grid finds
the local floor for the price of a few dozen more points instead of the
thousands a fine grid over the whole range would cost. The **seed** is the
point the refinement is given to start from, here the coarse grid's best
cell, and the refinement's answer is only as good as its seed: it will find
the floor of the valley it is put in, not a deeper valley elsewhere.

```
   cost
    ↑          coarse grid: · sampled     refinement: ▪ round the best ·
    │ ·                                                          ·
    │        ·                                    ·
    │                 ·                    ·  ▪▪▪▪▪                       cliff:
    │                          ·        ▪▪▪▪▪▪▪▪▪▪▪▪   ·                 no flight
    │                                 ▪▪▪   floor  ▪▪▪                    │
    │                                                    ·                │
    └──────────────────────────────────────────────────────────────────→ kick angle
                                                a descent from here ────→ falls off
```

The pattern is a trade between two failure modes. Too coarse a grid and the
seed is in the wrong valley or far up the side of the right one; too fine and
the search is the cost the refinement exists to avoid. The coarse spacing
should be about the width of the features that matter, so that every valley
gets at least one sample, and the refinement should shrink until the answer
stops moving at the precision the reader cares about. The turn search uses 20
m/s and 4° coarse, then 5 m/s and 1°, because the surface above changes by a
hundred metres per second over a degree and a turn reported to a degree is
what a pilot can fly.

The same pattern is the window search of
[P22](../../physics/orbits/transfer-windows-and-the-porkchop-plot.md): a 94 ×
41 grid over departure date and flight time sees both lobes of the porkchop
and the ridge between them, and a 7 × 7 patch shrunk nine times finds the
floor of the right lobe to the second. There the coarse grid is kept and drawn,
because the shape of the whole surface is itself the answer the reader wants.
And within a single cell the one-dimensional version, golden-section search
([A3](../../README.md#part-2--algorithms-and-the-solver)), finds where along an
arc a plane change is cheapest.

## In this codebase

`optimiseTurn` in [`src/core/ascent.ts`](../../../../src/core/ascent.ts) is
the search, built round one helper that flies a grid and keeps two results:
the cheapest flight under the pressure cap, and the gentlest flight of all,
in case nothing meets the cap.

```ts
scan(range(30, 140, 20), range(3, 25, 4)); // the coarse grid: 36 flights
// ...
const seed = found.best || found.gentlest;
if (seed)
  scan(
    range(Math.max(25, seed.vKick - 15), seed.vKick + 15, 5), // 7 speeds round the seed
    range(Math.max(2, seed.kick - 3), seed.kick + 3, 1), // 7 angles round the seed
  );
```

Then the third parameter, only round the seed: three speeds by three angles
by the four leads in `LEADS`, and if a lead won, a 5 × 5 × 5 refinement round
that. The comment above it says why: "a few dozen flights rather than a third
dimension over the whole grid", which at five leads would have multiplied
every count by five. Two more one-dimensional scans follow when they are
needed, a throttle limit scanned down from full thrust when nothing meets the
pressure cap, and a core throttle when solid boosters are aboard; both step
through a short list and take the first setting that works, the simplest grid
of all.

The cost `flyAscent` charges per try is the reason the counts are what they
are: about 9,000 steps of a tenth of a second, 0.5 to 1 ms per flight,
which [A1](closed-form-first-simulation-last.md) put against the microsecond
the closed form costs. `findWindow` in
[`src/core/transfer.ts`](../../../../src/core/transfer.ts) is the same shape
over a cheaper cell, and its `refine` is the shrinking patch written out.

## What made it real

The table above is the measurement: 36 flights for 3,875 m/s, 109 for 3,762,
3,645 for 3,722. The refinement buys 113 m/s for 73 flights; the full grid
buys 40 more for 3,536. On the six-Hammer Mainsail stack the rule under _The
turn has three parameters_ in
[`.claude/rules/solver.md`](../../../../.claude/rules/solver.md) records what
the lead scan round the seed found: 4,549 m/s down to 4,223 with a 7° kick at
125 m/s and 6° of lead, a few dozen flights, where a fifth grid dimension over
the whole range would have cost thousands.

The design snapshot and the mission sweep hold the turns the search finds,
because a change to the grid moves the turn and the turn moves the rocket:
when the flown cost was corrected to include finishing the orbit, the search
found a steeper flight for the Torch rocket at 3,561 m/s, and one sweep design
re-solved from five Twitches to seven.

## Where it breaks

- **The wrong valley.** The full grid's best turn, 75 m/s and 8° with 6° of
  lead, is 40 m/s better than the search's and lies outside the seed's
  neighbourhood, so the refinement never sees it. A seeded search is content
  with the valley it is given, and here that is a one-percent price paid for
  a thirty-fold saving. If that percent mattered, the fix is a coarser lead
  scan over the whole grid, not a finer refinement.
- **Descending instead of sampling.** At 120 m/s the cost falls 250 m/s per
  degree toward 4° and then no flight survives at 5°. A gradient step from 4°
  lands on the cliff. The grid is not a stopgap for a better optimiser; it is
  the right tool for a surface with edges.
- **A grid that is too coarse.** Moho's windows in P22 change by 376 m/s
  between columns three days apart. A coarse cell can sit hundreds of metres
  per second above the floor it contains, which is why every grid here is
  followed by a refinement and none is reported raw.
- **Refining the wrong quantity.** The turn search once preferred a flight
  that ran out of fuel short of orbit, because a truncated burn is always
  cheaper than a finished one. A search minimises what it is told to; the
  rule under _A flight's `total` is what the orbit needs_ records the fix.
- **Forgetting the phone.** Every count in `optimiseTurn` is a wall-clock
  decision. The perf notes in [`perf/README.md`](../../../../perf/README.md)
  measured a Pixel 8 at about eleven times slower than the desktop, so a
  search that feels free here is a visible pause there.

## Try it

Run the test file above. Then widen the coarse grid's angle step from 4 to 2
in the snippet's loop and watch the coarse answer improve toward 3,762 while
the flight count doubles to 72; then narrow it to 8 and watch it worsen. The
refinement in `optimiseTurn` is what makes the coarse spacing a choice about
cost rather than about the answer.

## Check yourself

<details><summary>Why does the turn search fly a coarse grid first instead of starting a fine local search from a sensible guess such as 100 m/s and 10°?</summary>

Because the cost surface has cliffs: at 120 m/s no kick beyond 4° flies at
all, and at 4° no kick speed below 120 m/s does. A local search from a guess
that happens to sit on a cliff, or in the wrong valley, has nothing to
follow. The grid samples every cell that flies, cheaply, and hands the best
one to the refinement as a seed.

</details>

<details><summary>The refinement found a turn 40 m/s worse than the best on a full fine grid. Is that a bug?</summary>

No, it is the trade the pattern makes. The full grid cost 3,645 flights and
two seconds; the search cost 109 and 61 ms, and the solver flies a few
hundred vehicles per mission. The one percent is the price of interactivity.
Were it worth recovering, the answer would be a coarse scan of the lead over
the whole grid, since the better turn lives in a valley the seed's
neighbourhood does not reach.

</details>

<details><summary>How should the coarse spacing be chosen?</summary>

At about the width of the features that matter, so that every valley gets a
sample and no cliff hides a cell that flies; then let the refinement do the
precision. Here 20 m/s and 4° find the right valley, 5 m/s and 1° find its
floor to what a pilot can fly, and the same reasoning gives the window
search 20-day columns for Duna and 3-day columns for Moho.

</details>

## Further reading

- William Press et al., _Numerical Recipes_, the chapter on minimisation, for
  why bracketing a minimum comes before refining it and what a
  one-dimensional refinement should do.
- Jorge Nocedal and Stephen Wright, _Numerical Optimization_, the
  introduction, for the distinction between global sampling and local
  descent and why the two are combined.

## Key takeaway

Sample the whole range coarsely so that no cliff or second valley is
missed, then search finely only round the best cell: on the 0.8 t launch
that is 109 flights for a turn within one percent of the best, against
3,645 flights and thirty times the wall-clock for the last percent, and the
same shape carries the window search, the raise search and every
one-dimensional scan in the solver.

_As of 2ecc64f._
