# A Seam Is Found by Id or Not at All

**Why it matters:** any renderer that draws outlines in screen space — from
depth, normals or an id buffer — over a model whose parts butt together with the
same profile.

## The concept

A screen-space outline pass draws a line where neighbouring pixels disagree.
Depth disagrees at a silhouette; normals disagree at a crease. Two cylinders of
one radius, stacked end to end on one axis, disagree in neither: the surface is
continuous in depth and in slope across the join, so to those two channels the
join is not there. The third channel, a per-part id rendered to its own target,
sees it — but only if the two cylinders were two parts when drawn, each with its
own id. One mesh carries one id. Whatever the shader does, a body drawn as a
single shape has no seams, and the fix is in the model, not in the pass.

## In this codebase

`stageParts` in `src/core/model.ts` pushed one `booster` shape per radial
column. A liquid column is an engine with a run of tanks above it, and a drop
tank is the run alone, but both were one cylinder, and so seamless. It now
pushes the engine and then walks `tankRun(col)` a tank at a time — the same walk
the stack's own run is drawn by, so the two cannot disagree about a run's
length. The ids are rendered in `src/ui/components/three-view.tsx` to
`idTarget`, nearest-filtered so that no boundary pixel blends two ids into a
third. `.claude/rules/renderer.md` carries the rule as "a line exists only where
the model has two parts"; this is the reason behind it.

## What made it real

Three `UR-2 'Caravel'` columns of four tanks over a 9.24 m run went from three
shapes at h = 11.95 to fifteen — three engines at 2.71 and twelve tanks at 3.83,
3.83, 1.02, 0.55 — with the totals matching to a centimetre, so the framed
extent did not move. The test written for this fault after #71, "draws a tank
run tank by tank", counted only the stage's own tanks, so the ring was invisible
to it on both sides of the change.

## Key takeaway

Outline shaders find discontinuities; a join between two identical profiles has
none, so it can only be drawn from an id — and an id exists only where the model
made a part.
