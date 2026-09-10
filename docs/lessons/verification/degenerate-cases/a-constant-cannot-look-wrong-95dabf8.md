# A Constant Cannot Look Wrong

**Why it matters:** whenever the common case of a model makes one of its outputs
constant or meaningless — a date that is always the start, a component that is
always zero — and the code that fills that output is only ever exercised there.

## The concept

A bug shows as an output that looks wrong. When the case under test is
degenerate, the output that would reveal the bug is a constant, or is not shown
at all, and the bug has no symptom in exactly the cases anyone looks at. Two
independent bugs can hide behind the same degeneracy, and passing tests on the
degenerate case say nothing about either. The remedy is to find the input that
breaks the degeneracy — the one that makes the constant move — and test there,
even if it is the rare case in production.

## In this codebase

The Mun, Minmus, Laythe, Vall and Tylo have e = 0 exactly, so a descent from any
of them costs the same at every moment and the departure date on its card means
nothing. Two bugs sat behind that in #223. `dropSearch` in
`src/core/transfer.ts` priced the descent at whatever time it was asked from,
and shed the scalar difference of two speeds — right on a circle, where the
moon's velocity has no radial part, and wrong on Gilly at e = 0.55, where it
does; it now sweeps the moon's period and sheds the vector difference,
`Math.hypot(vApo - vTan, vRad)`. And the return windows attached in `routeFor`
(`src/core/orbits.ts`) were searched from the mission's start rather than from
arrival plus stay; `homeFrom` decides it now. `test/transfer.test.ts` tests both
on Gilly and Bop, the moons whose dates can be wrong.

## What made it real

Gilly's departure runs from 1,470 m/s near apoapsis to 1,869 near periapsis;
asked from day zero, the first cut returned 1,668 — 200 m/s over the best, with
no way to tell from the card. The return bug showed the same way: an Eve → Gilly
trip arrived on Year 1 Day 23 and left on Year 1 Day 7, ignoring the stay
outright. On the Mun both numbers were identical at every instant, which is why
neither bug had a symptom until an eccentric moon was tried.

## Key takeaway

When an output is constant in the case you test, the code behind it is
untested — find the input that makes it move, and test there.
