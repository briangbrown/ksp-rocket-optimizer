# A Shorthand and Its Longhand Never Share a Style Object

**Why it matters:** any React component whose base style uses a shorthand —
`padding`, `margin`, `border`, `inset` — and whose variants override one side
of it.

## The concept

React does not write `style.cssText`. It diffs the new style object against the
previous one property by property, sets what changed, and clears what left by
assigning it the empty string. The browser, meanwhile, stores no shorthands: a
`padding: 16px` is expanded into four longhands the moment it is set, and a
later `paddingTop: X` overwrites one of them. Now take `paddingTop` out of the
object. React clears `padding-top` — and `padding`, unchanged in the diff, is
not written again, so there is no shorthand left to restore the side that was
just cleared. The top ends at zero. Nothing in React or the CSSOM is wrong;
each did exactly its half. The rule that follows is that a base which a variant
overrides one side of must itself be written in longhands, so every side is a
property React tracks on its own.

## In this codebase

`Section` in `src/ui/components/primitives.tsx` set `padding: SPACE.xl`. The
set brief in `src/ui/components/brief.tsx`, stuck to the top of the phone,
spreads `paddingTop: calc(16px + env(safe-area-inset-top))` over that for the
notch. Opening the brief removes the stuck style, the longhand leaves the
object, and the brief opened with its heading flush against the card's top
edge. `Section` now sets `paddingTop`, `paddingRight`, `paddingBottom` and
`paddingLeft`, and `test/brief.test.tsx` holds the open brief's `paddingTop`
at `16px` — a test that fails on the commit before.

## What made it real

Sixteen pixels against zero, measured in jsdom, whose CSSOM does the same
expansion a browser's does. The layout suite's page heights did not move
(4095 px on the phone, 2582 on the desktop) because the loss was inside one
card, which is also why no budget caught it.

## Key takeaway

Where a variant overrides one side of a shorthand, write the base in
longhands — React clears a property it stops seeing and never re-applies one
it still sees.
