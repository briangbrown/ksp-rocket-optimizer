# Between Two Items Has a Side

**Why it matters:** any list that draws something _between_ neighbours — an
insert point, a divider, a cut — and might be drawn in either direction.

## The concept

"Between item i and item i+1" is a relation, and a relation has no node of its
own. To render it you attach it to one neighbour, before or after, and that
attachment commits to a direction: "after i" and "before i+1" are the same slot
only while the list is drawn in index order. Reverse the list and "after i" in
the DOM sits between i and i−1. Every marker moves one slot the wrong way, and
because the shift is uniform nothing looks broken in the middle — the ends are
where it shows, as one marker that should not exist and one that is missing.

## In this codebase

`RouteMap` in `src/ui/components/route.tsx` draws the route bottom-up, launchpad
last, the way a rocket is read. A cut is "separate after leg i" — `cuts` is a
set of leg indices — and its scissors were rendered after leg i's row in the
DOM. In a reversed list that is the slot below the leg, between i and i−1. The
button now precedes its row, so it stands between leg i and leg i+1 on the
page, and `test/route-map.test.tsx` walks the buttons and rows in DOM order and
asserts the sequence `Aerobrake, Capture, cut 1, Orbit → escape, cut 0,
Launchpad → orbit` — a check that fails on the old placement.

## What made it real

A four-leg route offered a scissor under the launchpad, a cut after nothing,
and none between the final burn and the leg before it. The placement was not
new; it was only noticed when #139 added a _Cut the route_ button that places a
cut for the reader and so made the reader look where it landed. The fix moved
one JSX block above a sibling and changed no logic.

## Key takeaway

When you render a relation between neighbours, pick the neighbour by the
direction the list is drawn, not the direction it is indexed — and test the DOM
order, because a uniform off-by-one looks right everywhere but the ends.
