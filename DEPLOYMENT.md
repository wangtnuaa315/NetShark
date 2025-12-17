# NetShark 部署指南

## 🚀 快速开始（用户使用）

### 方法1：双击启动（推荐）
1. 右键点击 `NetShark.bat`
2. 选择 **"以管理员身份运行"**
3. 自动打开浏览器到 http://localhost:8000
4. 开始抓包！

### 方法2：命令行启动
```bash
# 以管理员身份打开 PowerShell/CMD
cd d:\PythonProject\NetShark
python backend/main.py
# 手动打开浏览器访问 http://localhost:8000
```

---

## 📦 打包部署（开发者）

### 前置要求
- Python 3.8+
- Node.js 16+

### 步骤1：构建前端
```bash
npm install
npm run build
```
这会生成 `dist/` 文件夹。

### 步骤2：打包后端为 .exe（可选）
```bash
pip install pyinstaller

# 打包后端
pyinstaller --onefile --add-data "dist;dist" backend/main.py -n NetShark
```

### 步骤3：分发
将以下文件打包给用户：
```
NetShark/
├── NetShark.bat         # 启动脚本
├── backend/            # Python后端代码
├── dist/               # 前端构建文件
└── README.md          # 使用说明
```

或使用 PyInstaller 打包：
```
NetShark/
├── NetShark.bat
├── NetShark.exe       # 打包后的单一可执行文件
└── dist/              # 前端文件
```

---

## 🎯 架构说明

### 开发模式
```
前端: http://localhost:5173 (Vite Dev Server)
后端: http://localhost:8000 (FastAPI)
```

### 生产模式（打包后）
```
统一端口: http://localhost:8000
├── / → 前端页面 (index.html)
├── /api/* → API接口
└── /ws/* → WebSocket
```

---

## ⚠️ 注意事项

1. **管理员权限**
   - 网络抓包需要管理员权限
   - 必须右键"以管理员身份运行"

2. **防火墙**
   - Windows 可能会弹出防火墙警告
   - 选择"允许访问"

3. **端口占用**
   - 确保 8000 端口未被占用
   - 如需修改端口，编辑 `backend/main.py` 的最后一行

---

## 🔧 故障排除

### 问题：浏览器无法打开
- 检查后端是否启动成功
- 手动访问 http://localhost:8000

### 问题：前端显示错误
- 确保已运行 `npm run build`
- 检查 `dist/` 文件夹是否存在

### 问题：抓包失败
- 确保以管理员身份运行
- 检查是否安装了 WinPcap/Npcap

---

## 📝 更新日志

### v1.0.0 (2025-12-12)
- ✅ HTTP/TCP 抓包
- ✅ 流量分析
- ✅ 独立部署支持
- ✅ 内网共享功能
