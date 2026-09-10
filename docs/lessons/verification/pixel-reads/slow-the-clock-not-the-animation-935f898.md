# Slow the Clock, Not the Animation

**Why it matters:** any test that has to read a frame _during_ an animation on
a machine too slow to draw more than one or two of them.

## The concept

An animation whose only input is time can be run at any speed by owning time.
The temptation, when a test cannot catch a frame in flight, is to lengthen the
duration under test — a knob in the production code, and a different animation
from the one shipped. Instead wrap the two clocks the loop reads,
`performance.now` for its start and `requestAnimationFrame` for each frame's
timestamp, so that both advance at a fraction of real time. The code under test
is byte-identical; it just believes less time has passed. The precondition is
that the animation reads no other clock: a `Date.now()` or a CSS transition
alongside it runs at full speed and the two fall out of step.

## In this codebase

The arrival check in `visual/render.test.ts` wraps the page's clock at a
quarter speed for the duration of one solve:

```ts
const slow = (t: number) => t0 + (t - t0) / 4;
performance.now = () => slow(now());
window.requestAnimationFrame = (cb) => raf((t) => cb(slow(t)));
```

then restores both. It waits for `data-motion="arriving"`, reads the elevation
on every frame it can while the attribute stands, and asserts that at least one
of those frames differs from the one it lands on. The arrival's easing is
`1 − (1 − t)³`, in `arrive()` in `src/ui/separation.ts`, and the test had to
know its shape to know why it needed the clock.

## What made it real

Nothing was timed; the arithmetic is what stood. SwiftShader, headless Chrome's
software GL, spends a good part of the arrival's 400 ms building the new
rocket's scene, so the first frame it can draw may fall past three quarters of
the way through — where the cubic has 0.25³, under 2%, of the offset left. The
offset is 6% of the rocket's height at its largest, in a panel a few hundred
pixels tall, so that first frame can already hash the same as the landed one
and the "something moved" assertion would flake on a run with nothing wrong. At
a quarter speed the same 400 ms is 1.6 s of wall time and the loop reads
several frames, the early ones with parts visibly raised.

## Key takeaway

To sample an animation a slow renderer cannot keep up with, wrap the clocks it
reads and run them slow — the shipped code is unchanged, and the shipped
duration is what you tested.
