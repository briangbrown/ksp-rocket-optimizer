# pack-power.ps1 — the parts that make and store electric charge, from a KSP
# install, for the ion work in #413. No meshes, no textures.
#
#   powershell -ExecutionPolicy Bypass -File .\pack-power.ps1
#   powershell -ExecutionPolicy Bypass -File .\pack-power.ps1 -Root "D:\Steam\steamapps\common\Kerbal Space Program"
#
# Writes ksp-power-parts.zip into the KSP root — the folder GameData sits in.

param([string]$Root = (Get-Location).Path)

$gd = Join-Path $Root "GameData"
if (-not (Test-Path $gd)) { Write-Error "No GameData folder under $Root"; exit 1 }

$out   = Join-Path $Root "ksp-power-parts.zip"
$stage = Join-Path $env:TEMP "ksp-power-parts"
Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
New-Item $stage -ItemType Directory | Out-Null

# Matched on what a file contains rather than where it sits. The folder these
# parts live in has moved between versions and differs again under ReStock, and
# a wrong path guess fails silently by collecting nothing; a module name does
# not move. ElectricCharge as a RESOURCE is how a battery is written, and it
# also catches the ion engine, whose draw is a PROPELLANT line in its own cfg.
$markers = 'ModuleDeployableSolarPanel|ModuleGenerator|ModuleResourceConverter|name\s*=\s*ElectricCharge'

Write-Host "Scanning $gd for power parts..."
$all = @(Get-ChildItem $gd -Recurse -File -Filter *.cfg -ErrorAction SilentlyContinue)
Write-Host "  $($all.Count) config files to read"

$hits = @($all | Select-String -Pattern $markers -List -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty Path)

# Every ReStock patch as well: a stock part is repointed, rescaled or given new
# variants there, and the patch is what decides. Same reason pack-engines.ps1
# takes them all rather than guessing which ones matter.
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

# Physics.cfg sits beside GameData, not inside it, and carries the solar
# constants — without it the panel falloff with distance is an assumption
# rather than a measurement.
$phys = Join-Path $Root "Physics.cfg"
if (Test-Path $phys) { Copy-Item $phys (Join-Path $stage "Physics.cfg") }
else { Write-Host "note: no Physics.cfg at the root; the solar law will be assumed" }

$files | ForEach-Object {
  $_.Substring($gd.Length).TrimStart('\', '/') + "`t" + (Get-Item $_).Length
} | Set-Content (Join-Path $stage "MANIFEST.txt")

# A quick count of what turned up, so a run that matched nothing useful says so
# here rather than after the zip has crossed a network.
foreach ($m in 'ModuleDeployableSolarPanel', 'ModuleGenerator', 'ModuleResourceConverter') {
  $n = @(Select-String -Path $files -Pattern $m -List -ErrorAction SilentlyContinue).Count
  "  {0,-28} {1}" -f $m, $n
}

Compress-Archive -Path "$stage\*" -DestinationPath $out -Force
$mb = [math]::Round((Get-Item $out).Length / 1MB, 2)
"$($files.Count) files, $mb MB -> $out"
