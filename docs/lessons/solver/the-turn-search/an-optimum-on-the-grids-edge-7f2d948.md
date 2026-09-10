# An Optimum on the Grid's Edge

**Why it matters:** any parameter search — a turn, a tank split, a
hyperparameter — whose answer keeps landing on a bound you set.

## The concept

A search that returns an interior point has found something; one that returns a
corner has found the edge of your box. The reflex is to widen the box, but a
bound that binds on every hard case is usually not a bad bound — it is the model
asking for a control it does not have, and it would push harder if allowed. The
tell is that the same corner comes back under every variation of the other
knobs. When the missing control is added, it does not need the whole grid re-run
in one more dimension: seed the new axis from the old optimum, scan it coarsely
round that seed, and refine round the best. The cost is a few dozen evaluations
rather than a multiple of the grid.

## In this codebase

`optimiseTurn` in `src/core/ascent.ts` searched `vKick` over 30–140 m/s and
`kick` over 3–25°, with a refinement floored at 2°. On the stalling Minmus stack
every variant — full thrust, core at 95%, boosters limited to 85, 70, 50% —
returned 130–140 m/s and 2°: the top of one range and the floor of the other,
"stay vertical" (#10). The control it wanted was the nose held above prograde,
`lead`. Rather than a third axis over the grid, `optimiseTurn` takes the
two-parameter result as its seed, scans `LEADS` (3, 6, 10, 15°) on a ±20 m/s,
±4° grid round it, then refines ±10 m/s, ±2°, ±2° round the best. Passing
`leads = []` asks for the classic turn alone, which is how the test compares.

## What made it real

The pinned corner cost about 2,600 m/s of gravity loss on a 4,300 m/s ascent;
with the third parameter the same stack flies at 4,223 m/s from 4,549. The
search did not get slower — `perf:mission` went 4,610 → 4,567 ms across five
missions — because a few dozen flights round a seed are cheap next to the grid.
The 81-design snapshot did not move; the mission sweep moved on one design, Duna
at 3.5 t, back to the 152.4 t rocket an earlier fix had had to grow to 172.2 t
because the two-parameter program could not fly it within what it carried.

## Key takeaway

When the optimum sits on the boundary you drew, ask what control the model lacks
before you widen the box — and add the control as a seeded local search, not
another grid axis.
