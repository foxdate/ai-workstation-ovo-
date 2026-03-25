@echo off
chcp 65001 >nul
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
  echo [提示] 未检测到 Python。请先安装并勾选「Add python.exe to PATH」。
  echo 下载: https://www.python.org/downloads/
  echo.
  set /p "open=是否用浏览器打开 Python 下载页？(Y/N): "
  if /i "%open%"=="Y" start https://www.python.org/downloads/
  goto :end
)

echo 使用: %PY_CMD%
echo.
%PY_CMD% 检查安装.py

echo.
echo ========================================
echo   可选：桌面版内嵌窗口依赖 (pywebview)
echo ========================================
echo 仅用浏览器打开可不装。详见 docs\如何安装依赖.md
echo.
set /p "deps=是否尝试安装 pywebview？(Y/N): "
if /i not "%deps%"=="Y" goto :end

echo.
echo [1/2] pip install pywebview ...
%PY_CMD% -m pip install pywebview
if errorlevel 1 (
  echo.
  echo [2/2] pip install pywebview[cef] ...
  %PY_CMD% -m pip install "pywebview[cef]"
)
if errorlevel 1 (
  echo.
  echo 安装未成功时可忽略，在「启动.bat」选 2 会用浏览器打开，功能相同。
) else (
  echo.
  echo 已安装。可在「启动.bat」选 2 启动桌面版。
)
echo.

:end
pause
