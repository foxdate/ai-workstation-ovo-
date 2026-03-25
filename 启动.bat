@echo off
chcp 65001 >nul
cd /d "%~dp0"

:menu
cls
echo.
echo ========================================
echo   OVO 启动
echo ========================================
echo   1  本地网页服务  (浏览器, 默认端口 8888)
echo   2  桌面版        (内嵌窗口或浏览器)
echo   3  LiteLLM       (Docker, 端口 4000)
echo   4  打包桌面 exe  (PyInstaller, 可选)
echo   0  退出
echo ========================================
set "choice="
set /p "choice=请选择 [0-4]: "
if "%choice%"=="1" goto run_web
if "%choice%"=="2" goto run_desktop
if "%choice%"=="3" goto run_litellm
if "%choice%"=="4" goto run_build
if "%choice%"=="0" goto eof
echo 无效选择，请重试。
timeout /t 2 >nul
goto menu

:run_web
echo.
echo OVO 本地网页服务
call :find_py
if not defined PY_CMD goto pause_err
%PY_CMD% -u server_with_proxy.py
goto after_run

:run_desktop
echo.
echo OVO 桌面版
call :find_py
if not defined PY_CMD goto pause_err
%PY_CMD% desktop_app.py
goto after_run

:run_litellm
echo.
echo ========================================
echo    启动 LiteLLM (AI 对话后端)
echo ========================================
where docker >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 Docker，请先安装并启动 Docker Desktop。
  echo 下载: https://www.docker.com/products/docker-desktop/
  goto after_run
)
set "CONFIG_PATH=%~dp0litellm\config.yaml"
if not exist "%CONFIG_PATH%" (
  echo [错误] 未找到配置文件: %CONFIG_PATH%
  goto after_run
)
echo 若已有旧容器将先删除再启动...
docker stop litellm 2>nul
docker rm litellm 2>nul
echo.
echo 正在启动 LiteLLM（端口 4000）...
docker run -d -p 4000:4000 --name litellm -v "%CONFIG_PATH%:/app/config.yaml" ghcr.io/berriai/litellm:main-latest --config /app/config.yaml
if errorlevel 1 (
  echo [错误] 启动失败。若端口被占用: docker stop litellm
  goto after_run
)
echo.
echo LiteLLM 已启动。请在本菜单选「1」打开网页与 AI 对话。
echo 查看日志: docker logs litellm   停止: docker stop litellm
goto after_run

:run_build
echo.
echo 正在打包 OVO 桌面版为 exe ...
call :find_py
if not defined PY_CMD goto pause_err
%PY_CMD% -m pip install pyinstaller pywebview -q
%PY_CMD% -m PyInstaller --noconfirm --onefile --windowed --name "OVO" --add-data "index.html;." --add-data "highlights.html;." --hidden-import "webview" desktop_app.py
if errorlevel 1 (
  echo 打包失败。
) else (
  echo 完成。输出: dist\OVO.exe
)
goto after_run

:find_py
set "PY_CMD="
py -3.12 -c "exit(0)" 2>nul
if not errorlevel 1 set "PY_CMD=py -3.12" & goto :eof
py -3.11 -c "exit(0)" 2>nul
if not errorlevel 1 set "PY_CMD=py -3.11" & goto :eof
py -3 -c "exit(0)" 2>nul
if not errorlevel 1 set "PY_CMD=py -3" & goto :eof
where python >nul 2>nul
if not errorlevel 1 set "PY_CMD=python"
goto :eof

:pause_err
echo [错误] 未找到 Python。请先安装 3.11+ 并加入 PATH。
pause
goto menu

:after_run
if errorlevel 1 pause
echo.
set "again="
set /p "again=按 Enter 返回菜单，或输入 Q 退出: "
if /i "%again%"=="Q" goto eof
goto menu

:eof
exit /b 0
