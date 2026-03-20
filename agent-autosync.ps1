[CmdletBinding()]
param(
    [ValidateSet("status", "doctor", "claim", "complete", "decision", "learning", "handoff", "event", "refresh-auto")]
    [string]$Action = "event",
    [string]$Agent = "gemini",
    [string]$Description,
    [string[]]$Files = @(),
    [string]$Notes,
    [string]$TaskId,
    [string]$Title,
    [string]$Context,
    [string]$Problem,
    [string]$Solution,
    [string]$ReusablePattern,
    [string]$Decision,
    [string]$Rationale,
    [string]$NextStep,
    [string]$EntryStatus = "in_progress",
    [string]$Category = "general",
    [string]$Source = "",
    [string]$EventStatus = "info",
    [string]$MetadataJson = "",
    [string]$WorkspaceRoot = "",
    [switch]$Silent
)

$defaultWorkspace = "<USER_HOME>\OneDrive\AUTOMACAO"
$logPath = Join-Path $PSScriptRoot "state\agent-autosync.log"

function Write-BridgeLog {
    param(
        [string]$Level,
        [string]$Message
    )

    $line = "{0} [{1}] {2}" -f (Get-Date -Format "o"), $Level.ToUpperInvariant(), $Message
    Add-Content -Path $logPath -Value $line -Encoding UTF8
}

function Resolve-WorkspaceRoot {
    param([string]$PreferredRoot)

    $candidates = New-Object System.Collections.Generic.List[string]
    if (-not [string]::IsNullOrWhiteSpace($PreferredRoot)) {
        [void]$candidates.Add($PreferredRoot)
    }

    if (-not [string]::IsNullOrWhiteSpace($env:AUTOPILOT_SHARED_WORKSPACE)) {
        [void]$candidates.Add($env:AUTOPILOT_SHARED_WORKSPACE)
    }

    [void]$candidates.Add($defaultWorkspace)

    if ($PWD -and -not [string]::IsNullOrWhiteSpace($PWD.ProviderPath)) {
        $cursor = $PWD.ProviderPath
        while (-not [string]::IsNullOrWhiteSpace($cursor)) {
            [void]$candidates.Add($cursor)
            $parent = Split-Path -Parent $cursor
            if ($parent -eq $cursor) {
                break
            }

            $cursor = $parent
        }
    }

    foreach ($candidate in $candidates) {
        if ([string]::IsNullOrWhiteSpace($candidate)) {
            continue
        }

        $syncScript = Join-Path $candidate "scripts\ai-sync.ps1"
        if (Test-Path $syncScript) {
            return $candidate
        }
    }

    return $null
}

try {
    $resolvedWorkspace = Resolve-WorkspaceRoot -PreferredRoot $WorkspaceRoot
    if ([string]::IsNullOrWhiteSpace($resolvedWorkspace)) {
        Write-BridgeLog -Level "warn" -Message "Shared workspace not found; action=$Action agent=$Agent source=$Source"
        if (-not $Silent) {
            Write-Warning "Shared workspace with scripts\\ai-sync.ps1 was not found."
        }

        return
    }

    $syncScript = Join-Path $resolvedWorkspace "scripts\ai-sync.ps1"
    $params = @{
        Action = $Action
    }

    foreach ($name in @("Agent", "Description", "Notes", "TaskId", "Title", "Context", "Problem", "Solution", "ReusablePattern", "Decision", "Rationale", "NextStep", "EntryStatus", "Category", "Source", "EventStatus", "MetadataJson")) {
        $value = Get-Variable -Name $name -ValueOnly
        if ($null -ne $value -and -not ([string]::IsNullOrWhiteSpace([string]$value))) {
            $params[$name] = $value
        }
    }

    if ($Files.Count -gt 0) {
        $params["Files"] = $Files
    }

    $output = & $syncScript @params -ErrorAction Stop 2>&1 | Out-String
    $trimmedOutput = $output.Trim()
    if ([string]::IsNullOrWhiteSpace($trimmedOutput)) {
        $trimmedOutput = "(no output)"
    }

    Write-BridgeLog -Level "info" -Message "Forwarded action=$Action agent=$Agent source=$Source workspace=$resolvedWorkspace result=$trimmedOutput"
    if (-not $Silent -and -not [string]::IsNullOrWhiteSpace($trimmedOutput)) {
        Write-Output $trimmedOutput
    }
} catch {
    Write-BridgeLog -Level "error" -Message "Forward failed; action=$Action agent=$Agent source=$Source error=$($_.Exception.Message)"
    if (-not $Silent) {
        Write-Warning "Shared autosync forward failed: $($_.Exception.Message)"
    }
}
