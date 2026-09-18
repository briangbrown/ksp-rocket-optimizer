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

- **Open until the game answers (#467):** whether a bare `PART` body with
  `MODULE { name = X }` stubs launches; the `srfN` long form carries a collider
  name we do not have, so the writer emits the two-field form
  `srfAttach,<token>`; whether a ReStock variant needs `ModulePartVariants`
  state named to draw the ReStock model. And what a `link` is to the game: in one 1.12.5 file the last part
  `link`s the first, which our reader takes as "the first part has a parent"
  and `checkCraft` as "not the root" — the game either re-roots to the first
  PART on load or reads `link` as an edge rather than a child; our writer
  writes root first with links downward, which the game's own 0.13 files
  are, and `craft:conformance` reports the other form as a note, not a
  failure. Each is a probe in the ladder; the
  answer replaces this line.
