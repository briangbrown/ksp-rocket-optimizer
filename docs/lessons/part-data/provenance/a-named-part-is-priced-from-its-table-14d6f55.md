# A Named Part Is Priced From Its Table

**Why it matters:** any constant whose comment names a row in a data table the
program already loads.

## The concept

A literal with a comment naming its source — `0.05 // TT-38K` — is a copy of a
table cell, and copies drift: the value was typed from memory, the table was
corrected later, or the wrong row was read. The comment makes it worse, because
a reader checks the name against the table, finds the row, and trusts the
number. If the table is loaded anyway, the literal should be a lookup that fails
loudly when the row goes missing, so the number charged is the number listed
and there is exactly one place it can be wrong.

## In this codebase

Three literals named the TT-38K radial decoupler and none carried its figures:
`RADIAL_DECOUPLER = 0.05` in `src/core/parts.ts` (the TT-70's mass), the
booster decoupler in `stageCost` (`src/core/performance.ts`) priced at
`DECOUPLER_FUNDS` (75, the estimate for a stage with no decoupler recorded),
and `RADIAL_JOIN_FALLBACK` at the same 0.05. `src/data/structure.json` had the
TT-38K at 0.025 t and 600 funds the whole time, and the user-facing parts table
listed "TT-38K Radial Decoupler" at twice its mass. `parts.ts` now finds
`TT38K` in `structureData.decoupler` by name, throws if it is gone, and
`RADIAL_DECOUPLER`, `RADIAL_DECOUPLER_FUNDS` and the fallback join read from it.
#161 was found by a copy review (#159): the sentence describing the part could
not be written truthfully.

## What made it real

Every ring paid double for its decouplers and an eighth of their price.
Correcting it moved 39 of the 81 snapshot designs — 27 the same parts at
0.05 t lighter and 1 050 funds dearer for a two-booster stage, 12 a different
rocket — and 13 of the 16 sweep missions, every cost row 525 funds a booster
dearer and every mass row 25 kg a booster lighter. On the cost objective the
walk now buys fewer boosters (Duna's 6 Hammers became 3). The move is the price,
which is why it was blessed rather than investigated.

## Key takeaway

A literal that names a table row is a stale copy waiting to happen — read the
row, and fail if it is not there.
