# An Optimiser Finds the Phantom Part

**Why it matters:** whenever a search is only as good as its catalogue —
parts, SKUs, instance types, library versions — and what the catalogue offers
depends on the environment it is read in.

## The concept

A catalogue entry that should not be available is not a harmless extra row.
An optimiser is looking for the best thing in the pool, and a phantom that is
any good will be found and built on, because being better than the real
options is exactly what makes it worth having. So a wrongly available entry
does not lie latent; it surfaces as the delivered answer. Availability is
also rarely a property of the entry alone — what one component supplies,
another may withdraw — so it is a predicate over the whole environment, and
belongs in one function every gate reads rather than in flags tested
separately at each.

## In this codebase

ReStock+ ships six engines and fifteen tanks as stand-ins for Making History
parts (`MHReplacement = True`) and hides them itself when the expansion is
installed. The app tested an `rs` flag and an `mh` flag separately, so with
both ticked it offered all twenty-one, and a shared Kerbol fly-by was built
on a UR-2 Caravel that is not in that game. The rows carry `mhr: 1` now, and
`offered(part, expansions)` in `src/core/constants.ts` is the one rule: an
expansion's part needs its expansion, either flag will do for a part both
ship, and a stand-in is offered only while Making History is absent. The tank
and engine filters in `app.tsx`, `couplersFor` and the setup tree read it,
and the mission sweep fails on a delivered part the install does not offer.

## What made it real

The phantom won because it was better. The reported link built 120 t for
31,866 funds on the Caravel; with it gone, 116.5 t for 33,976 funds on a
Bobcat under four Terriers and Sparks. The cheapest objective had found the
cheaper engine, and it was the one that did not exist. The same rule fixed
the opposite fault: the engine plates ship with both mods, and as `rs`-only
rows an install with Making History alone was denied plates it has. Design
snapshot and mission sweep unchanged; `test/parts-data.test.ts` pins the
twenty-one.

## Key takeaway

Compute "is this available" once, over the whole environment, because
whatever slips through will not stay hidden — the optimiser will pick it.
