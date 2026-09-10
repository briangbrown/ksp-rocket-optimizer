# Colour a Ratio on a Log Scale

**Why it matters:** any heat map of a cost whose interesting band is a small
neighbourhood of its minimum while the rest of the field runs to many times it —
Δv, latency, price, error.

## The concept

A linear colour scale spends its ramp evenly across the field's range. Where the
range is a factor of fifteen, the valley the reader cares about — everything
within a factor of two of the best — gets a sliver of the ramp and the plot is
mostly the top colour. Capping the range concentrates the ramp on the valley but
pins everything above the cap to one colour, which reads as clipping and hides
whatever structure lives there. Mapping colour to `log(value / min)` gets both:
a step in colour is a ratio in value, so the valley keeps a fixed share of the
ramp whatever the far corners do, nothing saturates, and the scale bar's stops
come out geometric rather than evenly spaced. It composes with a perceptually
linear map — equal steps in the ramp are equal steps in perceived colour, and
equal steps in perceived colour are then equal ratios in the quantity.

## In this codebase

The Δv transfer plot (#213). The issue asked for linear with a cap at four times
the minimum; that was the first cut. `uOf` in `src/ui/cet.ts` is the scale now:

```ts
const uOf = (total: number, lo: number, hi: number) =>
  hi > lo ? Math.log(Math.max(total, lo) / lo) / Math.log(hi / lo) : 0;
```

`stopsOf` gives the scale bar five geometric values; `rangeOf` in
`src/ui/components/porkchop.tsx` sets `lo` to the cheapest solved cell (or the
window's own total, where the refinement found lower than any cell) and `hi` to
the dearest; and the map is CET-L08, chosen because it is linear in lightness.

## What made it real

Duna's grid runs to 17 times its cheapest cell, Jool's to 4. Under the linear
scale capped at 4×, half of every plot was the cap's colour. On the log scale a
cell at twice the cheapest sits a quarter of the way up a sixteen-fold ramp and
one at four times it exactly halfway — `test/cet.test.ts` holds
`uOf(4 * lo, lo, 16 * lo)` at 0.5 — so the valley keeps a quarter of the ramp
while the corners still reach yellow. The scale bar for a 1,666 m/s minimum
reads 1,666 · 3,332 · 6,664 · 13,328 · 26,656, and the right margin is measured
from the widest of them, which is what had been clipping "6,664+" before.

## Key takeaway

When the differences that matter in a field are ratios, colour its logarithm —
a cap trades clipping for contrast, a log scale gets both.
