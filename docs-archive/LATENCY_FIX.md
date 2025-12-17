# NetShark 数据重复和延迟问题修复

## 问题分析

### 问题 1: Latency 全部显示 `-`

**原因**: 请求和响应的 packet_key 不匹配

```python
# 请求（出站）
packet_key = "192.168.2.130:50000-192.168.2.33:9001-TCP"

# 响应（入站）
packet_key = "192.168.2.33:9001-192.168.2.130:50000-TCP"  # 不同！
```

**解决方案**: 使用双向连接标识符

```python
# 无论方向，都使用相同的 key
if src_ip < dst_ip:
    conn_key = f"{src_ip}:{src_port}-{dst_ip}:{dst_port}-{protocol}"
else:
    conn_key = f"{dst_ip}:{dst_port}-{src_ip}:{src_port}-{protocol}"
```

### 问题 2: 数据重复

**可能原因**:
1. TCP 握手包（SYN, SYN-ACK, ACK）
2. 数据包和确认包（PSH, ACK）
3. ID 生成不够唯一

**解决方案**:
- 在 ID 生成中加入数据包大小
- 使用更精确的时间戳

## 修复内容

```python
# 1. 双向连接标识符
if ip_layer.src < ip_layer.dst:
    conn_key = f"{ip_layer.src}:{sport}-{ip_layer.dst}:{dport}-{protocol}"
else:
    conn_key = f"{ip_layer.dst}:{dport}-{ip_layer.src}:{sport}-{protocol}"

# 2. 更唯一的 ID
packet_id = abs(hash(conn_key + str(datetime.now().timestamp()) + str(len(pkt))))

# 3. 延迟计算使用双向 key
latency = self._calculate_latency(conn_key, is_outbound)
```

## 测试验证

重启服务后，应该看到：
- ✅ Latency 列显示实际延迟（如 `5ms`, `12ms`）
- ✅ 数据不再重复（相同时间戳只出现一次）
