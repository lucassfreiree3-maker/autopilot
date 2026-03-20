@echo off
setlocal

set RCLONE=<USER_HOME>\AppData\Local\Microsoft\WinGet\Packages\Rclone.Rclone_Microsoft.Winget.Source_8wekyb3d8bbwe\rclone-v1.73.2-windows-amd64\rclone.exe
set AUTOPILOT=<SAFE_ROOT>
set REMOTE=gdrive
set FOLDER_ID=1Vx0vXKGkZcj7jRv5dThLti4MlTHk6eo9
set FOLDER_URL=https://drive.google.com/drive/u/1/folders/1Vx0vXKGkZcj7jRv5dThLti4MlTHk6eo9
set RCLONE_CONFIG=%AUTOPILOT%\secrets\rclone.conf

if not exist "%AUTOPILOT%\secrets" mkdir "%AUTOPILOT%\secrets"

echo.
echo ============================================================
echo  [1/4] Autorizando rclone no Google Drive...
echo  O navegador sera aberto. Faca login com sua conta Google.
echo ============================================================
echo.
pause

"%RCLONE%" --config "%RCLONE_CONFIG%" config create %REMOTE% drive scope=drive.file --auto-confirm

echo.
echo ============================================================
echo  [2/4] Testando acesso ao folder configurado...
echo ============================================================
"%RCLONE%" --config "%RCLONE_CONFIG%" lsf %REMOTE%: --drive-root-folder-id %FOLDER_ID%
if %ERRORLEVEL% NEQ 0 (
    echo ERRO: Nao foi possivel acessar o folder do Google Drive.
    echo Verifique a permissao e a existencia do destino:
    echo   %FOLDER_URL%
    pause
    exit /b 1
)
echo OK - folder do Google Drive acessivel.

echo.
echo ============================================================
echo  [3/4] Registrando watcher no Task Scheduler...
echo  (inicia automaticamente ao fazer login no Windows)
echo ============================================================

schtasks /delete /tn "BBDevOpsAutopilot-GDriveWatcher" /f 2>nul

schtasks /create /tn "BBDevOpsAutopilot-GDriveWatcher" ^
  /tr "powershell.exe -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%AUTOPILOT%\gdrive-backup-watcher.ps1\"" ^
  /sc ONLOGON ^
  /ru "%USERNAME%" ^
  /it /f

if %ERRORLEVEL% EQU 0 (
    echo OK - Watcher agendado para iniciar no login.
) else (
    echo AVISO: Falha ao agendar. Tente como Administrador.
)

echo.
echo ============================================================
echo  [4/4] Executando primeiro backup agora...
echo ============================================================
powershell.exe -ExecutionPolicy Bypass -File "%AUTOPILOT%\gdrive-backup.ps1"

echo.
echo ============================================================
echo  CONCLUIDO! Sistema de backup ativo:
echo.
echo   AUTOMATICO: Detecta mudancas em tempo real.
echo               Apos 5 min de inatividade -> backup + upload.
echo               Inicia sozinho ao ligar/logar no Windows.
echo.
echo   MANUAL:     Execute backup-now.cmd a qualquer momento.
echo.
echo   DRIVE:      %FOLDER_URL%
echo               Arquivo: BBDevOpsAutopilot-backup.zip
echo               Substitui o anterior, sem acumular arquivos.
echo.
echo   CONFIG:     %RCLONE_CONFIG%
echo               OAuth do rclone fica dentro do safe-root do Autopilot.
echo.
echo   LOG:        %AUTOPILOT%\logs\gdrive-backup.log
echo ============================================================
echo.
echo Iniciando o watcher agora (rodara em background)...
start "" powershell.exe -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "%AUTOPILOT%\gdrive-backup-watcher.ps1"

pause
