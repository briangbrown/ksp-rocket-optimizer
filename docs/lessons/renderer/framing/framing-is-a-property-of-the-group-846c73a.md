# Framing Is a Property of the Group

**Why it matters:** whenever several views of one model sit side by side and the
reader is meant to read across them — a drafting sheet, a plan under an
elevation, a before beside an after.

## The concept

A function that frames one view fits the model to its panel: the scale that
makes the model fill the room, centred. Give each panel of a sheet that
treatment and each gets its own scale, and the alignment a sheet exists for is
gone — the plan's outline of a booster no longer sits under the elevation's.
Alignment means one scale, so the scale has to be chosen once, for the group,
from the group's extents and the room. For each way the cells can bind — the
stacked views against the height, the side-by-side views against the width —
take the scale that would just fit, and the tightest wins. Each camera's frustum
is then simply its panel in model units, width and height over the scale. And
the panels aligned along an axis share their cell width whatever their own
content reaches, because a cell sized to its content is a cell that has drifted
off the axis.

## In this codebase

`fitOrtho` in `src/ui/views.ts` frames one view. `sheetSizes` beside it takes
the front, right and plan extents with the row's room and returns one `scale`
and the four cells; `ThreeView` accepts it as a `scale` prop and, when present,
overrides `cameraFor`'s fit with `halfW = width / (2 * scale)`. The plan's cell
is given the front elevation's width rather than its own reach. The isometric, a
pictorial view, frames itself as it would on a paper sheet. `build.tsx` lays the
sheet out at 1024 px and up; below that the phone keeps two panels.

## What made it real

Measured in the browser, the front elevation's drawing and the plan's were the
same 156 px wide. `test/three-view.test.ts` checks that the scale is one number:
for a 30 m rocket with a 3 m plan, `(front.h − 16) / (2 · 1.1 · 15)` and
`(plan.h − 16) / (2 · 1.1 · 3)` both equal `scale`, and a pencil widened to the
120 px panel floor keeps all three orthographic cells the same width. Nothing in
the model changed — design snapshot and mission sweep untouched — since the same
shapes are projected four ways.

## Key takeaway

When views must read across each other, the scale is a decision about the group,
not about any one view — choose it once from the tightest constraint and hand it
down.
