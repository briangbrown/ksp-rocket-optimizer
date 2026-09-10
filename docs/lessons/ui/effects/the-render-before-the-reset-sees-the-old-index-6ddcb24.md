# The Render Before the Reset Sees the Old Index

**Why it matters:** any React component that keeps an index, cursor or
position in state and resets it in an effect when the data it indexes
changes.

## The concept

Effects run after render. When a prop changes and an effect exists to reset
the state that depended on the old prop, there is always one render in
between where the new data meets the old state. If that state is an index it
can be past the end of the new list, and the render throws before the effect
that would have fixed it ever runs. The reset is still right, but it is not a
guard; the guard is to clamp on every read — `Math.min(index, last)` — so the
in-between render is valid and the effect merely tidies up.

## In this codebase

`BuildView` in `src/ui/components/build.tsx` animates a separation and names
the step it left in `anim`; an effect on the design's signature resets it.
Change the brief mid-animation to a mission nothing solves and the next
render had a one-step list and an animation on step three: it read
`steps[3]`, threw on `.drop`, and the page was the error boundary. `from` was
already clamped to `last`; `base` was not, and is
`Math.min(motion ? motion.a : from, last)` now. On a phone the staging plays
itself once after every load, so a tap on the brief in those seconds was a
blank page — which is how a Kerbol fly-by link came to be reported as a
crash. The boundary now prints the error's message and its first frames,
since nobody reads a phone's console.

## What made it real

Reproduced in headless Chrome at the phone viewport: play the staging, two
seconds in switch the brief to a low solar orbit — 36 km/s from the pad,
which nothing solves — and the page fell to the boundary with the TypeError
on the console. With the clamp it stands and says "No solution"
(`visual/render.test.ts`). The check lives in the browser suite because the
sequence is a real animation interrupted by a real tap.

## Key takeaway

An effect that resets stale state runs one render too late to be a guard;
clamp the index where it is read.
