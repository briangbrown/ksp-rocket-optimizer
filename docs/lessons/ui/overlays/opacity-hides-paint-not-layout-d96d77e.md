# Opacity Hides Paint, Not Layout

**Why it matters:** whenever a hidden element — a tooltip, a popover, a drawer
— is parked with `opacity: 0`, and anything measures or scrolls the page.

## The concept

`opacity: 0` and `visibility: hidden` remove an element from view and from
nothing else. It still has a box, still takes part in layout, and still extends
its ancestors' scrollable overflow: `scrollWidth` and `scrollHeight` count it.
An absolutely positioned descendant hanging outside its parent's box widens that
parent's overflow area whether or not a pixel of it is painted. Only
`display: none`, or removing the node, takes it out. Transparent-until-shown is
right for a fade and wrong for anything measured by overflow — and a layout that
looks fine can still report, and on a touch screen sometimes actually scroll,
sideways.

## In this codebase

`.iconbtn::after` in `src/ui/styles.ts` is the icon button's tooltip, drawn from
its `aria-label` below the button. `measure()` in `visual/measure.ts` counts
every shown element with `scrollWidth > clientWidth + 1` as `sideways`. A
tooltip that was merely transparent while hidden put every row holding an icon
button on that list; it is `display: none` until `:hover` or `:focus-visible`
shows it, and the comment beside it says why (#130).

## What made it real

The offending count was not written down — the sideways assertion went red on
both screens with a row per icon button, and back to its budget of 7 on the
phone and 6 on desktop once the tooltip was `display: none`. The price is that
a `display: none` element cannot fade in, which for a tooltip is no price.

## Key takeaway

Transparent is still there: anything `scrollWidth` can count is laid out, so
park an overlay with `display: none`, not `opacity: 0`.
