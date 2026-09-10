# Asparagus Is a Mass History

**Why it matters:** when modelling any staging scheme where propellant flows
between stacks — crossfeed, drop tanks, asparagus — and deciding what about it
has to be simulated and what can be checked on numbers.

## The concept

A plain ring of boosters burns its own tanks and drops all at once. Asparagus
plumbs the ring so the outermost pair feeds everything still attached: every
engine drinks from that pair, so it empties after one pair's worth of the
_whole_ vehicle's consumption, and is shed the moment it does. The next pair,
still full, takes over. Nothing in the parts list distinguishes the two
arrangements — same tanks, same engines, same count. What differs is the
sequence of masses the vehicle passes through: dry tankage leaves early instead
of riding to burnout, and that is the whole of the Δv gain. So the rule that
makes asparagus asparagus is a schedule, and a schedule is arithmetic: how many
stacks remain after so much has been spent. Arithmetic can be lifted out of the
simulation it steers and pinned on its own.

## In this codebase

`boostersAfter(n, pairProp, spent)` in `src/core/ascent.ts` is that schedule,
`n − min(⌊spent / pairProp⌋ · 2, n − 2)` with `pairProp = 2 · fuelM`, and
`flyAscent` takes `pairDry` off the mass each time the count drops. It never
goes below two: the model keeps the last pair to burnout, since nothing outboard
is left to feed it. Before #125 the two lines sat inline in the ascent walk and
no check exercised them — every fixture ran with crossfeed off.
`test/asparagus.test.ts` pins the rule on numbers: pairs only, never below the
last pair, never more than the ring has, monotone as propellant goes.

## What made it real

The extraction changed no output: `designs.txt` was byte-identical and the
thirteen missions in the sweep unchanged. What it changed is what a test can
reach — five checks of the rule itself, in place of a solved mission that
happens to pass through it.

## Key takeaway

When a feature's whole effect is on the mass history, find the arithmetic that
writes that history and test it directly; the simulation around it is only how
the answer is delivered.
