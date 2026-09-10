# Check the Condition, Not the Proxy

**Why it matters:** any guard whose comment explains the threshold with a
phrase the code never evaluates.

## The concept

A numeric floor is usually a stand-in for a condition that was too awkward to
compute when the floor was written: "under 1.0 is fine _if the vehicle is
already fast and climbing_" becomes `>= 0.85`. The proxy holds while the cases
resemble the ones it was fitted on and fails silently when an optimiser finds
the cheapest thing that satisfies the number but not the sentence — which an
optimiser will, because that is what it is for. The repair is to compute the
condition. Often it is cheaper than it looked: the quantities the search already
has in hand are enough for a closed-form estimate, and the estimate only has to
be good enough to separate "fast" from "stalled".

## In this codebase

`boostedAscent` in `src/core/solver.ts` admitted a core whose post-separation
thrust-to-weight was at least 0.85, with a comment saying a real sustainer "can
sit a little under 1 by separation, already fast and climbing" (#168). Under the
cost objective it bought six Hammers for a Mainsail — the cheapest ring that
passes the 1.25 liftoff floor — burning out in 24 s at 1.9 km and 102 m/s, and
left the Mainsail at 0.88 on 155 t, vertical and slowing. `sustainerHolds` now
estimates the separation speed as the boost's net acceleration on its average
mass over its burn, `(thrustA / ((m0 + mA) / 2) − g) · tB`, and admits a core
under one only with `SUSTAINER_FAST` (250 m/s) of it, never below
`SUSTAINER_MIN`. `twrSep` rides on `Boosters` so the stage card reads
TWR 1.40 → 0.88 → 1.38 instead of hiding the dip.

## What made it real

The stack decelerated from 102 m/s at 0:30 to 89 m/s at 1:00 and did not pass
135 m/s until T+1:40 at 12 km; gravity loss was 2,569 m/s of a 4,296 m/s ascent,
where a rocket lifting off at 1.4 normally loses 1,200–1,500. Every design the
guard now refuses was passing before, so its replacements are dearer or heavier
— Minmus at 6.5 t cheapest 48,761 → 52,765 funds, low orbit at 0.8 t lightest
5.3 → 7.0 t — and five cells of the 81-design snapshot moved, all where a
stalling core had been the winner. Throttling the boosters was measured too and
ruled out: a 50% limiter saved 27 m/s of 4,300 and dropped liftoff to 1.07.

## Key takeaway

When a comment justifies a threshold with a condition, the optimiser will find
the case that meets the threshold and fails the condition — compute the
condition.
