# Judge a Candidate by What It Will Become

**Why it matters:** any two-stage selection where a cheap model ranks
candidates and an expensive check then accepts or rejects — and rejection
triggers a repair that changes the candidate's cost.

## The concept

If the expensive check can send a candidate back to be grown, "first in the
cheap ranking that passes" is the wrong rule twice over. Taking the first that
passes _at all_ can hand back a light design that then has to be grown a great
deal, when the one behind it needed nothing. Taking the first that passes
_without growth_ prefers a heavy design over a light one that needed a little.
The right comparison is each candidate's cost _after_ the repair it would
receive — an estimate is enough — and because the cheap ranking is sorted and an
estimate is never below the cheap score, the walk can stop at the first
candidate whose score cannot beat the best estimate so far. The other half is
depth: keep more than one candidate per bucket, because the cheap model's
favourite is often exactly the one the expensive check refuses.

## In this codebase

`planFor` in `src/core/plan.ts` sorts the chains by `chainScore`, flies each
with `simCached`, and used to take the first that came back `ok`. Now a flight
over what the chain carries has its score scaled by `exp(over / GROW_VE)` — the
rocket equation at 2,500 m/s, a launch stage's exhaust velocity, slightly
pessimistic so a candidate that fits is preferred unless the other is clearly
lighter — and the loop breaks at `cand.chainScore >= bestEst`. `reduceUnits` in
`solver.ts` keeps `ALTS_PER_K` (3) chains per stage count instead of one,
surfaced as `alts` beside `byK` (#168, #169).

## What made it real

On a 1 t low-orbit brief the mass objective's lightest two-stage chain could not
be flown to budget, and the 7.2 t Torch chain that could — the cost objective's
own pick — was never in its one-per-count list, so it grew a worse candidate to
8.0 t. With the runners-up and the grown-weight estimate, low orbit at 0.8 t
went 8.5 t / 3,695 funds → 7.3 t / 3,190 — a single stage of three Twitches and
two Shrimps the old walk never reached — and the Mun 20 t asparagus case
598.5 → 467.8 t. The extra flights are spent only on candidates that fail, and
none on the ones that do not.

## Key takeaway

Rank candidates by what they will cost once repaired, not by the order the cheap
model liked them — and keep enough runners-up for the repair to have somewhere
to go.
