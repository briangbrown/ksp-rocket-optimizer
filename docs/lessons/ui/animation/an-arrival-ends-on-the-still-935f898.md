# An Arrival Ends on the Still, to the Bit

**Why it matters:** any entrance or settle animation that hands over to a
drawing which then stays on screen.

## The concept

An entrance is not a second drawing that approaches the first; it is the still
drawing with a perturbation applied. Build it that way: define the resting
frame first, then define the animated frame as _rest + offset(t)_ where the
offset is exactly zero at t = 1, and take the camera and framing from the rest
at every t rather than from the moving parts. Then the handover from the last
animated frame to the resting render changes nothing, and that is a claim you
can test — render the rest cold, compare pixels. If the animation owns its own
camera, or eases the framing towards the rest, its last frame is _near_ the
still, and near is a jump the eye catches every time.

## In this codebase

`arrive()` in `src/ui/separation.ts`, the same shape of thing as `pose()` for a
separation. Every part starts a little above its place — `RISE = 0.06` of the
rocket's height at the bottom, twice that at the top — and settles on a cubic
`1 − (1 − t)³`; x, z and tilt are zero throughout, `extent` is the still's, and
`midY` is `H / 2` whatever the parts are doing:

```ts
y: RISE * H * (1 + p.y / H) * left; // left = 1 − settles(t), 0 at t = 1
```

Only the depth window reaches round the raised parts; the frame does not
follow them. `test/separation.test.ts` holds every offset `{0, 0, 0, 0}` at
t = 1 and the extent equal to `extentOf(model)` at 0, 0.5 and 1.
`visual/render.test.ts` reads the elevation on every frame while
`data-motion="arriving"`, waits for it to land, turns the view to isometric and
back so the scene is rebuilt from nothing in motion, and holds the landed
frame's hash equal to the cold one.

## What made it real

The landed frame and the cold render hash identically in headless Chrome, while
at least one frame read during the 400 ms arrival differs from both — so the
animation moved, and ended where the still is. Which design it is comes from
`missionSignature`, moved from `test/` into `src/core/signature.ts` so the app
and the snapshots compare the same text; a re-solve that returns the same
rocket is held not to arrive at all.

## Key takeaway

Write an entrance as the still plus an offset that is exactly zero at the end,
with the camera on the still throughout — then the last frame _is_ the
drawing, and a pixel comparison can say so.
