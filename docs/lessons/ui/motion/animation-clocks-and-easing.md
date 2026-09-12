# Animation clocks and easing

**Syllabus:** [L15](../../README.md#part-3--language-and-platform)

**Why it matters:** How motion is clocked matters because an animation is a
function of time evaluated once per frame, and the two ends of that
function are where it goes wrong: the frame's timestamp is the frame's
start, which can precede the moment the clock was started, so an unclamped
first step ran the arrival backwards for a frame; and the last frame must
be the still drawing to the bit, because the pixel check compares what the
animation handed over against what the still draws, and a curve evaluated
at 1.002 instead of 1 leaves every part a few billionths of a metre below
its place.

**Before this:** [L7](../react/react-effects-refs-and-drafts.md), _React
effects, refs, and drafts_, and
[L11](../../renderer/cameras/three-js-scene-orthographic-camera-and-the-camera-basis.md),
_three.js: scene, orthographic camera, and the camera basis_.

## A worked case

Take the four easing curves the build view moves by, and the four-part test
rocket, eight metres tall, that the arrival is checked on:

| t    | `falls` t² | `pushed` 1−(1−t)² | `smooth` t²(3−2t) | `settles` 1−(1−t)³ |
| ---- | ---------- | ----------------- | ----------------- | ------------------ |
| 0    | 0          | 0                 | 0                 | 0                  |
| 0.25 | 0.0625     | 0.4375            | 0.15625           | 0.578125           |
| 0.5  | 0.25       | 0.75              | 0.5               | 0.875              |
| 0.75 | 0.5625     | 0.9375            | 0.84375           | 0.984375           |
| 1    | 1          | 1                 | 1                 | 1                  |

Read the columns as speeds. `falls` covers a sixteenth of its distance in
the first quarter and seven sixteenths in the last: a released mass. `pushed`
is the same curve backwards, seven sixteenths first, then coasting: one
shove and nothing after. `smooth` is slow at both ends, for a camera.
`settles` covers 58 percent of its way in the first quarter and 1.6 percent
in the last: a part dropping onto the pad and stopping.

The arrival raises each part by six percent of the rocket's height, more
for higher parts, and lets `settles` bring them down:

| t                   | Bottom tank | Booster | Upper tank | Payload |
| ------------------- | ----------- | ------- | ---------- | ------- |
| 0                   | 0.48        | 0.48    | 0.72       | 0.90    |
| 0.5                 | 0.06        | 0.06    | 0.09       | 0.1125  |
| 1                   | 0           | 0       | 0          | 0       |
| −0.0075 (unclamped) | 0.4909      | 0.4909  | 0.7363     | 0.9204  |
| 1.002 (unclamped)   | −3.8e-9     | −3.8e-9 | −5.8e-9    | −7.2e-9 |

The last two rows are the two clock faults. A first frame stamped three
milliseconds before the clock started gives t = −0.0075, and every part is
higher than where it started: the arrival ran backwards for a frame. A last
frame at 400.8 ms on a 400 ms clock gives t = 1.002, and every part is below
its place by a few billionths: not the still drawing, and a comparison to
the bit fails. Clamping t to [0, 1] removes both, and at exactly 1 the
offsets are exactly zero.

```ts
// save as test/l15.test.ts and run: npx vitest run test/l15.test.ts --reporter=verbose
import { test } from "vitest";
import { arrive, assembly, pose, separation } from "../src/ui/separation";
import type { ModelPart } from "../src/core/model";

const falls = (t: number) => t * t; // separation.ts's four curves, module-private there
const pushed = (t: number) => 1 - (1 - t) * (1 - t);
const smooth = (t: number) => t * t * (3 - 2 * t);
const settles = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t);
const ARRIVE_MS = 400; // build.tsx

const booster = {
  n: "a booster",
  t: null,
  sz: ["R"],
  f: ["SF"],
  m: 1,
  dry: 0.2,
  fuelM: 0.8,
  iv: 200,
  ia: 170,
  fv: 200,
  cost: 100,
} as const;
const model: Array<ModelPart> = [
  // test/separation.test.ts's stack of three: written out, so the numbers are exact
  { role: "tank", x: 0, z: 0, y: 0, r: 1, h: 4, stage: 0 },
  {
    role: "booster",
    ring: 1,
    x: 2,
    z: 0,
    y: 0,
    r: 0.5,
    h: 3,
    stage: 0,
    part: booster as never,
  },
  { role: "tank", x: 0, z: 0, y: 4, r: 1, h: 3, stage: 1 },
  { role: "payload", x: 0, z: 0, y: 7, r: 0.6, h: 1 },
];
const next: Array<ModelPart> = [
  { role: "tank", x: 0, z: 0, y: 0, r: 1, h: 3, stage: 0 },
  { role: "payload", x: 0, z: 0, y: 3, r: 0.6, h: 1 },
];

test("clocks and easing", () => {
  for (const t of [0, 0.25, 0.5, 0.75, 1])
    console.log(
      `t=${t}: falls ${falls(t)}  pushed ${pushed(t)}  smooth ${smooth(t)}  settles ${settles(t)}`,
    );
  const asm = assembly(model);
  const ys = (t: number) =>
    arrive(asm, t)
      .offsets.map((o) => +o.y.toPrecision(4))
      .join(" ");
  for (const t of [0, 0.5, 1])
    console.log(
      `arrive t=${t}: offsets y = ${ys(t)}; settled ${arrive(asm, t).settled}`,
    );
  const early = -3 / ARRIVE_MS; // a frame stamped 3 ms before the clock started
  const late = (24 * 16.7) / ARRIVE_MS; // the 24th frame of a 60 Hz run, 400.8 ms in
  console.log(
    `unclamped first frame t=${early.toFixed(4)}: ${ys(early)}   unclamped last frame t=${late}: ${ys(late)}`,
  );
  const clamp = (u: number) => Math.min(1, Math.max(0, u));
  console.log(
    `clamped: t=${clamp(early)} → ${ys(clamp(early))};  t=${clamp(late)} → ${ys(clamp(late))}`,
  );
  const sep = separation(
    model,
    next,
    { drop: 0, boost: true },
    { drop: 1, boost: false },
  );
  for (const t of [0, 1]) {
    const p = pose(sep, t);
    console.log(
      `pose t=${t}: booster ${JSON.stringify(p.offsets[1])}, survivors ${p.offsets.filter((_, i) => !sep.goes[i]).every((o) => o.y === 0 && o.x === 0)}; midY ${p.midY}`,
    );
  }
});
```

## The idea

An animation on the web is not a thing that runs; it is a function of time
that the page evaluates once per frame. `requestAnimationFrame` asks the
browser to call back before its next paint and hands the callback a
timestamp; the callback computes where everything is at that moment, sets
it, and asks again if it is not done. The function has a domain, usually
normalised to t in [0, 1] by dividing elapsed time by a duration, and a
range, the positions and opacities at that t, and both ends of the domain
carry a rule.

The **frame timestamp** is the time the browser stamps on each animation
frame, and it is the frame's start, not the moment the callback runs. The
browser samples it once per frame, at the vertical sync the frame is built
for, and every callback in that frame gets the same value, which is what
lets two animations started in the same frame agree. It follows that the
first timestamp a callback sees can be earlier than a `performance.now()`
taken when the clock was started, because that clock was read partway
through a frame whose start had already been stamped. Elapsed time comes
out negative, t comes out negative, and a curve evaluated below its domain
does whatever its polynomial does there: `settles(−0.0075)` is negative, so
the parts move up before they move down. The fix is a clamp at zero, and
the rule is that a clock's first reading is not trusted to be at or after
its start.

**Easing** is the curve that turns t into progress, and it exists because
motion that starts and stops at full speed reads as a cut with a delay in
the middle. A polynomial in t is the whole toolkit: t² accelerates from
rest, 1−(1−t)² decelerates to it, t²(3−2t) does both, and the cubic
1−(1−t)³ decelerates harder. Which one to use is a question about what the
thing is: a released mass falls on t², a booster pushed once by its
separation motors coasts on 1−(1−t)², a camera eases at both ends because a
camera is not a body, and a part settling onto the pad stops on the cubic
because a settle is not a launch played backwards. The curves are shared
with the figures that count up alongside, so the numbers and the parts
arrive together.

**The still** is the drawing at rest, and it is where motion starts from and
returns to. An animation that ends anywhere else is worse than no
animation, because the frame it hands over to is drawn by other code from
other inputs, and any difference is a jump. So the arrival's last frame
must be the still to the bit: every offset exactly zero, the extent the
still's, the camera unmoved. A curve evaluated at 1.002 gives offsets of a
few billionths, which is not zero, and a comparison of pixels sees it. The
clamp at one makes the last evaluation exactly `settles(1)`, which is
exactly 1, and `1 − 1` is exactly 0. The same claim holds a separation at
both ends: it starts where the step it leaves was drawn and ends where the
step it arrives at will be drawn, and it is checked as arithmetic.

```
   effect runs           frame 1              frame 2  …        frame N            hand-over
   t0 = now()            stamp < t0 !         stamp                stamp ≥ t0+400     still drawing
   ───────┬──────────────┬────────────────────┬────────────────────┬──────────────────┬──────
          │  u = (stamp − t0) / 400            │                    │
          │  frame 1:  u < 0  → clamp to 0    │        frame N: u > 1 → clamp to 1
          │  settles(0) = 0, offsets at start  │        settles(1) = 1, offsets exactly 0
```

## In this codebase

[`src/ui/separation.ts`](../../../../src/ui/separation.ts) is the
choreography as arithmetic over two models, with no three.js and no DOM, so
it can be checked without a renderer. Its four curves are `falls`, `pushed`,
`smooth` and `settles`, each with a one-line reason; `pose(sep, t)` moves
the spent parts of a separation by `DROP` heights and `OUT` reaches and
tilts a booster column about its shared pivot, and eases the camera's
`midY` between the two framings with `smooth`; `arrive(asm, t)` raises each
part by `RISE` of the height, more for higher parts, and lets `settles`
bring them down, returning `settled` on the same curve for the figures. The
clocks are in
[`src/ui/components/build.tsx`](../../../../src/ui/components/build.tsx):

```ts
const t0 = performance.now();
let id = requestAnimationFrame(function tick(now: number) {
  /* Clamped below as well as above: the frame's timestamp can precede
     the `performance.now()` the clock started on, and a negative first
     step ran the arrival, and the handle, backwards for a frame. */
  const u = Math.min(1, Math.max(0, (now - t0) / ARRIVE_MS));
  setArrival({ t: u });
  if (u < 1) id = requestAnimationFrame(tick);
  else setArrival(null);
});
return () => cancelAnimationFrame(id);
```

`ARRIVE_MS` is 400, `STEP_MS` 800 and `PLAY_MS` 1600, and the effect's
cleanup cancels the pending frame so a design that changes mid-arrival does
not leave two clocks running. Which change is an arrival is decided by
`missionSignature` plus the payload diameter, so a re-solve that returns the
same rocket does not replay it. The root names its motion in `data-motion`,
computed in render rather than read from state so the arrival's first frame
is named too, and `settle` in
[`visual/browser.ts`](../../../../visual/browser.ts) waits for that
attribute to clear before it samples a pixel. The rule is in
[`.claude/rules/renderer.md`](../../../../.claude/rules/renderer.md), _An
arrival ends where the still drawing is, to the bit_, and the ui rule _The
build view names its motion, and the gaps count_.

## What made it real

The arrival tests in
[`test/separation.test.ts`](../../../../test/separation.test.ts) are the
measurement on numbers: at t = 1 every offset `toEqual({ x: 0, y: 0, z: 0,
tilt: 0 })` and `settled` is exactly 1, the extent and `midY` are the
still's at 0, 0.5 and 1, and every part's height falls monotonically
between sampled frames. The snippet's unclamped rows are what those tests
would see without the clamp: offsets of 0.49 where 0.48 was the start, and
−3.8 billionths where zero was required.

The backwards frame was seen, not reasoned: the comment in the clock
records that a negative first step ran the arrival and the scrubber's handle
backwards for a frame, in a real browser, where the first timestamp came in
under the `performance.now()` the clock had been started on. And the pixel
check is `visual/render.test.ts`, which samples the drawing after `settle`
and compares against the still; the visual suite's own screenshot of a
phone once caught a frame between one separation landing and the next
starting, which is why `data-motion` stays set through the gap.

## Where it breaks

- **Trusting the first timestamp.** It can precede the clock's start. Clamp
  below, or start the clock from the first frame's own stamp.
- **Letting the last frame overshoot.** Frames land every 16.7 ms and a
  duration is rarely a whole number of them; t lands past one and the curve
  past its end. Clamp above, and make the last evaluation exactly t = 1.
- **A curve that is not exactly zero at zero or one at one.** A cubic
  Bézier evaluated numerically, or a spring, ends near its target, not at
  it, and the hand-over to the still jumps by the difference. The four
  polynomials here are exact at both ends.
- **A clock without a cleanup.** A design that changes mid-arrival starts a
  second clock; without `cancelAnimationFrame` in the effect's cleanup both
  set state every frame and the drawing flickers between two rockets.
- **A camera that takes part.** The arrival plays on every change to the
  brief; a frame that moves each time is a nervous drawing. The camera holds
  the still's framing throughout, and only the depth window reaches round
  the raised parts.

## Try it

Run the snippet and read the unclamped rows. Change `late` to
`(24 * (1000 / 60)) / ARRIVE_MS`, which is exactly 1 in real arithmetic, and
see whether floating point agrees. Then replace `settles` with the smoother
`smooth` in the arrival column and watch the first-quarter progress fall
from 58 to 16 percent, which is what a launch played backwards would look
like. Then open the application, change the payload, and watch the parts
settle and the figures count up on the same curve.

## Check yourself

<details><summary>Why can the first frame's timestamp be earlier than a <code>performance.now()</code> taken before the frame was requested?</summary>

Because the timestamp is the frame's start, sampled once at the vertical
sync the frame is built for and shared by every callback in that frame. A
clock started with `performance.now()` partway through a frame reads later
than the stamp the next callback receives when the request lands in the
frame already stamped. Elapsed time comes out negative, so t is clamped at
zero.

</details>

<details><summary>Why must the last frame of an arrival be the still drawing to the bit, rather than very close to it?</summary>

Because the frame after it is drawn by other code from the still's inputs,
and any difference is a jump the eye sees and the pixel check measures.
Evaluating the curve at t = 1.002 leaves offsets of a few billionths, which
is not zero; clamping to exactly 1 makes `settles(1)` exactly 1 and the
offsets exactly 0.

</details>

<details><summary>A released stage falls on t², a booster is thrown out on 1−(1−t)², and the camera moves on t²(3−2t). Why three different curves for one separation?</summary>

Because each answers what the thing is. A released mass accelerates from
rest, so its progress is quadratic from zero. A booster's separation motors
fire once, so it starts fast and coasts, the same curve reversed. The
camera is not a body; motion that starts or stops at full speed reads as a
cut, so it eases at both ends.

</details>

## Further reading

- The HTML specification's section on animation frames, for what the
  timestamp handed to a `requestAnimationFrame` callback is and when it is
  sampled.
- Robert Penner, _Programming Macromedia Flash MX_ (2002), chapter 7, the
  origin of the polynomial easing family and its names.
- The MDN reference for `performance.now()` and `DOMHighResTimeStamp`, for
  the two clocks and why they are the same clock read at different moments.

## Key takeaway

An animation is a function of time evaluated once per frame, and both ends
of its domain carry a rule: the first frame's stamp can precede the clock's
start, so t is clamped at zero, and the last frame must be the still to the
bit, so t is clamped at one and the curve is exact there; in between, the
easing curve is chosen by asking what the moving thing is.

_As of c8c6662._
