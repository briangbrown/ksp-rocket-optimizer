# A Frame's Timestamp Can Precede the Clock You Started

**Why it matters:** any animation that starts a clock with `performance.now()`
and advances it from the timestamp `requestAnimationFrame` hands its callback.

## The concept

The timestamp a `requestAnimationFrame` callback receives is the frame's time,
not the callback's: the moment the browser took as the start of this frame,
which in Chrome is the display's vsync, and which can be a frame's width before
the callback actually runs. Code that ran in the gap — an input handler, a state
update, an effect — read a `performance.now()` that is _later_ than the
timestamp its first frame will carry. So the first step of
`(now − t0) / duration` can be negative. Clamping progress at 1 is habit;
clamping it at 0 is the one that catches this. In a fade a frame of negative
progress is invisible. In anything with a position it is a step the wrong way
followed by the right one, and the eye reads a hop at every start.

## In this codebase

`BuildView` in `src/ui/components/build.tsx` runs two such clocks: the arrival
(`ARRIVE_MS`) and each separation (`STEP_MS` or `PLAY_MS`), both started on
`performance.now()` and ticked by the frame's `now`. Both read

```ts
const u = Math.min(1, Math.max(0, (now - t0) / ms));
```

since #210. The tell was the scrubber's stops, which follow the handle: the
handle stepped backwards for one frame at the start of every separation, and the
lit stop with it, so every stage read as a jump back. `visual/stops.test.ts`
plays the staging through both ways and holds the handle and the lit stop to one
direction.

## What made it real

Sampled every few milliseconds during the play, the handle went 1.00 → 0.97
going forward and 4.00 → 4.03 coming back on the first frame of each
separation. Three percent of an 800 ms step is 24 ms — about a frame and a half
at 60 Hz, the size of gap the frame time can sit behind the clock by. With the
clamp the run is monotone in both directions, which is what the suite measures.

## Key takeaway

Clamp an animation's progress at both ends — the frame's timestamp is the
frame's start, not your callback's, and the first step can be negative.
