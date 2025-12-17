@echo off
REM ========================================
REM NetShark - 一键启动脚本（自动安装 Npcap）
REM ========================================

title NetShark Launcher

REM ★★★ 关键修复：先切换到脚本所在目录 ★★★
cd /d "%~dp0.."

echo.
echo ========================================
echo   NetShark - Network Traffic Analyzer
echo ========================================
echo.
echo Working Directory: %cd%
echo.

REM 检查管理员权限
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] This script requires administrator privileges.
    echo.
    echo Please:
    echo   1. Right-click this file
    echo   2. Select "Run as administrator"
    echo.
    pause
    exit /b 1
)

REM 检查 Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js first.
    echo Download from: https://nodejs.org/
    pause
    exit /b 1
)

REM 检查 Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found. Please install Python 3.9+.
    echo Download from: https://www.python.org/
    pause
    exit /b 1
)

REM ========================================
REM 自动检测并安装 Npcap
REM ========================================
echo [1/3] Checking Npcap driver...

sc query npcap >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Npcap driver not found.
    echo [*] Installing Npcap automatically...
    echo.
    
    REM 自动检测 dependencies 目录下的 npcap 安装包（使用绝对路径）
    set INSTALLER_PATH=
    for %%f in ("%cd%\dependencies\npcap*.exe") do (
        set INSTALLER_PATH=%%f
        goto :found_installer
    )
    
    :found_installer
    if "%INSTALLER_PATH%"=="" (
        echo [ERROR] Npcap installer not found in dependencies\ folder.
        echo Current directory: %cd%
        echo.
        echo Please download Npcap from https://npcap.com/
        echo and place npcap-x.xx.exe in: %cd%\dependencies\
        echo.
        pause
        exit /b 1
    )
    
    echo Found installer: %INSTALLER_PATH%
    echo Installing Npcap (this may take 30 seconds)...
    "%INSTALLER_PATH%" /S /winpcap_mode=yes /loopback_support=yes
    
    REM 等待安装完成
    timeout /t 10 /nobreak >nul
    
    REM 验证安装
    sc query npcap >nul 2>&1
    if %errorlevel% neq 0 (
        echo.
        echo [WARNING] Npcap installation may have failed.
        echo NetShark will start in demo mode (mock data).
        echo.
        echo To fix: Manually run the installer in dependencies\ folder
        echo.
        pause
    ) else (
        echo [OK] Npcap installed successfully!
        echo.
    )
) else (
    echo [OK] Npcap is ready.
)

REM ========================================
REM 启动服务
REM ========================================
echo.
echo [2/3] Starting Python backend...
start "NetShark Backend" cmd /k "cd /d "%cd%" && $env:PYTHONPATH='%cd%'; python -m backend.main"

REM 等待后端启动
timeout /t 3 /nobreak >nul

echo [3/3] Starting Vite frontend...
start "NetShark Frontend" cmd /k "cd /d "%cd%" && npm run dev"

echo.
echo ========================================
echo   NetShark is Running!
echo ========================================
echo.
echo Frontend: http://localhost:5173/
echo Backend:  http://localhost:8000/
echo.
echo Press any key to stop all services...
pause >nul

REM 关闭所有相关进程
taskkill /FI "WINDOWTITLE eq NetShark*" /F >nul 2>&1
echo.
echo Services stopped.

