"""
流量分类器
根据端口、协议、方向等因素判断数据包类型 (CLIENT/SERVER/DB)
"""
from typing import List


class TrafficClassifier:
    """数据包类型分类器"""
    
    def __init__(self, db_ports: str):
        """
        初始化分类器
        :param db_ports: 数据库端口列表，逗号分隔，如 "3306,6379,5432"
        """
        self.db_ports = self._parse_ports(db_ports)
    
    def _parse_ports(self, port_str: str) -> List[int]:
        """解析端口字符串为整数列表"""
        if not port_str:
            return []
        
        ports = []
        for item in port_str.split(','):
            try:
                port = int(item.strip())
                if 1 <= port <= 65535:
                    ports.append(port)
            except ValueError:
                pass
        return ports
    
    def classify(self, dport: int, is_outbound: bool) -> str:
        """
        分类数据包
        :param dport: 目标端口
        :param is_outbound: 是否为出站流量（从目标进程发出）
        :return: 'CLIENT' | 'SERVER' | 'DB'
        """
        # 优先判断数据库流量
        if dport in self.db_ports:
            return 'db'
        
        # 根据方向判断
        if is_outbound:
            return 'client'  # 客户端发出的请求
        else:
            return 'server'  # 服务器返回的响应
