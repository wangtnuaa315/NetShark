"""
网络抓包引擎
基于 Scapy 实现，支持PID过滤、流追踪、异常检测
"""
from scapy.all import sniff, TCP, UDP, IP, Raw, Packet
from typing import Optional, Callable
import threading
import logging
from datetime import datetime

from .port_mapper import PortMapper
from .traffic_classifier import TrafficClassifier
from .tcp_stream import TCPStreamManager
from .http_stream import HTTPStreamParser

logger = logging.getLogger(__name__)


class PacketCaptureEngine:
    """
    网络抓包引擎
    - 按PID过滤
    - TCP流追踪
    - HTTP解析
    - 重传/重试检测
    """
    
    def __init__(self, target_pid: int, db_ports: str = "3306,6379,5432", server_ips: str = ""):
        """
        初始化抓包引擎
        :param target_pid: 目标进程PID
        :param db_ports: 数据库端口列表（逗号分隔）
        :param server_ips: 服务器IP列表（逗号分隔），用于过滤流量，例如"192.168.2.33,14.119.115.229"
        """
        self.target_pid = target_pid
        self.db_ports = db_ports
        self.server_ips = [ip.strip() for ip in server_ips.split(',') if ip.strip()] if server_ips else []
        
        # 核心组件
        self.port_mapper = PortMapper()
        self.classifier = TrafficClassifier(db_ports)
        self.tcp_stream_manager = TCPStreamManager()
        self.http_stream_parser = HTTPStreamParser()
        
        self.is_running = False
        self.capture_thread: Optional[threading.Thread] = None
        self.packet_callback: Optional[Callable] = None
        
        # 请求时间戳字典（用于计算延迟）
        self.request_times = {}
        
        # 数据包计数器（生成唯一ID）
        self.packet_counter = 0
        self.packet_counter_lock = threading.Lock()
        
        logger.info(f"PacketCaptureEngine initialized for PID {target_pid}")
        if self.server_ips:
            logger.warning(f"[IP-FILTER] Server IPs: {self.server_ips}")
        
    def start(self, callback: Callable) -> None:
        """
        启动抓包
        :param callback: 数据包处理回调函数 callback(packet_dict)
        """
        if self.is_running:
            logger.warning("Capture already running")
            return
        
        self.packet_callback = callback
        self.is_running = True
        
        # 刷新端口映射
        logger.info(f"Refreshing port mapping for PID {self.target_pid}...")
        self.port_mapper.refresh()
        
        # 输出调试信息
        target_ports = self.port_mapper.get_ports_by_pid(self.target_pid)
        logger.info(f"Target PID {self.target_pid} is using ports: {target_ports}")
        logger.info(f"Total active ports in system: {len(self.port_mapper.port_to_pid)}")
        
        # 启动抓包线程
        self.capture_thread = threading.Thread(
            target=self._capture_loop,
            daemon=True
        )
        self.capture_thread.start()
        logger.info(f"Packet capture started for PID {self.target_pid}")
    
    def stop(self) -> None:
        """停止抓包"""
        self.is_running = False
        if self.capture_thread:
            self.capture_thread.join(timeout=2)
        logger.info("Packet capture stopped")
    
    def _capture_loop(self) -> None:
        """抓包主循环（在独立线程中运行）"""
        try:
            # 构建BPF过滤器
            bpf_filter = "tcp or udp"
            
            # 添加服务器IP过滤（类似Wireshark的 ip.addr == X.X.X.X）
            if self.server_ips:
                ip_filters = [f"host {ip}" for ip in self.server_ips]
                ip_filter_str = " or ".join(ip_filters)
                bpf_filter = f"({bpf_filter}) and ({ip_filter_str})"
                logger.warning(f"[BPF-FILTER] {bpf_filter}")
            
            # 使用 Scapy 嗅探网络流量
            sniff(
                prn=self._process_packet,
                filter=bpf_filter,  # 应用BPF过滤器
                store=False,  # 不存储数据包（节省内存）
                stop_filter=lambda _: not self.is_running
            )
        except Exception as e:
            logger.error(f"Capture loop error: {e}")
            self.is_running = False
    
    def _process_packet(self, pkt: Packet) -> None:
        """
        处理单个数据包
        :param pkt: Scapy 数据包对象
        """
        if not self.is_running:
            return
        
        # 检查是否是 IP 数据包
        if not pkt.haslayer(IP):
            return
        
        ip_layer = pkt[IP]
        
        # 获取传输层信息
        if pkt.haslayer(TCP):
            transport = pkt[TCP]
            protocol = "TCP"
        elif pkt.haslayer(UDP):
            transport = pkt[UDP]
            protocol = "UDP"
        else:
            return
        
        sport = transport.sport  # 源端口
        dport = transport.dport  # 目标端口
        
        # 获取本机IP（一次性）- 跳过回环地址
        if not hasattr(self, '_local_ip'):
            import psutil
            try:
                # 从目标进程的连接中获取本机IP（跳过回环）
                connections = psutil.net_connections(kind='inet')
                candidate_ips = []
                for conn in connections:
                    if conn.pid == self.target_pid and conn.laddr:
                        ip = conn.laddr.ip
                        # 跳过回环和通配符
                        if ip not in ['127.0.0.1', '0.0.0.0', '::1', '::']:
                            candidate_ips.append(ip)
                
                # 优先选择192.168网段的IP
                for ip in candidate_ips:
                    if ip.startswith('192.168.'):
                        self._local_ip = ip
                        logger.warning(f"[IP-DETECT] Found 192.168 IP: {self._local_ip}")
                        break
                else:
                    # 使用第一个非回环IP
                    if candidate_ips:
                        self._local_ip = candidate_ips[0]
                        logger.warning(f"[IP-DETECT] Using first non-loopback IP: {self._local_ip}")
                    else:
                        # 最终回退
                        self._local_ip = "192.168.2.130"
                        logger.warning(f"[IP-DETECT] No connections found, using hardcoded: {self._local_ip}")
            except Exception as e:
                self._local_ip = "192.168.2.130"
                logger.warning(f"[IP-DETECT] Detection failed ({e}), using hardcoded: {self._local_ip}")
        
        # 方案1: Port Mapper匹配
        is_outbound_port = self.port_mapper.belongs_to_pid(sport, self.target_pid)
        is_inbound_port = self.port_mapper.belongs_to_pid(dport, self.target_pid)
        
        # 方案2: IP地址匹配（更可靠）
        src_ip_str = str(ip_layer.src)
        dst_ip_str = str(ip_layer.dst)
        is_from_local = (src_ip_str == self._local_ip)
        is_to_local = (dst_ip_str == self._local_ip)
        
        # 综合判断
        is_outbound = is_outbound_port or is_from_local
        is_inbound = is_inbound_port or is_to_local
        
        # 🔧智能修复：如果我们之前见过这个连接的出站包，那么对应的入站包也应该捕获
        conn_key = f"{ip_layer.src}:{sport}-{ip_layer.dst}:{dport}"
        conn_key_reverse = f"{ip_layer.dst}:{dport}-{ip_layer.src}:{sport}"
        
        if not hasattr(self, '_known_connections'):
            self._known_connections = set()
        
        # 如果这是出站包，记录这个连接
        if is_outbound:
            self._known_connections.add(conn_key)
        
        # 如果这是已知连接的反向包（入站），也应该捕获
        if not is_inbound and conn_key_reverse in self._known_connections:
            is_inbound = True
            logger.debug(f"[SMART-MATCH] Inbound packet matched by connection tracking: {conn_key}")
        
        # 调试：输出匹配逻辑（移除emoji避免编码错误）
        logger.debug(f"[FILTER] {ip_layer.src}:{sport} -> {ip_layer.dst}:{dport} | "
                    f"Out={is_outbound} In={is_inbound} | "
                    f"PortOut={is_outbound_port} PortIn={is_inbound_port} | "
                    f"FromLocal={is_from_local} ToLocal={is_to_local} | LocalIP={self._local_ip}")
        
        # 调试：每捕获100个包输出一次调试信息
        if not hasattr(self, '_packet_count'):
            self._packet_count = 0
        self._packet_count += 1
        
        if self._packet_count % 100 == 0:
            logger.debug(f"Processed {self._packet_count} packets. " 
                        f"Last packet: {ip_layer.src}:{sport} -> {ip_layer.dst}:{dport}")
        
        if not (is_outbound or is_inbound):
            # 不属于目标进程，跳过
            return
        
        # 成功匹配到目标进程的包！
        direction = "OUTBOUND" if is_outbound else "INBOUND"
        logger.info(f"[MATCHED-{direction}] Packet for PID {self.target_pid}: "
                   f"{ip_layer.src}:{sport} -> {ip_layer.dst}:{dport} ({protocol})")
        
        # ═══════════════════════════════════════════════════════════
        # TCP流追踪和分析
        # ═══════════════════════════════════════════════════════════
        tcp_analysis = {}
        http_data = None
        tls_data = None  # TLS 协议数据
        
        if pkt.haslayer(TCP):
            # 使用TCP流管理器处理
            timestamp = datetime.now().timestamp()
            stream, tcp_packet, tcp_analysis = self.tcp_stream_manager.process_packet(pkt, timestamp)
            
            if stream and tcp_packet:
                logger.debug(f"[TCP] Stream {stream.stream_id}: "
                           f"SEQ={tcp_packet.seq}, ACK={tcp_packet.ack}, "
                           f"Flags={tcp_packet.flags}, Retrans={tcp_packet.is_retransmission}")
                
                # 如果有payload，尝试解析协议
                if tcp_packet.payload_len > 0:
                    payload = tcp_packet.payload
                    
                    # 首先尝试检测 TLS
                    tls_data = self._parse_tls(payload)
                    if tls_data:
                        logger.info(f"[TLS] Detected {tls_data['version']} {tls_data['content_type']}")
                        if 'sni' in tls_data:
                            logger.info(f"[TLS] SNI: {tls_data['sni']}")
                    
                    # 如果不是 TLS，检测是否是 HTTP
                    if not tls_data:
                        try:
                            payload_text = payload.decode('latin-1')
                            logger.debug(f"[HTTP] Checking payload: {payload_text[:100]}")
                            
                            # HTTP请求特征
                            if any(payload_text.startswith(m) for m in ['GET ', 'POST ', 'PUT ', 'DELETE ', 'HEAD ', 'OPTIONS ', 'PATCH ']):
                                logger.info(f"[HTTP] Detected HTTP request")
                                http_request = self.http_stream_parser.parse_request(payload, timestamp, stream.stream_id)
                                if http_request:
                                    body_str = http_request.body.decode('utf-8', errors='ignore')[:500]
                                    http_data = {
                                        'type': 'request',
                                        'method': http_request.method,
                                        'url': http_request.url,
                                        'headers': http_request.headers,
                                        'body': body_str
                                    }
                                    logger.warning(f"[HTTP-BODY] Request body length: {len(http_request.body)} bytes, preview: {body_str[:100]}")
                                    logger.info(f"[HTTP] Parsed request: {http_request.method} {http_request.url}")
                            
                            # HTTP响应特征
                            elif payload_text.startswith('HTTP/'):
                                logger.info(f"[HTTP] Detected HTTP response")
                                http_response = self.http_stream_parser.parse_response(payload, timestamp, stream.stream_id)
                                if http_response:
                                    http_data = {
                                        'type': 'response',
                                        'status_code': http_response.status_code,
                                        'reason': http_response.reason,
                                        'headers': http_response.headers,
                                        'body': http_response.body.decode('utf-8', errors='ignore')[:500]
                                    }
                                    logger.info(f"[HTTP] Parsed response: {http_response.status_code} {http_response.reason}")
                        except Exception as e:
                            logger.error(f"[HTTP] Failed to parse HTTP: {e}", exc_info=True)
                
                # === 新增：尝试从TCP流缓存解析完整HTTP消息 ===
                # 检查流的outbound buffer（客户端请求）
                if not http_data and len(stream.outbound_buffer) > 50:
                    try:
                        buffer_preview = stream.outbound_buffer.decode('latin-1', errors='ignore')[:50]
                        if any(buffer_preview.startswith(m) for m in ['GET ', 'POST ', 'PUT ', 'DELETE ', 'HEAD ', 'OPTIONS ', 'PATCH ']):
                            # 检查是否有完整headers
                            if b'\r\n\r\n' in stream.outbound_buffer:
                                # 提取headers部分检查Content-Length
                                header_end = stream.outbound_buffer.index(b'\r\n\r\n')
                                headers_part = stream.outbound_buffer[:header_end].decode('latin-1', errors='ignore')
                                
                                # 查找Content-Length
                                content_length = 0
                                for line in headers_part.split('\r\n'):
                                    if line.lower().startswith('content-length:'):
                                        try:
                                            content_length = int(line.split(':', 1)[1].strip())
                                        except:
                                            pass
                                        break
                                
                                # 检查body是否完整
                                expected_total = header_end + 4 + content_length  # 4 = len('\r\n\r\n')
                                current_size = len(stream.outbound_buffer)
                                
                                if current_size >= expected_total:
                                    logger.info(f"[HTTP-STREAM] Parsing request: {current_size}B (need {expected_total}B)")
                                    http_request = self.http_stream_parser.parse_request(stream.outbound_buffer, timestamp, stream.stream_id)
                                    if http_request:
                                        body_str = http_request.body.decode('utf-8', errors='ignore')[:500]
                                        http_data = {
                                            'type': 'request',
                                            'method': http_request.method,
                                            'url': http_request.url,
                                            'headers': http_request.headers,
                                            'body': body_str
                                        }
                                        logger.warning(f"[HTTP-STREAM] SUCCESS {http_request.method} {http_request.url} body={len(http_request.body)}B")
                                        stream.outbound_buffer = b''  # 清空
                                    else:
                                        logger.warning(f"[HTTP-STREAM] parse_request returned None")
                                else:
                                    logger.debug(f"[HTTP-STREAM] Waiting for more data: {current_size}/{expected_total}B")
                    except Exception as e:
                        logger.error(f"[HTTP-STREAM] Request parse error: {e}", exc_info=True)
                
                # 检查流的inbound buffer（服务器响应）
                if not http_data and len(stream.inbound_buffer) > 50:
                    try:
                        buffer_preview = stream.inbound_buffer.decode('latin-1', errors='ignore')[:50]
                        if buffer_preview.startswith('HTTP/'):
                            # 检查是否有完整headers
                            if b'\r\n\r\n' in stream.inbound_buffer:
                                # 提取headers部分检查Content-Length
                                header_end = stream.inbound_buffer.index(b'\r\n\r\n')
                                headers_part = stream.inbound_buffer[:header_end].decode('latin-1', errors='ignore')
                                
                                # 查找Content-Length
                                content_length = 0
                                for line in headers_part.split('\r\n'):
                                    if line.lower().startswith('content-length:'):
                                        try:
                                            content_length = int(line.split(':', 1)[1].strip())
                                        except:
                                            pass
                                        break
                                
                                # 检查body是否完整
                                expected_total = header_end + 4 + content_length
                                current_size = len(stream.inbound_buffer)
                                
                                if current_size >= expected_total:
                                    logger.info(f"[HTTP-STREAM] Parsing response: {current_size}B (need {expected_total}B)")
                                    http_response = self.http_stream_parser.parse_response(stream.inbound_buffer, timestamp, stream.stream_id)
                                    if http_response:
                                        body_str = http_response.body.decode('utf-8', errors='ignore')[:500]
                                        http_data = {
                                            'type': 'response',
                                            'status_code': http_response.status_code,
                                            'reason': http_response.reason,
                                            'headers': http_response.headers,
                                            'body': body_str
                                        }
                                        logger.warning(f"[HTTP-STREAM] SUCCESS {http_response.status_code} body={len(http_response.body)}B")
                                        stream.inbound_buffer = b''  # 清空
                                    else:
                                        logger.warning(f"[HTTP-STREAM] parse_response returned None")
                                else:
                                    logger.debug(f"[HTTP-STREAM] Waiting for more data: {current_size}/{expected_total}B")
                    except Exception as e:
                        logger.error(f"[HTTP-STREAM] Response parse error: {e}", exc_info=True)
        
        # ═══════════════════════════════════════════════════════════
        # 构建数据包字典（包含TCP和HTTP层信息）
        # ═══════════════════════════════════════════════════════════
        
        # 分类数据包 - 简化：所有包都归为client类型
        # 这样前端过滤器不会过滤掉入站包
        category = 'client'  # 统一分类，显示所有双向流量
        
        # 确定应用层协议
        app_protocol = protocol  # 默认为传输层协议 (TCP/UDP)
        
        # 优先级：HTTP > TLS > TCP
        if http_data:
            app_protocol = "HTTP"
        elif tls_data:
            app_protocol = "TLS"
        
        # 提取 HTTP 路径（如果有）
        path = self._extract_http_path(pkt)
        method = self._extract_http_method(pkt) if path else app_protocol
        
        # 如果从HTTP解析器获得了更准确的信息，使用它
        if http_data and http_data['type'] == 'request':
            method = http_data['method']
            path = http_data['url']
        
        # 生成唯一 ID
        with self.packet_counter_lock:
            self.packet_counter += 1
            packet_id = self.packet_counter
        
        # ═══════════════════════════════════════════════════════════
        # 生成Info字段（类似Wireshark，优先显示HTTP信息）
        # ═══════════════════════════════════════════════════════════
        info_parts = []
        
        try:
            # 如果有HTTP数据，优先显示HTTP信息
            if http_data:
                if http_data['type'] == 'request':
                    # HTTP请求：POST /vss/httpjson/user_login HTTP/1.1
                    info_parts.append(f"{http_data['method']} {http_data['url']} HTTP/1.1")
                else:
                    # HTTP响应：HTTP/1.1 200 OK
                    info_parts.append(f"HTTP/1.1 {http_data['status_code']} {http_data['reason']}")
            elif tls_data:
                # TLS 协议信息（类似 Wireshark）
                info_parts.append(f"{sport} → {dport}")
                
                # 显示 TLS 版本和内容类型
                content_type = tls_data.get('content_type', 'Unknown')
                version = tls_data.get('version', 'TLS')
                
                if 'handshake_type' in tls_data:
                    # 握手消息：Client Hello, Server Hello 等
                    info_parts.append(f"{tls_data['handshake_type']}")
                    if 'sni' in tls_data:
                        info_parts.append(f"SNI={tls_data['sni']}")
                elif content_type == 'Application Data':
                    # 应用数据
                    info_parts.append(f"Application Data")
                    info_parts.append(f"Len={tls_data.get('record_length', 0)}")
                elif content_type == 'ChangeCipherSpec':
                    info_parts.append("Change Cipher Spec")
                elif content_type == 'Alert':
                    info_parts.append("Alert")
                else:
                    info_parts.append(content_type)
            else:
                # 没有HTTP/TLS数据，显示TCP信息
                # 添加端口信息
                info_parts.append(f"{sport} → {dport}")
                
                # 添加TCP标志信息
                if pkt.haslayer(TCP):
                    tcp_layer = pkt[TCP]
                    flags = []
                    if tcp_layer.flags.P: flags.append("PSH")
                    if tcp_layer.flags.A: flags.append("ACK")
                    if tcp_layer.flags.S: flags.append("SYN")
                    if tcp_layer.flags.F: flags.append("FIN")
                    if tcp_layer.flags.R: flags.append("RST")
                    
                    if flags:
                        info_parts.append(f"[{', '.join(flags)}]")
                    
                    # 添加序列号
                    info_parts.append(f"Seq={tcp_layer.seq}")
                    if tcp_layer.flags.A:
                        info_parts.append(f"Ack={tcp_layer.ack}")
                    
                    # 添加payload长度
                    if pkt.haslayer(Raw):
                        payload_len = len(pkt[Raw].load)
                        info_parts.append(f"Len={payload_len}")
                else:
                    # 非TCP包
                    info_parts.append(f"{protocol}")
        except Exception as e:
            logger.error(f"Failed to generate info: {e}")
            info_parts = [f"{sport} → {dport} {protocol}"]
        
        info = " ".join(info_parts)
        
        # 构建数据包字典（确保所有字段类型正确）
        packet_data = {
            'id': int(packet_id),  # 确保是整数
            'timestamp': str(datetime.now().strftime('%H:%M:%S.%f')[:-3]),
            'source': str(ip_layer.src),
            'sourceIP': str(ip_layer.src),
            'destination': str(ip_layer.dst),
            'method': str(method),
            'path': str(path or f"{ip_layer.dst}:{dport}"),
            'protocol': str(app_protocol),  # 应用层协议 (HTTP/TLS/TCP/UDP)
            'status': int(200),
            'latency': str("-"),  # 延迟功能已移除
            'size': str(f"{len(pkt)}B"),
            'info': str(info),  # 新增Info字段
            'traceId': str(f"pkt_{packet_id}"),
            'category': str(category),
            'body': str(self._extract_payload(pkt)),
            
            # === TCP层信息 ===
            'tcp': {
                'is_retransmission': tcp_analysis.get('is_retransmission', False),
                'is_out_of_order': tcp_analysis.get('is_out_of_order', False),
                'stream_state': tcp_analysis.get('stream_state', 'UNKNOWN'),
                'retransmission_rate': tcp_analysis.get('retransmission_rate', 0)
            } if tcp_analysis else None,
            
            # === HTTP层信息 ===
            'http': http_data if http_data else None,
            
            # === TLS层信息 ===
            'tls': tls_data if tls_data else None
        }
        
        # 验证数据完整性
        required_fields = ['id', 'timestamp', 'source', 'destination', 'method', 'path', 'size']
        for field in required_fields:
            if field not in packet_data or packet_data[field] is None:
                logger.error(f"Missing or None field: {field}")
                return
        
        # DEBUG: 输出数据包信息
        logger.debug(f"Packet data: id={packet_data['id']}, "
                    f"tcp_retrans={packet_data['tcp']['is_retransmission'] if packet_data['tcp'] else False}, "
                    f"http_type={packet_data['http']['type'] if packet_data['http'] else None}")
        
        # 调用回调函数
        if self.packet_callback:
            try:
                self.packet_callback(packet_data)
            except Exception as e:
                logger.error(f"Callback error: {e}")
    
    def _extract_http_path(self, pkt: Packet) -> Optional[str]:
        """提取 HTTP 请求路径"""
        if not pkt.haslayer(Raw):
            return None
        
        try:
            payload = pkt[Raw].load
            # 尝试多种编码
            for encoding in ['utf-8', 'latin-1']:
                try:
                    decoded = payload.decode(encoding)
                    lines = decoded.split('\r\n')
                    if lines and (lines[0].startswith('GET') or 
                                 lines[0].startswith('POST') or 
                                 lines[0].startswith('PUT')):
                        parts = lines[0].split(' ')
                        if len(parts) >= 2:
                            return parts[1]
                except UnicodeDecodeError:
                    continue
        except Exception as e:
            logger.debug(f"HTTP path extract error: {e}")
        return None
    
    def _extract_http_method(self, pkt: Packet) -> str:
        """提取 HTTP 方法"""
        if not pkt.haslayer(Raw):
            return "TCP"
        
        try:
            payload = pkt[Raw].load.decode('utf-8', errors='ignore')
            for method in ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD']:
                if payload.startswith(method):
                    return method
        except:
            pass
        return "TCP"
    
    def _extract_payload(self, pkt: Packet) -> str:
        """提取数据包负载（智能编码处理）"""
        if pkt.haslayer(Raw):
            try:
                payload = pkt[Raw].load
                
                # 限制大小
                if len(payload) > 1024:
                    payload = payload[:1024]
                
                # 尝试多种编码
                for encoding in ['utf-8', 'gbk', 'gb2312', 'latin-1']:
                    try:
                        text = payload.decode(encoding)
                        # 检查可打印字符比例
                        printable = sum(1 for c in text if c.isprintable() or c in '\r\n\t ')
                        if printable / len(text) > 0.7:  # 70%以上可打印
                            return text if len(text) <= 500 else text[:500] + "..."
                    except (UnicodeDecodeError, AttributeError):
                        continue
                
                # 所有编码失败，显示十六进制
                hex_data = payload.hex()
                formatted = ' '.join(hex_data[i:i+2] for i in range(0, min(len(hex_data), 256), 2))
                return f"[Binary {len(payload)}B] {formatted}..."
            except Exception as e:
                logger.error(f"Payload extract error: {e}")
                return "(error)"
        return "(No payload)"
    
    def _calculate_latency(self, conn_key: str, is_outbound: bool) -> str:
        """
        简化的延迟计算
        :param conn_key: 连接标识符
        :param is_outbound: 是否是出站包
        :return: 延迟字符串
        """
        import time
        
        if is_outbound:
            # 出站包：记录时间
            self.request_times[conn_key] = time.time()
            logger.debug(f"[LATENCY] OUT: {conn_key}")
            return "-"
        else:
            # 入站包：计算延迟
            if conn_key in self.request_times:
                request_time = self.request_times[conn_key]
                latency_ms = int((time.time() - request_time) * 1000)
                
                # 清理
                del self.request_times[conn_key]
                
                result = f"{latency_ms}ms"
                logger.info(f"[LATENCY] IN: {conn_key} -> {result}")
                return result
            else:
                logger.debug(f"[LATENCY] IN (no pair): {conn_key}")
                return "-"
    
    def _parse_tls(self, payload: bytes) -> dict:
        """
        解析 TLS 协议（类似 Wireshark 的 TLS 识别）
        :param payload: TCP payload 数据
        :return: TLS 信息字典，如果不是 TLS 则返回 None
        """
        if not payload or len(payload) < 6:  # 至少需要 5 字节 header + 1 字节 content
            return None
        
        try:
            # TLS Record Layer
            content_type = payload[0]
            
            # Content Type 定义
            TLS_CONTENT_TYPES = {
                0x14: "ChangeCipherSpec",
                0x15: "Alert",
                0x16: "Handshake",
                0x17: "Application Data"
            }
            
            # 检查是否是有效的 TLS Content Type
            if content_type not in TLS_CONTENT_TYPES:
                return None
            
            # TLS 版本（必须是 0x03 开头）
            version_major = payload[1]
            version_minor = payload[2]
            
            # 严格检查版本号：major 必须是 0x03，minor 在 0x00-0x04 之间
            if version_major != 0x03 or version_minor > 0x04:
                return None
            
            TLS_VERSIONS = {
                (0x03, 0x00): "SSL 3.0",
                (0x03, 0x01): "TLS 1.0",
                (0x03, 0x02): "TLS 1.1",
                (0x03, 0x03): "TLS 1.2",
                (0x03, 0x04): "TLS 1.3"
            }
            
            version = TLS_VERSIONS.get((version_major, version_minor), f"Unknown ({version_major}.{version_minor})")
            
            # 记录长度（2 字节，大端序）
            record_length = (payload[3] << 8) | payload[4]
            
            # 长度验证：TLS 记录最大长度是 16384 + 256 = 16640 字节
            # 如果长度太小或太大，可能不是 TLS
            if record_length < 1 or record_length > 16640:
                return None
            
            # 对于 Handshake，进一步验证握手类型
            if content_type == 0x16 and len(payload) > 5:
                handshake_type = payload[5]
                # 有效的握手类型范围是 0x00-0x14
                if handshake_type > 0x14:
                    return None
            
            tls_info = {
                "protocol": "TLS",
                "version": version,
                "content_type": TLS_CONTENT_TYPES[content_type],
                "record_length": record_length
            }
            
            # 如果是握手消息，进一步解析
            if content_type == 0x16 and len(payload) > 5:
                handshake_type = payload[5]
                
                HANDSHAKE_TYPES = {
                    0x00: "Hello Request",
                    0x01: "Client Hello",
                    0x02: "Server Hello",
                    0x04: "New Session Ticket",
                    0x05: "End of Early Data",
                    0x08: "Encrypted Extensions",
                    0x0b: "Certificate",
                    0x0c: "Server Key Exchange",
                    0x0d: "Certificate Request",
                    0x0e: "Server Hello Done",
                    0x0f: "Certificate Verify",
                    0x10: "Client Key Exchange",
                    0x14: "Finished"
                }
                
                tls_info["handshake_type"] = HANDSHAKE_TYPES.get(handshake_type, f"Unknown (0x{handshake_type:02x})")
                
                # 解析 Client Hello / Server Hello 中的 SNI（Server Name Indication）
                if handshake_type == 0x01 and len(payload) > 43:  # Client Hello
                    sni = self._extract_sni(payload)
                    if sni:
                        tls_info["sni"] = sni
            
            return tls_info
            
        except Exception as e:
            logger.debug(f"[TLS] Parse error: {e}")
            return None
    
    def _extract_sni(self, payload: bytes) -> str:
        """
        从 TLS Client Hello 中提取 SNI（服务器名称指示）
        :param payload: TLS Client Hello 完整数据
        :return: 服务器域名，提取失败返回 None
        """
        try:
            if len(payload) < 43:
                return None
            
            # 跳过 TLS Record Header (5 bytes) + Handshake Header (4 bytes)
            # + Client Version (2) + Random (32) = 43 bytes
            offset = 43
            
            # Session ID Length
            if offset >= len(payload):
                return None
            session_id_len = payload[offset]
            offset += 1 + session_id_len
            
            # Cipher Suites Length
            if offset + 2 > len(payload):
                return None
            cipher_suites_len = (payload[offset] << 8) | payload[offset + 1]
            offset += 2 + cipher_suites_len
            
            # Compression Methods Length
            if offset >= len(payload):
                return None
            compression_len = payload[offset]
            offset += 1 + compression_len
            
            # Extensions Length
            if offset + 2 > len(payload):
                return None
            extensions_len = (payload[offset] << 8) | payload[offset + 1]
            offset += 2
            
            # 遍历扩展
            end_offset = offset + extensions_len
            while offset + 4 <= end_offset and offset + 4 <= len(payload):
                ext_type = (payload[offset] << 8) | payload[offset + 1]
                ext_len = (payload[offset + 2] << 8) | payload[offset + 3]
                offset += 4
                
                # SNI 扩展类型是 0x0000
                if ext_type == 0x0000 and ext_len > 5:
                    # SNI List Length (2) + Name Type (1) + Name Length (2) + Name
                    sni_list_len = (payload[offset] << 8) | payload[offset + 1]
                    name_type = payload[offset + 2]
                    name_len = (payload[offset + 3] << 8) | payload[offset + 4]
                    
                    if name_type == 0x00 and offset + 5 + name_len <= len(payload):
                        sni = payload[offset + 5: offset + 5 + name_len].decode('ascii', errors='ignore')
                        return sni
                
                offset += ext_len
            
            return None
            
        except Exception as e:
            logger.debug(f"[TLS] SNI extraction error: {e}")
            return None
