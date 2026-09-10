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

- **The engines are drawn from simplified copies of the game's meshes, and the
  tool that makes them is in the repository.** `public/engines/<art>/<title>.json`,
  one file an engine, made by `tools/engine-meshes.mjs` from a zip
  `tools/pack-engines.ps1` packs on the machine with the install (`tools/README.md`
  is the procedure). The drag cubes carry a height and a face area and nothing
  about a bell, and a radius-against-height profile — the first attempt — is
  a body of revolution, which two bells or four can never be; the mesh is
  the shape. The tool reads the part configs for which mesh, at what scale,
  in which default variant, with which shroud hidden; ReStock's patches for
  the parts it remodels; walks the transform tree with the root's own
  transform dropped, as the game drops it (left in, the Cub sat twenty-nine
  metres off its axis — it is where the prefab sat in the Unity scene); takes
  every visible triangle with the top node at y = 0 — a radial engine has no
  stack node and is framed on its `node_attach` instead, the attach point at
  the origin and the wall at −x, its `w` the greater of its width along the
  wall and its reach out from it; the configs do not agree on which way the
  node's direction points (the stock Puff's is the Thud's reversed), so the
  body's side decides, and the renderer stands the origin on the tank and
  turns it to face the axis (`face` on the model part, #164); welds the
  texture seams
  (the game splits a vertex wherever one runs, and unwelded each seam is a
  crack the simplifier may not close); and simplifies by quadric edge
  collapse — Garland and Heckbert, in the memoryless form of Lindstrom and
  Turk, where an edge is priced against the planes round it as they stand
  rather than a quadric accumulated over its history, which drifts on a long
  chain of collapses; the local quadric's own minimiser is refused when it
  lands farther from the edge than the edge is long, since the planes round
  one edge are often nearly coplanar and the solution then a needle out of
  the surface — the Boar grew one — to one face in six, floored at a
  thousand faces and capped at three thousand (`KEEP`, `FLOOR`, `CEIL`). A
  fixed count was wrong both ways: the ReStock Vector is a smooth cone under
  forty cooling ribs, and at a thousand faces the simplifier, unable to
  afford the ribs, ate the cone's circumference around them and drew a lumpy,
  crossing silhouette; the Spark has three thousand faces and needs no
  more. The gallery's Full switch draws `public/engines-full/` (the tool's
  `--full`) beside the simplified files for judging this — with the boundary
  loops weighted so a lip does not
  creep inward, a collapse that would flip a face refused, and **the turn a
  collapse puts on its faces priced into the cost** (`TURN` in the tool):
  a quadric measures distance, and merging two ring vertices on a cylinder
  moves the surface very little while turning its facets a lot, so left to
  the quadric alone a sixteen-segment ring became eight and every facet an
  edge to the shading. Priced, the budget goes to the bolts, pipes and
  struts — all turn and no size — and the smooth surfaces keep their rings.
  Forbidden outright instead of priced, it pinned a Mammoth at nine
  thousand vertices. The first pass was
  vertex clustering onto a grid, and it drew lumps: not curvature-aware, not
  normal-preserving, slivers everywhere, and flat-shaded on top. Millimetres,
  as integers. ReStock's engines carry a collar above the node that sits
  inside the tank; it stays, hidden by the tank. Under `public/`, not
  `src/data/`: a rocket needs three or four engines, and fetching those is
  cheaper than shipping eighty in the renderer's chunk — nothing here crosses
  the seam. Prettier leaves the folder alone (`.prettierignore`) because laid
  out the files would be ten times the bytes. The `FL-S1200` is the one
  engine unmeasured, being a tank in the pack's terms; it draws as the drum.

- **Six parts have no measurement anywhere.** The Nerv and the five engine
  plates carry `DRAG_CUBE { procedural = True }` — KSP computes them at runtime
  because the shroud varies with what is mounted inside. They fall back by
  design, in every regime, and no re-extraction will ever fill them in.

- **A part with no tech node is not available, and a node's spelling is the
  tree's.** Every gate — the tank filter in `app.tsx`, `couplersFor`,
  `pickStruct`, `radialJoin` in `parts.ts`, `tanksFor` in `test/grid.ts` —
  reads `!!x.t && unlocked.has(x.t)` and fails closed. It read `!x.t || …`
  and passed anything with no node at every tier, which is how seventeen
  Making History tanks with `t: null` — rows filled in from outside the
  install the configs came from, price left blank too — were building S4
  tanks on a roster that had not researched them (#191). The same test that
  names those seventeen (`test/parts-data.test.ts`) also found the
  TVR-2160C Mk2 Stack Quad-Coupler behind "Advanced Metalworks" where the
  tree spells it "Advanced MetalWorks": it had never been available. A
  node's name is a key into `tech.json`, so it is copied from there, not
  typed. The seventeen's nodes and prices were then recorded from their
  `.cfg` files (`TechRequired`, `cost`; five nodes, Fuel Systems to
  High-Performance Fuel Systems); `tools/README.md` says what was packed,
  for the next row that arrives the same way.

- **ReStock+ hides its Making History stand-ins, and so must the roster.**
  Six engines and fifteen tanks in ReStock+ — the Caravel, Galleon,
  Schnauzer, Ursa, Castor, Trash Panda, the FL-X 1.875 m tanks, the Kerbodyne
  SIV 5 m tanks and their adapters — exist for players without the expansion
  and carry `MHReplacement = True`; `ReStockPlus/Patches/MakingHistoryPartHiding.cfg`
  sets `TechHidden` and `category = none` on every one of them
  `:NEEDS[SquadExpansion/MakingHistory]`. A player with both mods never sees
  them, and the app was building a Kerbol fly-by on a Caravel. The rows carry
  `mhr: 1`, read from the merged `ModuleManager.ConfigCache` of an install
  with both, and `offered` in `src/core/constants.ts` is the one rule for what
  an install has: an expansion's part needs its expansion, either will do
  where a part has both flags, and an `mhr` part is offered only while Making
  History is absent. Every roster gate — the two filters in `app.tsx`,
  `couplersFor`, the tree in the setup sheet — reads it, and the mission sweep
  fails on a delivered part the install does not offer.
  `test/parts-data.test.ts` pins the twenty-one. The engine plates are the
  case for the either-flag rule: Making History and ReStock+ both ship them,
  EP-18 to EP-50 with the same mass, price and node, so one row carries `mh`
  and `rs`. Before this the plates were ReStock+-only, so an install with
  Making History and no ReStock+ was denied engine plates it has. The one
  approximation: Making History's EP-12 is 150 funds behind General
  Construction where ReStock+'s is 200 behind Advanced Construction, and the
  row carries the ReStock+ figures. It could be two rows, but the design
  grid solves with no expansions stated, which offers everything, and the
  cheaper row moved the price of every EP-12 in the snapshot by 50 funds
  for no design change — not worth a re-bless. If the grid ever states an
  install, split the row then.

- **`cet-l08.json` is a colour map, and it is somebody's work.** The 256 × 3
  byte table is CET-L08 from colorcet.com — Peter Kovesi's linear
  blue–magenta–yellow map, `CET-L08.csv` in the site's
  `CETperceptual_csv_0_255.zip`, unchanged — under Creative Commons BY. The
  licence asks for credit and the site's Cite section asks for the site and
  the paper: _Peter Kovesi. Good Colour Maps: How to Design Them.
  arXiv:1509.03700 [cs.GR] 2015_. The Setup sheet's _Attribution_ carries
  both, and `test/cet.test.ts` holds the table's two ends against the
  download, so a re-export that picked a neighbouring map (L06 is blue to
  white; L09 blue to yellow through green) fails there rather than in the
  plot. #213
