$ErrorActionPreference = "Stop"

$manifestPath = Join-Path $PSScriptRoot "autopilot-manifest.json"
$manifest = Get-Content -Raw -Path $manifestPath | ConvertFrom-Json

$sourceDir = $manifest.paths.home
$backupConfig = $manifest.backups.googleDrive
$backupName = $backupConfig.backupFileName
$folderId = $backupConfig.folderId
$folderUrl = $backupConfig.folderUrl
$remote = "{0}:" -f $backupConfig.remote
$logFile = $backupConfig.logFile
$rcloneConfig = $backupConfig.configPath
$tempZip = Join-Path $env:TEMP $backupName

function Write-BackupLog {
  param([string]$Message)

  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $line = "[{0}] {1}" -f $timestamp, $Message
  Write-Output $line
  Add-Content -Path $logFile -Value $line -Encoding UTF8
}

function Resolve-RcloneExecutable {
  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:PATH = "$machinePath;$userPath"

  $localAppData = [Environment]::GetFolderPath("LocalApplicationData")
  $wingetCandidate = Join-Path $localAppData "Microsoft\WinGet\Packages\Rclone.Rclone_Microsoft.Winget.Source_8wekyb3d8bbwe\rclone-v1.73.2-windows-amd64\rclone.exe"
  if (Test-Path $wingetCandidate) {
    return $wingetCandidate
  }

  $command = Get-Command "rclone.exe" -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $whereResult = cmd /c "where.exe rclone 2>nul" | Select-Object -First 1
  if ($whereResult) {
    return $whereResult
  }

  throw "rclone.exe was not found. Run setup-gdrive-auth.cmd first."
}

$logsDir = Split-Path -Parent $logFile
if (-not (Test-Path $logsDir)) {
  New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
}

$rcloneConfigDir = Split-Path -Parent $rcloneConfig
if (-not (Test-Path $rcloneConfigDir)) {
  New-Item -ItemType Directory -Path $rcloneConfigDir -Force | Out-Null
}

$rcloneExe = Resolve-RcloneExecutable

Write-BackupLog "=== Starting Google Drive backup ==="

try {
  if (Test-Path $tempZip) {
    Remove-Item $tempZip -Force
  }

  Write-BackupLog ("Compressing {0}" -f $sourceDir)
  Compress-Archive -Path (Join-Path $sourceDir "*") -DestinationPath $tempZip -Force

  $sizeMb = [math]::Round((Get-Item $tempZip).Length / 1MB, 1)
  Write-BackupLog ("ZIP created: {0} ({1} MB)" -f $tempZip, $sizeMb)

  $remoteName = "{0}:" -f $backupConfig.remote
  $rcloneArgs = @("--config", $rcloneConfig)
  $remotes = @(& $rcloneExe @rcloneArgs listremotes 2>&1)
  if ($remotes -notcontains $remoteName) {
    throw "rclone remote '$($backupConfig.remote)' is not configured in $rcloneConfig. Run setup-gdrive-auth.cmd first."
  }

  Write-BackupLog ("Uploading to Google Drive folder id {0}" -f $folderId)
  & $rcloneExe @rcloneArgs copy $tempZip $remote --drive-root-folder-id $folderId 2>&1 | ForEach-Object {
    Write-BackupLog ("rclone: {0}" -f $_)
  }

  if ($LASTEXITCODE -ne 0) {
    throw "rclone copy failed with exit code $LASTEXITCODE."
  }

  $lsResult = & $rcloneExe @rcloneArgs lsf $remote --drive-root-folder-id $folderId 2>&1 | Out-String
  if ($lsResult -notmatch [regex]::Escape($backupName)) {
    Write-BackupLog ("Warning: {0} was not listed after upload. Verify manually at {1}" -f $backupName, $folderUrl)
  } else {
    Write-BackupLog ("Backup confirmed in Google Drive: {0}" -f $folderUrl)
  }

  Remove-Item $tempZip -Force
  Write-BackupLog "Temporary ZIP removed."
  Write-BackupLog "=== Google Drive backup completed successfully ==="
} catch {
  Write-BackupLog ("Backup failed: {0}" -f $_.Exception.Message)
  exit 1
}
