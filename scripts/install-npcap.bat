@echo off
REM ========================================
REM NetShark - Npcap 自动安装脚本
REM ========================================

title Installing Npcap Driver...

echo.
echo ========================================
echo   NetShark - Npcap Driver Installer
echo ========================================
echo.

REM 检查是否以管理员身份运行
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] This script requires administrator privileges.
    echo Please right-click and select "Run as administrator".
    echo.
    pause
    exit /b 1
)

REM 检查 Npcap 是否已安装
echo [1/3] Checking existing installation...
sc query npcap >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Npcap is already installed.
    echo.
    pause
    exit /b 0
)

REM 检查安装包是否存在
set INSTALLER_PATH=%~dp0..\dependencies\npcap-1.79.exe

if not exist "%INSTALLER_PATH%" (
    echo [ERROR] Npcap installer not found at:
    echo   %INSTALLER_PATH%
    echo.
    echo Please download Npcap from https://npcap.com/
    echo and place it in the dependencies\ folder.
    echo.
    pause
    exit /b 1
)

REM 执行静默安装
echo [2/3] Installing Npcap driver...
echo This may take 30-60 seconds...
echo.

"%INSTALLER_PATH%" /S /winpcap_mode=yes /loopback_support=yes

REM 等待安装完成
timeout /t 10 /nobreak >nul

REM 验证安装
echo [3/3] Verifying installation...
sc query npcap >nul 2>&1
if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo   Installation Successful!
    echo ========================================
    echo.
    echo Npcap driver has been installed.
    echo You can now use NetShark to capture network traffic.
    echo.
) else (
    echo.
    echo [WARNING] Installation may have failed.
    echo Please restart your computer and try again.
    echo.
)

pause
