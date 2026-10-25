$ErrorActionPreference = 'Stop'
$taskName = 'LeadGen Account Protection'
$runnerPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'run-monitor.ps1')).Path
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing -and -not ($existing.Actions.Arguments -contains ('-NoProfile -NonInteractive -WindowStyle Hidden -File "' + $runnerPath + '"'))) { throw 'A different task already uses this name; it was not changed.' }
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "' + $runnerPath + '"')
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$watchdog = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) -RepetitionInterval (New-TimeSpan -Minutes 5)
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -Hidden
$definition = New-ScheduledTask -Action $action -Trigger @($trigger, $watchdog) -Principal $principal -Settings $settings -Description 'Monitors LeadGen mailbox readiness; pauses unsafe accounts. Five-minute restart check if stopped. Never sends email.'
Register-ScheduledTask -TaskName $taskName -InputObject $definition -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output 'Account protection monitor registered for current-user sign-in and started. It does not send email.'
