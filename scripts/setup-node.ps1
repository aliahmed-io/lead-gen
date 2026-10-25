$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$version = '22.23.4'
$runtimeRoot = Join-Path $projectRoot '.runtime'
$archiveName = "node-v$version-win-x64.zip"
$releaseUrl = "https://nodejs.org/dist/v$version"
New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
$checksums = (Invoke-WebRequest -Uri "$releaseUrl/SHASUMS256.txt").Content
$expectedLine = ($checksums -split "`n" | Where-Object { $_ -match ('\s+' + [regex]::Escape($archiveName) + '\s*$') })
if (-not $expectedLine) { throw 'Official Node archive checksum was not found.' }
$expectedHash = ($expectedLine.Trim() -split '\s+')[0]
$archivePath = Join-Path $runtimeRoot $archiveName
Invoke-WebRequest -Uri "$releaseUrl/$archiveName" -OutFile $archivePath
if ((Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash.ToLowerInvariant()) { throw 'Node archive checksum mismatch; nothing was installed.' }
Expand-Archive -LiteralPath $archivePath -DestinationPath $runtimeRoot -Force
$nodePath = Join-Path $runtimeRoot "node-v$version-win-x64/node.exe"
if ((& $nodePath --version) -ne "v$version") { throw 'Unexpected portable Node version.' }
Write-Output "Verified portable Node v$version installed for this project. System Node was not changed."
