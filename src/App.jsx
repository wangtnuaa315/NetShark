import React, { useState, useEffect, useRef } from 'react';
import ConfigScreen from './components/ConfigScreen';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import PacketList from './components/PacketList';
import PacketDetail from './components/PacketDetail';
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
        // 1. View Filter
        if (activeView === 'client' && p.category !== PacketType.CLIENT) return false;
        if (activeView === 'server' && p.category !== PacketType.SERVER) return false;
        if (activeView === 'db' && p.category !== PacketType.DB) return false;

        // 2. Search Filter
        if (!filterText) return true;
        const lowerFilter = filterText.toLowerCase();
        return (
            p.path.toLowerCase().includes(lowerFilter) ||
            p.method.toLowerCase().includes(lowerFilter) ||
            p.traceId.includes(lowerFilter)
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
            />
        );
    }

    // --- 渲染：主界面 ---
    return (
        <div className="flex h-screen bg-gray-900 text-gray-100 font-sans overflow-hidden">

            {/* Sidebar */}
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

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">

                {/* Top Bar */}
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

                {/* Packet List & Detail Split View */}
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
                        />
                    )}

                </div>
            </div>
        </div>
    );
}
