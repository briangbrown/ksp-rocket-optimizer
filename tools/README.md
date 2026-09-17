# tools

Scripts that read the game's own files to produce what lives in `src/data/`.
They run against an install this repository cannot see — Squad 1.12.5 with
Making History, Breaking Ground, ReStock and ReStock+ — so each one comes in
two halves: something to run on the machine with the install, and something
to run here on what it produced. `CLAUDE.md` and `.claude/rules/part-data.md`
say what the numbers mean once they are in.

## Engine meshes — `public/engines/`

How each engine is drawn: a simplified copy of its mesh in the game, one
file an engine, fetched by the renderer when the engine is first drawn. #85

1. On the machine with the install, from a PowerShell prompt in the KSP root
   (the folder with `GameData` in it):

       powershell -ExecutionPolicy Bypass -File tools\pack-engines.ps1

   It writes `ksp-engine-models.zip` to the desktop: every `.mu` and `.cfg`
   on a path with `Engine` in it, ReStock's patches, and `PartDatabase.cfg`.
   Tens of megabytes; no textures.

2. Here:

       node tools/engine-meshes.mjs path/to/ksp-engine-models.zip

   It reports what it could not measure and rewrites `public/engines/`. With
   `--full` it writes the welded, unsimplified meshes to `public/engines-full/`
   instead — ten megabytes, for the gallery's Simplified / Full switch and
   nothing else; the application never fetches them. With
   `--check` it compares instead and exits 1 on a difference, which is how to
   tell whether a game or mod update moved a shape. Prettier ignores the
   folder on purpose; do not lay the files out.

What it does, in one paragraph, and why each step is there: it finds each
engine's part config (by the `slug` `parts.json` carries, else the title,
else the nickname — one stock title has a typo in the game's own file), reads
which meshes the part uses at what scale, which variant is the default and
what that variant hides, and which objects are a jettisonable shroud; applies
ReStock's `@PART` patches for the parts ReStock remodels (a model swap, a
rescale, variants); walks each mesh's transform tree with the root's own
placement dropped, because that is where the prefab sat in the Unity scene
and the game discards it; takes every visible triangle in world space with
the top node at y = 0; welds the texture seams; and simplifies by memoryless
quadric edge collapse (each edge priced against the surface as it stands, not
a quadric accumulated over its history) to one face in six of the welded
mesh, never fewer than a thousand faces nor more than three thousand,
boundary loops protected so a bell's lip keeps its radius, face flips refused,
and the turn a collapse puts on its faces priced into its cost so the smooth
surfaces keep their rings and the budget is spent on bolts and struts — the
result renders smooth under the renderer's crease-split normals, with the lip
a line. The
oldest stock files carry an undocumented word after the root transform; the
reader skips word by word past it, as taniwha's does.

Plain Node, no dependencies. The `.mu` reader is this repository's own,
written from the format; the files it produces are measurements, and the
part-data rules apply to them.

## Tank configs — the Making History gap

Seventeen Making History tanks in `src/data/parts.json` carried no tech node
and no price, because the configs the data was captured from had no
MakingHistory folder; the gates fail closed, so such a row is unavailable
until both are recorded from the configs — the `TechRequired` and `cost`
lines of each part's `.cfg` (#191, recorded 2026-09). The pack that closed
it, from a PowerShell prompt at the KSP root:

```powershell
Compress-Archive -Path "GameData\SquadExpansion\MakingHistory\Parts\FuelTank\*.cfg" `
  -DestinationPath "$env:USERPROFILE\Desktop\mh-tanks.zip"
```

Nothing else is needed: the values are read by hand into `parts.json`, the
config's node id mapped to the tree's name in `src/data/tech.json`
(`highPerformanceFuelSystems` → "High-Performance Fuel Systems") — the
tree's spelling is the key, and "Advanced Metalworks" for "Advanced
MetalWorks" hid a coupler for months. `test/parts-data.test.ts` holds every
part to a node the tree has.

## Power parts — the ion gap

An electric engine is an engine flying on nothing until the plant that feeds
it is on the rocket, and until #413 there were no panels, no batteries and no
generator in `src/data/` to put there. This pack is where they came from;
`sizePlant` in `src/core/power.ts` sizes and prices a plant from them, and
#415 admitted the engine where the stage's route lets the plant and the
spiral be priced. Every part here carries `rs` or `mh` where it is an
expansion's, read off the folder it was packed from, and `offered` refuses it
with the expansion off exactly as it refuses a tank.

1. On the machine with the install, from a PowerShell prompt in the KSP root
   (the folder with `GameData` in it):

       powershell -ExecutionPolicy Bypass -File tools\pack-power.ps1

   It writes `ksp-power-parts.zip` into that same folder: every `.cfg` that
   mentions `ModuleDeployableSolarPanel`, `ModuleGenerator`,
   `ModuleResourceConverter` or an `ElectricCharge` resource, every ReStock
   patch, and `Physics.cfg`. A couple of megabytes; no meshes and no textures.

   Matched on what a file holds rather than where it sits. The folder these
   parts live in has moved between versions and differs again under ReStock,
   and a wrong path guess fails silently by collecting nothing — where a module
   name does not move. It over-collects on purpose: a command pod stores charge
   too, and a few hundred kilobytes of parts nobody asked for is a much better
   failure than a missing battery.

2. Here:

       node tools/power-parts.mjs path/to/ksp-power-parts.zip

   It rewrites `src/data/power.json` and reports what it found. With `--check`
   it compares instead and exits 1 on a difference, which is how to tell
   whether a game or mod update moved a number.

What comes out: a panel's charge rate and whether it tracks the sun, a
battery's stored charge, the generator's output, a fuel cell's rates and what
it burns, and for each the mass, cost and tech node — mass and cost being the
whole point, since an ion stage that does not carry its own power plant is an
engine flying on nothing.

Two of those numbers are not in the files as numbers. **An engine's draw** is a
propellant ratio: KSP needs a mass flow of `thrust / (Isp · g0)`, the mixture's
density is the ratio-weighted sum of what it burns, and each propellant's rate
is the one divided by the other times its ratio. Electric charge is massless,
so it adds nothing to the density and all of the draw — the Dawn's 1.8 against
xenon's 0.1 at a density of 0.0001 comes out at 8.74 charge a second, which is
what the game shows. **A tech node** is named by its id in a config and by the
tree's own title in `src/data/tech.json`, and the two are not a transformation
of each other: `largeElectrics` is "High-Power Electrics". The gates fail
closed, so a name the tree does not have hides the part for good rather than
erroring; the tool carries the table and stops on an id it does not know, and
`test/power-data.test.ts` holds every name in it against the tree.

`Physics.cfg` gives the flux a panel's rate is quoted at — 1360 W/m² at the
homeworld's orbital distance — so the falloff with distance is read rather than
assumed. It goes as the inverse square, which is what makes an ion stage at
Eeloo need 111 Gigantors or 82 generators for its seven engines; the last test
in `power-data.test.ts` does that arithmetic and prints it.

The pack over-collects, since a command pod stores charge too, and the reader
keeps only what a power plant is made of. Three ReStock+ parts arrive named by
their id because that mod keeps its strings in a Localization folder the pack
does not take; the tool says which.

## Radial parts — the standoff

Anything bolted to the side of a stack stands off it by the thickness of what
holds it — a booster on a TT-38K, a packed tank on a TT-38K braced with a
cubic strut — and the model places every one of them flush (#422). And a
radial part hangs from its surface-attach node, so where that node sits along
a booster decides how high the booster can hang (#438). Neither number is in
`src/data/` yet: `structure.json` carries `d: null` for every radial
decoupler and `geometry.json` has no entry for them.

1. On the machine with the install, from a PowerShell prompt in the KSP root
   (the folder with `GameData` in it):

       powershell -ExecutionPolicy Bypass -File tools\pack-radial.ps1

   It writes `ksp-radial-parts.zip` into that same folder: every `.cfg` that
   mentions `ModuleAnchoredDecoupler` (the radial decouplers and the
   manifold), `strutCube` (the cubic strut), a `SolidFuel` propellant (every
   solid booster) or a `node_attach` line, every ReStock patch, and
   `PartDatabase.cfg` from the root. A few megabytes; no meshes and no
   textures. `PartDatabase.cfg` is the one that matters — the game writes it
   on first launch and it holds every part's measured bounding box — so if the
   script says it is missing, run the game once and pack again.

2. Here, with the zip unpacked:

       node tools/radial-standoff.mjs path/to/PartDatabase.cfg path/to/unpacked

   It writes `STANDOFF` into each art's table in `src/data/geometry.json` and
   prints what it found; with `--check` it compares instead and exits 1 on a
   difference. Hand it every `PartDatabase.cfg` you have — stock and ReStock
   measure the same part differently, and a database is matched to its art by
   the heights the table already carries — and anything with the part configs
   in it. The first run used a `ModuleManager.ConfigCache` from the install
   for the configs, which holds every part as the game loaded it, and the two
   databases already on hand from the engine work.

What comes out: the distance from a holder's attach point to its far face,
along the direction its `node_attach` says the parent lies in — the drag
cube's least extent that way. A TT-38K stands a booster 0.237 m off the tank
in stock and 0.218 in ReStock; a TT-70 0.69; a cubic strut 0.26. The same
files answered #438's question on the way: every stock and ReStock solid
booster carries its surface-attach node at `y = 0`, mid-height, which is
where the model hangs one.

## Part geometry — `PART_H` and `PART_A`

Every part's height and axial face area in `src/data/geometry.json`: the
height is the slenderness limit and the elevation, the area is drag and the
width a part presents. Both come off the drag cube the game measures from
each part's model and writes to `PartDatabase.cfg` on first launch, one table
per art because ReStock remodels parts that already exist (#118). The
generator that first wrote the file was not tracked, so the check that would
have caught a corrupt cube ran only from memory (#316).

1. On the machine with the install, `tools/pack-radial.ps1` (above) already
   packs what this needs: `PartDatabase.cfg` from the KSP root. The titles
   come from `ModuleManager.ConfigCache` in `GameData/`, which holds every
   part as the game loaded it and is the only file carrying both a part's id
   and its title; copy it alongside.

2. Here:

       node tools/part-geometry.mjs path/to/PartDatabase.cfg path/to/ModuleManager.ConfigCache

   It rewrites `PART_H` and `PART_A` in each art's table and prints what it
   measured and what it refused; with `--check` it compares instead and exits
   1 on a difference. Hand it every `PartDatabase.cfg` you have: one with
   ReStock's cubes in it is the ReStock art, one without is stock. The parts
   measured are every title in `parts.json`, `structure.json` and
   `couplers.json`; a title naming two parts takes the visible one (#120); a
   part with no cube — the Nerv, the engine plates — is left out and falls
   back.

What it refuses: any cube whose fill factor, the +Y face's area over the
footprint its own box claims (`YP / (π/4 · size_x · size_z)`), is under 0.1.
A cylinder fills its bounding box, so honest cubes run from 0.29 (the TT-70)
to a median of 0.98 among the parts placed; ReStock's Mammoth, Twin-Boar and
RAPIER ship no cube and the game generated garbage from their models, at
0.00003, 0.055 and 0.014 (#110, #112). A refused part takes the same title's
values from the other art on the command line — the stock cube is the wrong
shape for a remodelled part, but it is a shape — and the run says so. With
one database and a refusal it fails rather than guess. The first tracked run
reproduced the committed tables to the digit but one: the RAPIER's ReStock
area had been left at the garbage cube's 1.277 while its height was read from
stock; it now reads 1.3 from the stock cube like the other two. Neither
baseline moved.

## The icon — `public/favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`

The nut (#206): a hex nut framing a rocket in Kerbin's teal, drawn once as
SVG in the app's own tokens, with no background and a `prefers-color-scheme`
rule — ink on a light tab bar, paper on a dark one, in the browsers that
take an SVG icon. The PNGs cannot switch: the 32 px one is the light
drawing on transparent, the home-screen one sits on an ink tile since iOS
paints black behind anything transparent. Both are rendered from the SVG,
never drawn again:

    node tools/favicon.mjs

which needs a Chromium — puppeteer's own, or `PUPPETEER_EXECUTABLE_PATH`,
or `/usr/bin/chromium` on linux-arm64 as the visual suite does.
