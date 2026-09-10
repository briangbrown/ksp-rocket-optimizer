# A Sentence You Cannot Write Is a Bug

**Why it matters:** whenever labels, help text or documentation are being
brought back in line with the code — the review is a test of the code as much
as of the prose.

## The concept

To describe a behaviour truthfully you have to state exactly what the code
does and under what conditions. Most of the time the code is right and the
words are stale. But sometimes no true sentence can be written — the label
would have to read "solid boosters allowed, which also switches off liquid
columns", or the parts table would have to list a part at another part's mass.
The prose has then found a defect the tests did not. Treat a copy review as a
walk over the code's claims, and file what cannot be said as bugs rather than
softening the words until they fit.

## In this codebase

#159 read every user-visible string, the README, the rules files and the flow
diagram against the code at `6e3fa6a`. Most of what it found was drift: an
integrator described as RK4 that is semi-implicit Euler, "every transfer a
Hohmann", fifteen sweep missions that were sixteen. Two items could not be made
true. The toggle _Solid boosters allowed_ sat over `wantMounts` in
`src/core/solver.ts`, which gated every radial mount on a solid being in the
roster, so a career with liquid engines and no SRBs never saw a column at all
(#160). The parts table listed a "TT-38K Radial Decoupler" from
`RADIAL_DECOUPLER = 0.05`, which is the TT-70's mass (#161). Both left the copy
change as filed issues and were fixed in the solver.

## What made it real

The copy fix itself left the 81-design snapshot and the 16-mission sweep
unchanged, so nothing in the suite knew anything was wrong: a baseline compares
the solver's output with its own past output, and both were priced the same
way. The two bugs it filed moved 39 of 81 designs and 13 of 16 missions when
fixed — a decoupler charged at twice its mass and an eighth of its price on
every ring, for as long as the solver had rings.

## Key takeaway

When the truthful sentence about a behaviour cannot be written, stop editing
the sentence — the code is what is wrong.
