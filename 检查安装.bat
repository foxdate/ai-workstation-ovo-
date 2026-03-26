@echo off
REM ASCII-only: avoids CMD parse bugs with echo and parentheses on Chinese Windows.
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
  echo.
  echo ERROR: Python not found. Install Python 3.11+ and check "Add python.exe to PATH".
  echo Download: https://www.python.org/downloads/
  echo.
  set /p "open=Open download page in browser? Y/N: "
  if /i "%open%"=="Y" start https://www.python.org/downloads/
  goto :end
)

echo Using: %PY_CMD%
echo.
%PY_CMD% 检查安装.py

echo.
echo ========================================
echo   Optional: pywebview for desktop window
echo ========================================
echo Skip if you only use the browser. See docs\如何安装依赖.md
echo.
set /p "deps=Install pywebview? Y/N: "
if /i not "%deps%"=="Y" goto :end

echo.
echo [1/2] pip install pywebview ...
%PY_CMD% -m pip install pywebview
if errorlevel 1 (
  echo.
  echo [2/2] pip install pywebview with CEF ...
  %PY_CMD% -m pip install "pywebview[cef]"
)
if errorlevel 1 (
  echo.
  echo Install failed - OK to skip. Launcher option 2 still opens browser.
) else (
  echo.
  echo Done. Use launcher option 2 for desktop.
)
echo.

:end
pause
