---
paths:
  - "src/craft/**"
  - "src/core/craft.ts"
  - "test/craft/**"
---

# The craft file

`src/craft/` reads and writes KSP `.craft` files and knows nothing else: no
solver, no part table, no React. `src/core/craft.ts` is the one adapter from a
delivered plan to a `Craft`, and the only module allowed to import
`src/craft/`. `test/boundaries.test.ts` holds both directions. #460, #462

- **The file is the spec; the write-ups are wrong where they differ.** Read
  off files KSP 1.12.5 wrote: `link = <name>_<uid>` is the child's token, not
  an index, and the root is the part nothing links to; `dstg = 0` is both "stays
  to the end" and "leaves in the last stage", the game does not distinguish;
  every unstaged field is `-1`; a free stack node is written
  `attN = <node>,Null_0_<p>_<d>_<p>_<d>`. One circulating spec says `link` is a
  0-based index with `-1` for the root. It is not.

- **The game cuts a line at `//`, wherever it falls.** Its reader treats `//`
  as a comment anywhere on a line, so a URL in `description` ends at `https:`.
  `checkCraft` refuses a description with `//` or a newline in it; the adapter
  writes the link's hash, not the link.

- **`pos` is trusted on load.** KSP re-derives nothing from the nodes, so a
  wrong position is a wrong rocket that still loads. Place by stack node —
  `child.pos = parent.pos + parent.bottom − child.top` — never by the drag
  cube's height: a tank's box overhangs its nodes by 50–100 mm and an engine's
  bell hangs past its bottom node (`.claude/rules/part-data.md`, #461).

- **Two layers, and the lossless one is underneath.** `node.ts` parses and
  prints ConfigNode text with nothing dropped and is held to
  `printNode(parseNode(t)) ≡ t` canonicalised; `craft.ts` reads the fields a
  `Craft` carries and drops the rest. Put a new field in `Craft` only when the
  adapter needs to set it; a field the game writes that we do not carry is
  read and forgotten, by design.

- **Numbers go through `format.ts` and nowhere else.** Nine significant
  digits, no exponent, `-0` written `0`, as .NET writes them. A caller's
  numbers with nine digits or fewer come back the same, which is what the
  property test holds; the adapter rounds to millimetres before it hands
  positions over.

- **Ids are the caller's, and deterministic.** The writer invents nothing: a
  `CraftPart.id` is a decimal 32-bit number the adapter derives from the part's
  place in the tree, so the same plan writes the same bytes (the
  same-link-same-result rule). `persistentId`s are FNV-1a hashes of the tokens.

- **Refuse, do not repair.** `writeCraft` runs `checkCraft` and throws on the
  first problem rather than writing a file the VAB loads with a hole in it. A
  craft with problems is the adapter's bug.

- **The adapter places from the model and stands by the nodes.** `craftOf`
  in `core/craft.ts` takes x and z from the same `stageGeom`/`columnsOf`/
  `boosterLayout` the drawing uses and y from a node walk, so the file and
  the picture agree in plan and the game gets the heights it trusts. The
  sweep holds four things on every delivery (`test/craft-checks.ts`): the
  craft passes `checkCraft` and round-trips; every drawn part has a craft
  part at its x, z (by attach point where it is bolted on; engines under a
  coupler stand on the coupler's nodes instead); the height is bounded by the
  drawing's, less the boxes' overhang of the nodes; and per stage the parts'
  dry mass equals `sol.dry − payloadIn`, the propellant `sol.prop` less the
  ring's, the ring `n × part.m`. A part left out or doubled fails here, named.

- **A surface-held column hangs from its top tank.** The chain is built
  bottom-up with each part holding the one below, so the top part is the
  chain's root; a ring column, a packed tank or a booster column bolted on
  by any other tank would leave its top tank parentless — twelve roots on
  the first run. Every packed tank is its own part on its own TT-38K and
  strut, which is what the plan bills (`cols = r × levels`).

- **`sol.dry` carries the payload; `sol.prop` carries the ring's fuel.**
  `dry` is the stage's structure plus everything above it (`payloadIn`);
  `prop` includes the boosters' propellant, and a solid "engine" stage has no
  tanks at all — its fuel is the engine's. Reconcile against those, not
  against `tanks.prop`.

- **A part holds what the plan flies it with, not what its config says.**
  Tanks full, as the solver sizes them; an engine the table's `fuelM` — a
  solid's whole charge, the Twin-Boar's 32 t, nothing for an engine the table
  has dry — however much the install's config puts in it. The ReStock+ Pug
  carries 0.2 t in its config that the table does not know (#468); the craft
  empties it, so the file is the plan. `bill.ts` counts a fuelled engine's
  `fuelM` into the stage's propellant where `prop` does not (a tank stage's
  `prop` is the tanks' and adapters'; a solid stage's is `n × fuelM`).

- **An engine plate has no engine nodes in its config.** They are made at
  run time (`ModuleDynamicNodes`), so `nodes.json` carries `top` and `bottom`
  only; the adapter stands the engines where the model's cluster rule puts
  them, on nodes named `bottom01…` as the game names the plate's, rounded to
  the millimetre so they read back as written. Whether the game takes them
  is probe 4 of #467.

- **The round trip is the acceptance test.** `test/craft-roundtrip.test.tsx`
  mounts the app on each link in `test/fixtures/links.txt`, takes the
  `PlanInput` and plan the app actually made, and holds
  `readCraft(writeCraft(craftOf(...)))` equal to the craft and
  `billOfCraft` equal to `billOfPlan`. A new construct in the solver wants a
  fixture link here before it is delivered.

- **The game is asked through `tools/craft-tools.ts`, not by hand.**
  `npm run craft:probes` writes the ladder, `craft:diff` reads the game's
  saved copy against ours, `craft:log` reads `KSP.log`, `craft:conformance`
  runs the reader over a folder of the game's files; `tools/README.md` has
  the protocol. A question about what the game accepts gets a probe on the
  ladder, and its answer replaces the line below that asked it.

- **What the game said to probe 1 (#467, KSP 1.12.5 + ReStock).** A craft of
  `MODULE { name = … }` stubs loads in the VAB and launches. The game kept
  every position, rotation, parent and stage number as written, to the
  millimetre. It rewrote three things, and the writer now writes them its
  way: `istg` on a part with no icon is its stage's number (not −1), `sepI`
  is `dstg` for every part but the root, and `srfN` is the long form
  `srfAttach,<token>,<collider>,<p>,<d>,<p0>` with the collider left
  empty — `sqor` is what marks a staged part. And a ReStock engine with no
  `selectedVariant` in its `ModulePartVariants` stub draws nothing in the
  VAB (its variants are whole meshes; a tank's are textures) and appears
  only on the pad: the stub now carries the default variant from
  `nodes.json`.

- **Which way a part faces when bolted on is read off its drag cube.** Its
  body is on one side of its attach point and the parent on the other, and
  `SIDE` in `geometry.json` says which (`.claude/rules/part-data.md`): the
  Thud, the Twitch and the SRBs face away from the axis with their attach
  direction, the radial decouplers and a tank toward it. `facing` in
  `core/craft.ts` reads it. Two guesses came before: one rule for every part
  (the Thud's way) stood the TT-38Ks a half turn round in probe 2; a list of
  exceptions was the thing the reader would not have. The game itself turned
  probe 3's Thumpers to face away from a plain load-and-save, and left probe
  1's Thuds on a tank as written, so it re-derives a surface part's facing on
  a decoupler and trusts the file on a tank; either way the cube's side is
  what it arrives at.

- **A radial engine's origin is on the wall, and the radial engines turn to
  clear the boosters.** The Twitch's attach node is at its origin, so its
  `pos` is the wall point and the bell the model draws hangs outboard of it —
  placed at the bell's centre it stood 17 cm off the tank. The boosters keep
  the 0° and 180° planes, the ones a pilot turns in; `radialPhase` finds the
  phase of the engine ring (72 steps in one) that puts every engine furthest
  from the nearest booster, and the drawing and the craft both use it. Only
  where no phase clears them does the booster ring stand outboard of the
  engines, as it always did: pushed out regardless, probe 2's Shrimps hung
  half a metre off the tank on a TT-38K a quarter of that thick, and
  collided with the Twitches in the VAB.

- **A booster stands off the wall by its holder and its attach node's
  radius, not half its cube.** `attachHalf` in `core/nodes.ts`: the cube is
  the whole part, fins and nozzle, and a Kickback is 1.6 m over its fins
  where the decoupler meets a 1.27 m casing — drawn and placed at the cube
  it stood 0.12 m off its TT-70s in probe 3 and 0.25 m into the tank in the
  model. The same number sizes the holder (`holderFor`, solver.md) and draws
  the solid. What is left is the cube itself: the drag-cube standoff
  (`geometry.json`, 0.218 m for the ReStock TT-38K) runs about 3 cm past the
  face the game snaps a booster to — the collider, which only the `.mu`
  carries. `STANDOFF` is measured off the collider now: `radial-standoff.mjs`
  reads the holders' `.mu` files (`tools/mu.mjs`, shared with the engine
  meshes; `pack-radial.ps1` packs them) and takes the far face of every
  collider along the attach direction, the cube standing in only where no
  model was given. ReStock TT-38K 0.184 m against a hand-placed 0.1855;
  TT-70 0.568 where the cube said 0.69 — probe 5's Thoroughbreds; Manifold
  0.164 against 0.49. The ReStock cubic strut's model
  (`restock-cubic-strut.mu`) was not in the first pack and still reads its
  cube.

- **A liquid column is as wide as its widest tank, not its engine's size
  class.** A synthesised column carries the core engine's `sz` for
  compatibility, and measured as a part (`widthOf`) that is 1.25 m under a
  Vector on a 3.75 m S3 drop tank: the ring stood the tank a metre into the
  core in probe 5 and the VAB showed the two intersecting. `boosterWidth` in
  `geometry.ts` — the widest tank, or the engine where it is wider — is what
  `boostersFit`, `stageSize`, the layout and the drawing read; the column's
  engine is still drawn at its own width. The attach radius of a column is
  its lowest tank's, the one the holder is on (`tankRun(...)[0]`).

- **A ring stands its decoupler's thickness off the wall it is bolted to,
  and its bare face against the bells it clears.** `boosterRing(n, bd, wall,
standoff, half, clear)` is the largest of three radii: the wall plus the
  holder's standoff plus the attach radius; the widest thing the booster runs
  alongside below the tanks (`clear`, an engine cluster wider than the tank)
  plus the attach radius, with no decoupler between; and the ring's room for
  itself. Charging the standoff from the bells too held probe 9's columns
  0.24 m off the TT-70s meant to hold them (#467). A section too wide to
  clear even at the holder's reach — an engine cluster wider than the tank
  plus the decoupler — is not cleared by pushing the ring out: the foot stops
  on top of it and the booster stands beside the tanks only, as a builder
  mounts SRBs above a wide cluster. `boostersFit` judges a count at the
  holder's reach, never at the ring's own self-clearing radius, which made
  every count fit and gave Tylo 3.5 t eight boosters its TT-70s could not
  reach (#483); `stageSize` is the ring or the bells, whichever is wider.

- **The holder's reach is applied in node space.** `boosterLayout` hands
  the craft `footFree` — the foot with nothing holding it, the base or the
  cap — and the craft maps that to the core engines' nozzle plane, then
  raises it until the booster's attach node (a solid's own, a column's
  lowest tank's) is on the core's tanks, from the parts' nodes. The model
  applies the same rule with drag-cube lengths, and a Vector's bell hangs
  0.75 m past its node, so probe 11's columns came out 0.4 m under the
  core's nozzles where Brian wanted them level (#483).

- **EAS-4s cross every stage joint the plan braced — four, from a 2.5 m
  stage and from a 1.25 or 1.875 m one carrying ten tonnes or more.** From a
  stage's lowest tank, just above its bottom rim, to the stage below. Where
  that stage is a ring of columns, to the columns' top caps, one each, half
  a radius outboard of the centre (`interstageAnchors`): the columns hang
  from cubic struts at their middles and their tops swing under the stage
  above, and Brian's probe 6 flexed with four struts to the core's decoupler
  and flew with the same four moved to the columns' tops — "the key to fight
  the big moment arm of those tanks". More columns than braces, the ones
  nearest the quarter azimuths; fewer, the rest go to the wall through the
  gaps. No ring, all four to the wall of what the stage below ends in — its
  decoupler, or its top tank where a plate makes the joint — at the quarter
  azimuths, off the boosters' planes. Never two: a pair in one plane braces
  one axis, and probe 6's Nerv joint flexed with two until it had four. They
  break at separation, as the game's do (#483). `Solution.interstage` is
  what the plan charged for them (`fitStructure`, on every stage with a
  stage below), the bill counts them on both sides, and `craftChecks` holds
  the count and the anchors on every sweep mission.

- **The root is a command part the roster has researched.** `craftOf` takes
  `unlocked` and asks `commandParts` for one the tree has reached, then the
  nearest stack size and the lightest; any command part only where none is
  researched, since a craft needs a root and the first probe core is four
  tiers in. A part the save has not unlocked loads with a "missing part"
  warning in a career game (Brian's tier-6 save, #467).

- **Braces cross.** Each EAS-4 runs from a quarter of the core's run to the
  column's other quarter: a strut the length of the gap between two walls
  is 16 cm on a TT-70, cannot be seen and holds no shear — probe 11's were
  written that way and Brian found none in the VAB.

- **A booster's foot is at the stage base, and in the craft on the core
  engines' nozzle plane.** The lowest bottom node of the stage's engines
  (`Column.nozzleY`), not the stage's bottom node — on a plated stage that is
  the shroud's foot below the bells, and mapped there probe 9's columns hung
  0.9 m under the core's Vectors with their TT-70s off the bottom edge of the
  Jumbo-64. `boosterLayout` puts the foot at the bottom of
  what is under the tanks — engine, coupler, adapters — so the nozzles line
  up with the core's, as the game's rockets are built. A walk that stopped
  at the first section too narrow to bolt to (#86, #109) held probe 5's
  columns at the tank base over a 1.875 m plate with a wide Vector cluster
  below; since #438 the holder meets the booster's middle on the tank, so
  nothing hangs from what is beside the foot. The model stacks by drag cubes
  and the craft by nodes, and an engine's bottom node is not its cube's
  bottom — the Skipper's is 0.16 m below it — so the craft puts the foot on
  the core engines' nozzle plane where the layout's foot is at the base; a
  foot raised off the base is a distance from the tank base, the same in
  both frames. A radial-engine stage keeps the model's foot.

- **A column hangs from its lowest tank; its holders sit at its middle and
  its far quarter.** `stackTanks(…, up)` builds the column's chain holding
  upward, so the lowest tank is its root and the holder is at that tank's
  attach node — held by its top tank, probe 5's decouplers sat at the top of
  the column and the second above it. The second holder goes to the quarter
  of the tank run farther from the first. An SRB's first holder has to be at
  its own attach node, its middle, where the game snaps it, so its second is
  a quarter-length away and no more — the most spread the game allows.

- **Every part but the root autostruts to its grandparent; the tanks and
  the parts that join stages are rigidly attached.** The game reads
  `autostrutMode` and `rigidAttachment` off the craft on load whether or not
  Advanced Tweakables is on (it saved probes 1–6 back with them untouched),
  so the writer sets what a builder would: Grandparent holds a stack of many
  short tanks against the bending and the pad wobble Brian saw on tall thin
  rockets, without the joint changes Heaviest makes at staging. Rigid
  attachment (`CraftPart.rigid`, set by `Builder.place`) is on for every
  tank, stack decoupler, coupler, engine plate, rejoin and adapter — the
  stack's own joints — and off for engines, holders, boosters, struts and
  the root: probe 6 still bent with braces at every joint and it off, and
  Brian asked for it on the stack (#483). Launch clamps are the other half
  of the pad problem and are not written yet (#484).

- **An engine plate is written in the plan's shroud variant, hangs the
  stage below from that variant's bottom node, and fires with its
  engines.** `sol.shroud.v` is one of the plate's variants (Short …
  Long); each moves the `bottom` node by the shroud's length — 1.25 m down
  on Short, 5 on Long — and `nodes.json` carries the moved nodes as
  `variantNodes` (`tools/part-nodes.mjs`). Written in the default (Long)
  with the default node, probe 7's plates showed the wrong shroud and their
  lower stages hung from the wrong height; Brian's fix set Medium-Short and
  hung the tank from the shroud's foot. The plate's `ModuleDecouple` is on
  its bottom node, so it is staged with the engines above it, not with the
  stage it leaves in. Its engine nodes are made at run time, a set per
  count named `N<count>_<k>`, all on the plate's origin plane (y = 0 in the
  part): the engines hang from there, and the shroud reaches down past their
  bells to the variant's `bottom` node, which is the stage's foot and what
  the stage below hangs from. Placed the other way round — the node at the
  engines' tops — probe 8's Terriers hung from the shroud's foot and the tank
  below hung from a Terrier. The writer names the nodes as the game does; the
  game keeps the engines where they are written and lists its own N nodes
  empty. The
  boosted stage path (`boostedAscent`) now takes `plateAbove` too, so a
  launch stage under a plate no longer buys the TD decoupler the plate makes
  redundant (solver.md).

- **Every decoupler is staged, plates included.** The game gave probe 3's
  second TT-38Ks and probe 5's engine plates icons in their drop stage; the
  writer stages them there (`holdStage`, and `{ignite: drop, drop}` for a
  plate) rather than leaving `sqor` at −1, or the round trip disagrees.

- **A column is braced to the core with two EAS-4 Strut Connectors, written
  as compound parts.** Probe 4's 21 t S3-3600 columns each hung from one
  Cubic Octagonal Strut — a 1 kg part with a size-0 node — and let go under
  thrust; Brian's hand-strutted copy reached orbit (#483). `braceBetween` in
  `core/craft.ts` writes an EAS-4 bolted to the core wall reaching for the
  column's tank at the quarter points of its run, for ring columns (the cubic
  strut then hangs the column at its middle) and for liquid booster columns
  that are levers — tank run over twice the diameter — where the plan
  charged them (`Boosters.brace`). An empty collider name renders and
  connects: probe 12's crossed braces showed in the VAB.
  The game's compound-part format, from a two-tank sample: `partName =
CompoundPart`; `PARTDATA { tgt, tpersID, pos, rot, dir, col }` with `tgt`
  the target's id and `tpersID` its persistentId; `pos` and `dir` the far end
  from the part's origin in the part's own frame (through its `rot`), which
  the sample's end on the second tank's wall confirmed; PARTDATA's `rot` the
  turn that lays `dir` along +x; `col` the target collider's name, left empty
  — whether the game fills it in is round 11's question. The part's +x
  points into the wall it stands on, as a decoupler's attach direction does.
  `CraftPart.compound` carries it, the reader reads it back, and `checkCraft`
  holds the target to exist. The plan charges what is written (solver.md), so
  the bill's `braces` agrees on both sides.

- **Struts stand at the quarter points of the column's run, all with one
  roll.** `join{k}a` on the core at a quarter up the column's tanks, `join{k}b`
  on the column at a quarter down, clamped to the core's tanks; 0.4 m apart
  at the middle they braced nothing. `faceWith` for a vertical direction is
  the quarter turn onto x̂ then the turn about y to the azimuth — the
  shortest arc rolled the off-axis struts by their azimuth and probe 5's
  stood on a corner.

- **A booster tops out at the tank top where the stage above would meet
  it.** The stage above stands on the top tank, and where its base reaches
  out past the ring's inner face — a three-stack cluster over a 2.5 m core —
  a booster past the tank top is in its engines: probe 3's Kickbacks were
  0.15 m up the Terriers' bells. `boosterLayout(sol, g, tankBase, above)`
  lowers the foot until the top is level with the tank top, as far as the
  holder still meets the middle, and the model and the craft both pass the
  next stage in. the stage above's reach is its whole core width
  (`stageSize(...).coreWidth / 2`), a ring of stacks included — `span` left
  Mun 3.5 t's three-column upper stage out and the Kickbacks stood 9 cm into
  it (#483). A stage narrow enough to stand inside the ring is passed
  by, as the game allows, and the foot stays where the walk put it; the
  model test holds both halves.

- **A part whose attach direction is down its own axis is laid on its
  side.** The cubic strut's `node_attach` is its bottom face, pointing down;
  bolted to a wall the game stands it face-on, axis horizontal, and probe 4's
  stood upright with their nodes vertical. `faceWith` turns a horizontal
  direction about y as before, and a vertical one by the quarter turn about
  d × target; `SIDE` covers the strut (−1, body behind its attach point) so
  its bottom is the face on the wall and its top node points at what it
  joins.

- **A tank with no top node is not in the pool.** The FL-C1000 and the
  S3-3600 Nosecone have the nose built on, and the game will not stack under
  a part with no node there; every tank a run here has is under something.
  `topless` in `core/nodes.ts` reads it off `nodes.json`, `poolsFor` leaves
  them out. The round-trip suite found it when a design change put an S3-7200
  on an FL-C1000 (#467).

- **The probes are written in ReStock's art.** `craft:probes` solves the
  sweep's missions with `rs: true`, since they are checked in an install that
  has it, and a TT-38K is 19 mm thinner there than in stock. The sweep itself
  stays in stock.

- **The craft stands on the VAB floor.** The editor's origin is the floor,
  and a craft hung from its root at the editor's spawn height (y = 15) ran
  seven metres under it on probe 3, the Thumpers' tops just showing. The
  adapter shifts the whole craft so its lowest stack node stands
  `FLOOR_CLEAR` (1.5 m, a bell's length) above y = 0; a tall rocket may top
  the hangar, which is the game's ceiling and not ours.

- **Open until the game answers (#467):** whether a bare
  `PART` body with no stubs launches (`01-stacka-bare`); an engine plate's
  `bottom01…` nodes (probe 4); decoupler orientation; and what a `link` to
  the first part means in the game's own files (one 1.12.5 file has the
  last part `link` the first, which our reader takes as "the first part has
  a parent" — the game either re-roots to the first PART on load or reads
  `link` as an edge; our writer writes root first with links downward, as
  the game's 0.13 files are, and `craft:conformance` reports the other form
  as a note).
