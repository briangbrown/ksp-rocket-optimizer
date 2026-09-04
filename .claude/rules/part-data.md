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

- **There are two sets of measurements, and which one is live is solve-scoped.**
  ReStock replaces the models of parts that already exist, so a part is a
  different size depending on whether it is installed — the Poodle presents
  4.853 m2 in a stock install and 2.899 in a ReStock one, the Vector is 1.931 m
  tall against 2.355. `geometry.json` therefore carries `stock` and `restock`
  tables, and `useArt` in `src/core/geometry.ts` picks one. It is called from
  `prepare` in the solver and from `planMission`, which are the two ways in, and
  the value persists for the drawing that follows the solve. Do not read
  `geometry.json` directly and do not add a third table for Making History:
  it adds parts and remodels nothing, so its parts appear in both, drawn with
  whichever art is installed. #118

- **A part title is not a unique key, and four of them were resolving to the
  wrong part.** KSP keeps the superseded model of a revised part in the game
  with the same title, hidden behind `TechHidden = true` and `category = none` —
  `liquidEngine` beside `liquidEngine_v2`, `Size2LFB` beside `Size2LFB_v2`. The
  extractor took whichever it met first, so the Twitch was recorded at 0.554 m
  where the part you can actually place is 0.5703, and the Twin-Boar at 8.707
  where it is 8.716. The generator prefers the visible part. With all three mods
  installed 22 titles name two parts; the rest of the duplicates are engine
  plates, which have no cube in any install and so cannot disagree.

- **`engine-shapes.json` is authored, and says so.** It is the one table here
  that is not a measurement: how each engine is drawn — bells, plate, body —
  as proportions of the envelope the solver sized it at. The shapes live in
  the install's `.mu` meshes, which are not published, and the drag cubes
  carry a height and a face area and nothing about a bell (#85 has the
  numbers: every liquid engine measures no wider than its mount). What is
  known about a part is what it is modelled on — the Terrier an LMDE, the
  Mammoth four RS-25s, the ReStock Poodle the four-chamber RD-0124 — and the
  table says that, in fractions, and stays inside the measured envelope by
  construction, so nothing the solver judged moves. A number in it is a
  judgement about a picture, not a fact about the game; change it when the
  drawing reads wrong, and say that is why. `restock` overrides the stock
  entry where ReStock's remodel changes the count of bells, chosen by the
  same `useArt` that picks the geometry table. The three cluster calls made
  from descriptions rather than from a screenshot are the ReStock Poodle,
  the Ursa (RD-107) and the Corgi (4× RL-10) — the preview is where they
  are checked.

- **Six parts have no measurement anywhere.** The Nerv and the five engine
  plates carry `DRAG_CUBE { procedural = True }` — KSP computes them at runtime
  because the shroud varies with what is mounted inside. They fall back by
  design, in every regime, and no re-extraction will ever fill them in.
