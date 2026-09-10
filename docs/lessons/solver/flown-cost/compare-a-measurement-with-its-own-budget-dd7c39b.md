# Compare a Measurement With Its Own Budget

**Why it matters:** any check of the form "measured ≤ provided", where the
thing provided was sized for more than the thing measured.

## The concept

A budget that covers several items and a measurement of one of them are not
comparable: the aggregate is always larger, so the check passes on things that
are badly short. The fix is bookkeeping, not physics — carve out the share of
the budget that was meant for the item measured, compare against that, and when
it falls short grow the _aggregate_ by the shortfall so the other items keep
what was theirs. The trap is that the check looks right when the budget happens
to contain only the one item, which is how it gets written, and only lies once
the budget grows.

## In this codebase

`planMission` in `src/core/plan.ts` re-solves a launch group when the simulated
ascent costs more than the vehicle was built to carry. `built` was the sum of
every stage's Δv in the group; when the group is only the climb that is the
right number. A cut can put a plane change, a capture and a descent in the
launch group (#167) — then `built` includes them and a rocket well short of
orbit passes as carrying its flight. `ascentShareOf` now sums the `ascent` legs
alone, margin included; `carriedFor` adds whatever the chain's tanks rounded the
group up to; and when the flight is over, the re-solve grows `groupDv` and
`share` together by the shortfall, so the legs beyond orbit are untouched. The
flight card's _Vehicle carries_ shows the share, not the group.

## What made it real

Minmus, land and return, 6.5 t, cheapest, one cut after the descent: the launch
group needed 5,143 m/s and was built to 5,304. The simulator flew the ascent at
4,296 m/s against the route's 3,400 (3,740 with margin) — 600 m/s short of
orbit — and 4,296 ≤ 5,304 let it stand. Compared honestly, every launch whose
flown ascent exceeded its share re-sized: Duna at 3.5 t (lightest) went
131 → 149 t, its old design flying 238 m/s over what it carried. The Mun 20 t
asparagus case went the other way, 598.5 → 467.8 t, once the same change's
candidate walk could see the honest figure.

## Key takeaway

"Measured ≤ provided" is only a check when both sides are for the same thing;
carve the share out of the aggregate before comparing, and grow the aggregate,
not the share, when it is short.
