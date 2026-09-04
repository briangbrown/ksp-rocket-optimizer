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
the top node at y = 0; welds the texture seams; and simplifies by quadric
edge collapse to about five hundred vertices (eight for the big clusters),
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
