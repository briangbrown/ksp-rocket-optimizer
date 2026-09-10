# Move It in the Tree, Not the Stylesheet

**Why it matters:** whenever a section belongs in a different place on a wide
screen than on a narrow one.

## The concept

CSS can put an element anywhere on the screen — `order`, a grid area, absolute
positioning — but three orders never move with it: what a screen reader
announces, where Tab goes next, and what find-in-page walks. All three are the
DOM's. A relocation done in the stylesheet therefore gives a sighted pointer
user one sequence and everyone else another, and the two disagree exactly
where the layout was meant to help. If the change is one of _sequence_ rather
than of position, make it a render-time decision: hold one piece of layout
state, a media query matched in script, and render the element in the branch
where it belongs. Ask the same query the stylesheet uses so the two can never
disagree. The costs are real and worth knowing — the element remounts when the
viewport crosses the breakpoint, so its local state resets, and a test
environment without `matchMedia` needs both a default and a way to stub it.

## In this codebase

`useWide()` in `src/ui/components/primitives.tsx` is the one piece of layout
state React holds: `matchMedia("(min-width: 1024px)")`, seeded from `isPhone()`
so the first render agrees with the stylesheet. In `src/ui/app.tsx` the same
`routeSection` element is rendered under the brief in the sticky left column
when `wide`, and after the results — `{!wide && routeSection}` — when not, so
reading order is DOM order on both screens. The stylesheet draws the two
columns; it decides nothing about what goes where. jsdom has no `matchMedia`,
so `useWide` answers "wide" there, and `test/brief.test.tsx` stubs one to test
the phone's brief. The layout suite's `ORDER` became per screen with this: the
route is fifth at 390 px and second at 1280.

## What made it real

Nothing was measured beyond the order itself: the layout suite asserts the
sequence of top-level headings on both screens and it matches what is drawn,
and axe stayed at zero. The reasoning is what holds — a `grid-area` would have
produced the same picture at 1280 px with the route read last and tabbed to
last, which is the bug this avoids rather than one that was observed.

## Key takeaway

Use CSS to change where a thing is drawn and the tree to change what comes
after what — reading order, focus order and search order follow the DOM, not
the picture.
