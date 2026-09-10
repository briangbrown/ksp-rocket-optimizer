# A z-index Orders Siblings, Not the Page

**Why it matters:** whenever something meant to float — a tooltip, a popover, a
menu — draws under content it should be over, and raising its `z-index` changes
nothing.

## The concept

`z-index` does not place an element in the page's stacking order; it places it
among the children of its nearest stacking context. A stacking context is formed
by more than `position` plus `z-index`: `position: sticky` and `fixed` create
one unconditionally, as do `opacity` below 1, `transform`, `filter` and several
others. Inside such a container a tooltip's `z-index: 70` orders it against the
container's other children only. The container is then painted as one unit at
its own level, and a later sibling of the container, with no z-index at all,
paints over the whole of it. The fix is not a larger number on the tooltip but a
number on the container, which lifts the entire stacking context, tooltip
included, above its neighbour.

## In this codebase

The desktop's left column in `src/ui/app.tsx` is `position: sticky`, through
`useStickyTop`, and the results column follows it in the DOM. Both tooltip kinds
in `src/ui/styles.ts` — `.iconbtn::after` and `.chip[data-hint]::after` — carry
`z-index: Z.popover`, and any hint reaching past the column's right edge was
drawn under the rocket. The column now carries `zIndex: Z.brief`, the token the
phone's sticky brief already takes, so `Z` in `src/ui/tokens.ts` stays the one
list of what stacks over what. Taking the tooltip out of the column — a portal,
or the `popover` attribute's top layer — would also have worked, at the cost of
rebuilding the `::after` trick that keeps a hidden tooltip out of `scrollWidth`.

## What made it real

`visual/layout.test.ts` shows the rightmost hint of the open brief, then reads
the viewport twice, hint shown and hint hidden, at sixteen points along the
hint's first line of text where it crosses the results column. Without the
column's `z-index`, 0 of 16 points changed: the card was what was seen both
times. With it the check is green, a quarter of the points being required to
change.

## Key takeaway

When raising a z-index changes nothing, find the stacking context the element is
trapped in and raise that.
