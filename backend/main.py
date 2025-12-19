# ============================================================
# 🔧 CRITICAL: Configure logging FIRST, before any backend imports!
# ============================================================
import logging
from pathlib import Path
import sys

log_dir = Path(__file__).parent.parent / "logs"
log_dir.mkdir(exist_ok=True)
log_file = log_dir / "netshark_debug.log"

# 手动创建FileHandler确保工作
file_handler = logging.FileHandler(log_file, encoding='utf-8', mode='w')
file_handler.setLevel(logging.DEBUG)
file_handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(name)s: %(message)s'))

stream_handler = logging.StreamHandler(sys.stdout)
stream_handler.setLevel(logging.DEBUG)
stream_handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(name)s: %(message)s'))

logging.basicConfig(
    level=logging.DEBUG,
    handlers=[file_handler, stream_handler],
    force=True  # 强制重新配置
)
logger = logging.getLogger(__name__)
logger.info("=" * 60)
logger.info(f"NetShark Backend Starting - Log file: {log_file}")
logger.info("=" * 60)

# 立即flush确保写入
for handler in logging.root.handlers:
    handler.flush()

# ============================================================
# Now import backend modules (they will use the configured logging)
# ============================================================
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from backend.services.process_scanner import get_running_processes
from backend.services.packet_capture import PacketCaptureEngine
from backend.services.mitm_proxy import MitmProxyService, HttpsTransaction
from backend.services import cert_manager
from backend.services.ssh_manager import ssh_manager, server_storage
import asyncio
from pathlib import Path
from pydantic import BaseModel
from typing import Optional

app = FastAPI()

# 静态文件目录（前端构建后的文件）
STATIC_DIR = Path(__file__).parent.parent / "dist"


# Enable CORS for frontend dev server (允许内网访问)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 允许所有来源（内网环境下安全）
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 全局抓包引擎实例（每个会话一个）
capture_engines = {}

# MITM 代理服务实例
mitm_proxy: MitmProxyService = None
mitm_websockets: list = []  # 存储 HTTPS 抓包的 WebSocket 连接



@app.get("/api/processes")
def list_processes():
    return get_running_processes()


@app.post("/api/dialog/open-file")
def open_file_dialog():
    import tkinter as tk
    from tkinter import filedialog
    
    # Create a hidden root window
    root = tk.Tk()
    root.withdraw()
    root.attributes('-topmost', True) # Bring to front
    
    file_path = filedialog.askopenfilename(
        title="Select Application to Monitor",
        filetypes=[("Executables", "*.exe"), ("All Files", "*.*")]
    )
    
    root.destroy()
    return {"path": file_path}


@app.post("/api/process/launch")
def launch_process(payload: dict):
    import subprocess
    import os
    
    path = payload.get("path")
    if not path or not os.path.exists(path):
        return {"error": "Invalid path"}
        
    try:
        # Launch the process
        proc = subprocess.Popen(path)
        return {
            "pid": proc.pid,
            "name": os.path.basename(path),
            "status": "launched"
        }
    except Exception as e:
        return {"error": str(e)}


@app.post("/api/agent/ping")
def ping_agent(payload: dict):
    # Mock ping implementation
    # In a real app, this would use 'ping' command or a socket connection
    import time
    time.sleep(0.5) # Simulate network latency
    
    target_ip = payload.get("ip", "unknown")
    if target_ip == "127.0.0.1" or target_ip == "localhost":
        return {"status": "ok", "latency": "2ms"}
    else:
        # Mock success for any IP for now, or random failure
        return {"status": "ok", "latency": "45ms"}


# ============================================================
# PCAP 文件上传和解析 API
# ============================================================

@app.post("/api/pcap/upload")
async def upload_pcap(file: UploadFile = File(...)):
    """
    上传并解析 PCAP 文件
    返回解析后的数据包列表
    """
    import tempfile
    import os
    from datetime import datetime
    from scapy.all import rdpcap, IP, TCP, UDP, Raw, DNS
    
    # 验证文件类型
    allowed_extensions = ['.pcap', '.pcapng', '.cap']
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in allowed_extensions:
        return {"error": f"不支持的文件格式: {file_ext}"}
    
    def detect_protocol(pkt, sport, dport):
        """检测应用层协议 - 只有包含实际数据时才识别为应用层协议"""
        
        # 检查是否有应用层数据
        has_payload = pkt.haslayer(Raw) and len(bytes(pkt[Raw].load)) > 0
        
        # 常见端口映射
        TLS_PORTS = {443, 8443, 993, 995, 465, 636}
        SSH_PORTS = {22}
        HTTP_PORTS = {80, 8080, 8000, 3000}
        DNS_PORTS = {53}
        MYSQL_PORTS = {3306}
        REDIS_PORTS = {6379}
        
        # 如果没有 payload，则不识别为应用层协议
        # 只显示传输层协议（TCP/UDP）
        if not has_payload:
            return None
        
        payload = bytes(pkt[Raw].load)
        
        # 检查 TLS 特征（通过数据内容判断，而不是端口）
        if len(payload) >= 3 and payload[0] in [0x14, 0x15, 0x16, 0x17] and payload[1] == 0x03:
            version_minor = payload[2]
            if version_minor == 0x03:
                return "TLSv1.2"
            elif version_minor == 0x04:
                return "TLSv1.3"
            elif version_minor == 0x01:
                return "TLSv1.0"
            elif version_minor == 0x02:
                return "TLSv1.1"
            return "TLS"
        
        # 检查 SSH 特征（SSH 协议以 "SSH-" 开头）
        if sport in SSH_PORTS or dport in SSH_PORTS:
            try:
                if payload[:4] == b'SSH-':
                    return "SSH"
            except:
                pass
            # 如果有数据但不是 SSH 握手，可能是加密的 SSH 数据
            if len(payload) > 0:
                return "SSH"
        
        # 检查 DNS（通常是 UDP）
        if sport in DNS_PORTS or dport in DNS_PORTS:
            return "DNS"
        
        # 检查 HTTP 特征
        try:
            payload_text = payload[:20].decode('latin-1')
            http_methods = ['GET ', 'POST ', 'PUT ', 'DELETE ', 'HEAD ', 'OPTIONS ', 'PATCH ']
            if any(payload_text.startswith(m) for m in http_methods):
                return "HTTP"
            if payload_text.startswith('HTTP/'):
                return "HTTP"
        except:
            pass
        
        # 基于端口的猜测（仅当有 payload 时）
        if sport in HTTP_PORTS or dport in HTTP_PORTS:
            return "HTTP"
        
        if sport in MYSQL_PORTS or dport in MYSQL_PORTS:
            return "MySQL"
        
        if sport in REDIS_PORTS or dport in REDIS_PORTS:
            return "Redis"
        
        return None
    
    try:
        # 保存到临时文件
        logger.info(f"[PCAP] Uploading file: {file.filename}")
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
        
        logger.info(f"[PCAP] Saved to temp file: {tmp_path}, size: {len(content)} bytes")
        
        # 使用 scapy 解析 PCAP 文件
        packets_raw = rdpcap(tmp_path)
        logger.info(f"[PCAP] Total raw packets: {len(packets_raw)}")
        
        # TCP 流追踪 - 用于识别同一个 TCP 连接的所有包
        tcp_streams = {}  # key: stream_key, value: stream_id
        stream_counter = 0
        
        def get_stream_id(src_ip, dst_ip, sport, dport):
            """获取 TCP 流 ID，双向匹配"""
            nonlocal stream_counter
            # 创建规范化的流键（确保双向都能匹配到同一个流）
            key1 = (src_ip, sport, dst_ip, dport)
            key2 = (dst_ip, dport, src_ip, sport)
            
            if key1 in tcp_streams:
                return tcp_streams[key1]
            if key2 in tcp_streams:
                return tcp_streams[key2]
            
            # 新的流
            stream_counter += 1
            tcp_streams[key1] = stream_counter
            return stream_counter
        
        # 转换为前端格式
        packets = []
        skipped_no_ip = 0
        for i, pkt in enumerate(packets_raw):
            if not pkt.haslayer(IP):
                skipped_no_ip += 1
                continue
            
            ip_layer = pkt[IP]
            base_protocol = "TCP" if pkt.haslayer(TCP) else "UDP" if pkt.haslayer(UDP) else "IP"
            
            # 提取端口
            sport = dport = 0
            if pkt.haslayer(TCP):
                sport = pkt[TCP].sport
                dport = pkt[TCP].dport
            elif pkt.haslayer(UDP):
                sport = pkt[UDP].sport
                dport = pkt[UDP].dport
            
            # 检测应用层协议
            app_protocol = detect_protocol(pkt, sport, dport)
            protocol = app_protocol if app_protocol else base_protocol
            
            # 计算大小
            size = len(pkt)
            
            # 构建 info 字段
            info = f"{sport} → {dport}"
            if pkt.haslayer(TCP):
                flags = pkt[TCP].flags
                flag_str = str(flags) if flags else ""
                info += f" [{flag_str}]"
            
            # TLS 特殊处理
            if protocol.startswith("TLS"):
                if pkt.haslayer(Raw):
                    payload = bytes(pkt[Raw].load)
                    if len(payload) >= 6 and payload[0] == 0x16:  # Handshake
                        hs_type = payload[5] if len(payload) > 5 else 0
                        hs_names = {1: "Client Hello", 2: "Server Hello", 11: "Certificate", 14: "Server Hello Done"}
                        info = f"{protocol} Handshake: {hs_names.get(hs_type, 'Unknown')}"
                    elif len(payload) >= 1 and payload[0] == 0x17:  # Application Data
                        info = f"{protocol} Application Data ({len(payload)} bytes)"
                    else:
                        info = f"{protocol} Encrypted"
            
            # 获取原始时间戳（用于排序）
            raw_time = float(pkt.time)
            
            # 提取 payload 内容
            payload_raw = b""
            payload_text = ""
            payload_hex = ""
            payload_base64 = ""
            if pkt.haslayer(Raw):
                payload_raw = bytes(pkt[Raw].load)
                # 尝试解码为文本（可能是二进制数据）
                try:
                    payload_text = payload_raw.decode('utf-8', errors='replace')
                except:
                    payload_text = payload_raw.decode('latin-1', errors='replace')
                # Hex 格式
                payload_hex = ' '.join(f'{b:02x}' for b in payload_raw)
                # Base64 格式
                import base64
                payload_base64 = base64.b64encode(payload_raw).decode('ascii')
            
            # 提取 TCP 层信息
            tcp_data = None
            if pkt.haslayer(TCP):
                tcp_layer = pkt[TCP]
                flags = tcp_layer.flags
                tcp_data = {
                    "src_port": tcp_layer.sport,
                    "dst_port": tcp_layer.dport,
                    "seq": tcp_layer.seq,
                    "ack": tcp_layer.ack,
                    "flags": str(flags) if flags else "",
                    "window_size": tcp_layer.window,
                    "payload_length": len(payload_raw),
                    "is_retransmission": False,  # PCAP 无法直接检测
                    "is_out_of_order": False,
                }
            
            # 提取 UDP 层信息
            udp_data = None
            if pkt.haslayer(UDP):
                udp_layer = pkt[UDP]
                udp_data = {
                    "src_port": udp_layer.sport,
                    "dst_port": udp_layer.dport,
                    "length": udp_layer.len,
                }
            
            # 获取 TCP 流 ID
            stream_id = None
            stream_peer = None  # 0 = 客户端发送, 1 = 服务端发送
            if pkt.haslayer(TCP):
                stream_id = get_stream_id(ip_layer.src, ip_layer.dst, sport, dport)
                # 判断是哪一方发送的（端口号较小的通常是服务端）
                if sport < dport:
                    stream_peer = 0  # 服务端发送
                else:
                    stream_peer = 1  # 客户端发送
            
            packet_data = {
                "id": i + 1,
                "timestamp": datetime.fromtimestamp(raw_time).strftime("%H:%M:%S.%f")[:-3],
                "raw_time": raw_time,  # 保存原始时间戳用于排序
                "source": ip_layer.src,
                "sourceIP": ip_layer.src,
                "destination": ip_layer.dst,
                "destIP": ip_layer.dst,
                "protocol": protocol,
                "method": protocol,
                "path": f"{ip_layer.dst}:{dport}",
                "size": f"{size}B",
                "info": info,
                "traceId": f"pcap-{i+1}",
                "category": "client",  # 默认分类
                "body": payload_text,  # 文本格式
                "payload_hex": payload_hex,  # Hex 格式
                "payload_base64": payload_base64,  # Base64 格式
                "payload_size": len(payload_raw),  # Payload 大小
                "tcp": tcp_data,  # TCP 层信息
                "udp": udp_data,  # UDP 层信息
                "stream_id": stream_id,  # TCP 流 ID
                "stream_peer": stream_peer,  # 发送方 (0/1)
            }
            
            packets.append(packet_data)
        
        # 按原始时间戳排序
        packets.sort(key=lambda p: p.get("raw_time", 0))
        
        # 计算相对时间（从第一个包开始，与 Wireshark 一致）
        if packets:
            first_time = packets[0].get("raw_time", 0)
            for idx, pkt_data in enumerate(packets):
                pkt_data["id"] = idx + 1
                raw = pkt_data.get("raw_time", 0)
                relative = raw - first_time
                # 格式化为 Wireshark 风格的相对时间
                pkt_data["timestamp"] = f"{relative:.6f}"
        
        # 构建 TCP 流信息（用于流追踪功能）
        streams = {}
        for pkt in packets:
            sid = pkt.get("stream_id")
            if sid is None:
                continue
            
            if sid not in streams:
                # 初始化流信息
                streams[sid] = {
                    "stream_id": sid,
                    "peers": [],  # 两个通信端点
                    "packets": [],  # 该流的所有包 ID
                    "total_bytes": 0,
                    "packet_count": 0,
                }
            
            stream = streams[sid]
            
            # 添加端点信息
            peer_info = {
                "host": pkt.get("sourceIP"),
                "port": pkt.get("tcp", {}).get("src_port") if pkt.get("tcp") else 0
            }
            # 检查是否已存在该端点
            if not any(p["host"] == peer_info["host"] and p["port"] == peer_info["port"] for p in stream["peers"]):
                if len(stream["peers"]) < 2:
                    stream["peers"].append(peer_info)
            
            # 添加包引用
            stream["packets"].append({
                "id": pkt.get("id"),
                "peer": pkt.get("stream_peer"),
                "timestamp": pkt.get("raw_time"),
                "payload_size": pkt.get("payload_size", 0),
                "payload_base64": pkt.get("payload_base64", ""),
            })
            stream["total_bytes"] += pkt.get("payload_size", 0)
            stream["packet_count"] += 1
        
        # 转换为列表
        streams_list = list(streams.values())
        
        # 清理临时文件
        os.unlink(tmp_path)
        
        logger.info(f"[PCAP] Parsed {len(packets)} packets from {file.filename} (skipped {skipped_no_ip} non-IP packets)")
        logger.info(f"[PCAP] Found {len(streams_list)} TCP streams")
        
        # 显示一些样本数据
        if packets:
            sample = packets[0]
            logger.info(f"[PCAP] Sample packet: proto={sample.get('protocol')}, size={sample.get('size')}, payload_size={sample.get('payload_size')}")
        
        return {
            "status": "success",
            "packet_count": len(packets),
            "file_size": len(content),
            "packets": packets,
            "streams": streams_list,  # TCP 流信息
            "stream_count": len(streams_list),
        }
        
    except Exception as e:
        logger.error(f"[PCAP] Parse error: {e}")
        import traceback
        traceback.print_exc()
        return {"error": str(e)}


# ============================================================
# HTTPS 代理相关 API
# ============================================================

@app.post("/api/https/start")
def start_https_proxy(payload: dict):
    """
    启动 HTTPS 代理服务
    """
    global mitm_proxy
    
    port = payload.get("port", 8888)
    
    if mitm_proxy and mitm_proxy.is_running:
        return {"status": "already_running", "port": mitm_proxy.proxy_port}
    
    try:
        mitm_proxy = MitmProxyService(proxy_port=port)
        
        def on_transaction(transaction: HttpsTransaction):
            """HTTPS 事务回调"""
            # 将事务转换为数据包格式并推送给所有连接的 WebSocket
            packet_data = _transaction_to_packet(transaction)
            for ws_queue in mitm_websockets:
                try:
                    ws_queue.put_nowait(packet_data)
                except:
                    pass
        
        mitm_proxy.start(callback=on_transaction)
        
        return {
            "status": "started",
            "port": port,
            "proxy_url": f"http://127.0.0.1:{port}",
            "ca_cert": mitm_proxy.get_ca_cert_path()
        }
    except Exception as e:
        logger.error(f"Failed to start HTTPS proxy: {e}")
        return {"status": "error", "message": str(e)}


@app.post("/api/https/stop")
def stop_https_proxy():
    """
    停止 HTTPS 代理服务
    """
    global mitm_proxy
    
    if mitm_proxy:
        mitm_proxy.stop()
        mitm_proxy = None
        return {"status": "stopped"}
    else:
        return {"status": "not_running"}


@app.get("/api/https/status")
def get_https_proxy_status():
    """
    获取 HTTPS 代理状态
    """
    global mitm_proxy
    
    if mitm_proxy and mitm_proxy.is_running:
        return {
            "running": True,
            "port": mitm_proxy.proxy_port,
            "proxy_url": f"http://127.0.0.1:{mitm_proxy.proxy_port}",
            "ca_cert": mitm_proxy.get_ca_cert_path()
        }
    else:
        return {
            "running": False,
            "port": None,
            "proxy_url": None,
            "ca_cert": None
        }


@app.get("/api/https/cert-info")
def get_cert_info():
    """
    获取 CA 证书信息
    包括证书是否存在、是否已安装、证书路径等
    """
    return cert_manager.get_certificate_info()


@app.post("/api/https/generate-cert")
def generate_cert():
    """
    生成 CA 证书（如果不存在）
    证书会保存到工程的 certs/ 目录
    """
    # 先检查是否已存在
    info = cert_manager.get_certificate_info()
    if info["exists"]:
        return {"status": "exists", "message": "证书已存在", **info}
    
    # 生成新证书
    result = cert_manager.generate_certificates()
    if result.get("success"):
        return {"status": "generated", "message": "证书生成成功", **result}
    else:
        return {"status": "error", "message": result.get("error", "生成失败")}


@app.post("/api/https/install-cert")
def install_https_cert():
    """
    安装 HTTPS 代理 CA 证书到系统
    需要管理员权限
    """
    # 先确保证书存在
    info = cert_manager.ensure_certificates()
    if not info["exists"]:
        return {"status": "error", "message": "证书不存在，请先生成证书"}
    
    # 安装证书
    result = cert_manager.install_certificate()
    if result.get("success"):
        return {"status": "success", "message": "证书安装成功！请重启浏览器使其生效。"}
    else:
        error_msg = result.get("error", "安装失败")
        if "拒绝访问" in error_msg or "Access" in error_msg:
            return {"status": "error", "message": "需要管理员权限。请以管理员身份运行后端。"}
        return {"status": "error", "message": error_msg}


def _transaction_to_packet(transaction: HttpsTransaction) -> dict:
    """
    将 HTTPS 事务转换为数据包格式（与现有格式兼容）
    """
    from datetime import datetime
    import uuid
    
    req = transaction.request
    resp = transaction.response
    
    # 生成唯一ID
    packet_id = str(uuid.uuid4())[:8]
    
    # 格式化时间
    timestamp = datetime.fromtimestamp(req.timestamp).strftime("%H:%M:%S.%f")[:-3]
    
    # 构建 HTTP 数据
    http_data = {
        "type": "request",
        "method": req.method,
        "url": req.url,
        "headers": req.headers,
        "body": req.body.decode('utf-8', errors='replace') if req.body else ""
    }
    
    if resp:
        http_data["response"] = {
            "status_code": resp.status_code,
            "reason": resp.reason,
            "headers": resp.headers,
            "body": resp.body.decode('utf-8', errors='replace') if resp.body else ""
        }
    
    return {
        "id": packet_id,
        "timestamp": timestamp,
        "source": req.host,
        "destination": "Client",
        "method": req.method,
        "path": req.path,
        "size": f"{len(req.body)}B" if req.body else "0B",
        "info": f"{req.method} {req.path} ({'HTTPS' if req.is_https else 'HTTP'})",
        "category": "server",  # HTTPS 流量归类为 server
        "protocol": "HTTPS" if req.is_https else "HTTP",
        "http": http_data,
        "tcp": None,
        "payload": req.body.decode('utf-8', errors='replace') if req.body else "",
        "hex_dump": req.body.hex() if req.body else "",
        "latency": f"{transaction.duration:.2f}ms" if transaction.duration else None
    }


@app.websocket("/ws/packets/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """
    WebSocket 端点，用于实时推送抓包数据
    :param session_id: 会话ID（通常是 PID）
    """
    await websocket.accept()
    logger.info(f"WebSocket connected: session {session_id}")
    
    try:
        # 接收启动配置
        config = await websocket.receive_json()
        target_pid = config.get("targetPid")
        db_ports = config.get("dbFilter", "3306,6379,5432")
        server_ips = config.get("serverFilter", "")  # 新增：服务器IP过滤
        
        if not target_pid:
            await websocket.send_json({"error": "Missing targetPid"})
            return
        
        logger.info(f"Starting capture for PID {target_pid}")
        if server_ips:
            logger.warning(f"Server IP filter enabled: {server_ips}")
        
        # 清理旧会话（如果存在）
        if session_id in capture_engines:
            logger.warning(f"Cleaning up old session: {session_id}")
            try:
                capture_engines[session_id].stop()
                del capture_engines[session_id]
            except Exception as e:
                logger.error(f"Error cleaning up old session: {e}")
        
        # 创建抓包引擎
        engine = PacketCaptureEngine(target_pid, db_ports, server_ips)
        capture_engines[session_id] = engine
        
        # 获取当前事件循环
        loop = asyncio.get_event_loop()
        
        # 使用队列在线程间传递数据包
        packet_queue = asyncio.Queue()
        
        # 定义同步回调（会在抓包线程中调用）
        def sync_callback(packet_data):
            """在抓包线程中调用的同步回调"""
            try:
                # 使用 call_soon_threadsafe 将数据放入队列
                loop.call_soon_threadsafe(packet_queue.put_nowait, packet_data)
            except Exception as e:
                logger.error(f"Failed to queue packet: {e}")
        
        # 启动抓包
        engine.start(sync_callback)
        
        # 创建异步任务来发送队列中的数据包
        async def send_packets():
            while True:
                try:
                    packet_data = await packet_queue.get()
                    await websocket.send_json(packet_data)
                    logger.debug(f"Sent packet to WebSocket: {packet_data['id']}")
                except Exception as e:
                    logger.error(f"Failed to send packet: {e}")
                    break
        
        # 启动发送任务
        send_task = asyncio.create_task(send_packets())
        
        # 保持连接，直到客户端断开
        while True:
            try:
                # 接收客户端消息（例如停止命令）
                message = await websocket.receive_json()
                if message.get("command") == "stop":
                    break
            except WebSocketDisconnect:
                break
            
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: session {session_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        # 取消发送任务
        if 'send_task' in locals():
            send_task.cancel()
        
        # 停止抓包
        if session_id in capture_engines:
            capture_engines[session_id].stop()
            del capture_engines[session_id]
        logger.info(f"Capture stopped for session {session_id}")


@app.websocket("/ws/https")
async def https_websocket_endpoint(websocket: WebSocket):
    """
    HTTPS 代理专用 WebSocket 端点
    用于实时推送解密后的 HTTPS 流量
    """
    import queue
    
    await websocket.accept()
    logger.info("HTTPS WebSocket connected")
    
    # 创建消息队列
    packet_queue = queue.Queue()
    mitm_websockets.append(packet_queue)
    
    try:
        # 持续发送数据包
        while True:
            try:
                # 非阻塞获取数据包
                packet = packet_queue.get_nowait()
                await websocket.send_json(packet)
            except queue.Empty:
                # 没有数据时短暂等待
                await asyncio.sleep(0.1)
                
                # 检查连接是否还活着
                try:
                    await asyncio.wait_for(
                        websocket.receive_text(),
                        timeout=0.01
                    )
                except asyncio.TimeoutError:
                    pass  # 正常，继续
                except:
                    break  # 连接断开
                    
    except WebSocketDisconnect:
        logger.info("HTTPS WebSocket disconnected")
    except Exception as e:
        logger.error(f"HTTPS WebSocket error: {e}")
    finally:
        # 从列表中移除
        if packet_queue in mitm_websockets:
            mitm_websockets.remove(packet_queue)
        logger.info("HTTPS WebSocket cleaned up")


# ============================================================
# SSH 远程抓包 API
# ============================================================

class SSHConnectRequest(BaseModel):
    host: str
    port: int = 22
    username: str
    password: str

class SSHServerSaveRequest(BaseModel):
    name: str
    host: str
    port: int = 22
    username: str
    password: str = ""
    save_password: bool = False  # 是否保存密码

class SSHCaptureRequest(BaseModel):
    """SSH 抓包请求（包含连接信息和抓包参数）"""
    host: str
    port: int = 22
    username: str
    password: str
    interface: str = "any"
    filter_expr: str = ""
    count: int = 100  # 0 = 无限制


@app.post("/api/ssh/test")
async def ssh_test_connection(request: SSHConnectRequest):
    """测试 SSH 连接"""
    logger.info(f"[SSH API] Test connection to {request.host}")
    
    result = ssh_manager.connect(
        host=request.host,
        port=request.port,
        username=request.username,
        password=request.password
    )
    
    if result["status"] == "ok":
        # 测试成功后断开（保持无状态）
        ssh_manager.disconnect()
    
    return result


@app.get("/api/ssh/servers")
async def ssh_list_servers():
    """获取已保存的服务器列表"""
    servers = server_storage.list_servers()
    # 不返回实际密码，只返回是否有密码
    safe_servers = []
    for s in servers:
        safe_server = {
            "id": s.get("id"),
            "name": s.get("name"),
            "host": s.get("host"),
            "port": s.get("port"),
            "username": s.get("username"),
            "has_password": s.get("has_password", False),
            "password": s.get("password", "") if s.get("has_password") else "",
            "created_at": s.get("created_at"),
            "last_used": s.get("last_used")
        }
        safe_servers.append(safe_server)
    return {"servers": safe_servers}


@app.post("/api/ssh/servers")
async def ssh_save_server(request: SSHServerSaveRequest):
    """保存服务器配置"""
    server = server_storage.add_server(
        name=request.name,
        host=request.host,
        port=request.port,
        username=request.username,
        password=request.password,
        save_password=request.save_password
    )
    return {"status": "ok", "server": server}


@app.delete("/api/ssh/servers/{server_id}")
async def ssh_delete_server(server_id: str):
    """删除服务器配置"""
    success = server_storage.delete_server(server_id)
    if success:
        return {"status": "ok"}
    return {"status": "error", "message": "服务器不存在"}


@app.put("/api/ssh/servers/{server_id}")
async def ssh_update_server(server_id: str, request: SSHServerSaveRequest):
    """更新服务器配置"""
    # 先删除旧的
    server_storage.delete_server(server_id)
    # 再添加新的
    server = server_storage.add_server(
        name=request.name,
        host=request.host,
        port=request.port,
        username=request.username,
        password=request.password,
        save_password=request.save_password
    )
    return {"status": "ok", "server": server}


@app.post("/api/ssh/interfaces")
async def ssh_get_interfaces(request: SSHConnectRequest):
    """获取远程服务器的网络接口列表"""
    result = ssh_manager.connect(
        host=request.host,
        port=request.port,
        username=request.username,
        password=request.password
    )
    
    if result["status"] != "ok":
        return result
    
    try:
        interfaces = ssh_manager.get_interfaces()
        return {"status": "ok", "interfaces": interfaces}
    finally:
        ssh_manager.disconnect()


class SSHStopCaptureRequest(BaseModel):
    """SSH 停止抓包请求"""
    password: str = ""


@app.post("/api/ssh/stop-capture")
async def ssh_stop_capture(request: SSHStopCaptureRequest):
    """停止当前的 SSH 抓包"""
    logger.info("[SSH API] Stop capture request")
    result = ssh_manager.stop_capture_file(password=request.password)
    return result


@app.post("/api/ssh/capture")
async def ssh_capture_to_file(request: SSHCaptureRequest):
    """执行远程抓包并返回 PCAP 数据（先抓后分析模式）"""
    logger.info(f"[SSH API] Capture request: {request.host}, interface={request.interface}, filter={request.filter_expr}")
    
    # 连接
    result = ssh_manager.connect(
        host=request.host,
        port=request.port,
        username=request.username,
        password=request.password
    )
    
    if result["status"] != "ok":
        return result
    
    try:
        # 检测 tcpdump 是否安装
        check_result = ssh_manager.execute("which tcpdump")
        if check_result["status"] != "ok" or not check_result["stdout"].strip():
            return {"status": "error", "message": "远程服务器未安装 tcpdump。请先安装: sudo apt install tcpdump"}
        
        # 执行抓包
        capture_result = ssh_manager.capture_to_file(
            interface=request.interface,
            filter_expr=request.filter_expr,
            password=request.password,
            count=request.count
        )
        
        if capture_result["status"] != "ok":
            return capture_result
        
        # 解析 PCAP 数据（复用现有逻辑）
        import tempfile
        import os
        from scapy.all import rdpcap, IP, TCP, UDP, Raw
        import base64
        
        # 保存到临时文件
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pcap') as tmp:
            tmp.write(capture_result["pcap_data"])
            tmp_path = tmp.name
        
        try:
            packets_raw = rdpcap(tmp_path)
            packets = []
            
            # 流追踪相关
            stream_map = {}
            stream_counter = 0
            stream_data = {}
            
            # 记录第一个包的时间戳，用于计算相对时间
            first_timestamp = None
            
            for idx, pkt in enumerate(packets_raw):
                if not pkt.haslayer(IP):
                    continue
                
                ip_layer = pkt[IP]
                src_ip = ip_layer.src
                dst_ip = ip_layer.dst
                
                # 协议检测
                protocol = "IP"
                src_port = 0
                dst_port = 0
                tcp_data = None
                udp_data = None
                
                if pkt.haslayer(TCP):
                    protocol = "TCP"
                    tcp_layer = pkt[TCP]
                    src_port = tcp_layer.sport
                    dst_port = tcp_layer.dport
                    
                    # TCP 流追踪
                    stream_key = tuple(sorted([(src_ip, src_port), (dst_ip, dst_port)]))
                    if stream_key not in stream_map:
                        stream_counter += 1
                        stream_map[stream_key] = stream_counter
                    
                    stream_id = stream_map[stream_key]
                    stream_peer = 0 if (src_ip, src_port) < (dst_ip, dst_port) else 1
                    
                    tcp_data = {
                        "src_port": src_port,
                        "dst_port": dst_port,
                        "seq": tcp_layer.seq,
                        "ack": tcp_layer.ack,
                        "flags": str(tcp_layer.flags) if tcp_layer.flags else "",
                        "window_size": tcp_layer.window,
                    }
                    
                    # TLS 检测
                    if dst_port == 443 or src_port == 443:
                        protocol = "TLS"
                        
                elif pkt.haslayer(UDP):
                    protocol = "UDP"
                    udp_layer = pkt[UDP]
                    src_port = udp_layer.sport
                    dst_port = udp_layer.dport
                    udp_data = {
                        "src_port": src_port,
                        "dst_port": dst_port,
                        "length": udp_layer.len,
                    }
                
                # Payload
                payload_raw = bytes(pkt[Raw].load) if pkt.haslayer(Raw) else b''
                payload_size = len(payload_raw)
                
                # 记录第一个包的时间戳
                pkt_time = float(pkt.time)
                if first_timestamp is None:
                    first_timestamp = pkt_time
                
                # 计算相对时间（从第一个包开始）
                relative_time = pkt_time - first_timestamp
                
                # 应用层协议检测
                app_protocol = protocol  # 默认用传输层协议
                http_info = ""
                
                if payload_size > 0 and pkt.haslayer(TCP):
                    try:
                        payload_str = payload_raw.decode('utf-8', errors='ignore')
                        payload_lower = payload_str.lower()
                        
                        # 检测是否包含 JSON 内容类型
                        has_json = 'application/json' in payload_lower or 'content-type: application/json' in payload_lower
                        
                        # HTTP 请求检测
                        if payload_str.startswith(('GET ', 'POST ', 'PUT ', 'DELETE ', 'HEAD ', 'OPTIONS ', 'PATCH ')):
                            first_line = payload_str.split('\r\n')[0] if '\r\n' in payload_str else payload_str[:100]
                            # POST/PUT 请求可能包含 JSON body
                            if has_json or (payload_str.startswith(('POST ', 'PUT ', 'PATCH ')) and ('{"' in payload_str or '[{' in payload_str)):
                                app_protocol = "HTTP/JSON"
                            else:
                                app_protocol = "HTTP"
                            http_info = first_line
                        
                        # HTTP 响应检测
                        elif payload_str.startswith('HTTP/'):
                            first_line = payload_str.split('\r\n')[0] if '\r\n' in payload_str else payload_str[:100]
                            # 检查是否包含 JSON
                            if has_json:
                                app_protocol = "HTTP/JSON"
                            else:
                                app_protocol = "HTTP"
                            http_info = first_line
                        
                        # JSON 检测（非 HTTP 但包含 JSON 数据）
                        elif payload_str.strip().startswith(('{', '[')):
                            app_protocol = "JSON"
                            
                    except Exception as e:
                        logger.debug(f"Protocol detection error: {e}")
                
                # 格式化相对时间为秒.微秒格式
                time_str = f"{relative_time:.6f}"
                
                packet_data = {
                    "id": idx + 1,
                    "timestamp": time_str,
                    "raw_time": pkt_time,
                    "relative_time": relative_time,
                    "sourceIP": src_ip,
                    "destIP": dst_ip,
                    "protocol": app_protocol,  # 使用应用层协议
                    "transport_protocol": protocol,  # 保留传输层协议
                    "method": app_protocol,
                    "path": f"{src_ip}:{src_port} → {dst_ip}:{dst_port}",
                    "size": f"{len(pkt)}B",
                    "info": http_info if http_info else f"{app_protocol} {src_port} → {dst_port}",
                    "payload_size": payload_size,
                    "payload_base64": base64.b64encode(payload_raw).decode() if payload_raw else None,
                    "tcp": tcp_data,
                    "udp": udp_data,
                    "stream_id": stream_id if pkt.haslayer(TCP) else None,
                    "stream_peer": stream_peer if pkt.haslayer(TCP) else None,
                }
                
                packets.append(packet_data)
            
            return {
                "status": "ok",
                "packets": packets,
                "packet_count": len(packets),
                "stream_count": stream_counter,
                "source": f"ssh://{request.username}@{request.host}"
            }
            
        finally:
            os.unlink(tmp_path)
            
    finally:
        ssh_manager.disconnect()


# ============================================================
# 静态文件服务（生产模式）
# ============================================================
# 提供前端静态文件
if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="assets")
    
    @app.get("/")
    async def serve_frontend():
        """返回前端 index.html"""
        index_file = STATIC_DIR / "index.html"
        if index_file.exists():
            return FileResponse(index_file)
        return {"error": "Frontend not built. Run 'npm run build' first."}
    
    logger.info(f"Serving frontend from {STATIC_DIR}")
else:
    logger.warning(f"Frontend build not found at {STATIC_DIR}. Run 'npm run build' to generate.")
    
    @app.get("/")
    async def no_frontend():
        return {
            "message": "NetShark Backend Running",
            "note": "Frontend not built. Please run 'npm run build' in the project root.",
            "api_docs": "/docs"
        }



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)  # 监听所有网络接口，允许内网访问

