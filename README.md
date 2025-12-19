# NetShark - 网络流量分析工具

<p align="center">
  <img src="docs/logo.png" alt="NetShark Logo" width="120">
</p>

一款现代化的网络流量分析工具，支持本地抓包和 SSH 远程抓包，提供直观的可视化界面。

## ✨ 主要功能

- 🔍 **本地抓包** - 基于 Scapy 的实时网络流量捕获
- 🌐 **SSH 远程抓包** - 通过 SSH 连接远程服务器执行 tcpdump
- 🔐 **HTTPS 解密** - 可选的 MITM 代理模式，解密 HTTPS 流量
- 📊 **TCP 分析** - 重传检测、乱序检测、流追踪
- 📁 **PCAP 导入** - 支持导入现有 PCAP 文件进行分析

## 🚀 快速开始

### 前置要求

- **Windows 10/11**
- **Python 3.10+**
- **Npcap** (用于本地抓包)

### 安装步骤

1. **克隆仓库**
   ```bash
   git clone https://github.com/wangtnuaa315/NetShark.git
   cd NetShark
   ```

2. **运行安装脚本**
   ```bash
   # 双击运行或在命令行执行
   install.bat
   ```
   
   安装脚本会自动：
   - 检测 Python 环境
   - 检测/提示安装 Npcap
   - 创建虚拟环境
   - 安装依赖包

3. **启动应用**
   ```bash
   # 双击运行
   start.bat
   ```

4. **访问应用**
   
   打开浏览器访问: http://localhost:8000

### 手动安装 Npcap

如果安装脚本未自动安装 Npcap，请手动下载安装：

1. 访问 https://npcap.com/#download
2. 下载并运行安装程序
3. **重要**: 安装时勾选 "WinPcap API-compatible Mode"

## 📁 项目结构

```
NetShark/
├── backend/                 # Python 后端
│   ├── main.py             # FastAPI 主入口
│   ├── services/           # 服务模块
│   │   ├── packet_capture.py   # 抓包服务
│   │   ├── tcp_stream.py       # TCP 流分析
│   │   ├── ssh_manager.py      # SSH 管理
│   │   └── mitm_proxy.py       # HTTPS 代理
│   └── data/               # 数据存储
├── src/                    # React 前端源码
│   ├── components/         # UI 组件
│   └── services/           # 前端服务
├── dist/                   # 前端编译输出
├── tools/                  # 工具和安装包
├── install.bat             # 安装脚本
├── start.bat               # 启动脚本
└── requirements.txt        # Python 依赖
```

## 🛠️ 开发模式

如需进行前端开发：

```bash
# 安装 Node.js 依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

## 📝 使用说明

### 本地抓包模式

1. 选择要监控的进程
2. 选择网络接口
3. 点击"开始抓包"
4. 查看实时捕获的数据包

### SSH 远程抓包模式

1. 切换到"SSH 抓包"标签
2. 添加并选择远程服务器
3. 配置抓包参数（接口、过滤器、数量）
4. 点击"开始抓包"
5. 等待抓包完成后查看结果

## 📄 许可证

MIT License

## 🙏 致谢

- [Scapy](https://scapy.net/) - 强大的网络数据包处理库
- [FastAPI](https://fastapi.tiangolo.com/) - 现代 Python Web 框架
- [React](https://react.dev/) - 用户界面库
- [Npcap](https://npcap.com/) - Windows 网络抓包驱动
