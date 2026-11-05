# Package one native app binary for Windows: a .zip always, an .msi when
# the WiX toolset is available.
# Usage: .\package.ps1 -BinaryName ruxt-desktop -AppName "Ruxt" [-Version 0.1.0]
# Output: native\packaging\dist\windows\<AppName>.zip (and .msi with WiX)
# Idempotent: the staging directory and outputs are rebuilt from scratch.
param(
    [Parameter(Mandatory = $true)][string]$BinaryName,
    [Parameter(Mandatory = $true)][string]$AppName,
    [string]$Version = "0.1.0"
)
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$NativeDir = (Resolve-Path (Join-Path $ScriptDir "..\..")).Path
$ExeName = if ($BinaryName.EndsWith(".exe")) { $BinaryName } else { "$BinaryName.exe" }
$BinaryPath = Join-Path $NativeDir "target\release\$ExeName"
if (-not (Test-Path $BinaryPath)) {
    throw "release binary not found: $BinaryPath (build it first: cargo build --release)"
}
if (-not (Get-Command Compress-Archive -ErrorAction SilentlyContinue)) {
    throw "Compress-Archive (PowerShell 5+) not found; cannot build the .zip"
}

$Dist = Join-Path $NativeDir "packaging\dist\windows"
$Staging = Join-Path $Dist "staging-$BinaryName"
$ZipPath = Join-Path $Dist "$AppName.zip"
foreach ($p in @($Staging, $ZipPath)) {
    if (Test-Path $p) { Remove-Item -Recurse -Force $p }
}
New-Item -ItemType Directory -Force -Path $Staging | Out-Null
Copy-Item $BinaryPath (Join-Path $Staging $ExeName)
Compress-Archive -Path (Join-Path $Staging "*") -DestinationPath $ZipPath -Force
Write-Host "built $ZipPath"

$Wix = Get-Command wix -ErrorAction SilentlyContinue
if ($Wix) {
    $WxsPath = Join-Path $Staging "$BinaryName.wxs"
    (Get-Content (Join-Path $ScriptDir "Product.wxs") -Raw).
        Replace("__APP_NAME__", $AppName).
        Replace("__BINARY__", $ExeName).
        Replace("__VERSION__", $Version) | Set-Content $WxsPath
    $MsiPath = Join-Path $Dist "$AppName.msi"
    if (Test-Path $MsiPath) { Remove-Item -Force $MsiPath }
    & $Wix.Source build $WxsPath -o $MsiPath
    if ($LASTEXITCODE -ne 0) { throw "wix build failed with exit code $LASTEXITCODE" }
    Write-Host "built $MsiPath"
} else {
    Write-Warning "WiX toolset ('wix') not found: .msi skipped. Install WiX v4 (dotnet tool install --global wix) and re-run to build it from Product.wxs."
}
Remove-Item -Recurse -Force $Staging
