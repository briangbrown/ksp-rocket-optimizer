# pack-craft.ps1 — what a .craft writer needs from a KSP install, and what the
# game says about the crafts it was given, for #460. No meshes, no textures.
#
#   powershell -ExecutionPolicy Bypass -File .\pack-craft.ps1
#   powershell -ExecutionPolicy Bypass -File .\pack-craft.ps1 -Root "D:\Steam\steamapps\common\Kerbal Space Program"
#
# Writes ksp-craft.zip into the KSP root — the folder GameData sits in.
#
# Two jobs, one zip. Before the writer exists it carries the install's own
# description of every part (#461); once it does, the same script brings back
# the crafts the game saved and the log of loading them (#467).
#
#   GameData\ModuleManager.ConfigCache   every part as the game loaded it,
#                                        patches applied: names, titles, nodes,
#                                        attach rules, variants, resources.
#                                        Written by ModuleManager on load; if
#                                        it is missing, run the game once.
#   PartDatabase.cfg                     every part's drag cube; already read
#                                        by part-geometry.mjs and
#                                        radial-standoff.mjs, packed again so
#                                        one zip is the whole picture.
#   KSP.log                              what happened the last time the game
#                                        ran — a craft that would not load
#                                        says why in here.
#   Ships\VAB, Ships\SPH                 the stock crafts that ship with the
#                                        game: how the game itself writes the
#                                        format, at scale.
#   saves\*\Ships\VAB, saves\*\Ships\SPH every craft in every save — the ones
#                                        this tool wrote and the game saved
#                                        back, which is the diff #467 wants.

param([string]$Root = (Get-Location).Path)

$gd = Join-Path $Root "GameData"
if (-not (Test-Path $gd)) { Write-Error "No GameData folder under $Root"; exit 1 }

$out   = Join-Path $Root "ksp-craft.zip"
$stage = Join-Path $env:TEMP "ksp-craft"
Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
New-Item $stage -ItemType Directory | Out-Null

$manifest = @()
function Take([string]$path, [string]$rel, [string]$why) {
  if (Test-Path $path) {
    $dest = Join-Path $stage $rel
    New-Item (Split-Path $dest) -ItemType Directory -Force | Out-Null
    Copy-Item $path $dest
    $script:manifest += "$rel`t$((Get-Item $path).Length)"
    "  {0,-44} {1,10:n0} bytes" -f $rel, (Get-Item $path).Length
  } else {
    "  {0,-44} missing — {1}" -f $rel, $why
  }
}

Write-Host "Packing from $Root"
Take (Join-Path $gd "ModuleManager.ConfigCache") "GameData\ModuleManager.ConfigCache" "run the game once so ModuleManager writes it; without it there are no part names or nodes"
Take (Join-Path $Root "PartDatabase.cfg") "PartDatabase.cfg" "run the game once so it is written"
Take (Join-Path $Root "KSP.log") "KSP.log" "the game has not run from this folder"

# The crafts, stock and saved. Matched on the extension under the folders the
# game uses, so a save with none says so here rather than after the zip has
# crossed a network.
$craftDirs = @(
  @{ Path = (Join-Path $Root "Ships\VAB");  Rel = "Ships\VAB" },
  @{ Path = (Join-Path $Root "Ships\SPH");  Rel = "Ships\SPH" }
)
foreach ($save in @(Get-ChildItem (Join-Path $Root "saves") -Directory -ErrorAction SilentlyContinue)) {
  foreach ($hangar in "VAB", "SPH") {
    $craftDirs += @{ Path = (Join-Path $save.FullName "Ships\$hangar"); Rel = "saves\$($save.Name)\Ships\$hangar" }
  }
}
$n = 0
foreach ($d in $craftDirs) {
  $files = @(Get-ChildItem $d.Path -Filter *.craft -File -ErrorAction SilentlyContinue)
  foreach ($f in $files) {
    $rel  = Join-Path $d.Rel $f.Name
    $dest = Join-Path $stage $rel
    New-Item (Split-Path $dest) -ItemType Directory -Force | Out-Null
    Copy-Item $f.FullName $dest
    $manifest += "$rel`t$($f.Length)"
    $n++
  }
  if ($files.Count) { "  {0,-44} {1} crafts" -f $d.Rel, $files.Count }
}
if ($n -eq 0) { "  no .craft files found under Ships\ or saves\*\Ships\" }

$manifest | Set-Content (Join-Path $stage "MANIFEST.txt")

Compress-Archive -Path "$stage\*" -DestinationPath $out -Force
$mb = [math]::Round((Get-Item $out).Length / 1MB, 2)
"$($manifest.Count) files, $mb MB -> $out"
