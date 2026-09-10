# The Page Names Its Motion

**Why it matters:** any test that reads a rendered frame and needs to know the
drawing has come to rest first.

## The concept

A sampler that waits a fixed time for an animation to finish is guessing about
the machine; a sampler that waits for the application to say it has finished is
not. Have the component publish its motion state as a DOM attribute — computed
in render from the same state that drives the frame — and have the harness wait
for the attribute to clear. Two things decide whether the attribute is honest.
It must be derived in render, not set from the effect that starts the
animation, or the first moving frame is unlabelled. And it must cover the
_gaps_: a choreography of several phases has rests between them where nothing
is in flight but the sequence is not over, and a sampler that reads in a rest
gets an intermediate state as though it were the final one.

## In this codebase

`BuildView` in `src/ui/components/build.tsx` sets `data-motion` on its root —
`"arriving"` while a new design settles onto the pad, `"staging"` from the
first separation of a walk to the last frame of it:

```ts
const motionName = arriving
  ? "arriving"
  : anim || moving || demo.current
    ? "staging"
    : undefined;
```

`moving` is the part that names the gaps: between one separation landing and
the next starting there is a render with no `anim`. `settle()` in
`visual/browser.ts` waits for the solver's pulse, then for two canvases, then
for `[data-motion]` to be absent — unless asked `{ motion: false }`, which the
render suite asks where the frame in flight is the thing it wants to read.
Before this, `settle` waited on the solver alone, and the plan check read a
frame of a separation as though it were the step.

## What made it real

The phone's layout screenshot, taken in the gap between two separations of the
first design's play-through, showed step 2 of a walk to the pad — the frame was
still, and it was the wrong one. That is what put `moving` beside `anim`. On the
phone that walk is eight seconds or so, five separations at 1.6 s with rests
between; a sleep that long would be either flaky or slow on every run, and the
attribute is neither.

## Key takeaway

Let the application declare when it is moving, derive the declaration in
render, and make it span the rests between phases — then a test waits for
truth instead of guessing at time.
