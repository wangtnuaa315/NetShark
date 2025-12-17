# NetShark 依赖项

## Npcap 网络驱动

**文件**: `npcap-x.xx.exe` (支持任意版本)  
**推荐版本**: 1.85+ (2024年最新稳定版)  
**大小**: ~3 MB  
**官网**: https://npcap.com/

### 下载步骤

请手动下载 Npcap 安装包并放到此目录：

1. 访问 https://npcap.com/#download
2. 下载 **"Npcap installer for Windows"** (任意版本均可)
3. 将下载的 `npcap-x.xx.exe` 复制到 `dependencies/` 目录

**注意**: 文件名必须以 `npcap` 开头，以 `.exe` 结尾（脚本会自动检测）

### 为什么需要 Npcap？

Npcap 是 Windows 平台的网络数据包捕获驱动，是 WinPcap 的现代替代品。NetShark 使用它来：
- 捕获指定进程的网络流量
- 过滤和分析数据包
- 支持 Wireshark 级别的底层网络访问

### 许可证

Npcap 采用 **Npcap Public Source License** (类似 BSD)，允许免费用于内部工具。

---

## 可选依赖（未来扩展）

### Wireshark (用于高级分析)
- 文件: `wireshark-installer.exe`
- 用途: 离线分析导出的 PCAP 文件

### Python 运行时 (如果不打包)
- 文件: `python-3.9-embeddable.zip`
- 用途: 无需系统安装 Python
