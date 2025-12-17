# NetShark 使用说明

## 🚀 启动方式

由于 Windows 批处理脚本嵌套调用的限制，请**直接运行**：

```
右键 scripts\start-dev.bat → "以管理员身份运行"
```

**不要**使用根目录的 `start.bat`（存在调用问题）。

---

## ✅ 启动后会看到

```
========================================
  NetShark - Network Traffic Analyzer
========================================

Working Directory: D:\PythonProject\NetShark

[1/3] Checking Npcap driver...
Found installer: D:\PythonProject\NetShark\dependencies\npcap-1.85.exe
Installing Npcap (this may take 30 seconds)...
[OK] Npcap installed successfully!

[2/3] Starting Python backend...
[3/3] Starting Vite frontend...

========================================
  NetShark is Running!
========================================

Frontend: http://localhost:5173/
Backend:  http://localhost:8000/

Press any key to stop all services...
```

---

## 📌 如果安装 Npcap 后还是提示未安装

可能需要**重启 Windows** 以加载驱动。

---

## 🐛 故障排查

### Npcap 相关
- 检查驱动: `sc query npcap`
- 手动安装: 双击 `dependencies\npcap-1.85.exe`

### 服务启动失败
- 确保以管理员身份运行
- 检查端口占用: `netstat -ano | findstr "8000 5173"`

---

**立即测试**: 右键 `scripts\start-dev.bat` → 以管理员身份运行
