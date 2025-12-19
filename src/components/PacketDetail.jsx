import React, { useState, useMemo } from 'react';
import { X, AlertTriangle, CheckCircle2 } from 'lucide-react';

function DetailRow({ label, value, highlight }) {
    return (
        <div className="grid grid-cols-[100px_1fr] text-xs gap-2 items-start">
            <div className="text-gray-500 mt-0.5">{label}:</div>
            <div className={`font-mono break-all leading-relaxed ${highlight ? 'text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded -ml-1 w-fit' : 'text-gray-300'}`}>
                {value}
            </div>
        </div>
    );
}

export default function PacketDetail({ packet, onClose, config, allPackets = [] }) {
    const [activeTab, setActiveTab] = useState('headers');

    return (
        <div className="w-1/2 flex flex-col bg-gray-900 h-full border-l border-black shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="h-12 bg-gray-800 border-b border-gray-700 flex items-center px-4 justify-between shrink-0">
                <div className="flex items-center gap-3 overflow-hidden">
                    <div className="flex flex-col">
                        <span className="text-[10px] text-gray-500 uppercase font-bold">Trace Context</span>
                        <span className="text-sm text-gray-200 truncate font-mono max-w-[200px]">{packet.path}</span>
                    </div>
                </div>
                <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={16} /></button>
            </div>


            {/* Tabs - 根据协议类型动态显示 */}
            <div className="flex bg-gray-800 border-b border-gray-700 shrink-0">
                {(() => {
                    // 根据协议类型决定显示哪些标签
                    const protocol = packet.protocol || packet.method;
                    const isTls = protocol === 'TLS' || packet.tls;

                    // 基础标签：始终显示 headers, tcp
                    let tabs = ['headers', 'tcp'];

                    // 如果有 stream_id，显示流追踪标签
                    if (packet.stream_id) {
                        tabs.push('stream');
                    }

                    // TLS 协议显示 TLS 标签
                    if (isTls) {
                        tabs.push('tls');
                    } else {
                        // 非 TLS 协议始终显示 HTTP 标签
                        tabs.push('http');
                    }

                    // 总是显示 payload 和 hex
                    tabs.push('payload', 'hex');

                    return tabs.map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-blue-500 text-blue-400 bg-gray-700/50' : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-700/30'}`}
                        >
                            {tab.toUpperCase()}
                        </button>
                    ));
                })()}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 bg-[#0d1117] font-mono text-sm">
                {activeTab === 'headers' && (
                    <div className="space-y-4">
                        <div className="border border-gray-700 rounded bg-gray-800/20 p-3 space-y-2">
                            <div className="text-xs font-bold text-gray-400 mb-2 border-b border-gray-700 pb-1">General</div>
                            <DetailRow label="Hooked PID" value={config?.targetProcess?.pid || 'N/A (PCAP导入)'} highlight />
                            <DetailRow label="Packet Source" value={packet.source} />
                            <DetailRow label="Remote Agent" value={config?.serverAgent || 'N/A'} />
                        </div>

                        <div className="border border-gray-700 rounded bg-gray-800/20 p-3 space-y-2">
                            <div className="text-xs font-bold text-gray-400 mb-2 border-b border-gray-700 pb-1">Packet Info</div>
                            <DetailRow label="Protocol" value={packet.protocol || packet.method} />
                            <DetailRow label="Source IP" value={packet.sourceIP} />
                            <DetailRow label="Dest IP" value={packet.destIP || packet.destination} />
                            <DetailRow label="Trace-ID" value={packet.traceId} />
                        </div>
                    </div>
                )}

                {activeTab === 'tcp' && (
                    <div className="space-y-4">
                        {packet.tcp ? (
                            <>
                                {/* 基本 TCP 信息 */}
                                <div className="border border-gray-700 rounded bg-gray-800/20 p-3 space-y-2">
                                    <div className="text-xs font-bold text-gray-400 mb-2 border-b border-gray-700 pb-1 flex items-center gap-2">
                                        TCP Layer Analysis
                                        {packet.tcp.is_retransmission ? (
                                            <AlertTriangle size={14} className="text-red-400" />
                                        ) : (
                                            <CheckCircle2 size={14} className="text-green-400" />
                                        )}
                                    </div>

                                    {/* 端口信息 */}
                                    <DetailRow label="Source Port" value={packet.tcp.src_port} highlight />
                                    <DetailRow label="Dest Port" value={packet.tcp.dst_port} highlight />

                                    {/* 序列号和确认号 */}
                                    <DetailRow label="Sequence Number" value={packet.tcp.seq} />
                                    <DetailRow label="Acknowledgment Number" value={packet.tcp.ack} />

                                    {/* TCP 标志 */}
                                    <DetailRow label="Flags" value={packet.tcp.flags || 'None'} />

                                    {/* 窗口大小 */}
                                    <DetailRow label="Window Size" value={packet.tcp.window_size} />

                                    {/* Payload 长度 */}
                                    <DetailRow label="Payload Length" value={`${packet.tcp.payload_length || 0} bytes`} />

                                    {/* 流状态（如果有） */}
                                    {packet.tcp.stream_state && (
                                        <DetailRow label="Stream State" value={packet.tcp.stream_state} />
                                    )}
                                </div>

                                {/* TCP 标志解释 */}
                                {packet.tcp.flags && (
                                    <div className="border border-blue-700/30 rounded bg-blue-900/10 p-3">
                                        <div className="text-xs font-bold text-blue-400 mb-2">🏷️ TCP Flags 解释</div>
                                        <div className="grid grid-cols-4 gap-2 text-xs">
                                            {packet.tcp.flags.includes('S') && (
                                                <div className="bg-green-900/30 border border-green-600/30 rounded px-2 py-1 text-center">
                                                    <span className="text-green-400 font-bold">SYN</span>
                                                    <div className="text-gray-500 text-[10px]">建立连接</div>
                                                </div>
                                            )}
                                            {packet.tcp.flags.includes('A') && (
                                                <div className="bg-blue-900/30 border border-blue-600/30 rounded px-2 py-1 text-center">
                                                    <span className="text-blue-400 font-bold">ACK</span>
                                                    <div className="text-gray-500 text-[10px]">确认</div>
                                                </div>
                                            )}
                                            {packet.tcp.flags.includes('P') && (
                                                <div className="bg-purple-900/30 border border-purple-600/30 rounded px-2 py-1 text-center">
                                                    <span className="text-purple-400 font-bold">PSH</span>
                                                    <div className="text-gray-500 text-[10px]">推送数据</div>
                                                </div>
                                            )}
                                            {packet.tcp.flags.includes('F') && (
                                                <div className="bg-red-900/30 border border-red-600/30 rounded px-2 py-1 text-center">
                                                    <span className="text-red-400 font-bold">FIN</span>
                                                    <div className="text-gray-500 text-[10px]">关闭连接</div>
                                                </div>
                                            )}
                                            {packet.tcp.flags.includes('R') && (
                                                <div className="bg-red-900/30 border border-red-600/30 rounded px-2 py-1 text-center">
                                                    <span className="text-red-400 font-bold">RST</span>
                                                    <div className="text-gray-500 text-[10px]">重置连接</div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* 重传/乱序说明区域 - 三列卡片式布局 */}
                                {(packet.tcp.is_retransmission || packet.tcp.is_out_of_order || (packet.tcp.retransmission_rate && packet.tcp.retransmission_rate > 0.01)) && (
                                    <div className="border-2 border-yellow-500/40 rounded-lg bg-gradient-to-br from-yellow-900/15 to-orange-900/10 p-4 shadow-lg">
                                        <div className="text-sm font-bold text-yellow-300 mb-4 pb-2 border-b-2 border-yellow-600/40 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <AlertTriangle size={16} className="text-yellow-400" />
                                                ⚡ 网络质量分析
                                            </div>
                                            <span className="text-xs text-gray-500">（当前数据包异常）</span>
                                        </div>

                                        {/* 三列卡片布局 */}
                                        <div className="grid grid-cols-3 gap-3">
                                            {/* 重传包卡片 */}
                                            <div className={`rounded-lg p-4 text-center ${packet.tcp.is_retransmission ? 'bg-red-900/30 border border-red-600/40' : 'bg-gray-800/30 border border-gray-700/30'}`}>
                                                <div className={`w-10 h-10 rounded-full mx-auto mb-3 flex items-center justify-center ${packet.tcp.is_retransmission ? 'bg-red-500' : 'bg-gray-600'}`}>
                                                    <span className="text-white text-lg">●</span>
                                                </div>
                                                <div className={`font-bold text-sm mb-2 ${packet.tcp.is_retransmission ? 'text-red-400' : 'text-gray-500'}`}>
                                                    检测到重传包
                                                </div>
                                                <div className="text-[10px] text-gray-400 leading-relaxed">
                                                    {packet.tcp.is_retransmission
                                                        ? '监测到TCP层出现多次数据包重传现象，分析显示数据包序列号重复（Duplicate Sequence Numbers），表明数据包在传输过程中丢失或被误别迟达，导致发送端端重发这些数据。'
                                                        : '未检测到重传'}
                                                </div>
                                                {packet.tcp.is_retransmission && (
                                                    <div className="mt-2 text-[10px] text-gray-500">
                                                        可能原因：网络丢包、ACK延迟、数据拥塞控制触发。
                                                    </div>
                                                )}
                                            </div>

                                            {/* 乱序包卡片 */}
                                            <div className={`rounded-lg p-4 text-center ${packet.tcp.is_out_of_order ? 'bg-orange-900/30 border border-orange-600/40' : 'bg-gray-800/30 border border-gray-700/30'}`}>
                                                <div className={`w-10 h-10 rounded-full mx-auto mb-3 flex items-center justify-center ${packet.tcp.is_out_of_order ? 'bg-orange-500' : 'bg-gray-600'}`}>
                                                    <span className="text-white text-lg">●</span>
                                                </div>
                                                <div className={`font-bold text-sm mb-2 ${packet.tcp.is_out_of_order ? 'text-orange-400' : 'text-gray-500'}`}>
                                                    检测到乱序包
                                                </div>
                                                <div className="text-[10px] text-gray-400 leading-relaxed">
                                                    {packet.tcp.is_out_of_order
                                                        ? '监测到TCP层数据包到达顺序异常，接收端发现数据包序列号未按预期递增，表明数据包在传输过程中经历了不同路径或延迟。'
                                                        : '未检测到乱序'}
                                                </div>
                                                {packet.tcp.is_out_of_order && (
                                                    <div className="mt-2 text-[10px] text-gray-500">
                                                        可能原因：网络路径不同、路由器负载不均、或QoS策略影响。
                                                    </div>
                                                )}
                                            </div>

                                            {/* 重传率统计卡片 */}
                                            <div className={`rounded-lg p-4 text-center ${packet.tcp.retransmission_rate > 0.1 ? 'bg-red-900/30 border border-red-600/40' : 'bg-gray-800/30 border border-gray-700/30'}`}>
                                                <div className="font-bold text-sm mb-2 text-yellow-400">
                                                    重传率偏高警告
                                                </div>
                                                <div className={`text-3xl font-bold mb-1 ${packet.tcp.retransmission_rate > 0.1 ? 'text-red-400' : packet.tcp.retransmission_rate > 0.05 ? 'text-yellow-400' : 'text-green-400'}`}>
                                                    {packet.tcp.retransmission_rate ? (packet.tcp.retransmission_rate * 100).toFixed(2) : '0.00'}%
                                                </div>
                                                <div className="text-[10px] text-gray-500 mb-2">
                                                    {packet.tcp.retransmission_rate > 0.1 ? '（严重）' : packet.tcp.retransmission_rate > 0.05 ? '（中等）' : '（正常）'}
                                                </div>

                                                <div className="bg-gray-800/50 rounded p-2 text-left mt-2">
                                                    <div className="text-[10px] text-purple-400 font-bold mb-1">📊 TCP紧急统计</div>
                                                    <div className="text-[10px] text-yellow-400">▲ 当前包: {packet.tcp.is_retransmission ? '重传包' : '正常包'}</div>
                                                </div>

                                                <div className="text-[10px] text-gray-400 mt-2 text-left">
                                                    该TCP连接从建立到现在的整体重传率为 {packet.tcp.retransmission_rate ? (packet.tcp.retransmission_rate * 100).toFixed(2) : '0.00'}%。
                                                    {packet.tcp.retransmission_rate > 0.1 && ' 建议排查网络质量问题。'}
                                                </div>

                                                <div className="mt-3 text-left">
                                                    <div className="text-[10px] text-yellow-400 font-bold mb-1">💡 健康指标</div>
                                                    <div className="text-[10px] space-y-0.5">
                                                        <div className="text-green-400">● 优秀 {'<'}1%</div>
                                                        <div className="text-blue-400">● 良好 1-5%</div>
                                                        <div className="text-yellow-400">● 中等 5-10%</div>
                                                        <div className="text-red-400">● 较差 {'>'}10%</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="text-gray-500 text-center py-8">
                                No TCP analysis data available
                            </div>
                        )}
                    </div>
                )}

                {/* TCP 流追踪标签页 */}
                {activeTab === 'stream' && (() => {
                    // 计算流数据
                    const streamId = packet.stream_id;
                    const streamPackets = streamId ? allPackets.filter(p => p.stream_id === streamId).sort((a, b) => (a.raw_time || 0) - (b.raw_time || 0)) : [];
                    const totalBytes = streamPackets.reduce((sum, p) => sum + (p.payload_size || 0), 0);
                    const packetsWithPayload = streamPackets.filter(p => p.payload_size > 0);

                    return (
                        <div className="space-y-4">
                            {streamId ? (
                                <>
                                    {/* 流统计信息 */}
                                    <div className="border border-cyan-700/30 rounded bg-cyan-900/10 p-3">
                                        <div className="text-xs font-bold text-cyan-400 mb-3 border-b border-cyan-700/30 pb-1 flex items-center justify-between">
                                            <span>🔗 TCP Stream #{streamId}</span>
                                            <span className="text-gray-400 font-normal">{streamPackets.length} 个包 | {totalBytes} bytes</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <DetailRow label="Source" value={`${packet.sourceIP}:${packet.tcp?.src_port || ''}`} />
                                                <DetailRow label="Destination" value={`${packet.destIP}:${packet.tcp?.dst_port || ''}`} />
                                            </div>
                                            <div>
                                                <DetailRow label="Total Packets" value={streamPackets.length} />
                                                <DetailRow label="With Payload" value={packetsWithPayload.length} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* 流数据视图 - 类似 Wireshark Follow TCP Stream */}
                                    <div className="border border-blue-700/30 rounded bg-gray-900/50">
                                        <div className="text-xs font-bold text-blue-400 p-2 border-b border-blue-700/30 flex items-center justify-between bg-blue-900/20">
                                            <span>📋 Follow TCP Stream</span>
                                            <span className="text-gray-500 font-normal">{packetsWithPayload.length} 个有效数据包</span>
                                        </div>

                                        {/* 流数据列表 */}
                                        <div className="max-h-80 overflow-auto">
                                            {packetsWithPayload.length > 0 ? (
                                                packetsWithPayload.map((p, idx) => (
                                                    <div
                                                        key={p.id}
                                                        className={`border-b border-gray-800 ${p.id === packet.id ? 'bg-blue-900/30 border-l-2 border-l-blue-500' : ''}`}
                                                    >
                                                        {/* 包头信息 */}
                                                        <div className={`px-3 py-1.5 text-[10px] flex items-center justify-between ${p.stream_peer === 0
                                                            ? 'bg-purple-900/20 text-purple-400'
                                                            : 'bg-green-900/20 text-green-400'
                                                            }`}>
                                                            <span className="font-bold">
                                                                {p.stream_peer === 0 ? '← Server' : '→ Client'}
                                                                <span className="text-gray-500 ml-2">#{p.id}</span>
                                                            </span>
                                                            <span className="text-gray-500">
                                                                {p.payload_size} bytes | {p.timestamp}
                                                            </span>
                                                        </div>

                                                        {/* Payload 数据 */}
                                                        <div className="px-3 py-2 font-mono text-[11px] text-gray-400 bg-black/20 whitespace-pre-wrap break-all max-h-24 overflow-auto">
                                                            {p.payload_base64 || p.body || '(binary data)'}
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-gray-500 text-center py-8 text-xs">
                                                    此流没有应用层数据（仅 TCP 控制包）
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* 当前包位置 */}
                                    <div className="bg-gray-800/30 border border-gray-700 rounded p-2 flex items-center justify-between text-xs">
                                        <span className="text-gray-500">
                                            📍 当前: Packet #{packet.id} ({packet.payload_size || 0} bytes)
                                        </span>
                                        <span className={`px-2 py-0.5 rounded ${packet.stream_peer === 0
                                            ? 'bg-purple-900/30 text-purple-400'
                                            : 'bg-green-900/30 text-green-400'
                                            }`}>
                                            {packet.stream_peer === 0 ? '← Server Response' : '→ Client Request'}
                                        </span>
                                    </div>
                                </>
                            ) : (
                                <div className="text-gray-500 text-center py-8">
                                    No TCP stream data available
                                </div>
                            )}
                        </div>
                    );
                })()}

                {activeTab === 'http' && (
                    <div className="space-y-4">
                        {packet.http ? (
                            <>
                                <div className="border border-gray-700 rounded bg-gray-800/20 p-3 space-y-2">
                                    <div className="text-xs font-bold text-gray-400 mb-2 border-b border-gray-700 pb-1">
                                        HTTP {packet.http.type.toUpperCase()}
                                    </div>
                                    {packet.http.type === 'request' && (
                                        <>
                                            <DetailRow label="Method" value={packet.http.method} />
                                            <DetailRow label="URL" value={packet.http.url} />
                                        </>
                                    )}
                                    {packet.http.type === 'response' && (
                                        <>
                                            <DetailRow label="Status Code" value={packet.http.status_code} highlight />
                                            <DetailRow label="Reason" value={packet.http.reason} />
                                        </>
                                    )}
                                </div>

                                {packet.http.headers && Object.keys(packet.http.headers).length > 0 && (
                                    <div className="border border-gray-700 rounded bg-gray-800/20 p-3 space-y-2">
                                        <div className="text-xs font-bold text-gray-400 mb-2 border-b border-gray-700 pb-1">HTTP Headers</div>
                                        {Object.entries(packet.http.headers).map(([key, value]) => (
                                            <DetailRow key={key} label={key} value={value} />
                                        ))}
                                    </div>
                                )}

                                {packet.http.body && (
                                    <div className="border border-gray-700 rounded bg-gray-800/20 p-3">
                                        <div className="text-xs font-bold text-gray-400 mb-2 border-b border-gray-700 pb-1">HTTP Body</div>
                                        <div className="text-gray-300 text-xs whitespace-pre-wrap break-all p-2 bg-black/30 rounded mt-2 font-mono">
                                            {(() => {
                                                try {
                                                    // 尝试解析为JSON并格式化
                                                    const jsonObj = JSON.parse(packet.http.body);
                                                    return JSON.stringify(jsonObj, null, 2);
                                                } catch (e) {
                                                    // 如果不是有效的JSON，则原样显示
                                                    return packet.http.body;
                                                }
                                            })()}
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="text-gray-500 text-center py-8">
                                No HTTP data (not an HTTP packet)
                            </div>
                        )}
                    </div>
                )}

                {/* TLS 标签内容 */}
                {activeTab === 'tls' && (
                    <div className="space-y-4">
                        {packet.tls ? (
                            <>
                                <div className="border border-yellow-500/30 rounded bg-yellow-900/10 p-3 space-y-2">
                                    <div className="text-xs font-bold text-yellow-400 mb-2 border-b border-yellow-600/30 pb-1 flex items-center gap-2">
                                        🔐 TLS Record Layer
                                    </div>
                                    <DetailRow label="Protocol" value={packet.tls.protocol || "TLS"} highlight />
                                    <DetailRow label="Version" value={packet.tls.version} />
                                    <DetailRow label="Content Type" value={packet.tls.content_type} />
                                    <DetailRow label="Record Length" value={`${packet.tls.record_length} bytes`} />
                                </div>

                                {packet.tls.handshake_type && (
                                    <div className="border border-blue-500/30 rounded bg-blue-900/10 p-3 space-y-2">
                                        <div className="text-xs font-bold text-blue-400 mb-2 border-b border-blue-600/30 pb-1">
                                            🤝 Handshake Details
                                        </div>
                                        <DetailRow label="Type" value={packet.tls.handshake_type} highlight />
                                        {packet.tls.sni && (
                                            <DetailRow label="SNI (Server Name)" value={packet.tls.sni} highlight />
                                        )}
                                    </div>
                                )}

                                <div className="border border-gray-700/50 rounded bg-gray-800/20 p-3">
                                    <div className="text-xs text-gray-500 italic">
                                        💡 TLS 数据已加密，无法查看明文内容。如需解密 HTTPS 流量，请在配置页面启用"HTTPS 增强"功能。
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="text-gray-500 text-center py-8">
                                No TLS data available
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'payload' && (
                    <div className="space-y-3">
                        {/* TLS 加密数据提示 */}
                        {(packet.protocol === 'TLS' || packet.tls) && (
                            <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-3 flex items-start gap-2">
                                <span className="text-yellow-500">🔐</span>
                                <div className="text-xs text-yellow-400">
                                    <span className="font-bold">TLS 加密数据</span>
                                    <p className="text-yellow-500/70 mt-1">
                                        以下内容为 TLS 加密后的二进制数据，无法解析为可读文本。这是正常的加密流量。
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Payload 大小信息 */}
                        {packet.payload_size !== undefined && (
                            <div className="text-xs text-gray-500 mb-2">
                                Payload 大小: {packet.payload_size} bytes
                            </div>
                        )}

                        {/* 加密数据提示 */}
                        {(packet.protocol === 'SSH' || packet.protocol?.startsWith('TLS')) && packet.payload_size > 0 && (
                            <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-3 flex items-start gap-2 mb-3">
                                <span className="text-yellow-500">🔐</span>
                                <div className="text-xs text-yellow-400">
                                    <span className="font-bold">{packet.protocol} 加密数据</span>
                                    <p className="text-yellow-500/70 mt-1">
                                        以下是加密后的二进制数据，无法解析为可读文本。推荐查看 Base64 或 HEX 格式。
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Hex 格式（优先显示，因为更易读） */}
                        {packet.payload_hex && (
                            <div className="mb-3">
                                <div className="text-xs text-green-400 mb-1 font-semibold">📦 Hex 格式:</div>
                                <div className="text-gray-400 whitespace-pre-wrap break-all p-2 bg-black/30 rounded font-mono text-xs max-h-40 overflow-auto">
                                    {packet.payload_hex}
                                </div>
                            </div>
                        )}

                        {/* Base64 格式 */}
                        {packet.payload_base64 && (
                            <div className="mb-3">
                                <div className="text-xs text-blue-400 mb-1 font-semibold">📝 Base64 编码:</div>
                                <div className="text-gray-400 whitespace-pre-wrap break-all p-2 bg-black/30 rounded font-mono text-xs max-h-40 overflow-auto">
                                    {packet.payload_base64}
                                </div>
                            </div>
                        )}

                        {/* 原始文本（可能是乱码） */}
                        {packet.body && (
                            <div>
                                <div className="text-xs text-gray-500 mb-1">📄 原始文本 (可能乱码):</div>
                                <div className="text-gray-500 whitespace-pre-wrap break-all leading-relaxed p-2 bg-black/30 rounded font-mono text-xs max-h-40 overflow-auto">
                                    {packet.body}
                                </div>
                            </div>
                        )}

                        {!packet.payload_hex && !packet.body && (
                            <div className="text-gray-500 text-center py-4">(empty - no application data)</div>
                        )}
                    </div>
                )}

                {activeTab === 'hex' && (
                    <div className="space-y-3">
                        {/* TLS 加密数据提示 */}
                        {(packet.protocol === 'TLS' || packet.tls) && (
                            <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-3 flex items-start gap-2">
                                <span className="text-yellow-500">🔐</span>
                                <div className="text-xs text-yellow-400">
                                    <span className="font-bold">TLS 加密数据（十六进制）</span>
                                </div>
                            </div>
                        )}

                        {/* Payload 大小信息 */}
                        {packet.payload_size !== undefined && (
                            <div className="text-xs text-gray-500 mb-2">
                                Payload 大小: {packet.payload_size} bytes
                            </div>
                        )}

                        <div className="text-gray-400 text-xs p-2 bg-black/30 rounded font-mono whitespace-pre-wrap break-all">
                            {packet.payload_hex || (packet.body ? packet.body.split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ') : '(empty - no application data)')}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
