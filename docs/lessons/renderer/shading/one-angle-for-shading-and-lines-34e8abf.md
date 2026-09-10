# One Angle for Shading and Lines

**Why it matters:** any drawing that shades a simplified mesh smoothly and also
inks its edges — technical illustration, CAD viewers, a schematic rocket.

## The concept

A simplified mesh is facets, and two decisions turn it into a drawing: which
facet junctions the normals average across (smooth) rather than split (a
shading break), and which junctions get a line. Both are a threshold on the
dihedral angle, and if the two thresholds differ the drawing lies — a line
where the shading is continuous, or a shading break with no line. One angle for
both means a line appears exactly where the shading breaks. The angle is
bracketed by the mesh itself: above the coarsest angle at which smooth facets
meet, and below the shallowest edge that is really an edge. Anything in the gap
is right.

## In this codebase

`engineGeometry` in `src/ui/components/three-view.tsx` runs
`toCreasedNormals(g, ENGINE_CREASE)` at 70°, and the crease pass builds
`EdgesGeometry(g, ENGINE_CREASE)` from the same constant, so a bell shades as a
curve and its lip is one line. The bracket: a ring of six facets — the coarsest
the simplifier leaves — meets at 60°, and no engine has a real edge shallower
than a right angle, so 70 sits between them. The revolved parts, forty-segment
lathes whose seams are 9° apart, take `CREASE_ANGLE = 30` instead, because
their only real crease is the 90° corner where a cap meets its tube. #85

## What made it real

A bracket rather than a measurement: 60° from the coarsest ring, 90° from the
shallowest genuine edge in the catalogue. Under 60 every facet of every bell
gets a line; over 90 the lip loses its. The choice was judged by eye on
`/gallery.html`, which draws all fifty engines beside their unsimplified
meshes; the design snapshot did not move because the drawing reads no solver
figure.

## Key takeaway

Shade and ink from one dihedral threshold, set between the coarsest smooth
facet and the shallowest real edge, and a line appears exactly where the
shading breaks.
