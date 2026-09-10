# Let the Body Decide the Sign

**Why it matters:** any time an orientation is read from an authored data
field whose sign convention the sources do not agree on — a normal, a mounting
node's direction, an "up" vector typed by hand.

## The concept

A direction vector in authored data carries two facts: an axis and a sense. The
axis is usually reliable; the sense often is not, because different authors
flipped it, an exporter re-signed it, or the original consumer never cared which
way it pointed. When the same data also carries the shape the direction
describes, the sense can be recovered from the shape: a body sits on one side
of its mounting point and not the other, and no author can get that wrong. Use
the field for the axis and the geometry for the sign.

## In this codebase

`tools/engine-meshes.mjs` frames a radial engine's mesh on its `node_attach` —
a point and a direction from the part config — with the attach point at the
origin and the wall at −x, so the renderer can stand it on a tank's wall. The
stock Puff's direction points out of the part where the Thud's points into it.
`measure` rotates the mesh so the node's axis lies along x, then sums the
vertices' x: a negative centroid (`cx < 0`) means the body landed on the wall's
side, and the mesh is mirrored through the origin. `test/engine-meshes.test.ts`
then holds every radial file to its declared width along and out from the wall.
#164

## What made it real

Nothing was measured beyond the two configs disagreeing; the reasoning is that
an engine's centroid cannot sit inside the tank it bolts to, so the centroid's
sign is the sense. Twelve files — seven stock, five ReStock — frame
consistently under the rule, and the gallery draws each beside its tank with
the bell outboard.

## Key takeaway

When a direction's sense is unreliable, take the axis from the field and the
sign from the geometry it describes.
