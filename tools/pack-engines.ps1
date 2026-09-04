# pack-engines.ps1 — engine meshes and configs from a KSP install, for
# tools/engine-meshes.mjs. No textures.
#
#   powershell -ExecutionPolicy Bypass -File .\pack-engines.ps1
#   powershell -ExecutionPolicy Bypass -File .\pack-engines.ps1 -Root "D:\Steam\steamapps\common\Kerbal Space Program"

param([string]$Root = (Get-Location).Path)

$gd = Join-Path $Root "GameData"
if (-not (Test-Path $gd)) { Write-Error "No GameData folder under $Root"; exit 1 }

$out   = Join-Path $env:USERPROFILE "Desktop\ksp-engine-models.zip"
$stage = Join-Path $env:TEMP "ksp-engine-models"
Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
New-Item $stage -ItemType Directory | Out-Null

# Every mesh and config on a path with "Engine" in it — Squad/Parts/Engine,
# SquadExpansion/MakingHistory/Parts/Engine, ReStock/Assets/Engine,
# ReStockPlus/Assets/Engine — plus every ReStock patch, which is where a stock
# part is pointed at its ReStock model.
$files = Get-ChildItem $gd -Recurse -File | Where-Object {
  ($_.Extension -eq ".mu" -or $_.Extension -eq ".cfg") -and (
    $_.FullName -match "[\\/]Engine" -or
    $_.FullName -match "[\\/]ReStock(Plus)?[\\/]Patches[\\/]"
  )
}

foreach ($f in $files) {
  $rel  = $f.FullName.Substring($gd.Length).TrimStart('\', '/')
  $dest = Join-Path $stage $rel
  New-Item (Split-Path $dest) -ItemType Directory -Force | Out-Null
  Copy-Item $f.FullName $dest
}

# PartDatabase.cfg sits beside GameData, not inside it.
$pdb = Join-Path $Root "PartDatabase.cfg"
if (Test-Path $pdb) { Copy-Item $pdb (Join-Path $stage "PartDatabase.cfg") }

$files | ForEach-Object { $_.FullName.Substring($gd.Length).TrimStart('\', '/') + "`t" + $_.Length } |
  Set-Content (Join-Path $stage "MANIFEST.txt")

Compress-Archive -Path "$stage\*" -DestinationPath $out -Force
$mb = [math]::Round((Get-Item $out).Length / 1MB, 1)
"$($files.Count) files, $mb MB -> $out"
