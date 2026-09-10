# Inclination Is Paid From the Parking Orbit You Have

**Why it matters:** whenever an ejection is priced as
`sqrt(v∞² + 2v_c²) − v_c` — the formula assumes the parking orbit already
lies in the escape's plane.

## The concept

The textbook ejection from a circular orbit is one prograde burn at
periapsis, and it is the whole burn only when the parking orbit's plane
contains the outgoing asymptote. A ship parked in the equator of a body whose
equator is the ecliptic — every stock body — has to leave that plane to reach
an inclined target: the departure hyperbola is tilted about the burn's radius
until its asymptote reaches the excess's elevation, and the burn gains a
normal component alongside the prograde one. The launch-window tools that
quote a small ejection to Moho assume you launched into a parking orbit
already inclined to match; a route that always parks equatorially has to pay
the tilt, and the cheapest transfer type can change once it does.

## In this codebase

`ejection` in `src/core/transfer.ts` does the tilt: with θ∞ the asymptote's
angle past periapsis and _el_ the excess's elevation, sin i = sin el / sin θ∞,
then `pro = v_pe·cos i − v_c` and `nor = v_pe·sin i`, and the window carries
`eject`, `ejectPro` and `ejectNor` so the card can show both parts. `price`
runs the ballistic transfer and the mid-course plane change through the same
function and takes the cheaper. On `main` today `ejection` takes the signed
C3 (#224) rather than the excess; the tilt is unchanged.

## What made it real

Priced as one prograde burn, the ballistic transfer won everywhere. Priced
from the equatorial parking orbit at this commit, Kerbin → Dres ballistic is
a 2,452 m/s ejection of which 1,713 is normal, against 1,447 in the plane
plus a 523 m/s mid-course tilt — so the mid-course plane change wins for
Dres, and for Duna, Jool and Eeloo too. Moho's 1,282 m/s of normal is still
cheaper than its 1,100 m/s mid-course burn, so Moho and Eve stay ballistic.
Kerbin → Duna stays where every tool puts it — 1,042 m/s in the plane with a
7 m/s mid-course tilt, 1,060 flown ballistically — which is why the one
number everyone quotes looked right while the inclined targets were wrong.

## Key takeaway

An ejection formula with one burn assumes a parking orbit already in the
escape's plane; price the tilt, or you have priced a launch you did not fly.
