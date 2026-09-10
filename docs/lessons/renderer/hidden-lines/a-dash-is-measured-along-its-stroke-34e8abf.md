# A Dash Is Measured Along Its Stroke

**Why it matters:** any screen-space effect with a period along a line —
dashes, ticks, arrowheads — drawn by a fragment shader.

## The concept

A fragment knows where it is on the screen, not how far along its stroke it
is. Phasing a dash on any screen coordinate — x, y, x + y — makes the period
depend on the stroke's direction: a line running along the phase axis gets the
full period, one crossing it gets the period divided by its projection, and an
ellipse gets every value in between. A drafter's dashes are the same length
however the line runs because they are measured along the line. Arc length has
to be a property of the geometry: chain segments into polylines, accumulate
screen-space length into a per-vertex attribute, and let the shader dash by
that. A per-pixel pass can still answer per-pixel questions — is something
behind me, am I on an outline — but never "where am I along this line".

## In this codebase

The build view's hidden lines were first found in the pixels: a depth peel of
the second layer into an id buffer, edge-detected, and dashed on `x + y`. On an
isometric ellipse the dashes ran from 2 px to 30 px round one curve.
`src/ui/components/hidden-lines.ts` makes them geometry instead — creases from
`EdgesGeometry` chained once by shared endpoint (`chainEdges`), silhouettes
rebuilt on each paint because they follow the camera — and writes every
stroke's screen-space arc length into an `along` attribute that the ghost
shader in `shaders.ts` dashes by (`fract(vAlong / dash)`), drawn through the
fill's depth with `GreaterDepth`. A closed loop is stretched to a whole number
of dashes so the seam never shows. The peel stays for what a fragment can
answer: the uniform hidden wash, and whether a silhouette fragment lies on its
part's hidden footprint (`contour`). #85

## What made it real

Two pixels to thirty on a single ellipse — a fifteen-fold spread in what should
be one period — short where the stroke crossed the screen diagonal and endless
where it ran along it. After the rewrite every dash on the preview reads the
same length on an ellipse as on a vertical; no suite measures dash length, and
the design snapshot is untouched because the drawing feeds nothing back.

## Key takeaway

A period along a line is arc length, and arc length lives in the geometry — a
fragment can say what is behind it but never how far along its stroke it is.
