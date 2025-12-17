# NetShark 网络流量分析工具

> 一个为内部使用设计的 Windows 网络数据包捕获与分析工具

---

## 🚀 快速开始

### ⚡ 一键启动（真正的现代化方案）

**以管理员身份**打开终端（PowerShell/CMD），然后执行：

```bash
cd D:\PythonProject\NetShark
npm start
```

**就这一条命令！** ✨

**特点**: 
- ✅ **单窗口，彩色合并日志**（蓝色=后端，紫色=前端）
- ✅ **业界标准工具** (concurrently - npm 生态标准)
- ✅ **Ctrl+C 一键停止所有服务**
- ✅ **跨平台兼容** (Windows/Mac/Linux)
- ✅ **零配置，开箱即用**

访问: **http://localhost:5173/**

---

### 📝 首次使用

1. **安装 Npcap 驱动**（仅首次）:
   ```
   双击: dependencies\npcap-1.85.exe
   ```

2. **安装依赖**（仅首次）:
   ```bash
   npm install
   ```

3. **启动**:
   ```bash
   npm start
   ```

---

## 📦 系统要求

### 必需
- Windows 10/11 (x64)
- 管理员权限（用于安装驱动）
- 8GB+ 内存

### 软件依赖（开发环境）
- Node.js 18+
- Python 3.9+
- Npcap 1.79+ (自动安装)

---

## 📁 项目结构

```
NetShark/
├── backend/               # Python 后端 (FastAPI)
│   ├── main.py           # API 入口
│   └── services/         # 核心服务
│       ├── process_scanner.py   # 进程扫描
│       └── packet_capture.py    # 网络抓包 (待实现)
├── src/                  # React 前端
│   ├── components/       # UI 组件
│   ├── services/         # 业务逻辑
│   └── models/           # 数据模型
├── dependencies/         # 第三方依赖
│   └── npcap-1.79.exe   # Npcap 安装包 (需手动下载)
└── scripts/              # 工具脚本
    ├── install-npcap.bat      # 自动安装驱动
    └── start-dev.bat          # 启动开发环境
```

---

## 🔧 功能模块

### ✅ 已实现
- [x] 进程列表扫描（真实数据）
- [x] 应用选择与启动
- [x] 远程 Agent Ping 测试
- [x] 中文界面
- [x] 现代化 UI（TailwindCSS 深色主题）

### 🚧 开发中
- [ ] 真实网络流量捕获（Scapy + Npcap）
- [ ] WebSocket 实时推送
- [ ] HTTP/HTTPS 协议解析
- [ ] 数据包过滤与搜索

### 📋 计划中
- [ ] PCAP 文件导出
- [ ] 流量统计分析
- [ ] 异常检测告警
- [ ] 多进程并发监控

---

## 🛠️ 开发指南

### 安装依赖

```bash
# 前端依赖
npm install

# 后端依赖
pip install -r requirements.txt
```

### 手动启动（调试用）

```bash
# 终端 1: 启动后端
cd backend
python -m backend.main

# 终端 2: 启动前端
npm run dev
```

### 构建生产版本（待实现）

```bash
npm run build          # 前端打包
pyinstaller spec.py    # 后端打包
```

---

## 📝 依赖下载

### Npcap 驱动

由于许可证限制，Npcap 安装包需要手动下载：

1. 访问 https://npcap.com/#download
2. 下载 **Npcap 1.79 installer for Windows**
3. 将 `npcap-1.79.exe` 放到 `dependencies/` 目录
4. 运行 `scripts\install-npcap.bat`

---

## 🐛 故障排查

### 问题：启动后报 "Npcap not found"
**解决**: 运行 `scripts\install-npcap.bat` 安装驱动

### 问题：WinError 740 权限不足
**解决**: 以管理员身份运行终端

### 问题：前端无法连接后端
**解决**: 检查后端是否在 8000 端口运行，查看终端日志

---

## 📄 许可证

内部工具，仅供公司内部使用。

---

## 👥 维护者

- 开发: [您的团队]
- 联系: [您的邮箱]

---

## 📅 更新日志

### v1.0.0 (2025-12-09)
- ✨ 初始版本发布
- ✅ 进程扫描与选择
- ✅ 基础 UI 框架
- 🚧 网络抓包功能开发中
