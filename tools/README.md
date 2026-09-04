# tools

Scripts that read the game's own files to produce what lives in `src/data/`.
They run against an install this repository cannot see — Squad 1.12.5 with
Making History, Breaking Ground, ReStock and ReStock+ — so each one comes in
two halves: something to run on the machine with the install, and something
to run here on what it produced. `CLAUDE.md` and `.claude/rules/part-data.md`
say what the numbers mean once they are in.

## Engine profiles — `src/data/engine-profiles.json`

How each engine is drawn: its outer radius against height, measured off the
`.mu` meshes, with each bell of a cluster measured about its own axis. #85

1. On the machine with the install, from a PowerShell prompt in the KSP root
   (the folder with `GameData` in it):

       powershell -ExecutionPolicy Bypass -File tools\pack-engines.ps1

   It writes `ksp-engine-models.zip` to the desktop: every `.mu` and `.cfg`
   on a path with `Engine` in it, ReStock's patches, and `PartDatabase.cfg`.
   Tens of megabytes; no textures.

2. Here:

       node tools/engine-profiles.mjs path/to/ksp-engine-models.zip
       npm run format

   It reports what it could not measure and rewrites the JSON. With
   `--check` it compares instead and exits 1 on a difference, which is how to
   tell whether a game or mod update moved a shape.

What it does, in one paragraph, and why each step is there: it finds each
engine's part config (by the `slug` `parts.json` carries, else the title,
else the nickname — one stock title has a typo in the game's own file), reads
which meshes the part uses at what scale, which variant is the default and
what that variant hides, and which objects are a jettisonable shroud; applies
ReStock's `@PART` patches for the parts ReStock remodels (a model swap, a
rescale, variants, a thrust transform); walks each mesh's transform tree with
the root's own placement dropped, because that is where the prefab sat in the
Unity scene and the game discards it; samples the triangle edges into height
bins below the top node, because a tube has vertices only on its end rings
and binning vertices alone reads the wall as radius zero; and decides how
many bells there are from the thrust transforms in the lower half _and_
whether the hull at the base has notches between them, because the RAPIER
has four transforms inside one bell.

Plain Node, no dependencies. The `.mu` reader is this repository's own,
written from the format; the numbers it produces are measurements, and the
part-data rules apply to them.
