# A Nudge to the Input Is Not a Constraint

**Why it matters:** whenever an interface offers to fix a search's answer by
moving one of the search's inputs — "start two hours later", "widen the range" —
instead of telling the search what to avoid.

## The concept

A search does not respond to a small change in its input with a small change in
its output. It re-decides from scratch over a domain the input defines, and any
rule inside it — report the first minimum, prefer the earliest, cap the span —
may now select something else entirely. So a control that nudges the input is
not a constraint on the output: it is a fresh question, and the answer can land
anywhere. The only way to make a search avoid something is to hand it the
constraint, inside the loop where the alternative candidates are being priced.
And because the intuition "shift it a little and it will move a little" is so
strong, the proposed control has to be measured across many cases before it
ships, not reasoned about on one.

## In this codebase

#216 first settled on a `warn` `Callout` plus a chip that moved the brief's
start date past the encounter. Measured over the fouled windows, the chip did
not work: #199's first-window rule reports the cheapest window within one
synodic period of the start, so moving the start by two hours moved the whole
span and could pull a different, cheaper window into range — months away, and
still fouled. The dodge went inside `search` in `src/core/transfer.ts` instead,
where the flight time can be held fixed while the departure alone walks forward
by `DODGE_STEP` to the first clean cell, and `dodged` on the `Window` reports
what was done. The brief's start date is untouched.

## What made it real

Of 69 fouled windows, tapping the chip would have landed clean 57 times and 12
times jumped to a different window that was still fouled — an 83% control, and
one whose failures the reader could not have predicted. The dodge inside the
search cleared 72 of 72, shifting the departure by 2.7 hours and costing
0.38 m/s on average.

## Key takeaway

To make a search avoid something, hand it the constraint; nudging its input
re-runs the search, and the new answer can land anywhere.
