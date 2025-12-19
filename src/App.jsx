import React, { useState, useEffect, useRef } from 'react';
import ConfigScreen from './components/ConfigScreen';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import PacketList from './components/PacketList';
import PacketDetail from './components/PacketDetail';
import RemoteServerView from './components/RemoteServerView';
import ServerManager from './components/ServerManager';
import { ProcessService } from './services/ProcessService';
import { engine } from './services/CaptureEngine';
import { httpsEngine } from './services/HttpsProxyService';
import { PacketType } from './models/types';

export default function NetSharkApp() {
    // UI 状态
    const [isConfigMode, setIsConfigMode] = useState(true);
    const [isCapturing, setIsCapturing] = useState(false);
    const [activeView, setActiveView] = useState('client');
    const [packets, setPackets] = useState([]);
    const [selectedPacket, setSelectedPacket] = useState(null);
    const [filterText, setFilterText] = useState('');

    // PCAP 分析模式（导入 PCAP 文件时启用）
    const [isPcapMode, setIsPcapMode] = useState(false);
    const [pcapInfo, setPcapInfo] = useState(null); // { filename, packet_count, stream_count }

    // 配置状态
    const [config, setConfig] = useState({
        targetProcess: null,
        serverIp: '',  // 🎯 服务器IP（统一字段）
        dbFilter: '3306, 6379',
        enableHttpsProxy: false,  // 🔒 HTTPS 增强开关
        connectionState: 'idle' // idle, connecting, connected
    });

    // 进程列表 (异步加载)
    const [processList, setProcessList] = useState([]);
    const [isLoadingProcesses, setIsLoadingProcesses] = useState(false);

    const listRef = useRef(null);

    // 初始化：订阅引擎数据（只订阅一次）
    useEffect(() => {
        // 清空之前的订阅者
        engine.subscribers = [];

        // 添加新订阅
        engine.onPacket((packet) => {
            setPackets(prev => {
                const newBuffer = [...prev, packet];
                if (newBuffer.length > 500) newBuffer.shift(); // 限制内存占用
                return newBuffer;
            });

            // 自动滚动
            if (listRef.current) {
                listRef.current.scrollTop = listRef.current.scrollHeight;
            }
        });

        // 清理函数：组件卸载时清空订阅者
        return () => {
            engine.subscribers = [];
        };
    }, []); // 空依赖数组，只执行一次

    // 动作：刷新进程列表
    const refreshProcesses = async () => {
        setIsLoadingProcesses(true);
        const list = await ProcessService.listRunningProcesses();
        setProcessList(list);
        setIsLoadingProcesses(false);
    };

    // 初始化加载进程
    useEffect(() => {
        if (isConfigMode) refreshProcesses();
    }, [isConfigMode]);

    // 动作：开始会话 (连接逻辑)
    const handleStartSession = async () => {
        if (!config.targetProcess) return;

        setConfig(prev => ({ ...prev, connectionState: 'connecting' }));

        try {
            // 📦 启动 TCP 抓包（主模式）
            console.log('[App] Starting TCP capture...');
            engine.configure(config);
            await engine.start();

            // 🔒 如果启用了 HTTPS 增强，同时启动 HTTPS 代理
            if (config.enableHttpsProxy) {
                try {
                    console.log('[App] Starting HTTPS proxy (enhancement)...');
                    httpsEngine.clearSubscribers();
                    httpsEngine.onPacket((packet) => {
                        setPackets(prev => {
                            const newBuffer = [...prev, packet];
                            if (newBuffer.length > 500) newBuffer.shift();
                            return newBuffer;
                        });
                        if (listRef.current) {
                            listRef.current.scrollTop = listRef.current.scrollHeight;
                        }
                    });
                    await httpsEngine.start();
                    console.log('[App] HTTPS proxy started');
                } catch (httpsErr) {
                    console.warn('[App] HTTPS proxy failed to start:', httpsErr);
                    // 不阻止 TCP 抓包继续
                }
            }

            setConfig(prev => ({ ...prev, connectionState: 'connected' }));
            setIsConfigMode(false);
            setIsCapturing(true);
        } catch (e) {
            console.error("Failed to start session", e);
            setConfig(prev => ({ ...prev, connectionState: 'idle' }));
            alert("Connection Failed: " + e.message);
        }
    };

    // 动作：暂停/恢复
    const toggleCapture = () => {
        if (isCapturing) {
            engine.stop();
            if (config.enableHttpsProxy) httpsEngine.stop();
        } else {
            engine.start().catch(console.error);
            if (config.enableHttpsProxy) httpsEngine.start().catch(console.error);
        }
        setIsCapturing(!isCapturing);
    };

    // 动作：清空
    const clearPackets = () => {
        setPackets([]);
        setSelectedPacket(null);
    };

    // 动作：切换视图（同时清空选中）
    const handleViewChange = (newView) => {
        setActiveView(newView);
        setSelectedPacket(null);  // 清空选中的包
    };

    // 视图过滤逻辑
    const filteredPackets = packets.filter(p => {
        // 1. View Filter（PCAP 分析模式下跳过视图过滤，显示所有包）
        if (!isPcapMode) {
            if (activeView === 'client' && p.category !== PacketType.CLIENT) return false;
            if (activeView === 'server' && p.category !== PacketType.SERVER) return false;
            if (activeView === 'db' && p.category !== PacketType.DB) return false;
        }

        // 2. Search Filter
        if (!filterText) return true;

        // 特殊筛选：stream:N - 按 TCP 流 ID 筛选
        if (filterText.toLowerCase().startsWith('stream:')) {
            const streamId = parseInt(filterText.split(':')[1]);
            return p.stream_id === streamId;
        }

        const lowerFilter = filterText.toLowerCase();
        return (
            (p.path && p.path.toLowerCase().includes(lowerFilter)) ||
            (p.method && p.method.toLowerCase().includes(lowerFilter)) ||
            (p.traceId && p.traceId.includes(lowerFilter)) ||
            (p.protocol && p.protocol.toLowerCase().includes(lowerFilter)) ||
            (p.info && p.info.toLowerCase().includes(lowerFilter))
        );
    });

    // --- 渲染：配置面板 ---
    if (isConfigMode) {
        return (
            <ConfigScreen
                config={config}
                setConfig={setConfig}
                processList={processList}
                isLoadingProcesses={isLoadingProcesses}
                onRefresh={refreshProcesses}
                onStart={handleStartSession}
                onPcapLoaded={(newPackets, info) => {
                    // 导入 PCAP 后切换到 PCAP 分析模式
                    setPackets(newPackets);
                    setIsConfigMode(false);
                    setIsPcapMode(true);  // 启用 PCAP 模式
                    setPcapInfo(info);    // 保存 PCAP 文件信息
                    setActiveView('client');
                }}
            />
        );
    }

    // --- 渲染：主界面 ---
    return (
        <div className="flex h-screen bg-gray-900 text-gray-100 font-sans overflow-hidden">

            {/* Sidebar - PCAP 模式下隐藏 */}
            {!isPcapMode && (
                <Sidebar
                    config={config}
                    activeView={activeView}
                    setActiveView={handleViewChange}
                    onConfig={() => {
                        // 停止所有引擎
                        engine.stop();
                        if (config.enableHttpsProxy) httpsEngine.stop();
                        setIsCapturing(false);
                        setIsConfigMode(true);
                        setConfig(prev => ({ ...prev, connectionState: 'idle' }));
                    }}
                />
            )}

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">

                {/* Top Bar - 根据模式显示不同内容 */}
                {isPcapMode ? (
                    /* PCAP 分析模式专用 TopBar */
                    <div className="h-16 bg-gray-800 border-b border-gray-700 flex items-center px-4 justify-between shrink-0">
                        <div className="flex items-center gap-4">
                            {/* PCAP 文件信息 */}
                            <div className="flex flex-col">
                                <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-0.5">PCAP 文件分析</label>
                                <div className="flex items-center gap-2 text-sm font-bold text-gray-200">
                                    <span className="text-blue-400">📄</span>
                                    <span>{pcapInfo?.filename || 'PCAP File'}</span>
                                </div>
                            </div>
                            <div className="h-8 w-px bg-gray-700 mx-2"></div>

                            {/* 统计信息 */}
                            <div className="flex gap-4 text-xs">
                                <div className="flex flex-col items-center">
                                    <span className="text-gray-500">数据包</span>
                                    <span className="text-white font-bold">{packets.length}</span>
                                </div>
                                <div className="flex flex-col items-center">
                                    <span className="text-gray-500">TCP 流</span>
                                    <span className="text-cyan-400 font-bold">{pcapInfo?.stream_count || '-'}</span>
                                </div>
                            </div>

                            <div className="h-8 w-px bg-gray-700 mx-2"></div>

                            {/* 清空按钮 */}
                            <button
                                onClick={clearPackets}
                                className="p-2 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
                                title="清空数据"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                        </div>

                        <div className="flex items-center gap-3">
                            {/* 搜索框 */}
                            <div className="relative">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                                <input
                                    type="text"
                                    placeholder="搜索... (回车确认)"
                                    value={filterText}
                                    onChange={(e) => setFilterText(e.target.value)}
                                    className="bg-gray-900 border border-gray-600 rounded pl-8 py-1.5 text-xs text-gray-300 w-56 focus:border-blue-500 outline-none"
                                />
                            </div>

                            {/* 返回按钮 */}
                            <button
                                onClick={() => {
                                    setIsConfigMode(true);
                                    setIsPcapMode(false);
                                    setPcapInfo(null);
                                    setPackets([]);
                                    setSelectedPacket(null);
                                }}
                                className="flex items-center gap-2 px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-xs text-white font-bold transition-colors"
                            >
                                ← 返回首页
                            </button>
                        </div>
                    </div>
                ) : (
                    /* 实时抓包模式 TopBar */
                    <TopBar
                        config={config}
                        isCapturing={isCapturing}
                        onToggle={toggleCapture}
                        onClear={clearPackets}
                        onDisconnect={() => setIsConfigMode(true)}
                        filterText={filterText}
                        setFilterText={setFilterText}
                        packets={packets}
                    />
                )}

                {/* 根据 activeView 切换内容 */}
                {activeView === 'server' ? (
                    /* 远程服务器视图 */
                    <RemoteServerView
                        onPacketsLoaded={(newPackets) => {
                            setPackets(newPackets);
                            setActiveView('client'); // 导入后切换到应用视图查看
                        }}
                    />
                ) : activeView === 'servers' ? (
                    /* 服务器管理视图 */
                    <ServerManager />
                ) : (
                    /* Packet List & Detail Split View */
                    <div className="flex-1 flex overflow-hidden">

                        <PacketList
                            packets={filteredPackets}
                            selectedId={selectedPacket?.id}
                            onSelect={setSelectedPacket}
                            listRef={listRef}
                            isWaiting={filteredPackets.length === 0}
                            activeView={activeView}
                        />

                        {selectedPacket && (
                            <PacketDetail
                                packet={selectedPacket}
                                onClose={() => setSelectedPacket(null)}
                                config={config}
                                allPackets={packets}
                            />
                        )}

                    </div>
                )}
            </div>
        </div>
    );
}
