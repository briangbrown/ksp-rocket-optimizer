# A Wrong Drawing Is a Wrong Constraint

**Why it matters:** whenever one geometric model feeds both a picture and an
optimiser's constraints — a rendering and a bounding box, a layout and a
collision check, a schematic and a slenderness limit.

## The concept

When a drawing is wrong the temptation is to file it as cosmetic. But if the
drawing and the constraint read the same geometry, the picture is only the
visible symptom of a constraint that has been wrong all along. Fixing the
picture in the drawing code alone removes the symptom and leaves the constraint
wrong; fixing the shared geometry moves the answers, and the answers moving is
the proof the constraint was biting. Scope a geometry fix by who reads the
geometry, not by who noticed the bug.

## In this codebase

`stageGeom` in `src/core/geometry.ts` is the single source of stage geometry:
`modelOf` in `src/core/model.ts` draws from it, and the solver's slenderness
limit and drag area are measured from it. A radial engine — a Thud, a Twitch —
bolts to the side of a tank, but `stageGeom` treated every engine as a stack
engine: a full engine length under the tank and a cluster tiling its base.
Drawn, two Thuds were a two-bell cluster under a 1.25 m tank. Measured, the
stage was too tall and too narrow, so the slenderness rule refused rockets that
were fine. #164 put the engine on the wall in both places at once: a radial
stage spans `td + 2·ed`, and the stack grows only by `RADIAL_HANG`, a quarter of
the engine's length.

## What made it real

Eighteen lines of the 81-design snapshot moved, every one a chain with a Twitch
or Thud stage. Aspect ratios fell — 9.36 → 5.45, 5.30 → 3.35, 9.56 → 5.57 — and
one design changed outright: tier9-pay0.8's 6× Twitch + FL-T800 stage became
5× Twitch + FL-T400 + Doughnut, score 13345 → 9973, a shorter tank pair the old
geometry had ruled too slender. In the solvability sweep Minmus went from
67.8 t in two stages to 57.2 t in three, and a Spark stage above a Twitch stage
packed six Oscar-Bs into a ring because `roomBelow` now counted the engines
beside the tank. None of those numbers is a drawing.

## Key takeaway

Scope a geometry fix by everyone who reads the geometry — if an optimiser
measures the same shape the renderer draws, the wrong picture was a wrong
constraint.
