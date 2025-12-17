# NetShark 后台启动脚本
# 服务在后台运行，关闭窗口不影响

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  NetShark - 后台模式启动" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERROR] 需要管理员权限" -ForegroundColor Red
    Read-Host "按 ENTER 退出"
    exit 1
}

# 检查 Npcap（简化版，已安装则跳过）
$npcapService = Get-Service -Name "npcap" -ErrorAction SilentlyContinue
if ($null -eq $npcapService) {
    Write-Host "[!] Npcap 未安装，正在安装..." -ForegroundColor Yellow
    $installers = Get-ChildItem -Path ".\dependencies\npcap*.exe" -ErrorAction SilentlyContinue
    if ($installers.Count -gt 0) {
        $installerPath = $installers[0].FullName
        Start-Process -FilePath $installerPath -ArgumentList "/S", "/winpcap_mode=yes", "/loopback_support=yes" -Wait
        Start-Sleep -Seconds 5
        Write-Host "[OK] Npcap 安装完成" -ForegroundColor Green
    }
}

# 构建命令字符串（避免引号嵌套问题）
$projectPath = $ScriptDir

# 启动后端（隐藏窗口）
Write-Host "[1/2] 启动后端服务（后台）..." -ForegroundColor Yellow

$backendScript = @"
Set-Location '$projectPath'
`$env:PYTHONPATH = '$projectPath'
python -m backend.main
"@

$backendProcess = Start-Process powershell -ArgumentList "-WindowStyle", "Hidden", "-Command", $backendScript -PassThru

Start-Sleep -Seconds 3

# 启动前端（隐藏窗口）
Write-Host "[2/2] 启动前端服务（后台）..." -ForegroundColor Yellow

$frontendScript = @"
Set-Location '$projectPath'
npm run dev
"@

$frontendProcess = Start-Process powershell -ArgumentList "-WindowStyle", "Hidden", "-Command", $frontendScript -PassThru

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  ✅ NetShark 已在后台运行" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "访问: http://localhost:5173/" -ForegroundColor Cyan
Write-Host ""
Write-Host "进程信息:" -ForegroundColor Gray
Write-Host "  后端 PID: $($backendProcess.Id)" -ForegroundColor Gray
Write-Host "  前端 PID: $($frontendProcess.Id)" -ForegroundColor Gray
Write-Host ""
Write-Host "如需停止服务，运行: .\stop.ps1" -ForegroundColor Yellow
Write-Host ""
Read-Host "按 ENTER 退出（服务将继续运行）"
