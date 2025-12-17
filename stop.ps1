# NetShark 停止脚本
# 用于停止后台运行的服务

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  NetShark - 停止服务" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 查找 NetShark 相关进程
$pythonProcesses = Get-Process python -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like "*backend.main*"
}

$nodeProcesses = Get-Process node -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like "*vite*"
}

$stopped = $false

# 停止后端
if ($pythonProcesses) {
    Write-Host "停止后端服务..." -ForegroundColor Yellow
    $pythonProcesses | Stop-Process -Force
    $stopped = $true
}

# 停止前端
if ($nodeProcesses) {
    Write-Host "停止前端服务..." -ForegroundColor Yellow
    $nodeProcesses | Stop-Process -Force
    $stopped = $true
}

if ($stopped) {
    Write-Host ""
    Write-Host "[OK] 所有 NetShark 服务已停止" -ForegroundColor Green
}
else {
    Write-Host "[INFO] 未发现运行中的 NetShark 服务" -ForegroundColor Yellow
}

Write-Host ""
Read-Host "按 ENTER 退出"
