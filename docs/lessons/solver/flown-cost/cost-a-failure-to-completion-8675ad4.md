# Cost a Failure to Completion

**Why it matters:** any simulator whose output is minimised by a search, when
the simulated run can end early.

## The concept

A search over a simulator minimises whatever the simulator reports. If a run
that stops short — out of fuel, out of time, out of bounds — reports what it
spent up to the stop, then stopping short is always cheaper than finishing, and
the optimiser will steer toward failing early. It is not being perverse; that is
the cheapest number on offer. A truncated run has to be costed at what
completion would have taken: the part integrated, plus the remainder estimated
by the cheapest possible means, never less than the ideal figure. Then a failure
reports at least as dear as any success and the search cannot prefer it.
Separately, "the current stage ran dry" and "the vehicle cannot finish" are
different facts; only the second is a failure.

## In this codebase

`flyAscent` in `src/core/ascent.ts` integrates the circularisation on the stage
live at apoapsis. When that stage ran dry it set `circShort`, broke, and
reported `circDv = spent > 0 ? spent : vC − vApo` — what the tanks held (#170).
The burn now stages up when a stage runs dry, since the vehicle has the stage
above and the closed form counted its Δv toward this orbit (`circStaged`), and
is costed to completion: `circDv = max(spent + left, vC − vApo)`, where `left`
is the impulsive remainder when the last stage runs dry, so
`total ≥ dvUsed + vCirc − vApo` always. The flight card splits the callout:
staging mid-burn is information, running dry before circular is a warning.

## What made it real

A 2× Torch / Spark rocket built to 3,762 m/s arrived at an 80 km apoapsis
needing 1,839 m/s to circularise, spent 232 of it, ran the Torch dry and
reported a 2,313 m/s ascent — under the physical minimum for that orbit — as
`ok`. Honestly, 2,080 + 1,839 ≈ 3,920 against 3,762 built: about 160 m/s short,
and the re-solve found 2,313 ≤ 3,762 and delivered it. The turn search had
_preferred_ that flight. Costed to completion, the same rocket's search finds a
steeper flight that circularises on one stage at 3,561 m/s, inside its budget;
`test/ascent.test.ts` holds the invariant on the simulator directly, and one
mission-sweep design moved — 5× Twitch at 5.32 t, passing on a truncated burn,
re-solved to 7× Twitch at 8.52 t.

## Key takeaway

A simulator that reports what a failed run spent, rather than what success
would have cost, hands the optimiser a reason to fail — cost every truncated run
to completion.
