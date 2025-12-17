# NetShark 项目清理记录

## 📁 文件整理 (2025-12-09)

### ✅ 已移动到 `docs-archive/` 目录

以下临时调试文档已归档：

- `PID_FIX_GUIDE.md` - PID 问题调试指南
- `DEBUG_PID.md` - PID 调试步骤
- `QUICKSTART.md` - 快速启动指南（已被 README.md 替代）
- `HOW_TO_START.md` - 启动说明（已被 STARTUP.md 替代）
- `START_POWERSHELL.md` - PowerShell 启动详细说明
- `TROUBLESHOOTING.md` - 后端连接问题排查
- `PAYLOAD_ENCODING_FIX.md` - Payload 编码修复记录
- `LATENCY_FIX.md` - 延迟计算修复记录

### ✅ 已移动到 `docs-archive/` 目录（废弃的启动脚本）

- `start.bat` - 旧的 batch 启动脚本（已被 start.ps1 替代）
- `start-background.ps1` - 后台模式启动脚本（已被 start.ps1 替代）
- `simple-start.bat` - 简化版调试脚本
- `test-start.bat` - 测试启动脚本

### ✅ 已删除（错误创建的文件）

- `backend/services/packet_capture_latency.py` - 错误创建的重复文件
- `src/components/ConfigScreen.jsx.backup` - 临时备份文件
- `src/components/ConfigScreen.jsx.broken` - 损坏的文件版本

---

## 📋 当前项目文件结构

### 根目录保留的关键文件

- **README.md** - 项目主文档（包含快速开始指南）
- **STARTUP.md** - 详细启动说明
- **start.ps1** - 主启动脚本（推荐使用）
- **stop.ps1** - 停止脚本
- **package.json** - Node.js 配置
- **requirements.txt** - Python 依赖

### 代码目录

- `backend/` - Python 后端
- `src/` - React 前端
- `dependencies/` - Npcap 安装包
- `scripts/` - 辅助脚本

### 归档目录

- `docs-archive/` - 临时调试文档归档

---

## 💡 使用建议

### 启动应用

```bash
# 推荐方式
npm start
```

### 查看文档

- 快速开始: 查看 `README.md`
- 详细启动说明: 查看 `STARTUP.md`
- 调试历史: 查看 `docs-archive/` 目录

### 停止服务

```bash
# 方式1: Ctrl+C (在 npm start 窗口)
# 方式2: 运行停止脚本
.\stop.ps1
```

---

## 📝 备注

所有归档的文档都保留在 `docs-archive/` 目录中，仅供参考。日常使用只需关注：
- `README.md` - 快速开始
- `STARTUP.md` - 详细说明
- `start.ps1` / `npm start` - 启动命令
