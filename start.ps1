# NetShark 启动脚本（改进版）
# 双窗口模式 - 稳定可靠

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Clear-Host

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "     NetShark - 网络流量分析工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[错误] 需要管理员权限" -ForegroundColor Red
    Write-Host ""
    Write-Host "请右键选择 '以管理员身份运行'" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "按 ENTER 退出"
    exit 1
}

# 检查并安装 Npcap
Write-Host "[1/3] 检查 Npcap 驱动..." -ForegroundColor Yellow

$npcapService = Get-Service -Name "npcap" -ErrorAction SilentlyContinue

if ($null -eq $npcapService) {
    Write-Host ""
    Write-Host "  未检测到 Npcap，正在自动安装..." -ForegroundColor Yellow
    
    $installers = Get-ChildItem -Path ".\dependencies\npcap*.exe" -ErrorAction SilentlyContinue
    
    if ($installers.Count -gt 0) {
        $installerPath = $installers[0].FullName
        Write-Host "  安装包: $($installers[0].Name)" -ForegroundColor Gray
        Write-Host "  正在安装，请稍候..." -ForegroundColor Gray
        
        Start-Process -FilePath $installerPath -ArgumentList "/S", "/winpcap_mode=yes", "/loopback_support=yes" -Wait
        Start-Sleep -Seconds 5
        
        Write-Host "  [完成] Npcap 安装成功" -ForegroundColor Green
    }
    else {
        Write-Host "  [错误] 未找到 Npcap 安装包" -ForegroundColor Red
        Write-Host ""
        Read-Host "按 ENTER 退出"
        exit 1
    }
}
else {
    Write-Host "  [已安装] Npcap 就绪" -ForegroundColor Green
}

Write-Host ""
Write-Host "[2/3] 启动后端服务..." -ForegroundColor Yellow

$backendCmd = @"
`$Host.UI.RawUI.WindowTitle = 'NetShark - 后端服务'
Set-Location '$ScriptDir'
`$env:PYTHONPATH = '$ScriptDir'
Write-Host '后端服务启动中...' -ForegroundColor Cyan
python -m backend.main
"@

Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd

Start-Sleep -Seconds 3

Write-Host "[3/3] 启动前端服务..." -ForegroundColor Yellow

$frontendCmd = @"
`$Host.UI.RawUI.WindowTitle = 'NetShark - 前端服务'
Set-Location '$ScriptDir'
Write-Host '前端服务启动中...' -ForegroundColor Magenta
npm run dev
"@

Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "     NetShark 启动成功！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  访问地址: " -NoNewline
Write-Host "http://localhost:5173/" -ForegroundColor Cyan
Write-Host ""
Write-Host "  已打开两个服务窗口:" -ForegroundColor Gray
Write-Host "    - NetShark - 后端服务 (蓝色)" -ForegroundColor Gray
Write-Host "    - NetShark - 前端服务 (紫色)" -ForegroundColor Gray
Write-Host ""
Write-Host "  💡 提示: 可以最小化这两个窗口" -ForegroundColor Yellow
Write-Host "  🛑 停止: 关闭两个服务窗口 或 运行 stop.ps1" -ForegroundColor Yellow
Write-Host ""
Write-Host "按任意键关闭此启动窗口（服务将继续运行）..." -ForegroundColor Gray

$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
