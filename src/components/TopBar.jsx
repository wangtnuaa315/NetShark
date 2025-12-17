import React, { useMemo } from 'react';
import { Box, Server, Play, Pause, Trash2, Search, Power, Activity } from 'lucide-react';

export default function TopBar({ config, isCapturing, onToggle, onClear, onDisconnect, filterText, setFilterText, packets = [] }) {
    // 计算网络质量
    const networkQuality = useMemo(() => {
        const tcpPackets = packets.filter(p => p.tcp);
        if (tcpPackets.length === 0) return { rate: 0, status: 'unknown', color: 'gray' };

        // 计算平均重传率
        const totalRetransRate = tcpPackets.reduce((sum, p) => sum + (p.tcp.retransmission_rate || 0), 0);
        const avgRate = totalRetransRate / tcpPackets.length;

        // 判断健康等级
        let status, color, icon;
        if (avgRate < 0.01) {
            status = '优秀';
            color = 'green';
            icon = '✅';
        } else if (avgRate < 0.05) {
            status = '良好';
            color = 'blue';
            icon = '✓';
        } else if (avgRate < 0.1) {
            status = '中等';
            color = 'yellow';
            icon = '⚠️';
        } else {
            status = '较差';
            color = 'red';
            icon = '❌';
        }

        return { rate: avgRate, status, color, icon };
    }, [packets]);

    return (
        <div className="h-16 bg-gray-800 border-b border-gray-700 flex items-center px-4 justify-between shrink-0">
            <div className="flex items-center gap-4">
                {/* Info Blocks */}
                <div className="flex flex-col">
                    <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-0.5">应用程序</label>
                    <div className="flex items-center gap-2 text-sm font-bold text-gray-200">
                        <Box size={14} className="text-blue-400" />
                        <span>{config.targetProcess?.name}</span>
                        <span className="text-xs text-gray-500 font-normal border border-gray-600 px-1 rounded bg-gray-700">PID {config.targetProcess?.pid}</span>
                        {config.enableHttpsProxy && (
                            <span className="text-xs text-green-400 font-normal border border-green-600 px-1 rounded bg-green-900/30">🔒 HTTPS</span>
                        )}
                    </div>
                </div>
                <div className="h-8 w-px bg-gray-700 mx-2"></div>
                <div className="flex flex-col">
                    <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-0.5">服务器</label>
                    <div className="flex items-center gap-2 text-sm text-gray-300">
                        <Server size={14} className="text-purple-400" />
                        <span className="font-mono">{config.serverIp || '未配置'}</span>
                        {config.serverIp && <div className="w-2 h-2 rounded-full bg-green-500 ml-1 animate-pulse"></div>}
                    </div>
                </div>
                <div className="h-8 w-px bg-gray-700 mx-2"></div>

                {/* Controls */}
                <button
                    onClick={onToggle}
                    className={`flex items-center gap-2 px-4 py-2 rounded shadow-sm text-sm font-bold transition-all ${isCapturing ? 'bg-red-500/10 text-red-400 border border-red-500/50 hover:bg-red-500/20' : 'bg-green-600 text-white hover:bg-green-500 shadow-green-900/20'}`}
                >
                    {isCapturing ? <><Pause size={16} fill="currentColor" /> 暂停</> : <><Play size={16} fill="currentColor" /> 恢复</>}
                </button>
                <button onClick={onClear} className="p-2 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors">
                    <Trash2 size={18} />
                </button>

                {/* 网络质量指示器 */}
                {packets.length > 0 && (
                    <>
                        <div className="h-8 w-px bg-gray-700 mx-2"></div>
                        <div className="flex flex-col relative group">
                            <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-0.5">网络质量</label>
                            <div className={`flex items-center gap-2 text-sm font-semibold ${networkQuality.color === 'green' ? 'text-green-400' :
                                networkQuality.color === 'blue' ? 'text-blue-400' :
                                    networkQuality.color === 'yellow' ? 'text-yellow-400' :
                                        networkQuality.color === 'red' ? 'text-red-400' : 'text-gray-400'
                                }`}>
                                <Activity size={14} className={networkQuality.color === 'green' ? 'text-green-400' : networkQuality.color === 'red' ? 'text-red-400 animate-pulse' : ''} />
                                <span>{networkQuality.icon} {networkQuality.status}</span>
                                <span className="text-xs text-gray-500 font-normal">
                                    ({(networkQuality.rate * 100).toFixed(2)}%)
                                </span>
                                {/* 信息图标 */}
                                <div className="cursor-help transition-all bg-blue-500/20 hover:bg-blue-500/30 rounded-full p-1 animate-pulse hover:animate-none border border-blue-400/50">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-blue-400 hover:text-blue-300">
                                        <circle cx="12" cy="12" r="10" />
                                        <text x="12" y="16" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">i</text>
                                    </svg>
                                </div>
                            </div>

                            {/* Tooltip说明 */}
                            <div className="absolute top-full left-0 mt-2 w-80 bg-gray-900 border-2 border-blue-500/50 rounded-lg shadow-2xl p-4 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                                <div className="text-sm font-bold text-blue-300 mb-3 border-b border-blue-700 pb-2">
                                    📊 网络质量判断标准
                                </div>
                                <div className="space-y-2 text-xs">
                                    <div className="flex items-start gap-2">
                                        <span className="text-green-400 font-bold min-w-[60px]">✅ 优秀</span>
                                        <span className="text-gray-300">重传率 &lt; 1%，网络状况极佳</span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <span className="text-blue-400 font-bold min-w-[60px]">✓ 良好</span>
                                        <span className="text-gray-300">重传率 1-5%，网络正常</span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <span className="text-yellow-400 font-bold min-w-[60px]">⚠️ 中等</span>
                                        <span className="text-gray-300">重传率 5-10%，存在轻微问题</span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <span className="text-red-400 font-bold min-w-[60px]">❌ 较差</span>
                                        <span className="text-gray-300">重传率 &gt; 10%，需要排查</span>
                                    </div>
                                </div>
                                <div className="mt-3 pt-3 border-t border-gray-700 text-xs text-gray-400">
                                    <span className="font-semibold text-gray-300">💡 说明：</span>
                                    重传率 = 重传包数量 / 总包数量。数值越低，网络质量越好。
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            <div className="flex items-center gap-3">
                <div className="relative">
                    <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                        type="text"
                        placeholder="过滤数据包..."
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        className="bg-gray-900 border border-gray-600 rounded pl-8 py-1.5 text-xs text-gray-300 w-48 focus:border-blue-500 outline-none"
                    />
                </div>
                <button
                    onClick={onDisconnect}
                    className="flex items-center gap-2 px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-xs text-gray-200 border border-gray-600 transition-colors"
                >
                    <Power size={12} /> 断开连接
                </button>
            </div>
        </div>
    );
}
