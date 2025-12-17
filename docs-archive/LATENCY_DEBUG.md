# NetShark 延迟调试指南

## 问题现状
Latency 列全部显示 `-`，无法计算请求-响应延迟。

## 调试步骤

### 1. 启用 DEBUG 日志
已修改 `backend/main.py`，将日志级别设置为 DEBUG。

### 2. 重启服务
```bash
# 停止: Ctrl+C
# 启动:
npm start
```

### 3. 查看日志输出

重启后，在后端日志中查找以下关键信息：

#### a) 数据包方向
```
DEBUG: Packet: 192.168.2.130:50000 -> 192.168.2.33:9001, is_outbound=True, conn_key=...
DEBUG: Packet: 192.168.2.33:9001 -> 192.168.2.130:50000, is_outbound=False, conn_key=...
```

**期望**: 应该同时看到 `is_outbound=True` 和 `is_outbound=False`

**如果只有 `True`**: 说明只捕获到出站包，没有入站包
- 可能原因: 端口映射问题，响应包未被识别为目标进程

#### b) 连接Key
```
DEBUG: [LATENCY] Request recorded: 192.168.2.130:50000-192.168.2.33:9001-TCP
DEBUG: [LATENCY] No matching request for: 192.168.2.33:9001-192.168.2.130:50000-TCP
```

**期望**: 出站和入站的 conn_key 应该**完全相同**

**如果不同**: 说明 conn_key 生成逻辑有问题

#### c) 匹配状态
```
INFO: [LATENCY] Response matched! 192.168.2.130:50000-192.168.2.33:9001-TCP -> 5ms
```

**期望**: 看到 `Response matched!`

**如果看到 `No matching request`**: 说明入站包找不到对应的出站包

---

## 可能的问题和解决方案

### 问题1: 只捕获到出站包

**原因**: 
- 入站包的端口不属于目标进程
- TCP 连接使用短生命周期，响应时连接已关闭

**解决方案**:
- 放宽端口映射刷新频率
- 使用更宽松的匹配逻辑

### 问题2: conn_key 不匹配

**原因**:
- 出站和入站的 key 生成逻辑不一致

**当前逻辑**:
```python
if is_outbound:
    conn_key = f"{src}:{sport}-{dst}:{dport}-{proto}"
else:
    conn_key = f"{dst}:{dport}-{src}:{sport}-{proto}"  # 翻转
```

**验证**: 检查日志中两个方向的 conn_key 是否一致

### 问题3: TCP 握手/确认包干扰

**现象**: 捕获到大量没有 payload 的包

**解决方案**: 只对有 payload 的包计算延迟

---

## 下一步

请重启服务，并**截图发送后端日志中包含以下内容的部分**:
- `[MATCHED]` 行
- `[LATENCY]` 行  
- `is_outbound=` 行

这样我可以精确定位问题所在。
