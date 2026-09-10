# A Fixture Must Prove It Reaches the Branch

**Why it matters:** whenever a regression case is added to exercise an optional
feature of a search or an optimiser — a flag in the input the code _may_ use,
not one it must.

## The concept

Turning a feature on in the input invites the solver to use it; it does not make
it. An optimiser with the feature available may choose against it, and the case
then pins a design that never touched the code under suspicion. Such a row is
not useless — that the solver declines the option is worth pinning — but it is
not the row you thought you added. So a fixture for a branch carries a second
assertion: that the branch was reached. And because different objectives make
different faults visible, one row is rarely enough. Then, when the first
snapshot is blessed, read it: a first blessing records what the code does today,
which is not the same thing as what is right.

## In this codebase

Every check ran with crossfeed off — the 81 designs in the grid and all thirteen
missions in the sweep set it false — and the branch had accumulated three
defects before anything looked at it: a `NaN` price (#93), a phantom part (#97)
and a drop tank drawn an engine too long (#124). `sweepCases` in `test/grid.ts`
adds the same Mun mission with crossfeed on once per objective, because the
`NaN` could only show under cost, where every comparison against it is false and
the stage simply never wins, and the phantom only under parts, the one objective
that counts them. `test/mission-sweep.test.ts` then asserts that at least one
crossfed row delivered a drop tank. `test/art-regime.test.ts` has the same shape
for a different switch — "designs a different rocket when only the art changes"
exists so that the wiring cannot come loose silently.

## What made it real

Of the three rows, one builds a drop tank. The cost row takes six Kickbacks and
the parts row a Mammoth and a Vector, both with crossfeed available. Had the mass
row been left out, three rows would have pinned nothing about the pool they were
written for, and passed.

## Key takeaway

A case that turns a feature on has to prove the feature ran — assert that the
branch was reached, or the row is a decoration that passes.
