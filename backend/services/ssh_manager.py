"""
SSH 连接管理服务
功能：
1. SSH 连接和认证
2. 执行远程命令
3. tcpdump 抓包
4. 服务器配置存储
"""

import paramiko
import json
import os
import uuid
import threading
import time
from datetime import datetime
from typing import Optional, List, Dict, Callable
import logging

logger = logging.getLogger(__name__)

# 服务器配置文件路径
SERVERS_FILE = os.path.join(os.path.dirname(__file__), '..', 'data', 'servers.json')


class SSHManager:
    """SSH 连接管理器"""
    
    def __init__(self):
        self.client: Optional[paramiko.SSHClient] = None
        self.connected = False
        self.current_server = None
        self._capture_thread = None
        self._stop_capture = threading.Event()
        self._current_capture_file = None  # 当前抓包的远程文件
        self._capture_channel = None  # 当前抓包的 SSH channel
        
    def connect(self, host: str, port: int, username: str, password: str, timeout: int = 10) -> dict:
        """
        建立 SSH 连接
        
        Args:
            host: 服务器地址
            port: SSH 端口
            username: 用户名
            password: 密码
            timeout: 连接超时（秒）
            
        Returns:
            dict: {"status": "ok/error", "message": str}
        """
        try:
            self.client = paramiko.SSHClient()
            self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            
            logger.info(f"[SSH] Connecting to {host}:{port} as {username}")
            
            self.client.connect(
                hostname=host,
                port=port,
                username=username,
                password=password,
                timeout=timeout,
                look_for_keys=False,
                allow_agent=False
            )
            
            self.connected = True
            self.current_server = {
                "host": host,
                "port": port,
                "username": username
            }
            
            logger.info(f"[SSH] Connected to {host}")
            return {"status": "ok", "message": f"成功连接到 {host}"}
            
        except paramiko.AuthenticationException:
            logger.error(f"[SSH] Authentication failed for {username}@{host}")
            return {"status": "error", "message": "认证失败：用户名或密码错误"}
            
        except paramiko.SSHException as e:
            logger.error(f"[SSH] SSH error: {e}")
            return {"status": "error", "message": f"SSH 错误: {str(e)}"}
            
        except Exception as e:
            logger.error(f"[SSH] Connection error: {e}")
            return {"status": "error", "message": f"连接失败: {str(e)}"}
    
    def disconnect(self):
        """断开 SSH 连接"""
        if self.client:
            self.client.close()
            self.client = None
        self.connected = False
        self.current_server = None
        logger.info("[SSH] Disconnected")
    
    def execute(self, command: str, sudo: bool = False, password: str = None) -> dict:
        """
        执行远程命令
        
        Args:
            command: 要执行的命令
            sudo: 是否使用 sudo
            password: sudo 密码（如果需要）
            
        Returns:
            dict: {"status": "ok/error", "stdout": str, "stderr": str, "exit_code": int}
        """
        if not self.connected or not self.client:
            return {"status": "error", "message": "未连接到服务器"}
        
        try:
            if sudo:
                # 使用 sudo 执行，通过 -S 从 stdin 读取密码
                if password:
                    command = f'echo "{password}" | sudo -S {command}'
                else:
                    command = f'sudo {command}'
            
            logger.debug(f"[SSH] Executing: {command[:100]}...")
            
            stdin, stdout, stderr = self.client.exec_command(command, timeout=30)
            
            exit_code = stdout.channel.recv_exit_status()
            stdout_str = stdout.read().decode('utf-8', errors='replace')
            stderr_str = stderr.read().decode('utf-8', errors='replace')
            
            return {
                "status": "ok" if exit_code == 0 else "error",
                "stdout": stdout_str,
                "stderr": stderr_str,
                "exit_code": exit_code
            }
            
        except Exception as e:
            logger.error(f"[SSH] Execute error: {e}")
            return {"status": "error", "message": str(e)}
    
    def get_interfaces(self, password: str = None) -> List[str]:
        """
        获取远程服务器的网络接口列表
        
        Returns:
            List[str]: 网络接口名称列表
        """
        result = self.execute("ip -o link show | awk -F': ' '{print $2}'")
        
        if result["status"] == "ok":
            interfaces = [line.strip() for line in result["stdout"].split('\n') if line.strip()]
            # 添加 "any" 选项
            return ["any"] + interfaces
        
        return ["any", "eth0", "lo"]
    
    def start_capture_stream(
        self,
        interface: str,
        filter_expr: str,
        password: str,
        on_packet: Callable[[bytes], None],
        on_error: Callable[[str], None]
    ):
        """
        开始实时抓包（流式）
        
        Args:
            interface: 网络接口
            filter_expr: tcpdump 过滤表达式
            password: sudo 密码
            on_packet: 收到数据包时的回调
            on_error: 错误回调
        """
        if not self.connected or not self.client:
            on_error("未连接到服务器")
            return
        
        self._stop_capture.clear()
        
        def capture_thread():
            try:
                # 构建 tcpdump 命令
                # -U: 立即输出（不缓冲）
                # -w -: 输出到 stdout
                # --immediate-mode: 立即模式
                cmd = f'echo "{password}" | sudo -S tcpdump -i {interface} -U -w - --immediate-mode'
                if filter_expr:
                    cmd += f' {filter_expr}'
                
                logger.info(f"[SSH] Starting capture: {cmd[:80]}...")
                
                # 使用 invoke_shell 保持会话
                channel = self.client.get_transport().open_session()
                channel.get_pty()
                channel.exec_command(cmd)
                
                # 等待 sudo 密码提示
                time.sleep(0.5)
                
                # 读取输出
                buffer = b''
                while not self._stop_capture.is_set():
                    if channel.recv_ready():
                        data = channel.recv(65536)
                        if data:
                            buffer += data
                            # 尝试解析 pcap 数据包
                            if len(buffer) >= 24:  # pcap 全局头大小
                                on_packet(buffer)
                                buffer = b''
                    else:
                        time.sleep(0.01)
                
                channel.close()
                logger.info("[SSH] Capture stopped")
                
            except Exception as e:
                logger.error(f"[SSH] Capture error: {e}")
                on_error(str(e))
        
        self._capture_thread = threading.Thread(target=capture_thread, daemon=True)
        self._capture_thread.start()
    
    def stop_capture(self):
        """停止抓包"""
        self._stop_capture.set()
        if self._capture_thread:
            self._capture_thread.join(timeout=5)
            self._capture_thread = None
    
    def capture_to_file(
        self,
        interface: str,
        filter_expr: str,
        password: str,
        count: int = 100,
        duration: int = 30
    ) -> dict:
        """
        抓包保存到远程文件，然后下载
        
        Args:
            interface: 网络接口
            filter_expr: tcpdump 过滤表达式
            password: sudo 密码
            count: 抓取包数量（0=无限制）
            duration: 最大持续时间（秒）
            
        Returns:
            dict: {"status": "ok/error", "pcap_data": bytes}
        """
        if not self.connected or not self.client:
            return {"status": "error", "message": "未连接到服务器"}
        
        # 重置停止标志
        self._stop_capture.clear()
        
        try:
            # 生成远程临时文件名
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            remote_file = f"/tmp/netshark_capture_{timestamp}.pcap"
            self._current_capture_file = remote_file
            
            # 构建 tcpdump 命令
            # 注意: 过滤表达式必须放在最后，并且需要用单引号包裹
            cmd = f'tcpdump -i {interface} -w {remote_file}'
            if count > 0:
                cmd += f' -c {count}'
            # 过滤表达式放在最后，用单引号包裹避免 shell 解析问题
            if filter_expr:
                # 清理过滤表达式，去除可能的外层引号
                clean_filter = filter_expr.strip().strip('"').strip("'")
                
                # 智能处理：如果只输入了数字，自动转换为端口过滤
                if clean_filter.isdigit():
                    clean_filter = f"port {clean_filter}"
                    logger.info(f"[SSH] Auto-converted filter to: {clean_filter}")
                
                cmd += f" '{clean_filter}'"
            
            logger.info(f"[SSH] Capture to file: {cmd}")
            
            # 使用非阻塞方式执行，以便可以中断
            if password:
                full_cmd = f'echo "{password}" | sudo -S {cmd}'
            else:
                full_cmd = f'sudo {cmd}'
            
            # 使用 channel 执行，可以手动关闭
            transport = self.client.get_transport()
            self._capture_channel = transport.open_session()
            self._capture_channel.exec_command(full_cmd)
            
            # 等待命令完成或被停止
            start_time = time.time()
            while not self._capture_channel.exit_status_ready():
                if self._stop_capture.is_set():
                    logger.info("[SSH] Capture stop requested")
                    # 发送 SIGINT 信号停止 tcpdump
                    try:
                        kill_cmd = f'echo "{password}" | sudo -S pkill -INT -f "tcpdump.*{remote_file}"'
                        self.client.exec_command(kill_cmd)
                        time.sleep(0.5)
                    except:
                        pass
                    break
                
                # 超时检查
                if time.time() - start_time > duration:
                    logger.info("[SSH] Capture timeout, stopping...")
                    try:
                        kill_cmd = f'echo "{password}" | sudo -S pkill -INT -f "tcpdump.*{remote_file}"'
                        self.client.exec_command(kill_cmd)
                        time.sleep(0.5)
                    except:
                        pass
                    break
                
                time.sleep(0.1)
            
            # 读取输出
            stderr_str = self._capture_channel.recv_stderr(4096).decode('utf-8', errors='replace')
            exit_code = self._capture_channel.recv_exit_status() if self._capture_channel.exit_status_ready() else 0
            
            logger.info(f"[SSH] Capture result: exit_code={exit_code}")
            logger.info(f"[SSH] Capture stderr: {stderr_str[:200]}")
            
            self._capture_channel = None
            
            if "packets captured" not in stderr_str and exit_code != 0 and not self._stop_capture.is_set():
                return {"status": "error", "message": stderr_str or "抓包失败"}
            
            # 下载文件
            sftp = self.client.open_sftp()
            try:
                with sftp.open(remote_file, 'rb') as f:
                    pcap_data = f.read()
                
                # 暂时不删除远程临时文件，供调试验证
                # sftp.remove(remote_file)
                logger.info(f"[SSH] Remote PCAP file kept at: {remote_file}")
                
                logger.info(f"[SSH] Downloaded {len(pcap_data)} bytes of PCAP data")
                
                return {
                    "status": "ok",
                    "pcap_data": pcap_data,
                    "size": len(pcap_data),
                    "remote_file": remote_file,  # 返回远程文件路径
                    "stopped": self._stop_capture.is_set()
                }
                
            finally:
                sftp.close()
                self._current_capture_file = None
            
        except Exception as e:
            logger.error(f"[SSH] Capture to file error: {e}")
            self._current_capture_file = None
            return {"status": "error", "message": str(e)}
    
    def stop_capture_file(self, password: str = None) -> dict:
        """
        停止当前的文件抓包
        
        Returns:
            dict: {"status": "ok/error", "message": str}
        """
        logger.info("[SSH] Stop capture requested")
        self._stop_capture.set()
        
        # 如果有正在进行的抓包，尝试杀死 tcpdump 进程
        if self._current_capture_file and self.connected and self.client:
            try:
                kill_cmd = f'pkill -INT -f "tcpdump.*{self._current_capture_file}"'
                if password:
                    kill_cmd = f'echo "{password}" | sudo -S {kill_cmd}'
                self.client.exec_command(kill_cmd)
                logger.info("[SSH] Sent kill signal to tcpdump")
            except Exception as e:
                logger.error(f"[SSH] Failed to kill tcpdump: {e}")
        
        return {"status": "ok", "message": "停止信号已发送"}


class ServerStorage:
    """服务器配置存储（支持加密密码）"""
    
    # 简单的加密密钥（实际生产环境应该使用更安全的方式）
    _ENCRYPTION_KEY = b'NetShark_Secret_Key_2024!'
    
    def __init__(self, filepath: str = SERVERS_FILE):
        self.filepath = filepath
        self._ensure_file()
    
    def _ensure_file(self):
        """确保配置文件存在"""
        os.makedirs(os.path.dirname(self.filepath), exist_ok=True)
        if not os.path.exists(self.filepath):
            self._save({"servers": []})
    
    def _encrypt_password(self, password: str) -> str:
        """简单加密密码（Base64 + XOR）"""
        import base64
        if not password:
            return ""
        key = self._ENCRYPTION_KEY
        encrypted = bytes([ord(c) ^ key[i % len(key)] for i, c in enumerate(password)])
        return base64.b64encode(encrypted).decode('utf-8')
    
    def _decrypt_password(self, encrypted: str) -> str:
        """解密密码"""
        import base64
        if not encrypted:
            return ""
        try:
            key = self._ENCRYPTION_KEY
            decoded = base64.b64decode(encrypted.encode('utf-8'))
            return ''.join([chr(b ^ key[i % len(key)]) for i, b in enumerate(decoded)])
        except:
            return ""
    
    def _load(self) -> dict:
        """加载配置"""
        try:
            with open(self.filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            return {"servers": []}
    
    def _save(self, data: dict):
        """保存配置"""
        with open(self.filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    
    def list_servers(self) -> List[dict]:
        """获取所有服务器（密码解密返回）"""
        data = self._load()
        servers = data.get("servers", [])
        # 解密密码
        for server in servers:
            if server.get("encrypted_password"):
                server["password"] = self._decrypt_password(server["encrypted_password"])
                server["has_password"] = True
            else:
                server["password"] = ""
                server["has_password"] = False
        return servers
    
    def get_server(self, server_id: str) -> Optional[dict]:
        """获取指定服务器"""
        servers = self.list_servers()
        for server in servers:
            if server.get("id") == server_id:
                return server
        return None
    
    def add_server(self, name: str, host: str, port: int, username: str, password: str = None, save_password: bool = False) -> dict:
        """添加服务器"""
        data = self._load()
        
        server = {
            "id": str(uuid.uuid4()),
            "name": name,
            "host": host,
            "port": port,
            "username": username,
            "created_at": datetime.now().isoformat(),
            "last_used": None
        }
        
        # 可选保存密码（加密存储）
        if save_password and password:
            server["encrypted_password"] = self._encrypt_password(password)
        
        data["servers"].append(server)
        self._save(data)
        
        logger.info(f"[Storage] Added server: {name} ({host}), password_saved={save_password}")
        return server
    
    def update_server(self, server_id: str, **kwargs) -> bool:
        """更新服务器"""
        data = self._load()
        
        for server in data["servers"]:
            if server.get("id") == server_id:
                # 如果更新密码，需要加密
                if "password" in kwargs:
                    if kwargs.get("save_password") and kwargs["password"]:
                        server["encrypted_password"] = self._encrypt_password(kwargs["password"])
                    del kwargs["password"]
                    if "save_password" in kwargs:
                        del kwargs["save_password"]
                server.update(kwargs)
                self._save(data)
                return True
        
        return False
    
    def delete_server(self, server_id: str) -> bool:
        """删除服务器"""
        data = self._load()
        
        original_count = len(data["servers"])
        data["servers"] = [s for s in data["servers"] if s.get("id") != server_id]
        
        if len(data["servers"]) < original_count:
            self._save(data)
            logger.info(f"[Storage] Deleted server: {server_id}")
            return True
        
        return False
    
    def update_last_used(self, server_id: str):
        """更新最后使用时间"""
        self.update_server(server_id, last_used=datetime.now().isoformat())


# 全局实例
ssh_manager = SSHManager()
server_storage = ServerStorage()

