# NetShark 启动指南 (PowerShell 版)

由于批处理脚本在您的环境中存在闪退问题，请使用以下 PowerShell 命令手动启动。

---

## 🚀 一次性准备（首次使用）

### 1. 安装 Npcap 驱动
```powershell
# 以管理员身份打开 PowerShell，执行：
Start-Process "D:\PythonProject\NetShark\dependencies\npcap-1.85.exe" -Wait
```

或双击: `D:\PythonProject\NetShark\dependencies\npcap-1.85.exe`

---

## 🎯 日常启动（每次使用）

### 方法1: 两个终端窗口

#### 终端1 - 启动后端
```powershell
# 以管理员身份打开 PowerShell
cd D:\PythonProject\NetShark
$env:PYTHONPATH = 'D:\PythonProject\NetShark'
python -m backend.main
```

#### 终端2 - 启动前端
```powershell
# 普通权限即可
cd D:\PythonProject\NetShark
npm run dev
```

访问: **http://localhost:5173/**

---

### 方法2: 一条命令启动（推荐）

```powershell
# 以管理员身份打开 PowerShell，执行：
cd D:\PythonProject\NetShark

# 启动后端（后台）
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd D:\PythonProject\NetShark; `$env:PYTHONPATH='D:\PythonProject\NetShark'; python -m backend.main"

# 等待2秒
Start-Sleep -Seconds 2

# 启动前端（后台）
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd D:\PythonProject\NetShark; npm run dev"

Write-Host ""
Write-Host "==================================="
Write-Host "  NetShark 已启动"
Write-Host "==================================="
Write-Host ""
Write-Host "前端: http://localhost:5173/"
Write-Host "后端: http://localhost:8000/"
```

---

## 🛑 停止服务

```powershell
# 关闭所有 Python backend
Get-Process | Where-Object {$_.MainWindowTitle -like "*NetShark*"} | Stop-Process -Force

# 或者直接关闭弹出的两个 PowerShell 窗口
```

---

## 📝 保存为 PowerShell 脚本（可选）

创建文件: `D:\PythonProject\NetShark\start.ps1`

```powershell
# NetShark 启动脚本
Set-Location "D:\PythonProject\NetShark"

Write-Host "启动 NetShark..." -ForegroundColor Cyan

# 启动后端
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd D:\PythonProject\NetShark; `$env:PYTHONPATH='D:\PythonProject\NetShark'; python -m backend.main"

Start-Sleep -Seconds 2

# 启动前端  
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd D:\PythonProject\NetShark; npm run dev"

Write-Host ""
Write-Host "✅ 服务已启动" -ForegroundColor Green
Write-Host "访问: http://localhost:5173/" -ForegroundColor Yellow
```

然后在管理员 PowerShell 中运行:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\start.ps1
```

---

## ⚠️ 常见问题

### 问题: "无法运行脚本"
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

### 问题: 端口占用
```powershell
# 检查端口
netstat -ano | findstr "8000"
netstat -ano | findstr "5173"

# 杀死进程
Stop-Process -Id <PID> -Force
```
