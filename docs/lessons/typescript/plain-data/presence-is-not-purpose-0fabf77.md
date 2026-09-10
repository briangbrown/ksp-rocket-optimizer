# Presence Is Not Purpose

**Why it matters:** whenever an optional field on a plain record is tested for
presence — `l.window &&`, `?.window` — to decide what _kind_ of record it is,
rather than to read the value it holds.

## The concept

An optional field carries a value, and its presence carries a second, unwritten
fact: "this is the kind of record that has one of these". Code that tests
presence is leaning on that second fact, and nothing in the type says so. It
holds only as long as there is exactly one reason to fill the field. The moment
the field gains a second reason — populated for a drawing where before it was
populated only for a pricing — every presence test in the codebase silently
starts matching records it was never meant to, and does it without a type error
or a failing test, because the field's shape has not changed at all. The fix is
to test the fact you actually mean, or to give that fact its own field.

## In this codebase

`Leg` in `src/core/orbits.ts` has `window?: Window`, and until #223 only the
interplanetary leg ever carried one. `routeFor` found the outward transfer for
pricing the way home with `base.find((l) => l.window)` — a presence test
standing in for "the interplanetary leg". #223 hung a window on the Kerbin → Mun
intercept leg for its date and its drawing, keeping the leg's tabulated figure,
and that lookup matched it: the return flipped from the tabulated mirror to a
computed transfer. The lookup now names the fact it wants,
`l.window && SYS[l.window.to]?.parent !== origin`, and `test/transfer.test.ts`
pins all seven of the default mission's legs by label and value.

## What made it real

A change meant to draw a picture moved the default mission's Δv by 549 m/s. No
snapshot caught it: the design snapshot and mission sweep build their routes
without a start time, so no window ever enters them and a leg's `window` is
absent in every case they see. It was found by reading the route by hand, and
the pinned-legs test exists so that the next reason to fill the field cannot
repeat it.

## Key takeaway

A presence test on an optional field is a type check in disguise — name the
fact you are testing, or the next reason to fill the field will silently change
the answer.
