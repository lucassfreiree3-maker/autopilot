$spoolDir = "<SAFE_ROOT>\spooler"
$autosyncScript = "<SAFE_ROOT>\agent-autosync.ps1"
$powershellExe = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
if (-not (Test-Path $powershellExe)) {
    $powershellExe = "powershell.exe"
}
if (-not (Test-Path $spoolDir)) { New-Item -ItemType Directory -Path $spoolDir -Force | Out-Null }

function Publish-AutosyncEvent {
    param(
        [string]$Description,
        [string]$Status = "info",
        [string]$Category = "spooler",
        [string]$Notes = "",
        [string[]]$Files = @(),
        [string]$MetadataJson = ""
    )

    if (Test-Path $autosyncScript) {
        & $autosyncScript -Action event -Agent gemini -Description $Description -EventStatus $Status -Category $Category -Notes $Notes -Files $Files -Source "start-agent-spooler.ps1" -MetadataJson $MetadataJson -Silent | Out-Null
    }
}

function Publish-AutosyncHandoff {
    param(
        [string]$Description,
        [string]$Notes = "",
        [string]$NextStep = "",
        [string[]]$Files = @()
    )

    if (Test-Path $autosyncScript) {
        & $autosyncScript -Action handoff -Agent gemini -Description $Description -EntryStatus "blocked" -Notes $Notes -NextStep $NextStep -Files $Files -Source "start-agent-spooler.ps1" -Silent | Out-Null
    }
}

Clear-Host
Write-Host "[SPOOLER] Gemini command sentinel started." -ForegroundColor Cyan
Write-Host "Gemini can now execute automation scripts through this spooler." -ForegroundColor Yellow
Publish-AutosyncEvent -Description "Gemini spooler started." -Status "ready" -Files @($spoolDir)

while ($true) {
    $pending = Join-Path $spoolDir "pending.ps1"
    $result = Join-Path $spoolDir "result.log"

    if (Test-Path $pending) {
        Write-Host "`n[SPOOLER] Command received. Executing..." -ForegroundColor Magenta
        $pendingLength = (Get-Item $pending).Length
        $receiveMetadata = [ordered]@{
            pendingFile = $pending
            bytes = $pendingLength
        } | ConvertTo-Json -Compress
        Publish-AutosyncEvent -Description "Gemini spooler received a command payload." -Status "received" -Notes "Executing pending.ps1 from the Gemini spooler." -Files @($pending) -MetadataJson $receiveMetadata

        try {
            $output = & $powershellExe -ExecutionPolicy Bypass -File $pending 2>&1
            $output | Out-File -FilePath $result -Encoding UTF8
            Write-Host "[SPOOLER] Command completed. Output available in result.log." -ForegroundColor Green
            Publish-AutosyncEvent -Description "Gemini spooler executed a command successfully." -Status "success" -Notes "Execution finished and result.log was updated." -Files @($result)
        } catch {
            $error[0] | Out-File -FilePath $result -Encoding UTF8
            Write-Host "[SPOOLER] Command execution failed." -ForegroundColor Red
            Publish-AutosyncEvent -Description "Gemini spooler command execution failed." -Status "error" -Notes $_.Exception.Message -Files @($result)
            Publish-AutosyncHandoff -Description "Gemini spooler command failed." -Notes "Inspect result.log for the latest execution failure." -NextStep "Review the pending script failure, adjust the command or environment, and rerun through the spooler." -Files @($pending, $result)
        }

        Remove-Item $pending -Force
    }

    Start-Sleep -Seconds 2
}
