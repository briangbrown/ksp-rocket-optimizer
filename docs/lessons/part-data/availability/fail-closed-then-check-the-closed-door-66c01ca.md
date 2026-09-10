# Fail Closed, Then Check the Closed Door

**Why it matters:** any gate of the form "is this thing unlocked" where the
thing's key can be missing from the data.

## The concept

`!x.key || unlocked.has(x.key)` reads a missing key as permission: a row with
no key passes every gate, everywhere, for everyone.
`!!x.key && unlocked.has(x.key)` reads it as absence: the row is offered
nowhere. Failing closed is the right default because its failure is a thing
missing rather than a thing wrong — but it is silent in exactly the way
failing open is loud. A misspelt key fails closed too, and nobody notices a
part that never appears. So a fail-closed gate needs a second piece: a check
that every key in the data is one the gate could ever accept.

## In this codebase

Seventeen Making History tanks in `src/data/parts.json` carried `t: null` —
rows filled in from outside the install the configs came from, price blank
too — and every gate read `!x.t || unlocked.has(x.t)`: the tank filter in
`src/ui/app.tsx`, `couplersFor`, `pickStruct` and `radialJoin` in
`src/core/parts.ts`, `tanksFor` in `test/grid.ts`. A shared design was built
on an S4-64 and an S4-128 at a roster that had not researched them (#191).
The engine gate had always been `unlocked.has(e.t)`, and no engine ever
slipped. Every gate reads `!!x.t && unlocked.has(x.t)` now, and
`test/parts-data.test.ts` holds every engine, tank, coupler and structure
part to a node `tech.json` has, and every tank to a price.

## What made it real

The check found a second fault on its first run: the TVR-2160C Mk2 Stack
Quad-Coupler named its node "Advanced Metalworks" where the tree spells it
"Advanced MetalWorks", so it had never been available to anyone — a
fail-closed error no design had ever shown. Seventeen rows open everywhere,
one row open nowhere, and none of the three baselines moved on either: all
three pin Making History off, and the quad-coupler's return chose nothing
new. The seventeen nodes and prices were then read from the `.cfg` files,
five nodes and 30 to 51,200 funds.

## Key takeaway

A gate should fail closed on missing data, and a closed gate needs a data
check behind it, because a part that is never offered is a bug nobody
reports.
