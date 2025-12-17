@echo off
REM ========================================
REM NetShark - 测试启动脚本
REM 用于诊断问题
REM ========================================

REM 强制切换到脚本所在目录
cd /d "%~dp0"

echo Current directory: %cd%
echo Script location: %~dp0
echo.

echo Checking files...
echo.

if exist "scripts\start-dev.bat" (
    echo [OK] scripts\start-dev.bat found
) else (
    echo [ERROR] scripts\start-dev.bat NOT found
)

if exist "dependencies\npcap*.exe" (
    echo [OK] Npcap installer found
    dir dependencies\npcap*.exe
) else (
    echo [ERROR] Npcap installer NOT found in dependencies\
)

if exist "backend\main.py" (
    echo [OK] backend\main.py found
) else (
    echo [ERROR] backend\main.py NOT found
)

echo.
echo Press any key to continue...
pause >nul

REM 尝试运行启动脚本
echo.
echo Calling scripts\start-dev.bat...
call "scripts\start-dev.bat"
