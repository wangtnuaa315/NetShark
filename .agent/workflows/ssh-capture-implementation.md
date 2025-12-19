---
description: SSH 远程抓包功能实现计划
---

# SSH 远程抓包功能实现

## 功能需求
1. **认证方式**: 优先密码认证，后续支持密钥
2. **sudo 密码**: 使用 SSH 登录密码（需要服务器配置）
3. **服务器存储**: 保存常用服务器配置，可选择已有服务器
4. **抓包模式**: 
   - 实时流式（边抓边看）
   - 先抓后分析（抓完下载 PCAP）

## 实现步骤

### Phase 1: 后端基础设施
// turbo
1. 安装 paramiko 依赖: `pip install paramiko`
2. 创建 `backend/services/ssh_manager.py` - SSH 连接管理
3. 创建 `backend/data/servers.json` - 服务器配置存储

### Phase 2: 后端 API
4. 添加 SSH 相关 API 到 `backend/main.py`:
   - `POST /api/ssh/test` - 测试连接
   - `GET /api/ssh/servers` - 获取已保存服务器
   - `POST /api/ssh/servers` - 保存服务器
   - `DELETE /api/ssh/servers/{id}` - 删除服务器
   - `POST /api/ssh/interfaces` - 获取网络接口
   - `WebSocket /ws/ssh/capture` - 实时抓包

### Phase 3: 前端界面
5. 创建 `src/components/SSHCapturePanel.jsx` - SSH 配置面板
6. 更新 `ConfigScreen.jsx` - 集成 SSH 模式

### Phase 4: 实时抓包
7. 实现 tcpdump 输出解析
8. 实现 WebSocket 数据推送
9. 实现前端实时显示

### Phase 5: 文件下载模式
10. 实现远程抓包并下载 PCAP
11. 复用现有 PCAP 解析逻辑

## 服务器配置数据结构
```json
{
  "servers": [
    {
      "id": "uuid",
      "name": "生产服务器",
      "host": "192.168.1.100",
      "port": 22,
      "username": "root",
      "created_at": "2024-01-01T00:00:00Z",
      "last_used": "2024-01-01T00:00:00Z"
    }
  ]
}
```

注意: 密码不保存，每次使用时输入

## tcpdump 命令模板
```bash
# 实时流式（输出到 stdout，管道传输）
sudo tcpdump -i {interface} {filter} -w - -U

# 先抓后分析（保存到文件）
sudo tcpdump -i {interface} {filter} -c {count} -w /tmp/capture_{timestamp}.pcap
```
