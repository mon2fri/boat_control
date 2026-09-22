[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$ZipPath,

    [Parameter(Position = 1)]
    [string]$ProjectRoot = (Join-Path $PSScriptRoot ".."),

    [switch]$CopyProjectConfig
)

$ErrorActionPreference = "Stop"

$zip = (Resolve-Path -LiteralPath $ZipPath).Path
$root = (Resolve-Path -LiteralPath $ProjectRoot).Path
$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("boat-control-release-" + [guid]::NewGuid())

try {
    New-Item -ItemType Directory -Path $temporaryRoot | Out-Null
    Expand-Archive -LiteralPath $zip -DestinationPath $temporaryRoot -Force

    $manageFiles = @(Get-ChildItem -LiteralPath $temporaryRoot -Recurse -File -Filter "manage.py") |
        Where-Object { $_.FullName -match "[\\/]backend[\\/]manage\.py$" }
    if ($manageFiles.Count -ne 1) {
        throw "The ZIP must contain exactly one backend/manage.py file."
    }

    $archiveRoot = $manageFiles[0].Directory.Parent.FullName
    $required = @(
        (Join-Path $archiveRoot "backend"),
        (Join-Path $archiveRoot "frontend\dist"),
        (Join-Path $archiveRoot "trigger.py"),
        (Join-Path $archiveRoot "pyproject.toml")
    )
    $missing = @($required | Where-Object { -not (Test-Path -LiteralPath $_) })
    if ($missing.Count -gt 0) {
        throw "The ZIP is missing required release files: $($missing -join ', ')"
    }

    # Deliberately copy only release code/assets. Root config/ and data/ are
    # never source paths or destinations in this script.
    Copy-Item -LiteralPath (Join-Path $archiveRoot "backend") -Destination $root -Recurse -Force
    $frontendRoot = Join-Path $root "frontend"
    if (-not (Test-Path -LiteralPath $frontendRoot)) {
        New-Item -ItemType Directory -Path $frontendRoot | Out-Null
    }
    Copy-Item -LiteralPath (Join-Path $archiveRoot "frontend\dist") -Destination $frontendRoot -Recurse -Force
    Copy-Item -LiteralPath (Join-Path $archiveRoot "trigger.py") -Destination $root -Force
    Copy-Item -LiteralPath (Join-Path $archiveRoot "pyproject.toml") -Destination $root -Force

    if ($CopyProjectConfig) {
        $archiveConfig = Join-Path $archiveRoot ".config"
        if (-not (Test-Path -LiteralPath $archiveConfig)) {
            throw "-CopyProjectConfig was specified, but the ZIP does not contain .config."
        }
        Copy-Item -LiteralPath $archiveConfig -Destination $root -Force
    }

    Write-Host "Copied backend, frontend/dist, trigger.py, and pyproject.toml."
    if ($CopyProjectConfig) {
        Write-Host "Copied .config. Root config/ and data/ were not touched."
    } else {
        Write-Host "Preserved the existing .config. Root config/ and data/ were not touched."
    }
}
finally {
    if (Test-Path -LiteralPath $temporaryRoot) {
        Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
    }
}
#   From the project root:
#   .\scripts\copy_release_from_zip.ps1 `
#     -ZipPath "C:\releases\boat-control.zip"
#   To also replace .config:
#   .\scripts\copy_release_from_zip.ps1 `
#  -ZipPath "C:\releases\boat-control.zip" `
#  -CopyProjectConfig
#For a different destination root:
#   .\scripts\copy_release_from_zip.ps1 `
#     -ZipPath "C:\releases\boat-control.zip" `
#     -ProjectRoot "C:\boat-control"
#   The script never modifies config/ or data/.