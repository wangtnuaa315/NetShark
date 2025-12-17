"""
端口-进程 映射器
用于将网络端口映射到具体的进程PID，实现进程级流量过滤
"""
import psutil
from typing import Dict, Optional
import logging

logger = logging.getLogger(__name__)


class PortMapper:
    """端口到PID的映射管理器"""
    
    def __init__(self):
        self.port_to_pid: Dict[int, int] = {}
        self.pid_to_ports: Dict[int, set] = {}
        
    def refresh(self) -> None:
        """刷新端口映射表"""
        self.port_to_pid.clear()
        self.pid_to_ports.clear()
        
        try:
            connections = psutil.net_connections(kind='inet')
            for conn in connections:
                if conn.laddr and conn.pid:
                    port = conn.laddr.port
                    pid = conn.pid
                    
                    # 建立双向映射
                    self.port_to_pid[port] = pid
                    
                    if pid not in self.pid_to_ports:
                        self.pid_to_ports[pid] = set()
                    self.pid_to_ports[pid].add(port)
                    
            logger.info(f"Port mapping refreshed: {len(self.port_to_pid)} active ports")
        except Exception as e:
            logger.error(f"Failed to refresh port mapping: {e}")
    
    def get_pid_by_port(self, port: int) -> Optional[int]:
        """通过端口号获取进程PID"""
        return self.port_to_pid.get(port)
    
    def get_ports_by_pid(self, pid: int) -> set:
        """通过进程PID获取所有相关端口"""
        return self.pid_to_ports.get(pid, set())
    
    def belongs_to_pid(self, port: int, target_pid: int) -> bool:
        """判断某个端口是否属于目标进程"""
        pid = self.get_pid_by_port(port)
        return pid == target_pid if pid else False
