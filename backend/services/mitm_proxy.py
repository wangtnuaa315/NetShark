"""
MITM 代理服务
用于拦截和解密 HTTPS 流量
"""
import asyncio
import logging
import threading
from typing import Callable, Optional
from dataclasses import dataclass
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class HttpsRequest:
    """HTTPS 请求数据"""
    method: str
    url: str
    host: str
    path: str
    headers: dict
    body: bytes
    timestamp: float
    is_https: bool = True


@dataclass
class HttpsResponse:
    """HTTPS 响应数据"""
    status_code: int
    reason: str
    headers: dict
    body: bytes
    timestamp: float


@dataclass
class HttpsTransaction:
    """完整的 HTTPS 事务（请求+响应）"""
    request: HttpsRequest
    response: Optional[HttpsResponse] = None
    duration: Optional[float] = None  # 毫秒


class MitmProxyService:
    """
    MITM 代理服务
    使用 mitmproxy 拦截 HTTP/HTTPS 流量
    """
    
    def __init__(self, proxy_port: int = 8888):
        """
        初始化 MITM 代理
        
        :param proxy_port: 代理端口，默认 8888
        """
        self.proxy_port = proxy_port
        self.is_running = False
        self.callback: Optional[Callable] = None
        self._thread: Optional[threading.Thread] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        
        # 存储待匹配的请求（用于请求/响应配对）
        self._pending_requests: dict = {}
        
        logger.info(f"MITM Proxy Service initialized on port {proxy_port}")
    
    def start(self, callback: Callable):
        """
        启动代理服务
        
        :param callback: 数据回调函数 callback(transaction: HttpsTransaction)
        """
        if self.is_running:
            logger.warning("MITM Proxy is already running")
            return
        
        self.callback = callback
        self.is_running = True
        
        # 在独立线程中运行代理
        self._thread = threading.Thread(target=self._run_proxy, daemon=True)
        self._thread.start()
        
        logger.info(f"MITM Proxy started on port {self.proxy_port}")
    
    def stop(self):
        """停止代理服务"""
        self.is_running = False
        
        if self._loop:
            self._loop.call_soon_threadsafe(self._loop.stop)
        
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5)
        
        logger.info("MITM Proxy stopped")
    
    def _run_proxy(self):
        """在独立线程中运行 mitmproxy"""
        try:
            # 创建新的事件循环并设置为当前线程的事件循环
            self._loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self._loop)
            
            # 运行代理
            self._loop.run_until_complete(self._async_run_proxy())
            
        except ImportError as e:
            logger.error(f"MITM Proxy import error (mitmproxy not installed?): {e}")
            self.is_running = False
        except Exception as e:
            logger.error(f"MITM Proxy error: {e}")
            import traceback
            traceback.print_exc()
            self.is_running = False
        finally:
            if self._loop:
                self._loop.close()
    
    async def _async_run_proxy(self):
        """异步运行 mitmproxy"""
        from mitmproxy import options
        from mitmproxy.tools.dump import DumpMaster
        
        # 配置选项
        opts = options.Options(
            listen_host="127.0.0.1",
            listen_port=self.proxy_port,
            ssl_insecure=True,  # 忽略服务器证书错误
        )
        
        # 创建 DumpMaster
        self._master = DumpMaster(opts)
        
        # 添加请求/响应处理器
        self._master.addons.add(MitmAddon(self._on_request, self._on_response))
        
        logger.info(f"Starting mitmproxy on 127.0.0.1:{self.proxy_port}")
        
        # 运行代理
        await self._master.run()
    
    def _on_request(self, flow):
        """处理 HTTP 请求"""
        try:
            request = flow.request
            
            # 创建请求对象
            https_request = HttpsRequest(
                method=request.method,
                url=request.pretty_url,
                host=request.host,
                path=request.path,
                headers=dict(request.headers),
                body=request.content or b'',
                timestamp=datetime.now().timestamp(),
                is_https=request.scheme == "https"
            )
            
            # 存储待配对
            flow_id = id(flow)
            self._pending_requests[flow_id] = https_request
            
            logger.debug(f"[MITM] Request: {request.method} {request.pretty_url}")
            
        except Exception as e:
            logger.error(f"Error processing request: {e}")
    
    def _on_response(self, flow):
        """处理 HTTP 响应"""
        try:
            response = flow.response
            flow_id = id(flow)
            
            # 获取对应的请求
            https_request = self._pending_requests.pop(flow_id, None)
            if not https_request:
                logger.warning("No matching request for response")
                return
            
            # 创建响应对象
            https_response = HttpsResponse(
                status_code=response.status_code,
                reason=response.reason or "",
                headers=dict(response.headers),
                body=response.content or b'',
                timestamp=datetime.now().timestamp()
            )
            
            # 计算耗时
            duration = (https_response.timestamp - https_request.timestamp) * 1000
            
            # 创建完整事务
            transaction = HttpsTransaction(
                request=https_request,
                response=https_response,
                duration=duration
            )
            
            logger.debug(f"[MITM] Response: {response.status_code} {https_request.url} ({duration:.2f}ms)")
            
            # 回调通知
            if self.callback:
                self.callback(transaction)
            
        except Exception as e:
            logger.error(f"Error processing response: {e}")
    
    def get_ca_cert_path(self) -> str:
        """
        获取 CA 证书路径
        用户需要安装此证书才能解密 HTTPS
        """
        from pathlib import Path
        import os
        
        # mitmproxy 默认证书目录
        home = Path.home()
        cert_path = home / ".mitmproxy" / "mitmproxy-ca-cert.pem"
        
        if cert_path.exists():
            return str(cert_path)
        
        # Windows 格式
        cert_path_cer = home / ".mitmproxy" / "mitmproxy-ca-cert.cer"
        if cert_path_cer.exists():
            return str(cert_path_cer)
        
        return ""
    
    def install_ca_cert(self) -> bool:
        """
        安装 CA 证书到系统信任存储（Windows）
        需要管理员权限
        """
        try:
            import subprocess
            from pathlib import Path
            
            home = Path.home()
            cert_path = home / ".mitmproxy" / "mitmproxy-ca-cert.cer"
            
            if not cert_path.exists():
                logger.error("CA certificate not found. Run the proxy first to generate it.")
                return False
            
            # 使用 certutil 安装证书
            result = subprocess.run(
                ["certutil", "-addstore", "Root", str(cert_path)],
                capture_output=True,
                text=True
            )
            
            if result.returncode == 0:
                logger.info("CA certificate installed successfully")
                return True
            else:
                logger.error(f"Failed to install certificate: {result.stderr}")
                return False
            
        except Exception as e:
            logger.error(f"Error installing certificate: {e}")
            return False


class MitmAddon:
    """mitmproxy 插件，用于拦截请求/响应"""
    
    def __init__(self, on_request: Callable, on_response: Callable):
        self.on_request = on_request
        self.on_response = on_response
    
    def request(self, flow):
        """请求拦截"""
        self.on_request(flow)
    
    def response(self, flow):
        """响应拦截"""
        self.on_response(flow)
