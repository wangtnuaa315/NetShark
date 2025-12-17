"""
TCP流管理器
负责追踪TCP连接、重组数据、检测重传
"""
import logging
from typing import Dict, Optional, List, Tuple
from dataclasses import dataclass, field
from datetime import datetime
from scapy.all import TCP, IP

logger = logging.getLogger(__name__)


@dataclass
class TCPPacket:
    """TCP数据包信息"""
    timestamp: float
    seq: int
    ack: int
    flags: str  # SYN, ACK, FIN, PSH, RST
    payload: bytes
    payload_len: int
    window_size: int
    is_retransmission: bool = False
    

@dataclass
class TCPStream:
    """TCP流（单个连接）"""
    stream_id: str  # 五元组标识符
    src_ip: str
    src_port: int
    dst_ip: str
    dst_port: int
    
    # 连接状态
    state: str = "INIT"  # INIT, SYN_SENT, ESTABLISHED, FIN_WAIT, CLOSED
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    
    # 数据包列表
    packets: List[TCPPacket] = field(default_factory=list)
    
    # 序列号追踪（用于检测重传）
    seen_sequences: Dict[int, float] = field(default_factory=dict)  # seq -> timestamp
    
    # 统计信息
    total_packets: int = 0
    total_bytes: int = 0
    retransmission_count: int = 0
    out_of_order_count: int = 0
    
    # 期望的下一个序列号
    expected_seq: Optional[int] = None
    
    # === HTTP重组缓存 ===
    # 出站方向payload（客户端 -> 服务器）
    outbound_buffer: bytes = field(default_factory=bytes)
    # 入站方向payload（服务器 -> 客户端）
    inbound_buffer: bytes = field(default_factory=bytes)
    

class TCPStreamManager:
    """TCP流管理器 - 追踪所有TCP连接"""
    
    def __init__(self):
        self.streams: Dict[str, TCPStream] = {}
        logger.info("TCP Stream Manager initialized")
    
    def _get_stream_key(self, src_ip: str, src_port: int, dst_ip: str, dst_port: int) -> str:
        """
        生成双向连接标识符
        无论方向，都生成相同的key
        """
        # 排序确保双向一致
        if (src_ip, src_port) < (dst_ip, dst_port):
            return f"{src_ip}:{src_port}-{dst_ip}:{dst_port}"
        else:
            return f"{dst_ip}:{dst_port}-{src_ip}:{src_port}"
    
    def process_packet(self, pkt, timestamp: float = None) -> Tuple[TCPStream, TCPPacket, dict]:
        """
        处理TCP数据包
        
        :return: (stream, tcp_packet, analysis) 
                 analysis包含: is_retransmission, is_out_of_order等
        """
        if not timestamp:
            timestamp = datetime.now().timestamp()
        
        # 提取IP和TCP层
        if not pkt.haslayer(IP) or not pkt.haslayer(TCP):
            return None, None, {}
        
        ip_layer = pkt[IP]
        tcp_layer = pkt[TCP]
        
        # 获取五元组
        src_ip = ip_layer.src
        dst_ip = ip_layer.dst
        src_port = tcp_layer.sport
        dst_port = tcp_layer.dport
        
        # 获取或创建流
        stream_key = self._get_stream_key(src_ip, src_port, dst_ip, dst_port)
        
        if stream_key not in self.streams:
            self.streams[stream_key] = TCPStream(
                stream_id=stream_key,
                src_ip=src_ip,
                src_port=src_port,
                dst_ip=dst_ip,
                dst_port=dst_port,
                start_time=timestamp
            )
        
        stream = self.streams[stream_key]
        
        # 提取TCP信息
        seq = tcp_layer.seq
        ack = tcp_layer.ack
        flags = self._get_tcp_flags(tcp_layer)
        payload = bytes(tcp_layer.payload) if tcp_layer.payload else b''
        payload_len = len(payload)
        window_size = tcp_layer.window
        
        # 检测重传
        is_retransmission = self._detect_retransmission(stream, seq, payload_len)
        
        # 检测乱序
        is_out_of_order = self._detect_out_of_order(stream, seq, payload_len)
        
        # 更新连接状态
        self._update_state(stream, flags)
        
        # 创建TCP包对象
        tcp_packet = TCPPacket(
            timestamp=timestamp,
            seq=seq,
            ack=ack,
            flags=flags,
            payload=payload,
            payload_len=payload_len,
            window_size=window_size,
            is_retransmission=is_retransmission
        )
        
        # 添加到流
        stream.packets.append(tcp_packet)
        stream.total_packets += 1
        stream.total_bytes += payload_len
        
        if is_retransmission:
            stream.retransmission_count += 1
        
        if is_out_of_order:
            stream.out_of_order_count += 1
        
        # 记录序列号
        if payload_len > 0 and not is_retransmission:
            stream.seen_sequences[seq] = timestamp
            # 更新期望序列号
            stream.expected_seq = seq + payload_len
            
            # === 添加payload到HTTP重组缓存 ===
            # 判断方向：基于IP地址匹配
            # 出站：src_ip == stream.src_ip (客户端发送)
            # 入站：src_ip == stream.dst_ip (服务器响应)
            if src_ip == stream.src_ip and dst_ip == stream.dst_ip:
                # 出站数据
                stream.outbound_buffer += payload
                logger.warning(f"[TCP-BUFFER] Outbound += {payload_len}B, total={len(stream.outbound_buffer)}B")
                
                # 检查是否包含完整HTTP请求（不输出preview避免编码问题）
                if len(stream.outbound_buffer) > 20 and b'\r\n\r\n' in stream.outbound_buffer:
                    # 检测HTTP方法
                    first_line = stream.outbound_buffer.split(b'\r\n')[0]
                    if any(first_line.startswith(m.encode()) for m in ['GET ', 'POST ', 'PUT ', 'DELETE ']):
                        logger.warning(f"[TCP-BUFFER] Complete HTTP request detected ({len(stream.outbound_buffer)}B)")
                
            elif src_ip == stream.dst_ip and dst_ip == stream.src_ip:
                # 入站数据
                stream.inbound_buffer += payload
                logger.warning(f"[TCP-BUFFER] Inbound += {payload_len}B, total={len(stream.inbound_buffer)}B")
                
                # 检查是否包含完整HTTP响应
                if len(stream.inbound_buffer) > 20 and b'\r\n\r\n' in stream.inbound_buffer:
                    if stream.inbound_buffer.startswith(b'HTTP/'):
                        logger.warning(f"[TCP-BUFFER] Complete HTTP response detected ({len(stream.inbound_buffer)}B)")
        
        # 分析结果
        analysis = {
            'is_retransmission': is_retransmission,
            'is_out_of_order': is_out_of_order,
            'stream_state': stream.state,
            'total_packets': stream.total_packets,
            'retransmission_rate': stream.retransmission_count / stream.total_packets if stream.total_packets > 0 else 0
        }
        
        logger.debug(f"[TCP] Stream {stream_key}: SEQ={seq}, ACK={ack}, Flags={flags}, "
                    f"Retrans={is_retransmission}, OutOfOrder={is_out_of_order}")
        
        return stream, tcp_packet, analysis
    
    def _get_tcp_flags(self, tcp_layer) -> str:
        """提取TCP标志"""
        flags = []
        if tcp_layer.flags.S: flags.append("SYN")
        if tcp_layer.flags.A: flags.append("ACK")
        if tcp_layer.flags.F: flags.append("FIN")
        if tcp_layer.flags.P: flags.append("PSH")
        if tcp_layer.flags.R: flags.append("RST")
        return "|".join(flags) if flags else ""
    
    def _detect_retransmission(self, stream: TCPStream, seq: int, payload_len: int) -> bool:
        """
        检测TCP重传
        重传的特征：相同的序列号再次出现
        """
        if payload_len == 0:
            return False
        
        # 检查序列号是否已见过
        if seq in stream.seen_sequences:
            return True
        
        return False
    
    def _detect_out_of_order(self, stream: TCPStream, seq: int, payload_len: int) -> bool:
        """
        检测乱序包
        如果收到的序列号小于期望序列号，说明乱序
        """
        if stream.expected_seq is None or payload_len == 0:
            return False
        
        return seq < stream.expected_seq
    
    def _update_state(self, stream: TCPStream, flags: str):
        """更新TCP连接状态"""
        # SYN包 - 连接开始
        if "SYN" in flags and "ACK" not in flags:
            stream.state = "SYN_SENT"
        # SYN+ACK包 - 服务器响应
        elif "SYN" in flags and "ACK" in flags:
            stream.state = "SYN_RECEIVED"
        # ACK包 - 完成三次握手或数据传输
        elif "ACK" in flags and stream.state in ["SYN_SENT", "SYN_RECEIVED"]:
            stream.state = "ESTABLISHED"
        # 中途捕获的连接 - 有ACK但状态还是INIT
        elif "ACK" in flags and stream.state == "INIT":
            stream.state = "ESTABLISHED"
        # FIN包 - 连接关闭
        elif "FIN" in flags:
            stream.state = "FIN_WAIT"
        # RST包 - 连接重置
        elif "RST" in flags:
            stream.state = "CLOSED"
            stream.end_time = datetime.now().timestamp()
    
    def get_stream_stats(self, stream_id: str) -> Optional[dict]:
        """获取流统计信息"""
        if stream_id not in self.streams:
            return None
        
        stream = self.streams[stream_id]
        
        return {
            'stream_id': stream.stream_id,
            'src': f"{stream.src_ip}:{stream.src_port}",
            'dst': f"{stream.dst_ip}:{stream.dst_port}",
            'state': stream.state,
            'total_packets': stream.total_packets,
            'total_bytes': stream.total_bytes,
            'retransmissions': stream.retransmission_count,
            'retransmission_rate': stream.retransmission_count / stream.total_packets if stream.total_packets > 0 else 0,
            'out_of_order': stream.out_of_order_count,
            'duration': (stream.end_time or datetime.now().timestamp()) - stream.start_time if stream.start_time else 0
        }
    
    def get_all_streams(self) -> List[dict]:
        """获取所有流的统计信息"""
        return [self.get_stream_stats(sid) for sid in self.streams.keys()]
