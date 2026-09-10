# Walk a Conic by Anomaly, Not by Time

**Why it matters:** any time a Keplerian trajectory has to be sampled to find
something along it — a sphere-of-influence crossing, a closest approach, a
shadow entry — and the check has to run often enough that milliseconds matter.

## The concept

Kepler's equation is cheap in one direction only. From an anomaly, the time is
closed form: `E − e·sin E` on an ellipse, `e·sinh H − H` on a hyperbola. From a
time, the anomaly needs Newton's method. Sampling a conic by time therefore
costs a Newton solve per sample; sampling it by anomaly costs none, and the
samples are the same points on the same curve. The second half is that the
thing being looked for has a size, and the step should be sized to it locally,
not to the trajectory. A coarse pass over the ship alone — no ephemeris calls at
all — finds the stretches whose radius can reach the target's orbit widened by
its sphere. A fine pass re-walks only those, at a step that puts a few samples
across the sphere's diameter given how far the ship moves there. A single
uniform step cannot do the job: the smallest sphere crossed at the highest speed
sets a step the whole arc cannot afford.

## In this codebase

`arcLeg` and `hyperLeg` in `src/core/encounter.ts` (#216) each expose a
`nodeAt(nu)` that returns position and time for a true anomaly; the arc solves
Newton once, for its end anomaly, and never per node. `scanLeg` does the two
passes: `COARSE = 240` nodes of the ship alone, then for each candidate body only
the stretches within `a(1 − e) − soi` to `a(1 + e) + soi`, re-walked with
`ACROSS = 3` samples per sphere diameter, capped at `FINE_CAP = 600`.
`test/encounter.test.ts` holds the optimisation honest: every Kerbin escape
over a Mun period agrees exactly with a naive ten-thousand-step walk of the same
hyperbola, and the Dres → Eeloo cruise through Jool's sphere agrees on depth
with an independent Runge-Kutta propagation.

## What made it real

The obvious check, uniform steps with ephemeris lookups everywhere, cost 2.4 ms
per window. This one costs 98 µs for Kerbin → Duna and 501 µs for Kerbin → Jool,
so a window is still 14 ms as it was before the check existed. The case that
rules out a uniform step: Dres's sphere is crossed in under two hours on a
thousand-day arc.

## Key takeaway

Sample along the coordinate that is closed-form, and size the step to the thing
you are looking for rather than to the path you are walking.
