@echo off
REM 最简化的启动脚本 - 用于调试

echo ====================================
echo NetShark Simple Launcher
echo ====================================
echo.

REM 强制切换到项目目录
cd /d "D:\PythonProject\NetShark"
echo Current directory: %cd%
echo.

REM 显示 Npcap 状态
echo Checking Npcap...
sc query npcap >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Npcap installed
) else (
    echo [!] Npcap NOT installed
    echo Please run: dependencies\npcap-1.85.exe
    echo.
)

echo.
echo Press ENTER to start services...
pause >nul

echo.
echo Starting backend...
start "NetShark Backend" cmd /k "cd /d D:\PythonProject\NetShark && set PYTHONPATH=D:\PythonProject\NetShark && python -m backend.main"

timeout /t 2 >nul

echo Starting frontend...
start "NetShark Frontend" cmd /k "cd /d D:\PythonProject\NetShark && npm run dev"

echo.
echo ====================================
echo Services Started!
echo ====================================
echo.
echo Frontend: http://localhost:5173/
echo Backend:  http://localhost:8000/
echo.
echo Press any key to exit this window...
echo (Services will keep running)
pause >nul
