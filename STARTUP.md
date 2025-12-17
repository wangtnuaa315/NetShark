# NetShark 现代化启动指南

## 🚀 最简单的启动方式（推荐）

### 一条命令启动所有服务

```bash
npm start
```

就这么简单！✨

---

## 📋 工作原理

使用 **concurrently** 包（Node.js 生态标准工具）并发启动：
- 🔵 **后端** (Python FastAPI)  
- 🟣 **前端** (Vite)

**优点**:
- ✅ **单窗口，彩色日志**（蓝色=后端，紫色=前端）
- ✅ **单命令启动/停止** (Ctrl+C 停止所有)
- ✅ **跨平台** (Windows/Mac/Linux 都支持)
- ✅ **业界标准** (大部分 Web 项目都这么做)

---

## 🔧 停止服务

按 `Ctrl+C` 即可停止前端和后端

---

## 📦 其他可用命令

```bash
# 只启动前端
npm run dev

# 只启动后端
npm run backend

# 生产打包
npm run build
```

---

## ⚠️ 首次使用注意

### 1. 安装 Npcap 驱动（仅首次）

**手动安装**（最可靠）:
```
双击: dependencies\npcap-1.85.exe
```

**或 PowerShell 安装**:
```powershell
Start-Process "dependencies\npcap-1.85.exe" -ArgumentList "/S", "/winpcap_mode=yes" -Wait
```

### 2. 需要管理员权限

确保在**管理员**终端中运行 `npm start`

---

## 🎯 完整启动流程

```bash
# 1. 打开管理员 PowerShell/CMD
# 2. 进入项目目录
cd D:\PythonProject\NetShark

# 3. 安装依赖（首次）
npm install

# 4. 启动！
npm start

# 5. 访问
# http://localhost:5173/
```

---

## 🆚 对比旧方案

| 特性 | PowerShell 脚本 | npm start (新方案) |
|------|---------------|-------------------|
| 窗口数量 | 2个 | **1个** ✅ |
| 日志合并 | ❌ 分离 | **✅ 合并,彩色** |
| 语法错误 | ❌ 频繁 | **✅ 无** |
| 跨平台 | ❌ 仅 Windows | **✅ 全平台** |
| 停止方式 | 关闭窗口 | **Ctrl+C** ✅ |
| 业界标准 | ❌ | **✅** |

---

访问: **http://localhost:5173/**
