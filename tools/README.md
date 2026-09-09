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
