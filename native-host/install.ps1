# Installs the JJptt native host for Chrome / Edge / Brave / Chromium on Windows.
# Usage:  powershell -ExecutionPolicy Bypass -File install.ps1 [-Uninstall]
param([switch]$Uninstall)
$ErrorActionPreference = 'Stop'

$Name = 'com.jjptt.host'
$ExtensionId = 'fdlnogjbmfefgnaidfoackkjnnkibnmm'
$InstallDir = Join-Path $env:LOCALAPPDATA 'JJptt'
$RegKeys = @(
  'HKCU:\Software\Google\Chrome\NativeMessagingHosts',
  'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts',
  'HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts',
  'HKCU:\Software\Chromium\NativeMessagingHosts',
  'HKCU:\Software\Vivaldi\NativeMessagingHosts'
)

if ($Uninstall) {
  foreach ($k in $RegKeys) {
    $p = Join-Path $k $Name
    if (Test-Path $p) { Remove-Item -Path $p -Force }
  }
  if (Test-Path $InstallDir) { Remove-Item -Path $InstallDir -Recurse -Force }
  Write-Host 'JJptt native host removed.'
  exit 0
}

$Source = Join-Path $PSScriptRoot 'bin\jjptt-host-windows-amd64.exe'
if (-not (Test-Path $Source)) { throw "Missing $Source" }

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$Exe = Join-Path $InstallDir 'jjptt-host.exe'
Copy-Item -Path $Source -Destination $Exe -Force
Unblock-File -Path $Exe
# Remember the jjptt folder so the update button can git pull it.
$RepoDir = Split-Path $PSScriptRoot -Parent
[System.IO.File]::WriteAllText((Join-Path $InstallDir 'repo-path'), $RepoDir, (New-Object System.Text.UTF8Encoding $false))

$ManifestPath = Join-Path $InstallDir "$Name.json"
$Manifest = [ordered]@{
  name = $Name
  description = 'JJptt native host'
  path = $Exe
  type = 'stdio'
  allowed_origins = @("chrome-extension://$ExtensionId/")
} | ConvertTo-Json
[System.IO.File]::WriteAllText($ManifestPath, $Manifest, (New-Object System.Text.UTF8Encoding $false))

foreach ($k in $RegKeys) {
  New-Item -Path (Join-Path $k $Name) -Value $ManifestPath -Force | Out-Null
}

Write-Host 'JJptt native host installed.'
Write-Host 'Fully quit and reopen your browser, then click the JJptt extension icon.'
