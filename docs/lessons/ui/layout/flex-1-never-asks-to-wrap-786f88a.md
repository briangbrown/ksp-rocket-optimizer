# `flex: 1` Never Asks to Wrap

**Why it matters:** any flex row that is meant to wrap and has an item with the
`flex: 1` shorthand on it.

## The concept

`flex: 1` expands to `flex: 1 1 0%` — grow one, shrink one, basis _zero_. A
wrapping flex line breaks on the sum of its items' hypothetical main sizes, and
those come from the basis, not the content. With a basis of zero an item adds
nothing to that sum, so a row never wraps on its account however wide its
content grows; the content spills over its neighbours instead. `flex: 1 1 auto`
takes the content as the basis, so a long item asks for its own line. The
opposite trick exists too: `contain: inline-size` makes an item's content not
count towards intrinsic sizing at all, for the case where words inside a
flexible box must not be allowed to push the row's other members about.

## In this codebase

`Section`'s header in `src/ui/components/primitives.tsx` is a wrapping flex row
holding the fold's button and, beside it, an `aside`. The button's style was
`flex: 1`, so at 390 px the build section's three tabs sat on top of its
heading — the row never broke. The button is `flex: "1 1 auto"` now, and the
tabs wrap under a heading they cannot share a line with. Inside that button the
brief's summary line is `flex: "1 1 0"` with `minWidth: 0` and
`contain: "inline-size"`, the other way round: its words are not to count, so
the Δv `aside` stays on the heading's line whatever the summary says.

## What made it real

The layout suite's _sideways_ count — elements whose `scrollWidth` exceeds
their `clientWidth` — went from 1 to 0 on the phone; the one was the build
section's header row, over by 27 px, which is exactly the overlap the basis of
zero produced. Every other budget on both screens held.

## Key takeaway

`flex: 1` is a basis of zero, and a basis of zero never asks a row to wrap —
write `1 1 auto` where the content should be allowed to break the line.
