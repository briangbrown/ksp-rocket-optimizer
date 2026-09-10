# The Cursor Confesses the Clickable

**Why it matters:** when auditing a page for target size or keyboard reach and
the markup was not written with a semantic control for every clickable thing.

## The concept

A `div` with an `onClick` declares nothing that a query for `button` will find,
but its author almost always gave it `cursor: pointer` so the mouse would say it
was pressable. The computed cursor is therefore a confession. Enumerate every
element whose cursor is `pointer` and whose parent's is not — so a chip inside a
clickable row is not counted twice — add the real form controls, and you have
the set a finger can press whether or not the markup admits it. That set is
what to hold to a control's bar, and the elements the cursor alone found are the
ones most likely to fail the keyboard, because the promise was made to the
pointer and to nobody else.

## In this codebase

`measure()` in `visual/measure.ts`: `isControl` takes `BUTTON`, `A`, `SELECT`,
`TEXTAREA` and any `INPUT` but a checkbox; the cursor rule takes the rest. A
label wrapping a checkbox is the checkbox's target, so the input inside it is
not counted again at 13 px. Each target is stamped `data-k` so the Tab walk in
`visual/layout.test.ts` can name what it reached (#129).

## What made it real

Sixty-six targets on the default solved page. Four were found only by the
cursor rule — the two `PickerHead` divs and two tech-tree name `span`s — and
those four were exactly the four the Tab walk never reached. When #130 made them
buttons, unreachable went 4 → 0 with the measurement unchanged.

## Key takeaway

A `cursor: pointer` is the author admitting the element is a control; enumerate
by it, then hold everything it finds to a control's bar.
