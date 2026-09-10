# A Third Body Is Zero or Everything

**Why it matters:** whenever a two-body transfer is validated inside a
patched-conic world — KSP, or any simulator that switches frames at a sphere of
influence — and you are deciding whether to correct the numbers, warn the
reader, or do something else.

## The concept

In a patched-conic model gravity is piecewise: exactly one body pulls at a time,
the one whose sphere of influence the ship is inside. A body the ship never
enters exerts nothing however close it passes, so a two-body arc is not an
approximation of the flight — it _is_ the flight, exactly, right up to the
moment the ship crosses a third sphere. Then the model switches frames and the
flight that was priced does not happen at all. The error is not continuous; it
is zero, and then it is total. That shape decides the remedy. There is nothing
to correct, because the numbers are exact until they are meaningless. A warning
is a poor answer when the discontinuity is thin and a small shift steps clean
over it. So: detect the crossing, and move off it.

## In this codebase

`encountersOf` in `src/core/encounter.ts` (#216) walks all three legs of a
window against every body under the relevant primary — the escape hyperbola
against the departure body's moons, the cruise against the other planets, the
capture hyperbola against the arrival body's moons. `search` in
`src/core/transfer.ts` then dodges rather than reports: it steps the departure
forward by `DODGE_STEP` (two hours) up to `DODGE_REACH` (nine days), holding the
flight time, and takes the first clean cell within 2% of the cost. `dodged` on
the `Window` says what was done, `encounters` is what the delivered flight still
meets, and the card says so in a `note` — or, only where no dodge was found, a
`warn` `Callout` naming what is in the way.

## What made it real

Among planets the crossing is rare: 2 of 6,048 sampled arcs. Among moons it is
not: 72 of 320 delivered windows across eight routes and forty start dates, a
fifth, almost all the Mun on the way out or a Jool moon on the way in. Dodging
those 72 shifted the departure by 2.7 hours on average and cost 0.38 m/s on
average, and left none fouled. The discontinuity was thin enough that stepping
over it cost less than the rounding on the figure it protects.

## Key takeaway

When a model's error is discrete — zero until a threshold, then total — do not
correct or warn; detect the threshold and step off it.
