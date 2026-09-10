# A Sideways Scroll Clips Vertically Too

**Why it matters:** putting anything taller than its line inside a container
that scrolls horizontally.

## The concept

`overflow-x` and `overflow-y` are not independent. If either is anything other
than `visible`, the other computes from `visible` to `auto` — the spec forbids
a box that clips one way and spills the other. So `overflow-x: auto` on a row
silently gives it `overflow-y: auto` as well, and a child that pokes above or
below the row is clipped, or grows a scrollbar, though nothing vertical was
asked for. It bites when a child is sized by a rule the row's height was not: a
target that must be 44 px sitting on a header line that was 22.

## In this codebase

The drawing row in `src/ui/components/build.tsx` has
`overflowX: railed ? undefined : "auto"` so that panels wider than the card can
be scrolled to. `HEAD`, the header line above each column, was 22 px; the
_Isometric_ `IconButton` that #132 put on that line is 44 px on the phone, the
target size. Selected, its inverted ground lost its top and bottom and looked
broken. `HEAD` is 44 now, and the comment beside it says a shorter line cannot
carry the button.

## What made it real

Eleven pixels clipped from each edge of the button, seen on the phone rather
than by the suite — the target-size check measures the element's box, not how
much of it is visible. The fix grew the page by exactly the 22 px the line
grew: 9,073 → 9,095 on the phone, 4,892 → 4,914 on desktop, inside the 2% the
height budgets carry.

## Key takeaway

Ask for `overflow-x: auto` and you get `overflow-y: auto` with it; a
horizontally scrolling row must be as tall as its tallest child or it will cut
it.
