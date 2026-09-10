# The Handover Speed Is Not the Excess

**Why it matters:** whenever a heliocentric solution — a Lambert arc, a
Hohmann ellipse, a porkchop cell — is priced into a burn at a planet by
patched conics.

## The concept

A patched-conic transfer hands the ship from the Sun's frame to the planet's
at the edge of the planet's sphere of influence. The arc's velocity relative
to the planet is therefore the ship's speed _at that edge_, r_soi from the
planet, not at infinity. Between the edge and infinity there is still
2μ/r_soi of potential to climb, so the true excess is
v∞² = v_rel² − 2μ/r_soi. A sphere of influence is finite and the game patches
at it, so this is not a rounding error: it is the potential the model would
otherwise count twice, once in the arc and once in the ejection.

## In this codebase

`atInfinity` in `src/core/transfer.ts` at this commit —
`sqrt(max(0, v_rel² − 2μ/r_soi))` — takes the relative velocity `price` gets
from `lambert` and `stateAt` and returns the excess that `ejection` and
`inject` spend. It has since been renamed `c3Of` and made signed (#224), for
the reason the neighbouring lesson gives. The Hohmann pricing the route used
before had no such step to get wrong: it worked from the difference of two
circular speeds and never saw the sphere at all.

## What made it real

Without the term every ejection and capture ran one to two percent over
alexmoon's launch-window planner at the same departure and time of flight:
12 m/s on Kerbin's ejection, 20 m/s on Eve's capture. With it, nine of his
selected transfers — Duna, Eve, Dres, Moho, Jool, Eeloo, and Duna and Eve
home, ballistic and mid-course — agree to the metre per second, ejection
inclination included. The solvability snapshot moved with the pricing, Gilly
63.8 t → 55.9 and Pol 138.1 → 175.1, which is what a two percent error in Δv
becomes once a rocket is sized on it.

## Key takeaway

A velocity relative to a body at its sphere of influence still has that
sphere's potential to climb; subtract 2μ/r_soi before calling it the excess.
