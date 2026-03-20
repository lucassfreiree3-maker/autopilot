[CmdletBinding()]
param(
    [ValidateSet("doctor", "ensure", "watch", "repair-services")]
    [string]$Action = "doctor"
)

$ErrorActionPreference = "Continue"

$root = $PSScriptRoot
$servicesPath = Join-Path $root "services.json"
$stateDir = Join-Path $root "state"
$statePath = Join-Path $stateDir "services-state.json"
$logDir = Join-Path $root "logs"
$logPath = Join-Path $logDir "autopilot-supervisor.log"
$stopFlag = Join-Path $stateDir "services.stop"
$powershellExe = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
if (-not (Test-Path $powershellExe)) {
    $powershellExe = "powershell.exe"
}

if (-not (Test-Path $stateDir)) {
    New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
}

if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

function Write-Log {
    param([string]$Message)

    $line = "[{0}][supervisor] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Add-Content -Path $logPath -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
}

function Read-ServicesConfig {
    if (-not (Test-Path $servicesPath)) {
        throw "Missing services manifest: $servicesPath"
    }

    return Get-Content $servicesPath -Raw | ConvertFrom-Json
}

function Get-ProcessCount {
    param([string]$Pattern)

    try {
        $matches = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
            $_.CommandLine -and $_.CommandLine -match $Pattern
        }
        return @($matches).Count
    } catch {
        return 0
    }
}

function Get-ServiceSnapshot {
    param([object]$Service)

    $scriptExists = Test-Path $Service.scriptPath
    $processCount = if ($scriptExists) { Get-ProcessCount -Pattern $Service.matchPattern } else { 0 }
    $running = $scriptExists -and ($processCount -gt 0)

    return [pscustomobject]@{
        name = $Service.name
        enabled = [bool]$Service.enabled
        description = $Service.description
        scriptPath = $Service.scriptPath
        scriptExists = $scriptExists
        processCount = $processCount
        running = $running
        status = $(if (-not $Service.enabled) { "disabled" } elseif (-not $scriptExists) { "blocked" } elseif ($running) { "running" } else { "stopped" })
    }
}

function Write-StateFile {
    param([object[]]$ServiceSnapshots)

    $overallStatus = "ready"
    if (@($ServiceSnapshots | Where-Object { $_.status -eq "blocked" }).Count -gt 0) {
        $overallStatus = "blocked"
    } elseif (@($ServiceSnapshots | Where-Object { $_.enabled -and $_.status -ne "running" }).Count -gt 0) {
        $overallStatus = "degraded"
    }

    $state = [ordered]@{
        generatedAt = (Get-Date).ToString("o")
        status = $overallStatus
        services = $ServiceSnapshots
    }

    Set-Content -Path $statePath -Value (($state | ConvertTo-Json -Depth 8) + [Environment]::NewLine) -Encoding UTF8
    return $state
}

function Start-ServiceProcess {
    param([object]$Service)

    if (-not $Service.enabled) {
        return
    }

    if (-not (Test-Path $Service.scriptPath)) {
        Write-Log ("Cannot start {0}: missing script {1}" -f $Service.name, $Service.scriptPath)
        return
    }

    Write-Log ("Starting service {0}" -f $Service.name)
    Start-Process -FilePath $powershellExe -ArgumentList @(
        "-WindowStyle", "Hidden",
        "-ExecutionPolicy", "Bypass",
        "-File", $Service.scriptPath
    ) -WindowStyle Hidden | Out-Null
}

function Ensure-Services {
    param([switch]$StartMissing)

    $config = Read-ServicesConfig
    $snapshots = New-Object System.Collections.Generic.List[object]

    foreach ($service in $config.services) {
        $snapshot = Get-ServiceSnapshot -Service $service
        [void]$snapshots.Add($snapshot)

        if ($StartMissing -and $service.enabled -and $snapshot.status -eq "stopped") {
            Start-ServiceProcess -Service $service
            Start-Sleep -Seconds 2
            $snapshot = Get-ServiceSnapshot -Service $service
            $snapshots[$snapshots.Count - 1] = $snapshot
        }
    }

    return (Write-StateFile -ServiceSnapshots $snapshots.ToArray())
}

function Show-Doctor {
    $state = Ensure-Services

    Write-Output ("AutopilotServicesReadiness: {0}" -f $state.status)
    Write-Output ("ServicesManifest: {0}" -f $servicesPath)
    Write-Output ("ServicesState: {0}" -f $statePath)
    foreach ($service in $state.services) {
        Write-Output ("- {0}: status={1} running={2} processCount={3} scriptExists={4}" -f $service.name, $service.status, $service.running, $service.processCount, $service.scriptExists)
    }
}

switch ($Action) {
    "doctor" {
        Show-Doctor
    }
    "ensure" {
        $state = Ensure-Services -StartMissing
        Write-Output ("AutopilotServicesReadiness: {0}" -f $state.status)
    }
    "repair-services" {
        $state = Ensure-Services -StartMissing
        Write-Output ("AutopilotServicesReadiness: {0}" -f $state.status)
    }
    "watch" {
        if (Test-Path $stopFlag) {
            Remove-Item $stopFlag -Force
        }

        Write-Log "Supervisor watch loop started."
        while (-not (Test-Path $stopFlag)) {
            $state = Ensure-Services -StartMissing
            Write-Log ("Supervisor cycle completed with status={0}" -f $state.status)

            $config = Read-ServicesConfig
            $sleepSeconds = if ($config.checkIntervalSeconds -gt 0) { [int]$config.checkIntervalSeconds } else { 30 }
            $elapsed = 0
            while ($elapsed -lt $sleepSeconds -and -not (Test-Path $stopFlag)) {
                Start-Sleep -Seconds 5
                $elapsed += 5
            }
        }

        Write-Log "Supervisor watch loop stopped."
    }
}
