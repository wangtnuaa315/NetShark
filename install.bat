@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

echo.
echo ==============================================================
echo                    NetShark 安装向导
echo                  网络流量分析工具 v1.0
echo ==============================================================
echo.

cd /d "%~dp0"

:: ============================================================
:: 1. 检测 Python 环境
:: ============================================================
echo [1/5] 检测 Python 环境...

where python >nul 2>&1
if %errorlevel% neq 0 (
    echo       [错误] 未检测到 Python，请先安装 Python 3.10+
    echo       下载地址: https://www.python.org/downloads/
    pause
    exit /b 1
)

for /f "tokens=2 delims= " %%v in ('python --version 2^>^&1') do set PYTHON_VERSION=%%v
echo       检测到 Python %PYTHON_VERSION%

for /f "tokens=1,2 delims=." %%a in ("%PYTHON_VERSION%") do (
    set MAJOR=%%a
    set MINOR=%%b
)

if %MAJOR% lss 3 (
    echo       [错误] Python 版本过低，需要 Python 3.10+
    pause
    exit /b 1
)
echo       [OK] Python 版本检测通过

:: ============================================================
:: 2. 检测/安装 Npcap
:: ============================================================
echo.
echo [2/5] 检测 Npcap 驱动...

if exist "C:\Program Files\Npcap\NPFInstall.exe" (
    echo       [OK] Npcap 已安装
) else if exist "C:\Windows\System32\Npcap\NPFInstall.exe" (
    echo       [OK] Npcap 已安装
) else (
    echo       [警告] 未检测到 Npcap 驱动
    
    if exist "tools\npcap-1.80.exe" (
        echo       正在启动 Npcap 安装程序...
        start /wait "" "tools\npcap-1.80.exe"
    ) else if exist "tools\npcap-1.85.exe" (
        echo       正在启动 Npcap 安装程序...
        start /wait "" "tools\npcap-1.85.exe"
    ) else (
        echo.
        echo       请手动下载并安装 Npcap:
        echo       https://npcap.com/#download
        echo.
        echo       或将 npcap-1.85.exe 放到 tools 文件夹中重新运行
        echo.
        echo 按任意键继续...
        pause > nul
    )
)

:: ============================================================
:: 3. 创建/激活虚拟环境
:: ============================================================
echo.
echo [3/5] 配置 Python 虚拟环境...

if not exist "venv" (
    echo       正在创建虚拟环境...
    python -m venv venv
    if %errorlevel% neq 0 (
        echo       [错误] 创建虚拟环境失败
        pause
        exit /b 1
    )
    echo       [OK] 虚拟环境创建成功
) else (
    echo       [OK] 虚拟环境已存在
)

:: ============================================================
:: 4. 安装 Python 依赖
:: ============================================================
echo.
echo [4/5] 安装 Python 依赖包...

call venv\Scripts\activate.bat

python -m pip install --upgrade pip -q 2>nul

if exist "requirements.txt" (
    pip install -r requirements.txt -q 2>nul
    echo       [OK] 依赖安装完成
) else (
    echo       [警告] 未找到 requirements.txt
)

:: ============================================================
:: 5. 构建前端
:: ============================================================
echo.
echo [5/5] 检查前端构建...

if exist "dist\index.html" (
    echo       [OK] 前端已构建
) else (
    echo       [提示] 前端未构建，需运行: npm install and npm run build
)

:: ============================================================
:: 完成
:: ============================================================
echo.
echo ==============================================================
echo                        安装完成!
echo ==============================================================
echo.
echo   启动方式: 双击 start.bat
echo   访问地址: http://localhost:8000
echo.
echo ==============================================================
echo.

pause
