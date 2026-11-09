# Compiles desktop/HangarLauncher.cs into Hangar.exe on the desktop.
# Only needed once (or when the launcher itself changes): app updates happen automatically at start.
param([string]$Out = (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Hangar.exe'))

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$src = Get-Content (Join-Path $PSScriptRoot 'HangarLauncher.cs') -Raw -Encoding UTF8
$tmp = Join-Path $env:TEMP 'HangarLauncher.gen.cs'
[IO.File]::WriteAllText($tmp, $src.Replace('__HANGAR_DIR__', $root), (New-Object Text.UTF8Encoding $true))

$icon = Join-Path $root 'src\app\favicon.ico'
$iconArg = @()
if (Test-Path $icon) { $iconArg = @("/win32icon:$icon") }

& $csc /nologo /target:winexe /optimize+ /codepage:65001 "/out:$Out" @iconArg `
  /r:System.Windows.Forms.dll /r:System.Drawing.dll $tmp
if ($LASTEXITCODE -ne 0) { throw "csc failed" }
Remove-Item $tmp
Write-Host "Built $Out (project: $root)"
