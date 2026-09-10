# A Record Can Be Checked Against Itself

**Why it matters:** whenever a measured record carries two descriptions of the
same shape — a bounding box and a face area, a length and a mass, a count and a
total — and one of them might be wrong.

## The concept

A shape's bounding box and its projected face area are not independent. A solid
roughly fills its own box, so the axial face area divided by the box's footprint
is a fill factor that sits near one for anything cylindrical and never near zero
for anything real. Two numbers measured from the same part therefore carry a
check on each other that needs no outside reference: compute the ratio the whole
population should share, and a record far outside it is not describing its part
at all. The check does not say which number is wrong. It says the record cannot
be trusted, which is enough to stop it entering the data — and it is cheaper and
more reliable than an eye looking for a height that seems too large, because the
eye also has to know what "too large" is.

## In this codebase

`src/data/geometry.json` transcribed the drag cubes of one Squad 1.12.5 +
Breaking Ground + ReStock+ install — a height in `PART_H` and a face area in
`PART_A` for each part; `main` has since split them into `stock` and `restock`
tables (#118). KSP generates a drag cube for any part that ships without one,
and ReStock replaces the Mammoth's, the Twin-Boar's and the RAPIER's models
without shipping cubes for them, so KSP generated cubes from the new models and
produced garbage: the Mammoth's box came out 499 × 25.1 × 741 m, centred 151 m
to one side and 271 m in front of the part it bounds, with its axial and side
face areas identical to four figures. Re-baking reproduces it, since the fault
is in the asset. Those three heights and two areas were read from stock installs
instead, three of which agree exactly, and are the only values in the file not
measured from the reference install. The check for the next extraction, from
`PartDatabase.cfg` alone, is `YP / (π/4 · size_x · size_z)`.

## What made it real

Across 524 parts the fill factor averages 0.983 — a cylinder fills its box. The
three bad cubes read 0.00003, 0.014 and 0.055; anything under about 0.1 that is
not a dish or a solar panel is a cube that does not describe its part. The
Mammoth went from 25.10 m tall to 4.144 and from 8.383 m² to 12.47 — the
"3.27 m across" that had illustrated a booster-placement rule (#109) was this
artefact, and the issue's own estimate of "about 5.6 m" was a third high, so a
plausible number typed by hand would have been wrong too. Nine of 81 grid
designs moved, all in the recorded aspect ratio of candidates already inside the
slenderness limit (`ar` 24.30 → 11.91 on one, `slim` true on both sides), and
one of thirteen missions re-staged from seven stages to six: a table that only
seemed to feed the drawing reached the solver through the slenderness limit.

## Key takeaway

Two measurements of one shape carry a check on each other — compute the ratio
the population should share, and a record far outside it is not a measurement of
its part.
