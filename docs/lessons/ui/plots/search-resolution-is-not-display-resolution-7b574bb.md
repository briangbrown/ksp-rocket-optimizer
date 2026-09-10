# An Optimiser's Grid Is Not a Picture's Grid

**Why it matters:** whenever a search's sampled evaluations are also going to
be drawn — a porkchop plot, a parameter sweep, a loss landscape.

## The concept

A coarse grid is enough for an optimiser because a refinement follows it: the
grid only has to land within a cell of the minimum. A picture has no refinement.
Every feature narrower than a cell is smeared across its neighbours by whatever
interpolation reads between them, and a thin ridge becomes a wall as wide as
the cell — which the eye reads not as a resolution limit but as clipping, or as
a different landscape. The grid is still worth keeping: it is priced already, it
shows something at once, and it is the picture's first draft. But the picture
wants a finer pass of its own, and that pass should be display-only. It must not
feed back into the search, or the answer moves with the plot's resolution; and
since nothing depends on it, it can be priced progressively, a time slice at a
time between paints, sharpening the draft in place.

The ridge in a porkchop plot is a real physical line, not noise: departures
whose transfer angle is 180°. The two position vectors are then collinear, the
transfer plane is undefined, and a target a little off the departure plane asks
for an arc nearly perpendicular to it, so the Δv spikes along a curve through
the plot.

## In this codebase

`findWindow` in `src/core/transfer.ts` priced 94 × 41 cells over two synodic
periods and threw them away. Since #213 it keeps them on `Window.plot` as a
`Grid` — whole m/s, −1 where no arc solved, plain numbers so it crosses the
`planMission` seam — and `priceColumns` prices any run of columns of a grid at
that grid's own spacing. `useFiner` in `src/ui/components/porkchop.tsx` prices
the same span three times finer for the plot alone (`FINE`), twelve
milliseconds of columns at a time (`SLICE_MS`) between paints, starting from the
coarse grid read bilinearly (`readGrid`) so an unpriced column is never a gap;
`data-fine` says when it is done. On `main` today the finer pass runs on a pool
of workers (#215) rather than in slices on the page's thread; the grid and the
division of labour are the same.

## What made it real

At the search's spacing — 20 days by 11 for Duna — the 180° ridge smeared into
walls forty days wide and read as clipping against alexmoon's per-pixel plot;
at 7 days by 4 it is the line it is. A cell prices in about 5 µs: the search's
3,854 cells are 20 ms, and the finer grid's 280 × 121 ≈ 34,000 cells about
170 ms, a dozen frames — hence the slices. `priceColumns` at the search's own
spacing returns the search's totals to the bit, held by `test/transfer.test.ts`,
and the design snapshot, mission sweep, routes table and solvability snapshot
were byte-identical: the plot got three times finer and the answer did not move.

## Key takeaway

Keep the search's grid as the picture's first draft and sharpen it for the eye
alone — a resolution fine enough to find the minimum is not fine enough to draw
the ridge beside it.
