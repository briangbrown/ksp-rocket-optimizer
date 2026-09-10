# Greedy Decomposition Needs a Compounding Objective

**Why it matters:** any pipeline that optimises stages in sequence, each
against what the previous handed it, and offers more than one objective.

## The concept

Solving a chain top-down — each segment minimised on its own, given the load
above — is only globally right when the objective propagates through the load.
Mass does: a heavier upper segment is heavier for every stage beneath, so
minimising mass locally is charged for its consequences downstream. Cost does
not: a segment's funds are its own, and the tonnes it hands down are free to it
and dear to everyone below. The greedy walk then buys a cheap, heavy top and
pays for it several times over at the bottom. The cheapest repair is a floor:
solve the compounding objective too and deliver whichever design measures better
on the one asked for. It is valid because the mass design is always a legitimate
design, and it guarantees "cheapest" is never dearer than "lightest" — at the
price of solving twice.

## In this codebase

`planMission` in `src/core/plan.ts` solves groups from the top of the stack
down, and `solve` minimises the chosen `objective` within each group.
`chainScore`'s comment in `solver.ts` — compare whole chains on the chosen
measure — fixes this within a group; between groups the segment above is already
decided when the one below is solved (#169). `planMission` now calls `planFor`
with the asked-for objective and, for `cost` and `parts`, again with `mass`, and
returns the plan whose summed `sol.cost` or `sol.parts` is lower. Issue #169
lists the next two rungs — a shadow price per tonne handed down, or a small beam
across groups — neither built.

## What made it real

Minmus, land and return, 6.5 t: the mass objective's design cost 42,235 funds;
the cost objective's cost 48,761, 15% more. Its Minmus legs chose a Hammer and a
Thumper — a few hundred funds under a Reliant on an FL-T800 — and handed 17.8 t
down instead of about 11, so the launch group needed a Mainsail on two Jumbo-64s
and six Hammers. With the floor, Mun at 3.5 t cheapest went 33,598 → 26,749
funds, 20% cheaper and heavier, and `test/flown-cost.test.ts` holds cheapest ≤
lightest and fewest parts ≤ lightest on the Minmus brief. `perf:mission` rose
3,252 → 4,610 ms for five missions, part of it this second plan.

## Key takeaway

A greedy stage-by-stage optimiser is only right for an objective the stages pass
to each other; for any other, solve the compounding one too and take the better.
