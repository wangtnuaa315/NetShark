# NetShark 故障排查记录

## 问题: 后端服务启动但未监听端口

### 现象
- `npm start` 显示服务启动
- 但 `netstat -ano | findstr "8000"` 无结果
- Python 进程在运行，但没有绑定8000端口
- 前端报错: ERR_CONNECTION_REFUSED

### 原因
`package.json` 中的后端启动命令使用了 `cross-env PYTHONPATH=.`，在某些环境下相对路径可能无法正确解析。

### 解决方案
移除 `cross-env PYTHONPATH=.`，因为：
1. Python已经在项目根目录运行，当前目录自动在 sys.path 中
2. `python -m backend.main` 会自动处理模块路径

### 修改
```json
// 修改前
"backend": "cross-env PYTHONPATH=. python -m backend.main"

// 修改后
"backend": "python -m backend.main"
```

### 验证步骤
1. 停止当前服务 (Ctrl+C)
2. 运行 `npm start`
3. 检查端口: `netstat -ano | findstr "8000"`
4. 应该看到类似: `TCP    0.0.0.0:8000    0.0.0.0:0    LISTENING    12345`
