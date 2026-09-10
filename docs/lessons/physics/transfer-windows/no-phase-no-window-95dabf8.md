# No Phase, No Window

**Why it matters:** whenever a transfer solver is asked for a window between a
body and the one it orbits — and, more generally, whenever a dimension you are
about to search is a symmetry of the problem.

## The concept

A transfer window exists because the geometry of two bodies changes with time,
so the same burn is cheaper at some phases than others. Leaving a moon for the
planet it circles, there is no second body to phase against: the target is the
centre of the frame, and on a circular orbit every instant is the same picture
turned round. The departure-time dimension has collapsed into a symmetry. What
remains is the one thing that is not symmetric — where in the parking orbit to
burn, which is the ejection angle. And because two-body motion is
time-reversible, the way down is the way up run backwards, burn for burn: the
solver you already trust for the outward trip is a free oracle for the new one.

## In this codebase

`dropSearch` in `src/core/transfer.ts` (#223) searches nothing. Burn retrograde
at the moon's orbital radius until the orbit about the primary has its
periapsis at the parking orbit; vis-viva gives the speed the ship needs at that
apoapsis, the difference from the moon's own speed is the relative velocity,
and `c3Of` and `injectC3` turn that into a burn from the moon's parking orbit.
No Lambert, no grid. `search` dispatches to it when `parentOf(from) === to`,
and the `Window` it returns carries `depart: t0`, `phase: 0` and a one-cell
`plot`, so the card (`isDrop` in `src/ui/components/transfer.tsx`) shows the
ejection angle and drops the date, the phase angle and the plot.

## What made it real

The descent came out as the outward trip's exact mirror. Mun: 856 to leave
Kerbin and 280 to capture going out; 280 to leave the Mun and 856 to
circularise coming home. Minmus 921 / 161 out, 160 / 921 home. Laythe 1,864 /
880 out, 880 / 1,864 home. Ike is the exception that proves the premise: 298 /
139 out against 137 / 300 home, two metres a second apart each way, because
Ike's orbit has e = 0.03 and is not quite the circle the symmetry assumes.
`test/transfer.test.ts` holds the mirror to the metre.

## Key takeaway

Before searching a dimension, ask whether the problem is symmetric in it — a
symmetry is a dimension you do not have to search, and the time-reversed trip is
an oracle you get for free.
