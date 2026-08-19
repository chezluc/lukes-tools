[CmdletBinding()]
param([ValidateSet('install','uninstall','up','down','status','doctor','logs','help')][string]$Command = 'help')

$ErrorActionPreference = 'Stop'
$BridgeDir = Split-Path -Parent $PSScriptRoot
$StateDir = Join-Path $env:LOCALAPPDATA 'ChromeConsoleBridgeV6'
$StartupDir = [Environment]::GetFolderPath('Startup')
$Instances = @(
  @{ Name = 'canary'; Port = 4471; Script = 'scripts\start-canary.mjs' },
  @{ Name = 'chrome'; Port = 4472; Script = 'scripts\start-chrome.mjs' }
)

function Get-NodePath {
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $node) { throw 'node.exe was not found on PATH. Install Node.js LTS and reopen PowerShell.' }
  $node.Source
}

function Get-Health($Instance) {
  try { Invoke-RestMethod -Uri "http://127.0.0.1:$($Instance.Port)/health" -TimeoutSec 2 }
  catch { $null }
}

function Start-Instance($Instance) {
  if (Get-Health $Instance) { return }
  New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
  $node = Get-NodePath
  $log = Join-Path $StateDir "$($Instance.Name).log"
  $err = Join-Path $StateDir "$($Instance.Name).error.log"
  Start-Process -FilePath $node -ArgumentList (Join-Path $BridgeDir $Instance.Script) `
    -WorkingDirectory $BridgeDir -WindowStyle Hidden -RedirectStandardOutput $log `
    -RedirectStandardError $err | Out-Null
}

function Stop-Instance($Instance) {
  $listeners = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $Instance.Port -State Listen -ErrorAction SilentlyContinue
  foreach ($listener in $listeners) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)" -ErrorAction SilentlyContinue
    if ($process -and $process.CommandLine -like "*$BridgeDir*") {
      Stop-Process -Id $listener.OwningProcess
    } elseif ($process) {
      Write-Warning "Port $($Instance.Port) belongs to another process; not stopping PID $($listener.OwningProcess)."
    }
  }
}

function Write-Status {
  foreach ($instance in $Instances) {
    $health = Get-Health $instance
    if ($health) {
      "$($instance.Name) (:$($instance.Port)): server=UP extensionConnected=$($health.extensionConnected) workers=$($health.workersOnline)"
    } else {
      "$($instance.Name) (:$($instance.Port)): server=DOWN"
    }
  }
}

function Install-StartupLauncher($Instance) {
  $target = Join-Path $StartupDir "Chrome Console Bridge v6 - $($Instance.Name).vbs"
  $launcher = Join-Path $BridgeDir "start-$($Instance.Name).cmd"
  $escaped = $launcher.Replace('"', '""')
  @(
    'Set shell = CreateObject("WScript.Shell")'
    ('shell.Run Chr(34) & "{0}" & Chr(34), 0, False' -f $escaped)
  ) | Set-Content -LiteralPath $target -Encoding ASCII
}

switch ($Command) {
  'install' {
    Get-NodePath | Out-Null
    foreach ($instance in $Instances) { Install-StartupLauncher $instance; Start-Instance $instance }
    Start-Sleep -Seconds 1
    Write-Status
    "Installed per-user startup launchers in: $StartupDir"
  }
  'uninstall' {
    foreach ($instance in $Instances) {
      Stop-Instance $instance
      Remove-Item -LiteralPath (Join-Path $StartupDir "Chrome Console Bridge v6 - $($instance.Name).vbs") -ErrorAction SilentlyContinue
    }
    'Removed v6 startup launchers and stopped v6 bridge processes. Project files and older versions were not changed.'
  }
  'up' { foreach ($instance in $Instances) { Start-Instance $instance }; Start-Sleep -Seconds 1; Write-Status }
  'down' { foreach ($instance in $Instances) { Stop-Instance $instance }; Write-Status }
  'status' { Write-Status }
  'doctor' {
    "Bridge directory: $BridgeDir"
    try { "Node: $(Get-NodePath)" } catch { "Node: MISSING - $($_.Exception.Message)" }
    foreach ($instance in $Instances) {
      $health = Get-Health $instance
      if (-not $health) { "$($instance.Name) :$($instance.Port): server DOWN; run bin\bridge.cmd up"; continue }
      if ($health.extensionConnected) { "$($instance.Name) :$($instance.Port): READY ($($health.workersOnline) worker(s))" }
      else { "$($instance.Name) :$($instance.Port): server UP, extension disconnected; start the browser and verify the unpacked dist-$($instance.Name) extension is enabled at chrome://extensions" }
    }
  }
  'logs' {
    if (-not (Test-Path $StateDir)) { "No logs yet: $StateDir"; break }
    Get-ChildItem -LiteralPath $StateDir -Filter '*.log' | ForEach-Object { "--- $($_.Name) ---"; Get-Content -LiteralPath $_.FullName -Tail 80 }
  }
  default { @'
Chrome Console Bridge v6 for Windows

  bin\bridge.cmd install    install per-user login startup + start both servers
  bin\bridge.cmd up         start missing servers
  bin\bridge.cmd down       stop only v6 processes owned by this project
  bin\bridge.cmd status     show server and extension health
  bin\bridge.cmd doctor     diagnose Node/server/extension readiness
  bin\bridge.cmd logs       show recent logs
  bin\bridge.cmd uninstall  remove startup launchers and stop v6 servers
'@ }
}
