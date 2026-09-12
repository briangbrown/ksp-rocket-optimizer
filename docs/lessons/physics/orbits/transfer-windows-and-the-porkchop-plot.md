# Transfer windows and the porkchop plot

**Syllabus:** [P22](../../README.md#part-1--physics)

**Why it matters:** Transfer windows matter because the brief has to report
a departure date and a Δv for every leg between planets, and neither is a
formula: the Hohmann of [P17](hohmann-transfer-and-synodic-period.md) is an
estimate for circles, while the real cost is a surface of Lambert-priced
transfers over departure date and flight time whose lowest point is the
window; without the search there is no date to report, and without the plot
of that surface the reader cannot see how wide the window is, what leaving a
week late costs, or that a cheaper one follows.

**Before this:** [P21](lamberts-problem.md), _Lambert's problem_.

## A worked case

Kerbin to Duna from a new save. The search lays a grid over two questions,
when to leave and how long to fly, and prices every cell:

| Axis           | Range                                        | Steps               |
| -------------- | -------------------------------------------- | ------------------- |
| Departure date | Day 1 to Day 1,865, 2.05 synodic periods     | 94, every 19.9 days |
| Time of flight | 91 to 604 days, 0.3 to 2 times the Hohmann's | 41, every 12.8 days |

That is 3,854 cells. In each, Lambert's problem gives the arc from where
Kerbin is on that date to where Duna is after that flight, and the arc is
priced as an ejection and a capture from the two relative speeds
([P18](ejection-energy-and-the-hyperbolic-leg.md)), with the tilt paid in
the ejection or mid-course, whichever is cheaper
([P19](plane-change-and-inclination.md)). The totals run from 1,666 to
27,978 m/s across the grid, with a median of 7,222: most of the surface is
several times the price of its floor, and only 30 cells of the 3,854 are
within 5% of the cheapest.

The cheapest cell in the first synodic period is at column 12, row 14: a
departure near Day 240 with a 270-day flight, at 1,704 m/s. A refinement
then searches a 7 × 7 patch about it, shrinks the patch by 0.3 and repeats,
nine times, from a step of 20 days down to seconds, and settles on Year 1
Day 231, 271 days of flight, 1,697 m/s. The cells around it say what the
window is worth:

| Leave                          | Cost      | Against the window |
| ------------------------------ | --------- | ------------------ |
| At the window, Day 231         | 1,697 m/s |                    |
| 20 days later                  | 1,775 m/s | +78                |
| 40 days later                  | 1,926 m/s | +229               |
| 60 days later                  | 2,176 m/s | +479               |
| At the window, 13 days longer  | 1,715 m/s | +18                |
| At the window, 13 days shorter | 1,706 m/s | +9                 |

A week late costs about 25 m/s; two months late costs a third again. The
flight time hardly matters within a fortnight. The valley is long in one
direction and short in the other, and that shape is what the plot draws.

Moho is the contrast. Its synodic period is 135 days, so the grid's date
step is 3.0 days; the first window is Year 1 Day 97 at 5,110 m/s, and one
column later, three days, it is 5,486. Moho's windows also differ from one
to the next: the second period holds one on Day 267 at 4,966, cheaper by
144, and the card offers it. Duna's second period is no better than its
first, within the two percent the code treats as noise, so nothing is said.

Because the search is in TypeScript, the snippet is a test file. Save it as
`test/window-try.test.ts` and run
`npx vitest run test/window-try.test.ts --reporter=verbose`:

```ts
import { it } from "vitest";
import { findWindow } from "../src/core/transfer.js";
import { kerbalDate, DAY } from "../src/core/kepler.js";
import { lowR } from "../src/core/orbits.js";
it("the Duna window and its grid", () => {
  const w = findWindow(
    "Kerbin",
    "Duna",
    lowR("Kerbin"),
    lowR("Duna"),
    0,
    true,
  )!;
  const g = w.plot;
  const d = kerbalDate(w.depart);
  console.log(
    `Year ${d.year} Day ${d.day}, ${Math.round(w.tof / DAY)} days, ${Math.round(w.total)} m/s`,
  );
  console.log(
    `${g.nt} dates every ${(g.step / DAY).toFixed(1)} d by ${g.nf} flight times`,
  );
  const col = Math.round((w.depart - g.t0) / g.step);
  const row = Math.round((w.tof - g.fLo) / ((g.fHi - g.fLo) / (g.nf - 1)));
  const cell = (i: number, j: number) => g.totals[(col + i) * g.nf + row + j];
  console.log(cell(0, 0), cell(1, 0), cell(2, 0), cell(3, 0)); // 1704 1775 1926 2176
});
```

## The idea

A **transfer window** is the departure date and time of flight at which a
transfer between two bodies is cheapest. It is a minimum of a function of
two variables: for a departure date t and a flight time τ, Lambert's problem
gives the arc, the arc's two relative speeds give the two burns, and the sum
is Δv(t, τ). The window is where that surface is lowest. Nothing about the
surface is available in closed form, because where the planets are on each
date comes from Kepler's equation and the arc from a solver, so the window
is found by sampling the surface and descending.

The **porkchop plot** is the surface drawn: departure date along the bottom,
time of flight up the side, cost as colour or contour. The name is from the
shape of the contours, two lobes pinched at a waist, like a chop. The lobes
are the transfers that go the short way round the Sun, under 180°, and the
long way, over 180°; the waist between them is the ridge of transfers near
exactly 180°, which between tilted orbits need an enormous plane change and
so cost far more than their neighbours. Every real window sits in a lobe,
tens of degrees short of or past the half-turn.

```
   time of flight
     ↑
     │ ░░░░░░░░░░░░░▒▒▒▒▒▓▓▓█▓▓▓▒▒▒▒▒░░░░░░░░░░░░░░░░░░
     │ ░░░░░░▒▒▒▒▒▒▒▒▒▒▒▒▓▓▓█▓▓▓▒▒▒▒▒▒▒▒▒▒▒░░░░░░░░░░░░       long way round
     │ ░░░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▓▓█▓▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░░░░░░░░       (over 180°)
     │ ░▒▒▒▒▒▒▒░░░░░░▒▒▒▒▒▓▓█▓▓▒▒▒▒░░░░░░░▒▒▒▒▒▒▒▒░░░░░░   ← the ridge: near-180°
     │ ▒▒▒▒▒▒░░░  ░░░▒▒▒▒▓▓█▓▓▒▒▒░░░  ●  ░░░▒▒▒▒▒▒▒░░░░░      transfers, a wall
     │ ▒▒▒▒▒░░░ ○ ░░░▒▒▒▒▓▓█▓▓▒▒▒░░░░   ░░░░▒▒▒▒▒▒▒▒░░░░      of plane change
     │ ▒▒▒▒▒▒░░░  ░░░▒▒▒▒▓▓█▓▓▒▒▒▒░░░░░░░░▒▒▒▒▒▒▒▒▒░░░░
     │ ▒▒▒▒▒▒▒▒░░░░░▒▒▒▒▒▓▓█▓▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░░░       short way round
     │ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▓▓█▓▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒       (under 180°)
     └───────────────────────────────────────────────→ departure date
        ○ the window: the floor of one lobe       ● a cheaper one, a synodic period on
        ░ cheap   ▒ dearer   ▓ dear   █ the ridge
```

Two lengths set the axes, and both come from [P17](hohmann-transfer-and-synodic-period.md).
The dates span a synodic period, because the geometry repeats after one, so
one period is sure to hold a window; the code scans a second so it can
mention a cheaper window there, but reports the first period's, because the
first window from the date the reader gave is what they asked for. The
flight times bracket the Hohmann's, from a third of it to twice, because the
real arc is near the half-ellipse but not on it.

Finding the minimum is coarse first, then fine. A coarse grid is sampled
everywhere, so the ridge and the lobes are seen whole and the search cannot
be trapped on the wrong side of the wall; then the cheapest cell is refined
by a shrinking local search, because the coarse cell is 20 days wide for
Duna and the brief reports a day. The date reported is the refined cell's;
the Δv on the leg is its cost; and the plot is the coarse grid, kept on the
window as plain numbers so the picture the reader sees is the search that
was done and not a different one.

The window also fixes the two angles a pilot flies by. The **phase angle**
is how far ahead of the departure body the target sits, about the Sun, at
departure: 38.6° for the Duna window, in the forties as every tool says. The
ejection angle is where on the parking orbit to burn, measured from the
body's prograde for a transfer outward and from retrograde for one inward,
and it comes from the hyperbola's asymptote in [P18](ejection-energy-and-the-hyperbolic-leg.md):
153° from prograde for Duna, 62° from retrograde for Moho.

## In this codebase

`findWindow` in [`src/core/transfer.ts`](../../../../src/core/transfer.ts)
is the search. After the axes are set from the synodic period and the
Hohmann time, the grid is one loop:

```ts
for (let i = 0; i < nt; i++)
  for (let j = 0; j <= NF; j++) {
    const t = t0 + i * step;
    const tof = fLo + ((fHi - fLo) * j) / NF;
    const c = at(t, tof); // one cell: Lambert, then ejection + plane + capture
    if (!c) continue;
    totals[i * nf + j] = Math.round(c.total); // the plot
    if (t <= t0 + first) {
      if (!early || c.total < early.c.total) early = { t, tof, c }; // the first period's floor
    } else if (!later || c.total < later.c.total) later = { t, tof, c }; // the second's
  }
```

`at` is `price` from [P19](plane-change-and-inclination.md), which solves the
Lambert arc for the ballistic and mid-course cases and returns the cheaper as
a `Cell`. `refine` is the shrinking 7 × 7 search, nine rounds with the step
multiplied by 0.3 each time. `next` is set only when the second period's
refined floor is under 98% of the first's. The result is the `Window`, all
plain numbers, so it crosses the `planMission` seam unchanged and the route
in [`src/core/orbits.ts`](../../../../src/core/orbits.ts) can put its two
excess speeds on the leg that leaves, as [P17](hohmann-transfer-and-synodic-period.md)
showed.

The plot is the search's own grid, carried on the window as `plot`, a `Grid`
of 94 × 41 totals with the pricing that produced them.
[`src/ui/components/porkchop.tsx`](../../../../src/ui/components/porkchop.tsx)
paints it on a canvas, cheapest cell blue and dearest yellow on a log scale,
read between cells bilinearly, with the window marked and a cheaper next one
marked hollow. Because 20 days by 13 is coarse enough to paint the 180°
ridge as a wall, the card then prices the same span three times finer a
slice at a time through `priceColumns`, which at the search's own spacing
returns the search's totals to the bit; the picture sharpens, the search
does not move.

The brief supplies the two inputs the search takes besides the bodies: the
date to search from, "leave no earlier than", and for a return the stay,
which sets when the window home is searched from.

## What made it real

The Duna window is held against every launch-window tool's answer. The test
"finds the classic Duna departure from a new save" in
[`test/transfer.test.ts`](../../../../test/transfer.test.ts) requires a
departure in the 230s of Year 1, an ejection between 1,000 and 1,100 m/s, a
capture between 600 and 700, a phase angle between 35° and 48°, an ejection
angle between 145° and 160° from prograde, and a flight between 250 and 300
days; the search gives Day 231, 1,042, 648, 38.6°, 153° and 271 days. Against
a well-known community planner, nine transfers agree to the metre per second
once the sphere-of-influence correction of [P16](patched-conics-and-the-sphere-of-influence.md)
is in.

The shape of the surface is measured too. Moho's grid has its cheapest cell
of the first period at 5,110 and the next column, three days on, at 5,486,
which is why the coarse-then-fine search matters there and why Moho's
"cheaper window follows" on Day 267 at 4,966 is offered: the test "reports
the first window, and names a clearly cheaper one after it" holds both, and
that Duna's next is null. "Starts where it is told" holds that searching
from thirty days after the Duna window finds the next one a synodic period
on, within forty days. And the plot test holds that `priceColumns` at the
search's spacing reproduces the search's totals exactly, so the picture is
the search.

## Where it breaks

- **Searching two periods for the answer.** The first cut scanned two
  synodic periods and reported the cheapest, and for Moho that was a window
  two years after the date the reader had given. The reported window is now
  the first period's floor and the second period is only mentioned. The
  rule under _Transfer windows_ in
  [`.claude/rules/solver.md`](../../../../.claude/rules/solver.md) records
  it.
- **The ridge painted as a wall.** At the search's spacing the near-180°
  transfers fill whole cells and the plot showed a band; priced three times
  finer it is the line it is. The ridge is real, the width was the grid's.
- **A coarse grid on a fast planet.** Moho's cost moves 376 m/s in one
  three-day column. The refinement exists because the coarse floor can be
  hundreds of metres per second from the true one.
- **A grid that starts at the wrong clock.** The ephemeris uses the game's
  g₀ of 9.80665; the solver elsewhere uses 9.81. Run with the solver's,
  Kerbin's year came out 1,600 s short and every window drifted with it.
  Also in the rule.
- **A fouled optimum.** The cheapest cell may describe a flight that passes
  through the Mun's sphere on the way out, which the game would fly
  differently. That check, and the small shift that clears it, is
  [P23](../../README.md#part-1--physics), _Encounters on the way_.

## Try it

Run the test file above. Then change the `0` in `findWindow` to
`w.depart + 30 * DAY` in a second call and print its `depart`: the window
found is about 926 days after the first, a synodic period and change, as
[P17](hohmann-transfer-and-synodic-period.md) predicted. Then change
`"Duna"` to `"Moho"` in both places: the step falls to 3.0 days, the cells
after the window climb by hundreds, and `w.next` is no longer null.

## Check yourself

<details><summary>Why is the window found by sampling a grid and then refining, rather than by descending from a guess such as the Hohmann's date?</summary>

Because the surface has a ridge. Transfers near 180° between tilted orbits
cost far more than their neighbours and divide the surface into two lobes;
a descent started on the wrong side would settle in the wrong lobe or on the
ridge's flank. Sampling the whole span first sees both lobes, and the
refinement then does the fine work inside the right one.

</details>

<details><summary>Duna's second synodic period has a cell at 1,666 m/s, cheaper than the reported window's 1,697. Why does the card say nothing about it?</summary>

Because the grid is coarse and a percent is noise. A second-period window
is offered only when its refined cost is under 98% of the first's, and
1,666 is within two percent of 1,697. Moho's Day 267 window, 144 m/s under
its Day 97 one, clears the bar and is offered.

</details>

<details><summary>What do the two axes of the porkchop plot span, and where do those two lengths come from?</summary>

Departure dates over a synodic period, because after one the two planets
are back in the same relative position and the picture repeats; and flight
times from a third of the Hohmann's to twice it, because the real arc is
near the half-ellipse but not on it. Both lengths are P17's, and both are
computed before a single cell is priced.

</details>

## Further reading

- Howard Curtis, _Orbital Mechanics for Engineering Students_, the chapter on
  interplanetary trajectories, for launch windows and the phase angle at
  departure.
- NASA JPL, _Basics of Space Flight_, the section on interplanetary
  trajectories, for how porkchop plots are read and why they have the shape
  they do.
- Sergeyevsky, Snyder and Cunniff, _Interplanetary Mission Design Handbook_
  (JPL, 1983), the original porkchop plots for Earth to Mars, one per
  opportunity.

## Key takeaway

A window is the lowest point of a surface, cost against departure date and
flight time, that only a Lambert solver can price; the search samples it on
a grid spanning one synodic period and a third-to-twice the Hohmann's
flight, refines the cheapest cell to the second, reports the first period's
floor and mentions the second's, and the porkchop plot is that same grid
drawn, so the reader can see that leaving Duna's window twenty days late
costs 78 m/s and sixty days late costs 479.

_As of 2ecc64f._
