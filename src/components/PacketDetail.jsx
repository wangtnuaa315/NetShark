import React, { useState } from 'react';
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

export default function PacketDetail({ packet, onClose, config }) {
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

            {/* Tabs */}
            <div className="flex bg-gray-800 border-b border-gray-700 shrink-0">
                {['headers', 'tcp', 'http', 'payload', 'hex'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-blue-500 text-blue-400 bg-gray-700/50' : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-700/30'}`}
                    >
                        {tab.toUpperCase()}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 bg-[#0d1117] font-mono text-sm">
                {activeTab === 'headers' && (
                    <div className="space-y-4">
                        <div className="border border-gray-700 rounded bg-gray-800/20 p-3 space-y-2">
                            <div className="text-xs font-bold text-gray-400 mb-2 border-b border-gray-700 pb-1">General</div>
                            <DetailRow label="Hooked PID" value={config.targetProcess.pid} highlight />
                            <DetailRow label="Packet Source" value={packet.source} />
                            <DetailRow label="Remote Agent" value={config.serverAgent} />
                        </div>

                        <div className="border border-gray-700 rounded bg-gray-800/20 p-3 space-y-2">
                            <div className="text-xs font-bold text-gray-400 mb-2 border-b border-gray-700 pb-1">Headers</div>
                            <DetailRow label="Method" value={packet.method} />
                            <DetailRow label="Source IP" value={packet.sourceIP} />
                            <DetailRow label="Trace-ID" value={packet.traceId} />
                        </div>
                    </div>
                )}

                {activeTab === 'tcp' && (
                    <div className="space-y-4">
                        {packet.tcp ? (
                            <>
                                <div className="border border-gray-700 rounded bg-gray-800/20 p-3 space-y-2">
                                    <div className="text-xs font-bold text-gray-400 mb-2 border-b border-gray-700 pb-1 flex items-center gap-2">
                                        TCP Layer Analysis
                                        {packet.tcp.is_retransmission ? (
                                            <AlertTriangle size={14} className="text-red-400" />
                                        ) : (
                                            <CheckCircle2 size={14} className="text-green-400" />
                                        )}
                                    </div>
                                    <DetailRow label="Stream State" value={packet.tcp.stream_state} />
                                    <DetailRow
                                        label="Retransmission"
                                        value={packet.tcp.is_retransmission ? "YES ⚠️" : "No"}
                                        highlight={packet.tcp.is_retransmission}
                                    />
                                    <DetailRow
                                        label="Out of Order"
                                        value={packet.tcp.is_out_of_order ? "YES" : "No"}
                                    />
                                    <DetailRow
                                        label="Retrans Rate"
                                        value={`${(packet.tcp.retransmission_rate * 100).toFixed(2)}%`}
                                    />
                                </div>

                                {/* 重传/乱序说明区域 - 智能显示 */}
                                {(packet.tcp.is_retransmission || packet.tcp.is_out_of_order || packet.tcp.retransmission_rate > 0.05) && (
                                    <div className="border-2 border-yellow-500/40 rounded-lg bg-gradient-to-br from-yellow-900/15 to-orange-900/10 p-4 space-y-3 shadow-lg">
                                        <div className="text-sm font-bold text-yellow-300 mb-3 pb-2 border-b-2 border-yellow-600/40 flex items-center gap-2">
                                            <AlertTriangle size={16} className="text-yellow-400" />
                                            ⚡ 网络质量分析
                                            <span className="ml-auto text-xs text-gray-400 font-normal">
                                                {packet.tcp.is_retransmission || packet.tcp.is_out_of_order ? '（当前数据包异常）' : '（TCP流异常）'}
                                            </span>
                                        </div>

                                        {/* 3列横向布局 */}
                                        <div className="grid grid-cols-3 gap-3">
                                            {/* 重传包卡片 */}
                                            {packet.tcp.is_retransmission && (
                                                <div className="bg-gradient-to-br from-red-900/40 to-red-800/30 border-2 border-red-500/50 rounded-lg p-4 shadow-lg">
                                                    <div className="text-center mb-3">
                                                        <div className="text-4xl mb-2">🔴</div>
                                                        <div className="text-sm text-red-200 font-bold">检测到重传包</div>
                                                    </div>
                                                    <div className="text-xs text-gray-300 leading-relaxed">
                                                        监测到TCP层出现多次数据包重传现象，分析显示数据包序列号重复（Duplicate Sequence Numbers），表明数据包在传输过程中丢失或被迟到达，导致发送端重发这些数据。
                                                        <div className="mt-2 pt-2 border-t border-red-700/30 text-gray-400">
                                                            可能原因：网络丢包、ACK延迟、或拥塞控制触发。
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* 乱序包卡片 */}
                                            {packet.tcp.is_out_of_order && (
                                                <div className="bg-gradient-to-br from-orange-900/40 to-orange-800/30 border-2 border-orange-500/50 rounded-lg p-4 shadow-lg">
                                                    <div className="text-center mb-3">
                                                        <div className="text-4xl mb-2">🟠</div>
                                                        <div className="text-sm text-orange-200 font-bold">检测到乱序包</div>
                                                    </div>
                                                    <div className="text-xs text-gray-300 leading-relaxed">
                                                        监测到TCP层数据包到达顺序异常，接收端发现数据包序列号未按预期递增，表明数据包在传输过程中经历了不同的路径或延迟。
                                                        <div className="mt-2 pt-2 border-t border-orange-700/30 text-gray-400">
                                                            可能原因：网络路径不同、路由器负载不均、或QoS策略影响。
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* 重传率警告卡片 */}
                                            {packet.tcp.retransmission_rate > 0.05 && (
                                                <div className={`border-2 rounded-lg p-4 shadow-lg ${packet.tcp.retransmission_rate > 0.1
                                                    ? 'bg-gradient-to-br from-red-900/40 to-red-800/30 border-red-500/50'
                                                    : 'bg-gradient-to-br from-yellow-900/40 to-yellow-800/30 border-yellow-500/50'
                                                    }`}>
                                                    <div className="text-center mb-3">
                                                        <div className="text-4xl mb-2">{packet.tcp.retransmission_rate > 0.1 ? '🔴' : '🟡'}</div>
                                                        <div className={`text-sm font-bold ${packet.tcp.retransmission_rate > 0.1 ? 'text-red-200' : 'text-yellow-200'}`}>
                                                            重传率偏高警告
                                                        </div>
                                                    </div>
                                                    <div className="text-center mb-3">
                                                        <div className="text-3xl font-bold text-white">
                                                            {(packet.tcp.retransmission_rate * 100).toFixed(2)}%
                                                        </div>
                                                        <div className={`text-xs mt-1 font-semibold ${packet.tcp.retransmission_rate > 0.1 ? 'text-red-300' : 'text-yellow-300'}`}>
                                                            {packet.tcp.retransmission_rate > 0.1 ? '（严重）' : '（中等）'}
                                                        </div>
                                                    </div>
                                                    <div className="text-xs text-gray-300 leading-relaxed">
                                                        <div className="bg-blue-900/20 border border-blue-600/30 rounded px-2 py-1.5 mb-2">
                                                            <div className="text-center text-blue-300 font-semibold mb-1">📊 TCP流累积统计</div>
                                                            <div className={`text-center font-bold text-sm ${packet.tcp.is_retransmission ? 'text-red-300' : 'text-green-300'
                                                                }`}>
                                                                {packet.tcp.is_retransmission
                                                                    ? '⚠️ 当前包：重传包'
                                                                    : '✅ 当前包：正常'}
                                                            </div>
                                                        </div>
                                                        该TCP连接<span className="text-blue-300 font-semibold">从建立到现在</span>的整体重传率为
                                                        <span className="text-white font-semibold"> {(packet.tcp.retransmission_rate * 100).toFixed(2)}%</span>
                                                        。{packet.tcp.is_retransmission
                                                            ? '当前选中的数据包本身就是重传包。'
                                                            : '虽然当前包正常，但该流之前出现过多次重传。'}
                                                        {packet.tcp.retransmission_rate > 0.1
                                                            ? '建议排查网络质量问题。'
                                                            : '网络存在轻微波动。'}
                                                        <div className="mt-3 pt-2 border-t border-gray-700/30">
                                                            <div className="font-semibold text-gray-300 mb-1.5">💡 健康指标</div>
                                                            <div className="space-y-1">
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-green-400">●</span>
                                                                    <span className="text-gray-400">优秀 &lt;1%</span>
                                                                </div>
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-blue-400">●</span>
                                                                    <span className="text-gray-400">良好 1-5%</span>
                                                                </div>
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-yellow-400">●</span>
                                                                    <span className="text-gray-400">中等 5-10%</span>
                                                                </div>
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-red-400">●</span>
                                                                    <span className="text-gray-400">较差 &gt;10%</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
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

                {activeTab === 'payload' && (
                    <div className="text-gray-300 whitespace-pre-wrap break-all leading-relaxed p-2">
                        {packet.body}
                    </div>
                )}

                {activeTab === 'hex' && (
                    <div className="text-gray-400 text-xs p-2">
                        {packet.body.split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ')}...
                    </div>
                )}
            </div>
        </div>
    );
}
