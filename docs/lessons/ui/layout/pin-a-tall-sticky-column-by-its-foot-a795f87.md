# Pin a Tall Sticky Column by Its Foot

**Why it matters:** any sidebar that is `position: sticky` and can grow taller
than the window.

## The concept

`position: sticky; top: X` pins an element's head. While the element is shorter
than the viewport that is what you want: it rides along beside the content.
Once it is taller, pinning the head puts the foot permanently out of reach —
the page scrolls, the column does not, and whatever is at its bottom can never
be seen. An inner scroll container fixes that at the cost of a second scrollbar
and a clipping box that cuts off anything absolutely positioned out of it, such
as a tooltip. The cheaper fix is a _negative_ `top`. Sticky positioning accepts
one, and with `top = viewport − height − margin` the column scrolls with the
page until its last line reaches the bottom edge, then holds there. So the
offset is `min(margin, viewport − height − margin)`: the margin while the column
fits, the overshoot once it does not. The height has to be observed, because it
changes as the column's content opens and closes.

## In this codebase

`useStickyTop(margin)` in `src/ui/app.tsx` returns a callback ref and a `top`:

```ts
return { ref, top: Math.min(margin, winH - h - margin) };
```

`h` comes from a `ResizeObserver` on the ref — a callback ref rather than an
object one, because the column is only in the tree on a wide screen and mounts
and unmounts as the viewport crosses 1024 px — and `winH` from the window's
`resize`. The desktop's 360 px left column, holding the brief and _Where it
goes_, is `position: sticky; alignSelf: start` with that `top`. It is not an
inner scroll container because the chips' `data-hint` tooltips are absolutely
positioned and would be clipped by one.

## What made it real

Nothing was measured for the pin itself; the failure is qualitative and the
reasoning above is what stands. With the brief open, the column is taller than
the layout suite's 900 px window, and pinned at the top its _Done_ button and
the route beneath it would be under the fold for the length of the page. The
two-column shell as a whole took the desktop page from 2582 to 2556 px, and the
suite's budget came down to 2610 with it.

## Key takeaway

A sticky element taller than the viewport wants a negative `top` equal to its
overshoot, so it is pinned by whichever end fits — and its height has to be
watched, not assumed.
