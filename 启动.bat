@echo off
REM OVO launcher: desktop only (no standalone browser server). ASCII-only.
cd /d "%~dp0"

:menu
cls
echo.
echo ========================================
echo   OVO Launcher
echo ========================================
echo   1  Desktop app  - OVO window
echo   2  LiteLLM Docker  - port 4000
echo   3  Build OVO.exe  - run build_exe.bat
echo   0  Exit
echo ========================================
set "choice="
set /p "choice=Choose 0-3: "
if "%choice%"=="1" goto run_desktop
if "%choice%"=="2" goto run_litellm
if "%choice%"=="3" goto run_build
if "%choice%"=="0" goto eof
echo Invalid choice.
timeout /t 2 >nul
goto menu

:run_desktop
echo.
echo OVO desktop
call :find_py
if not defined PY_CMD goto pause_err
%PY_CMD% desktop_app.py
goto after_run

:run_litellm
echo.
echo ========================================
echo   LiteLLM  Docker backend
echo ========================================
where docker >nul 2>nul
if errorlevel 1 (
  echo ERROR: Docker not found. Install Docker Desktop.
  echo https://www.docker.com/products/docker-desktop/
  goto after_run
)
set "CONFIG_PATH=%~dp0litellm\config.yaml"
if not exist "%CONFIG_PATH%" (
  echo ERROR: Missing config: %CONFIG_PATH%
  goto after_run
)
echo Stopping old container if any...
docker stop litellm 2>nul
docker rm litellm 2>nul
echo.
echo Starting LiteLLM on port 4000...
docker run -d -p 4000:4000 --name litellm -v "%CONFIG_PATH%:/app/config.yaml" ghcr.io/berriai/litellm:main-latest --config /app/config.yaml
if errorlevel 1 (
  echo ERROR: docker run failed. Try: docker stop litellm
  goto after_run
)
echo.
echo LiteLLM started. Run menu option 1 for OVO desktop.
echo Logs: docker logs litellm    Stop: docker stop litellm
goto after_run

:run_build
call "%~dp0build_exe.bat"
goto menu

:find_py
set "PY_CMD="
py -3.12 -c "exit(0)" 2>nul
if not errorlevel 1 (
  set "PY_CMD=py -3.12"
  goto :eof
)
py -3.11 -c "exit(0)" 2>nul
if not errorlevel 1 (
  set "PY_CMD=py -3.11"
  goto :eof
)
py -3 -c "exit(0)" 2>nul
if not errorlevel 1 (
  set "PY_CMD=py -3"
  goto :eof
)
where python >nul 2>nul
if not errorlevel 1 set "PY_CMD=python"
goto :eof

:pause_err
echo ERROR: Python not found. Install 3.11+ and add to PATH.
pause
goto menu

:after_run
if errorlevel 1 pause
echo.
set "again="
set /p "again=Enter=menu  Q=quit: "
if /i "%again%"=="Q" goto eof
goto menu

:eof
exit /b 0
