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

- **`engine-profiles.json` is measured from the meshes, and the tool that
  measures it is in the repository.** The drag cubes carry a height and a face
  area and nothing about a bell; the shapes live in the install's `.mu`
  files, which `tools/engine-profiles.mjs` reads directly — the part configs
  for which mesh, at what scale, in which default variant, with which shroud
  hidden; ReStock's patches for the parts it remodels; then the transform
  tree walked and the triangle edges binned by height below the top node
  (a tube has vertices only on its end rings; binning vertices alone reads
  the wall between as radius zero — the first pass drew every engine as
  diamonds on a thread). The root object's transform is dropped, as the
  game drops it: it is where the prefab sat in the Unity scene, and left in
  it put the Cub twenty-nine metres off its own axis. A cluster's bells are
  each measured about their own thrust transform, and `n` is how many the
  hull has notches between at the base — a count of transforms alone would
  make the RAPIER four, and the two by the Cherenkov's mount belong to a
  variant. What the meshes settled against what the parts are said to be
  modelled on: the stock Poodle is a twin (the 1.9 revamp), the ReStock one
  too, the Kodiak is four chambers, the Bobcat two. `tools/README.md` has
  the packing script for the install and the run; the `FL-S1200` is the one
  engine unmeasured, being a tank in the pack's terms.

- **Six parts have no measurement anywhere.** The Nerv and the five engine
  plates carry `DRAG_CUBE { procedural = True }` — KSP computes them at runtime
  because the shroud varies with what is mounted inside. They fall back by
  design, in every regime, and no re-extraction will ever fill them in.
