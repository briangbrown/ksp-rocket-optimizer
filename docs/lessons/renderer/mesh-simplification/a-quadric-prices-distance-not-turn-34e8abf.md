# A Quadric Prices Distance, Not Turn

**Why it matters:** any mesh simplification whose result will be shaded
smooth — quadric edge collapse optimises a metric that is blind to what smooth
shading shows.

## The concept

Quadric error metrics price a collapse by how far the merged vertex sits from
the planes around it. On a faceted cylinder that distance is tiny: merge two
adjacent ring vertices and the surface moves by the sagitta of one facet. But
the facets either side turn by a whole segment angle, and under smooth normals
the turn is exactly what the eye sees — a sixteen-segment ring becomes eight
and the shading hard-edges every facet while the metric reports almost no
error. The fix is to price what the metric cannot see: add the turn each
affected face makes, as area × (1 − cos θ), scaled so a modest turn costs as
much as a large displacement. Smooth surfaces then keep their rings and the
budget goes to the details that are all turn and no size. Forbidding turns
outright does not work: a bolt head is nothing but turns, and the simplifier
stalls on it.

## In this codebase

`simplify` in `tools/engine-meshes.mjs` collapses the game's engine meshes into
`public/engines/`. Its cost is `qeval(q, c) + TURN * extent² * turnOf(a, b, c)`,
memoryless after Lindstrom and Turk — each edge priced against the planes as
they stand, since a quadric accumulated over a long chain of collapses drifts
off the true surface. `TURN = 40`: a face turning fifteen degrees costs what
moving it the part's whole extent would. A face turned past `dot < 0.2` is a
flip and is refused outright. #85

## What made it real

Under the quadric alone a sixteen-segment ring went to eight, and every facet
became a crease under the renderer's 70° crease-split normals. With turns
forbidden rather than priced, the Mammoth pinned at nine thousand vertices.
Priced, the Vector went from 13,382 faces to 2,230 with its cone smooth and its
forty cooling ribs kept. The budget itself — one face in six, floored at 1000
and capped at 3000 — was set after a fixed thousand ate the Vector's
circumference around the ribs and the Spark's three thousand faces needed no
more than they had.

## Key takeaway

A distance metric cannot see a turn — when the result will be shaded smooth,
price the normals' turn into the collapse or the budget is spent where you
cannot see it.
