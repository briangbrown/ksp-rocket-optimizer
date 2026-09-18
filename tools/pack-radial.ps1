# pack-radial.ps1 — the parts that hold something on the side of a stack, and
# the parts that get held there, from a KSP install, for #422 and #438 — and,
# since #467, the holders' own .mu models: the face the game snaps a booster
# to is the collider, which only the mesh carries, and the drag cube
# overstates it (3 cm on a TT-38K, about 25 cm on a TT-70). No textures.
#
#   powershell -ExecutionPolicy Bypass -File .\pack-radial.ps1
#   powershell -ExecutionPolicy Bypass -File .\pack-radial.ps1 -Root "D:\Steam\steamapps\common\Kerbal Space Program"
#
# Writes ksp-radial-parts.zip into the KSP root — the folder GameData sits in.

param([string]$Root = (Get-Location).Path)

$gd = Join-Path $Root "GameData"
if (-not (Test-Path $gd)) { Write-Error "No GameData folder under $Root"; exit 1 }

$out   = Join-Path $Root "ksp-radial-parts.zip"
$stage = Join-Path $env:TEMP "ksp-radial-parts"
Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
New-Item $stage -ItemType Directory | Out-Null

# Matched on what a file contains rather than where it sits, as pack-power.ps1
# does and for the same reason: a wrong path guess collects nothing and says
# so only once the zip has crossed a network.
#
#   ModuleAnchoredDecoupler   every radial decoupler — the TT-38K, the TT-70,
#                             the Hydraulic Detachment Manifold — and nothing
#                             else; a stack decoupler is ModuleDecouple.
#   strutCube                 the Cubic Octagonal Strut, which braces a packed
#                             ring and stands its tanks off by its own size.
#   name = SolidFuel          every solid booster: where its surface-attach
#                             node sits along its length is what decides how
#                             high it hangs off the decoupler (#438).
#   node_attach               anything else that can be bolted to a side —
#                             the radial engines among them. Over-collects,
#                             on purpose; a few hundred kilobytes.
$markers = 'ModuleAnchoredDecoupler|strutCube|name\s*=\s*SolidFuel|^\s*node_attach\s*='

Write-Host "Scanning $gd for radial parts..."
$all = @(Get-ChildItem $gd -Recurse -File -Filter *.cfg -ErrorAction SilentlyContinue)
Write-Host "  $($all.Count) config files to read"

$hits = @($all | Select-String -Pattern $markers -List -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty Path)

# Every ReStock patch as well: a stock part is repointed, rescaled or given new
# variants there, and the patch is what decides.
$patches = @($all |
  Where-Object { $_.FullName -match "[\\/]ReStock(Plus)?[\\/]Patches[\\/]" } |
  Select-Object -ExpandProperty FullName)

$files = @($hits + $patches | Sort-Object -Unique)

if (-not $files) { Write-Error "Matched no part configs under $gd"; exit 1 }

foreach ($f in $files) {
  $rel  = $f.Substring($gd.Length).TrimStart('\', '/')
  $dest = Join-Path $stage $rel
  New-Item (Split-Path $dest) -ItemType Directory -Force | Out-Null
  Copy-Item $f $dest
}

# The holders' meshes. A stock part's model sits beside its config; a
# ReStock one is named by a `model =` line in the patch that repoints it, so
# both are followed: every .mu next to a config with an anchored decoupler or
# the cubic strut in it, and every .mu a matched config names.
# Only the four holders the model places (and the TT-14): matched by config
# name, and by the model path a ReStock patch names for them. Every .mu next
# to every matched config was 30 MB of boosters and engines (#467).
$holderNames = 'name\s*=\s*(radialDecoupler|radialDecoupler2|radialDecoupler1-2|strutCube|restock-decoupler-radial-tiny-1)\s*$'
$holderModels = 'decoupler-radial|radialDecoupler|strutCube|restock-strut'
$holders = @($files | Where-Object { Select-String -Path $_ -Pattern $holderNames -Quiet })
$meshes = @()
foreach ($h in $holders) {
  $meshes += @(Get-ChildItem (Split-Path $h) -File -Filter *.mu -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty FullName)
}
foreach ($f in $files) {
  foreach ($m in (Select-String -Path $f -Pattern '^\s*model\s*=\s*(\S+)' -AllMatches)) {
    foreach ($g in $m.Matches) {
      $p = $g.Groups[1].Value
      if ($p -notmatch $holderModels) { continue }
      $mu = Join-Path $gd ($p + ".mu")
      if (Test-Path $mu) { $meshes += (Get-Item $mu).FullName }
    }
  }
}
$meshes = @($meshes | Sort-Object -Unique)
foreach ($f in $meshes) {
  $rel  = $f.Substring($gd.Length).TrimStart('\', '/')
  $dest = Join-Path $stage $rel
  New-Item (Split-Path $dest) -ItemType Directory -Force | Out-Null
  Copy-Item $f $dest
}
"  {0,-28} {1}" -f 'holder meshes (.mu)', $meshes.Count

# PartDatabase.cfg sits beside GameData, not inside it, and carries every
# part's drag cube — the bounding box the game measured off the model. A
# decoupler's thickness is the extent of that box along its attach direction,
# and without it the standoff is a guess.
$pdb = Join-Path $Root "PartDatabase.cfg"
if (Test-Path $pdb) { Copy-Item $pdb (Join-Path $stage "PartDatabase.cfg") }
else { Write-Host "note: no PartDatabase.cfg at the root; run the game once so it is written" }

$files | ForEach-Object {
  $_.Substring($gd.Length).TrimStart('\', '/') + "`t" + (Get-Item $_).Length
} | Set-Content (Join-Path $stage "MANIFEST.txt")

# A quick count of what turned up, so a run that matched nothing useful says so
# here rather than after the zip has crossed a network.
foreach ($m in 'ModuleAnchoredDecoupler', 'strutCube', 'name\s*=\s*SolidFuel') {
  $n = @(Select-String -Path $files -Pattern $m -List -ErrorAction SilentlyContinue).Count
  "  {0,-28} {1}" -f $m, $n
}

Compress-Archive -Path "$stage\*" -DestinationPath $out -Force
$mb = [math]::Round((Get-Item $out).Length / 1MB, 2)
"$($files.Count) files, $mb MB -> $out"
