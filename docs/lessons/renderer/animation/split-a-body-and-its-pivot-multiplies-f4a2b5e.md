# Split a Body and Its Pivot Multiplies

**Why it matters:** whenever a thing drawn as one mesh is redrawn as several,
and something already animates it — a rotation especially.

## The concept

A renderer that places each mesh at its own centre and rotates it there gives a
one-mesh body rigid motion for nothing: its centre is the body's pivot. Split
the body into five meshes and the same per-mesh transform is no longer rigid.
Every part turns about its own centre, and a stack of parts fans open.
Translation does not do this — equal offsets keep the parts' spacing — which is
also why a test that checks spacing cannot see it. Rigidity means one pivot for
the group, and the group needs a name: an identifier on each part saying which
body it belongs to, not a guess from position, which merges two bodies the
moment they share a footprint. The turn about the shared pivot then folds into
each part's own offset — an arm `d` from pivot to centre swings `d·sin(tilt)`
outward and `d·(cos(tilt) − 1)` down, both zero when `d` is, so a one-mesh body
moves exactly as it did.

## In this codebase

#123 drew a radial column as its engine and its tanks, and the boosters-away
transition then pulled each column apart. `Shape.ring` in `src/core/model.ts`
became a number, each booster counted across the model, and `pivots` in
`src/ui/separation.ts` takes the middle of each ring's span; `pose` adds the
arm's swing and drop to the offset it already computed. `test/separation.test.ts`
— "keeps its joints closed the whole way out" — checks the property itself: the
top face of one part is still the bottom face of the next, through the same
composition `three-view` applies, at five points across the transition.

## What made it real

The first version of that test checked the parts' spacing and passed with the
bug reinstated. Checking the joints fails on the old code by 0.785 m at
mid-transition. A solid booster — one shape, its own pivot — moves identically
to the bit, and the design snapshot and mission sweep were untouched, since
nothing in the model's geometry changed.

## Key takeaway

Per-mesh rotation is rigid only while the body is one mesh — the moment you
split it, give the pieces a shared pivot by name, and test the joints, not the
spacing.
