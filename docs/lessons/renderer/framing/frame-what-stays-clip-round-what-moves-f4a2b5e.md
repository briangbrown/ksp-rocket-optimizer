# Frame What Stays, Clip Round What Moves

**Why it matters:** any camera that fits itself to a subject while parts of the
scene animate away from it.

## The concept

A camera makes two decisions that are easy to mistake for one: what to frame —
the scale and centre that fill the panel — and what to keep between the near
and far planes. While everything drawn is also everything framed, one extent
serves both. During a transition it cannot. The framing should follow what
remains, because chasing departing parts pushes everything else off the panel;
yet the departing parts are still drawn, and planes measured on what stays slice
them in mid-air. Leaving the panel at the edge is the intent; being cut in half
is not. So the depth window is measured off everything posed, and measured about
the point the camera looks at rather than the floor — a part falling below the
pad is moving _towards_ a plan view that looks up from beneath — with each part
reaching `h/2 + r` along the axis, since a tilted cylinder reaches further than
its half-length.

## In this codebase

`cameraFor` in `src/ui/views.ts` takes a `depth` extent separately from the one
it frames, defaulting to the same. `pose` in `src/ui/separation.ts` reports a
`sweep` beside its `extent`: twice the furthest any posed part reaches from
`midY`, measured off the parts rather than reasoned from the `DROP` and `OUT`
constants, so a change to the choreography carries into the clip planes by
itself. The depth cue stays on what is framed, so a booster on its way out does
not wash out the rocket it left.

## What made it real

Without the separate window, 21 parts fell outside the depth planes across three
views and five points of the transition; with it, none, and a second check
requires the sweep to exceed the framing once anything is moving. The design
snapshot and mission sweep did not change, since none of this touches the model.

## Key takeaway

Framing and clipping are two extents: fit the camera to what stays, and reach
the near and far planes round everything still being drawn.
