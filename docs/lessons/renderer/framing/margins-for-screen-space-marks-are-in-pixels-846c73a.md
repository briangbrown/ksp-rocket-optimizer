# Margins for Screen-Space Marks Are in Pixels

**Why it matters:** any drawing that mixes quantities in model units — the shape
— with quantities in screen units — a stroke width, a marker, a label — and
leaves air around the shape.

## The concept

Air specified as a fraction of the shape scales with the shape: ten per cent of
a 30 m rocket is plenty, ten per cent of a 2.5 m disc at the same scale is
almost nothing. A stroke drawn a few device pixels outside the silhouette scales
with nothing — it is the same width whatever the shape — so a proportional
margin protects it when the shape is large and fails when the shape is small,
which is when there is least reason to notice. The margin that protects a
screen-space mark needs a screen-space term of its own: take the pixels off the
room first, choose the scale for what is left, then add them back to each cell.
Done in that order the scale stays one number for the group and the cells stay
aligned.

## In this codebase

`sheetSizes` in `src/ui/views.ts` had only `SHEET_AIR` — 1.1, ten per cent each
side, in metres. On the boosters-away staging step, whose plan is a single 2.5 m
disc, the outline pass in `ThreeView`, drawn a few device pixels outward from
the silhouette, was clipped top and bottom. `SHEET_PAD` — 8 CSS px each side of
every orthographic cell — is now subtracted from the row's height and width
before the scale is chosen and added to each cell after, so the plan is still
exactly the front elevation's width.

## What made it real

At the sheet's scale, ten per cent of a 2.5 m disc came to two pixels of air,
less than the outline's own offset. With the pad the plan measured sixteen
device pixels of air above and below its drawing. `test/three-view.test.ts`
reads the shared scale back with the margin removed — `(plan.h − 16) / (2 · 1.1
· 3)` equals `scale` — which is what pins the order of operations.

## Key takeaway

Anything drawn in pixels needs its margin in pixels; a proportional margin
vanishes with the shape it was proportional to.
