@echo off
chcp 65001 >nul
echo ========================================
echo    NetShark 网络抓包工具
echo ========================================
echo.
echo [1/3] 正在启动后端服务...
echo.

REM 检查是否以管理员身份运行
net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo ❌ 错误: 需要管理员权限!
    echo.
    echo 请右键点击此文件，选择"以管理员身份运行"
    echo.
    pause
    exit /b 1
)

REM 切换到脚本所在目录
cd /d "%~dp0"

REM 检查 dist 文件夹是否存在
if not exist "dist\index.html" (
    echo ❌ 错误: 前端未构建!
    echo.
    echo 请先运行: npm run build
    echo.
    pause
    exit /b 1
)

echo [2/3] 等待服务器就绪...
timeout /t 2 /nobreak >nul

echo [3/3] 正在打开浏览器...
start http://localhost:8000

echo.
echo ========================================
echo ✓ NetShark 正在运行!
echo.
echo 浏览器地址: http://localhost:8000
echo 按 Ctrl+C 停止服务
echo ========================================
echo.

REM 启动 Python 服务器（前台运行）
python backend/main.py

