@echo off
REM Build OVO.exe (onefile, windowed). ASCII-only.
cd /d "%~dp0"

set "PY_CMD="
py -3.12 -c "exit(0)" 2>nul
if not errorlevel 1 set "PY_CMD=py -3.12"
if not defined PY_CMD (
  py -3.11 -c "exit(0)" 2>nul
  if not errorlevel 1 set "PY_CMD=py -3.11"
)
if not defined PY_CMD (
  py -3 -c "exit(0)" 2>nul
  if not errorlevel 1 set "PY_CMD=py -3"
)
if not defined PY_CMD (
  where python >nul 2>nul
  if not errorlevel 1 set "PY_CMD=python"
)
if not defined PY_CMD (
  echo ERROR: Python not found.
  pause
  exit /b 1
)

echo Using: %PY_CMD%
echo Installing PyInstaller + pywebview...
%PY_CMD% -m pip install -q pyinstaller pywebview

echo Building...
%PY_CMD% -m PyInstaller --noconfirm --onefile --windowed --name "OVO" ^
  --add-data "index.html;." ^
  --add-data "highlights.html;." ^
  --add-data "integrated_apps.json;." ^
  --add-data "_check.js;." ^
  --add-data "scripts;scripts" ^
  --add-data "litellm;litellm" ^
  --add-data "docs;docs" ^
  --hidden-import server_with_proxy ^
  --collect-all pywebview ^
  desktop_app.py

if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)
echo.
echo Done: dist\OVO.exe
echo Place litellm folder next to OVO.exe if you use Docker LiteLLM from 启动.bat
pause
