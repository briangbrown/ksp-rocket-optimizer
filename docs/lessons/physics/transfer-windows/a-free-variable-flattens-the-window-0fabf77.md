# A Free Variable Flattens the Window

**Why it matters:** when deciding whether a cost landscape — a porkchop plot, or
any two-axis picture of a minimum — has anything to show; and more generally
whenever one degree of freedom can be re-chosen much faster than the axis you
are plotting against.

## The concept

A porkchop plot has valleys because the departure date fixes the geometry: a
ship leaving one planet for another cannot wait for a better alignment without
moving to a different cell. Now suppose a variable inside each cell can be
chosen freely, on a timescale far shorter than the cell's own step. Each cell is
minimised over it, and whatever structure the axis carried is absorbed into that
inner minimisation. The axis goes flat. The thing that times the burn is no
longer a date on the axis but the free variable itself — and a search over the
flat axis can afford to be coarse, since it is really only finding the other
axis.

## In this codebase

Low Kerbin orbit to the Mun is a transfer with no sphere of influence to leave:
`raiseSearch` in `src/core/transfer.ts` (#223) raises apoapsis to meet the moon
inside the one frame. The ship goes round its parking orbit every half hour,
far inside the grid's step, so where on that orbit to burn is free, and
`raiseCell` prices each cell by a one-dimensional search over that longitude
with Lambert. The grid is 24 × 20 against the planetary search's 48 × 40, the
card draws no `Porkchop` for such a window (`isRaise` in
`src/ui/components/transfer.tsx`), and the phase angle to the moon at the burn
is the number the pilot times by. #223 had decided "yes, plot too" before
anyone knew the burn point was free; the measurement reversed it.

## What made it real

The Mun's entire grid — every departure date at every flight time — sits within
3% of its own minimum. A planetary grid's far corners are fifteen times its
minimum, which is what gives the plot a valley to show. With the axis flat, the
figures still land on the community map: 856 and 280 m/s against its 860 and
280 for the Mun, 921 and 161 against 930 and 160 for Minmus, and a phase angle
of 111° against the 105–115° pilots quote.

## Key takeaway

A cost landscape only has shape along an axis nothing else can compensate for —
find the variable that can be re-chosen for free, and expect the axis it
compensates to be flat.
