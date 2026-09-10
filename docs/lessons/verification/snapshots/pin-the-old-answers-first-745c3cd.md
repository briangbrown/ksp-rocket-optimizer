# Pin the Old Answers Before You Generalise

**Why it matters:** whenever a hand-written table or a set of special cases is
about to be replaced by one general mechanism that is supposed to give the same
answers.

## The concept

A generalisation is a claim: everything the old code could be asked, the new
code answers identically. The claim is only checkable if the old answers exist
somewhere the new code can be held to, so the first commit is the table of them,
generated from the old code over every input it accepts, before a line of it
changes. The diff after the rewrite is then the whole review. An empty diff
proves the rewrite was a rewrite; a non-empty one names exactly which inputs
moved and forces an explanation of each. Hash one line per input so the table
stays readable at thousands of rows, and keep a handful of whole answers in the
clear so a diff can be read rather than only detected.

## In this codebase

`buildRoute` in `src/core/orbits.ts` built a mission's legs from a hand-written
`DEST` table, two pseudo-destinations special-cased at the top, and a "profile".
#188 replaced all three with `routeFor` over a pair of endpoints. Before that,
the branch's first commit was `test/routes.test.ts` with
`test/__snapshots__/routes.txt`: every origin, destination, profile, return,
chute and plane-change setting the app could ask for, one SHA-1 per line, and
seven routes written out leg by leg in `routes-sample.txt`. `buildRoute`
survives as an adapter over `routeFor`, through `endpointsOf`, which is what
lets the old questions still be asked of the new code.

## What made it real

5,904 routes; 5,844 came out byte-identical. The 60 that moved were one shape,
_land & back_ to Jool, and they were not a regression. Jool has no surface, the
app forced that profile to orbit, and the old builder took neither its landing
branch nor its orbit branch on the way home, so it left Jool orbit without
paying to escape it — about 3,000 m/s at Jool's speeds. Unreachable from the
app, wrong, and visible only because every old answer was on file to be diffed.
The design snapshot and mission sweep did not move at all, since the solver
never sees where a Δv came from.

## Key takeaway

Generate the old answers before you touch the old code; the diff is the proof,
and the rows that move are either your regression or its bug.
