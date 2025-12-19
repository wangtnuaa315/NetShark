@echo off
chcp 65001 > nul
setlocal

echo.
echo ==============================================================
echo                        NetShark
echo                    网络流量分析工具
echo ==============================================================
echo.

cd /d "%~dp0"

:: ============================================================
:: 检查是否已安装
:: ============================================================
if not exist "venv\Scripts\python.exe" (
    echo [错误] 虚拟环境未配置，请先运行 install.bat
    echo.
    pause
    exit /b 1
)

:: ============================================================
:: 强制结束占用端口的进程
:: ============================================================
echo 检查端口 8000...

for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr ":8000" ^| findstr "LISTENING"') do (
    echo [警告] 端口 8000 被进程 %%p 占用，正在结束...
    taskkill /F /PID %%p > nul 2>&1
)
timeout /t 1 /nobreak > nul

:: ============================================================
:: 快速检测 Npcap
:: ============================================================
if not exist "C:\Program Files\Npcap\NPFInstall.exe" (
    if not exist "C:\Windows\System32\Npcap\NPFInstall.exe" (
        echo [警告] 未检测到 Npcap 驱动，本地抓包可能无法使用
        echo.
    )
)

:: ============================================================
:: 检查前端是否已构建
:: ============================================================
if not exist "dist\index.html" (
    echo [错误] 前端未构建，请先运行: npm run build
    pause
    exit /b 1
)

:: ============================================================
:: 启动服务
:: ============================================================
echo 正在启动 NetShark 服务...
echo.
echo   访问地址: http://localhost:8000
echo   按 Ctrl+C 停止服务
echo.
echo   提示: 如果页面显示旧版本，请按 Ctrl+F5 强制刷新
echo.
echo --------------------------------------------------------------
echo.

:: 激活虚拟环境
call venv\Scripts\activate.bat

:: 1.5秒后自动打开浏览器
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:8000"

:: 启动后端服务 (添加 --reload 可以在开发时使用)
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000

:: 如果服务退出
echo.
echo 服务已停止。
pause
