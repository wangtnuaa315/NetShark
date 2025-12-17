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
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from backend.services.process_scanner import get_running_processes
from backend.services.packet_capture import PacketCaptureEngine
from backend.services.mitm_proxy import MitmProxyService, HttpsTransaction
from backend.services import cert_manager
import asyncio
from pathlib import Path

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

