---
paths:
  - "src/data/**"
---

# The part tables

`src/data/` is measurements from a specific KSP install, not configuration.
Changing a number here is changing a measurement.

- **A drag cube can be wrong, and three of them were.** `src/data/geometry.json`
  is a transcription of one install's `PartDatabase.cfg`, and KSP generates a
  cube for any part that does not ship one. ReStock replaces the Mammoth's, the
  Twin-Boar's and the RAPIER's models and — unlike the Rhino's, the Mainsail's
  and the Skipper's, which it patches with a hand-authored `DRAG_CUBE` —
  supplies none with them. KSP therefore generated cubes from the new models and
  produced garbage: the Mammoth's bounding box came out 499 x 25.1 x 741 m,
  centred 151 m to one side and 271 m in front of the part it bounds, and its
  axial and side face areas came back byte-identical, which no real part gives.
  Re-baking does not fix this — the cause is in the ReStock asset, so the same
  numbers come back. Those three heights, and the Mammoth's and Twin-Boar's
  areas, are read from stock installs instead and are the only values here not
  measured from the reference install.

  The cheap test for the next extraction, which needs nothing but the file
  itself: divide a part's axial face area by the footprint its own box claims,
  `YP / (pi/4 * size_x * size_z)`. Across 524 parts that is 0.983 — a cylinder
  fills its own bounding box. The three bad ones read 0.00003, 0.014 and 0.055.
  Anything under about 0.1 that is not a dish or a solar panel is a cube that
  does not describe its own part.
