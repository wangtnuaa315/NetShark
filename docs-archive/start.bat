@echo off
REM ========================================
REM NetShark - 快速启动 (推荐使用)
REM 自动检测并安装 Npcap
REM ========================================

echo NetShark Launcher Starting...
echo.

REM 切换到脚本所在目录
cd /d "%~dp0"

echo Current directory: %cd%
echo.

REM 检查 scripts\start-dev.bat 是否存在
if not exist "scripts\start-dev.bat" (
    echo [ERROR] Startup script not found!
    echo Expected location: %cd%\scripts\start-dev.bat
    echo.
    pause
    exit /b 1
)

echo [OK] Found scripts\start-dev.bat
echo.
echo Calling startup script...
echo.

REM 调用启动脚本（不要用 call，直接执行）
"scripts\start-dev.bat"

REM 如果执行失败，显示错误
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Startup script failed with error code: %errorlevel%
    echo.
    pause
)
