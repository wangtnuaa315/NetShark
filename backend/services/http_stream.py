"""
HTTP流解析器
从TCP流中提取和解析HTTP请求/响应
"""
import logging
import re
from typing import Optional, Dict, List, Tuple
from dataclasses import dataclass, field
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class HTTPRequest:
    """HTTP请求"""
    method: str
    url: str
    version: str
    headers: Dict[str, str]
    body: bytes
    timestamp: float
    stream_id: str
    
    def __str__(self):
        return f"{self.method} {self.url} {self.version}"


@dataclass
class HTTPResponse:
    """HTTP响应"""
    version: str
    status_code: int
    reason: str
    headers: Dict[str, str]
    body: bytes
    timestamp: float
    stream_id: str
    
    def __str__(self):
        return f"{self.version} {self.status_code} {self.reason}"


@dataclass
class HTTPTransaction:
    """HTTP事务（一个请求+响应对）"""
    request: HTTPRequest
    response: Optional[HTTPResponse] = None
    duration: Optional[float] = None  # 响应时间（毫秒）
    is_retry: bool = False  # 是否是重试请求
    retry_count: int = 0
    

class HTTPStreamParser:
    """HTTP流解析器"""
    
    def __init__(self):
        self.transactions: List[HTTPTransaction] = []
        self.pending_requests: Dict[str, List[HTTPRequest]] = {}  # stream_id -> [requests]
        
        # 用于检测重试
        self.url_history: Dict[str, List[Tuple[float, str]]] = {}  # url -> [(timestamp, stream_id)]
        
        logger.info("HTTP Stream Parser initialized")
    
    def parse_request(self, data: bytes, timestamp: float, stream_id: str) -> Optional[HTTPRequest]:
        """
        解析HTTP请求
        
        :param data: 原始HTTP数据
        :param timestamp: 时间戳
        :param stream_id: TCP流ID
        :return: HTTPRequest或None
        """
        try:
            # 转换为字符串（尝试多种编码）
            text = self._decode_data(data)
            if not text:
                return None
            
            # 分割请求行和headers/body
            parts = text.split('\r\n\r\n', 1)
            if len(parts) < 1:
                return None
            
            header_section = parts[0]
            # Body部分保持原始bytes，不强制解码
            body = data.split(b'\r\n\r\n', 1)[1] if b'\r\n\r\n' in data else b''
            
            # 分割行
            lines = header_section.split('\r\n')
            if not lines:
                return None
            
            # 解析请求行: "GET /api/login HTTP/1.1"
            request_line = lines[0]
            match = re.match(r'([A-Z]+)\s+(.+?)\s+(HTTP/[\d\.]+)', request_line)
            if not match:
                logger.debug(f"Invalid HTTP request line: {request_line}")
                return None
            
            method, url, version = match.groups()
            
            # 解析headers
            headers = self._parse_headers(lines[1:])
            
            # 提取body（如果有Content-Length）
            content_length = int(headers.get('Content-Length', 0))
            if content_length > 0 and len(parts) > 1:
                body = parts[1].encode('utf-8')[:content_length]
            
            request = HTTPRequest(
                method=method,
                url=url,
                version=version,
                headers=headers,
                body=body,
                timestamp=timestamp,
                stream_id=stream_id
            )
            
            # 检测是否是重试
            self._check_retry(request)
            
            # 添加到待处理队列
            if stream_id not in self.pending_requests:
                self.pending_requests[stream_id] = []
            self.pending_requests[stream_id].append(request)
            
            logger.info(f"[HTTP] Parsed request: {method} {url}")
            
            return request
            
        except Exception as e:
            logger.error(f"Failed to parse HTTP request: {e}")
            return None
    
    def parse_response(self, data: bytes, timestamp: float, stream_id: str) -> Optional[HTTPResponse]:
        """
        解析HTTP响应
        
        :param data: 原始HTTP数据
        :param timestamp: 时间戳
        :param stream_id: TCP流ID
        :return: HTTPResponse或None
        """
        try:
            # 转换为字符串
            text = self._decode_data(data)
            if not text:
                return None
            
            # 分割状态行和headers/body
            parts = text.split('\r\n\r\n', 1)
            if len(parts) < 1:
                return None
            
            header_section = parts[0]
            # Body从原始bytes提取，避免编码问题
            body = data.split(b'\r\n\r\n', 1)[1] if b'\r\n\r\n' in data else b''
            
            # 分割行
            lines = header_section.split('\r\n')
            if not lines:
                return None
            
            # 解析状态行: "HTTP/1.1 200 OK"
            status_line = lines[0]
            match = re.match(r'(HTTP/[\d\.]+)\s+(\d+)\s*(.*)', status_line)
            if not match:
                logger.debug(f"Invalid HTTP response line: {status_line}")
                return None
            
            version, status_code, reason = match.groups()
            status_code = int(status_code)
            
            # 解析headers
            headers = self._parse_headers(lines[1:])
            
            # 提取body
            content_length = int(headers.get('Content-Length', 0))
            if content_length > 0 and len(parts) > 1:
                body = parts[1].encode('utf-8')[:content_length]
            
            response = HTTPResponse(
                version=version,
                status_code=status_code,
                reason=reason.strip() if reason else "",
                headers=headers,
                body=body,
                timestamp=timestamp,
                stream_id=stream_id
            )
            
            # 尝试匹配对应的请求
            self._pair_response_with_request(response)
            
            logger.info(f"[HTTP] Parsed response: {status_code} {reason}")
            
            return response
            
        except Exception as e:
            logger.error(f"Failed to parse HTTP response: {e}")
            return None
    
    def _decode_data(self, data: bytes) -> Optional[str]:
        """尝试多种编码解码数据"""
        for encoding in ['utf-8', 'gbk', 'gb2312', 'latin-1']:
            try:
                return data.decode(encoding)
            except:
                continue
        return None
    
    def _parse_headers(self, lines: List[str]) -> Dict[str, str]:
        """解析HTTP headers"""
        headers = {}
        for line in lines:
            if ':' in line:
                key, value = line.split(':', 1)
                headers[key.strip()] = value.strip()
        return headers
    
    def _check_retry(self, request: HTTPRequest):
        """检测HTTP请求重试"""
        url = request.url
        
        if url not in self.url_history:
            self.url_history[url] = []
        
        # 获取该URL的历史
        history = self.url_history[url]
        
        # 如果在短时间内（比如5秒）有相同URL的请求，标记为重试
        recent_threshold = 5.0  # 5秒
        for prev_timestamp, prev_stream_id in history:
            if request.timestamp - prev_timestamp < recent_threshold:
                logger.info(f"[HTTP] Retry detected: {request.method} {url}")
                # 这是重试请求
                # 可以在这里标记，但这里只记录
                break
        
        # 添加到历史
        history.append((request.timestamp, request.stream_id))
        
        # 清理旧记录（保留最近10个）
        if len(history) > 10:
            self.url_history[url] = history[-10:]
    
    def _pair_response_with_request(self, response: HTTPResponse):
        """将响应与请求配对"""
        stream_id = response.stream_id
        
        if stream_id not in self.pending_requests or not self.pending_requests[stream_id]:
            logger.warning(f"[HTTP] No matching request for response in stream {stream_id}")
            return
        
        # FIFO: 取第一个请求
        request = self.pending_requests[stream_id].pop(0)
        
        # 计算响应时间
        duration = (response.timestamp - request.timestamp) * 1000  # 毫秒
        
        # 创建事务
        transaction = HTTPTransaction(
            request=request,
            response=response,
            duration=duration
        )
        
        self.transactions.append(transaction)
        
        logger.info(f"[HTTP] Paired: {request} -> {response} ({duration:.2f}ms)")
    
    def get_transactions(self, limit: int = 100) -> List[HTTPTransaction]:
        """获取最近的事务"""
        return self.transactions[-limit:]
    
    def get_stats(self) -> dict:
        """获取统计信息"""
        total = len(self.transactions)
        
        # 统计状态码
        status_codes = {}
        total_duration = 0
        retry_count = 0
        
        for trans in self.transactions:
            if trans.response:
                code = trans.response.status_code
                status_codes[code] = status_codes.get(code, 0) + 1
            
            if trans.duration:
                total_duration += trans.duration
            
            if trans.is_retry:
                retry_count += 1
        
        return {
            'total_transactions': total,
            'avg_duration': total_duration / total if total > 0 else 0,
            'status_codes': status_codes,
            'retry_count': retry_count,
            'retry_rate': retry_count / total if total > 0 else 0
        }
