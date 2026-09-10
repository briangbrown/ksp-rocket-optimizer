# Wait for the Signal, Not the Clock

**Why it matters:** any browser test that samples the screen after an
animation, on a machine whose frame rate you do not control.

## The concept

An animation is specified in animation time — 800 ms — but a test's sleep is
wall time, and the two agree only when frames arrive as fast as the animation
assumes. On a CI runner's software renderer a single frame can take most of the
animation's length, so a sample taken "well after" the end catches the last
frame still landing, the test fails on code it did not touch, and passes on
re-run. Padding the sleep only moves the boundary. The animating component
knows when it stopped; expose that as something readable — a data attribute, an
event — and have the test wait on it. The assertions do not change (it moved,
it stopped, it stopped somewhere new); only the definition of "stopped" does.

## In this codebase

"animates a separation, and settles where a cut would have" in
`visual/render.test.ts` slept 1.2 s past its first sample and held two reads of
the elevation equal. It failed on `main` after #156 merged and on a branch that
had not touched the build view, then passed on a re-run of identical code. It
now waits on `settle` in `visual/browser.ts`, which polls until no element
carries the `data-motion` attribute #138 put on the build view's root for
exactly this, and then samples twice 300 ms apart.
#141

## What made it real

A fixed sample 1.46 s after an 800 ms transition — nearly twice the
animation's length — was still early on CI's renderer. One failed run of a test
with no relevant diff, green on re-run, is the whole measurement, and it is the
signature of a clock-based wait.

## Key takeaway

A sleep is a guess about frame rate; make the component say it has stopped and
wait for that.
