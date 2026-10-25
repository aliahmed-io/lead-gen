$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodePath = Join-Path $projectRoot '.runtime/node-v22.23.4-win-x64/node.exe'
if (-not (Test-Path -LiteralPath $nodePath)) { throw 'Run scripts/setup-node.ps1 to install the project runtime first.' }
$logFolder = Join-Path $projectRoot 'data-working'
New-Item -ItemType Directory -Path $logFolder -Force | Out-Null
$monitorPath = Join-Path $projectRoot 'runtime/monitor-service.js'
# The scheduled PowerShell action is hidden. Keep it alive while its native child runs.
$ErrorActionPreference = 'Continue'
& $nodePath '--experimental-sqlite' $monitorPath 1> (Join-Path $logFolder 'monitor-service.stdout.log') 2> (Join-Path $logFolder 'monitor-service.stderr.log')
exit $LASTEXITCODE
