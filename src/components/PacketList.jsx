import React from 'react';
import { Activity, AlertTriangle } from 'lucide-react';
import { PacketType } from '../models/types';

export default function PacketList({ packets, selectedId, onSelect, listRef, isWaiting, activeView }) {
    // 获取协议类型的颜色
    const getProtocolColor = (method, protocol) => {
        // 优先使用 protocol 字段
        if (protocol === 'TLS') return 'text-yellow-400';     // TLS - 黄色（类似 Wireshark）
        if (protocol === 'HTTPS') return 'text-green-400';    // HTTPS - 绿色
        if (protocol === 'HTTP') return 'text-blue-400';      // HTTP - 蓝色

        // 回退到 method 检测
        if (method.includes('GET') || method.includes('POST') || method.includes('PUT') || method.includes('DELETE')) {
            return 'text-blue-400';  // HTTP
        }
        if (method.includes('DB') || method.includes('SQL')) return 'text-orange-400';  // 数据库
        if (method.includes('TCP')) return 'text-purple-400';  // TCP
        if (method.includes('UDP')) return 'text-cyan-400';    // UDP
        if (method.includes('TLS')) return 'text-yellow-400';  // TLS
        return 'text-gray-400';
    };

    // 获取协议类型显示文本
    const getProtocolType = (method, protocol) => {
        // 优先使用 protocol 字段
        if (protocol === 'TLS') return 'TLS';
        if (protocol === 'HTTPS') return 'HTTPS';
        if (protocol === 'HTTP') return 'HTTP';

        // 回退到 method 检测
        if (method.includes('GET') || method.includes('POST') || method.includes('PUT') || method.includes('DELETE')) {
            return 'HTTP';
        }
        if (method.includes('DB') || method.includes('SQL')) return 'DB';
        if (method.includes('TCP')) return 'TCP';
        if (method.includes('UDP')) return 'UDP';
        if (method.includes('TLS')) return 'TLS';
        return method;
    };

    return (
        <div className="w-1/2 flex flex-col border-r border-gray-700 transition-all duration-300 bg-gray-900">
            {/* Table Header */}
            <div className="grid grid-cols-12 bg-gray-800/80 backdrop-blur-sm text-gray-400 text-xs font-semibold py-2 px-4 border-b border-gray-700 select-none sticky top-0 z-10">
                <div className="col-span-2">Time</div>
                <div className="col-span-2">Source</div>
                <div className="col-span-1">Protocol</div>
                <div className="col-span-2">Path</div>
                <div className="col-span-1">Size</div>
                <div className="col-span-4">Info</div>
            </div>

            {/* Table Body */}
            <div ref={listRef} className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 hover:scrollbar-thumb-gray-600">
                {isWaiting ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-600 opacity-60">
                        <Activity size={64} className="mb-4 text-gray-700" />
                        <p className="text-sm">Listening for {activeView} traffic...</p>
                        <p className="text-xs mt-1">Buffer is empty</p>
                    </div>
                ) : (
                    packets.map((pkt) => (
                        <div
                            key={pkt.id}
                            onClick={() => onSelect(pkt)}
                            className={`grid grid-cols-12 items-center py-2 px-4 text-xs border-b border-gray-800/50 cursor-pointer transition-colors 
                ${selectedId === pkt.id ? 'bg-blue-600/20 text-blue-100 border-l-4 border-l-blue-500' : 'text-gray-300 hover:bg-gray-800'}
              `}
                        >
                            <div className="col-span-2 font-mono opacity-70 flex items-center gap-1">
                                {pkt.tcp?.is_retransmission && (
                                    <AlertTriangle size={12} className="text-red-400" title="TCP Retransmission" />
                                )}
                                {pkt.timestamp}
                            </div>
                            <div className="col-span-2 flex flex-col truncate pr-2">
                                <span className={`font-medium text-xs ${pkt.category === PacketType.CLIENT ? 'text-blue-300' : (pkt.category === PacketType.SERVER ? 'text-purple-300' : 'text-yellow-300')}`}>{pkt.source}</span>
                            </div>
                            <div className={`col-span-1 font-bold ${getProtocolColor(pkt.method, pkt.protocol)}`}>{getProtocolType(pkt.method, pkt.protocol)}</div>
                            <div className="col-span-2 truncate font-mono text-gray-400" title={pkt.path}>
                                {pkt.path}
                            </div>
                            <div className="col-span-1 text-gray-500">{pkt.size}</div>
                            <div className="col-span-4 text-gray-400 font-mono truncate" title={pkt.info || ''}>
                                {pkt.info || '-'}
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="bg-gray-800 text-[10px] text-gray-400 px-3 py-1 flex justify-between border-t border-gray-700 shrink-0">
                <span>View: {activeView.toUpperCase()}</span>
                <span>{packets.length} Packets</span>
            </div>
        </div>
    );
}
