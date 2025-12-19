import React, { useState, useEffect, useRef } from 'react';
import {
    Activity, Monitor, RefreshCw, Search, Cpu, Server,
    CheckCircle2, Database, Zap, ChevronRight, FileCode, Play, Shield, AlertTriangle, X,
    Upload, FolderOpen, Loader, Terminal
} from 'lucide-react';
import { ProcessService } from '../services/ProcessService';
import { HttpsProxyService } from '../services/HttpsProxyService';
import SSHCapturePanel from './SSHCapturePanel';

export default function ConfigScreen({ config, setConfig, processList, isLoadingProcesses, onRefresh, onStart, onPcapLoaded }) {
    const [mode, setMode] = useState('local'); // 'local' | 'pcap' | 'ssh'
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedApp, setSelectedApp] = useState(null);
    const [certInfo, setCertInfo] = useState({ exists: false, installed: false });
    const [certLoading, setCertLoading] = useState(false);
    const [showNoIpWarning, setShowNoIpWarning] = useState(false); // 显示无IP警告模态框

    // PCAP 导入相关状态
    const [pcapLoading, setPcapLoading] = useState(false);
    const [pcapResult, setPcapResult] = useState(null);
    const fileInputRef = useRef(null);

    const filteredProcesses = processList.filter(proc =>
        proc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(proc.pid).includes(searchTerm)
    );

    // 检查证书状态（当开启 HTTPS 增强时）
    useEffect(() => {
        if (config.enableHttpsProxy) {
            checkCertStatus();
        }
    }, [config.enableHttpsProxy]);

    const checkCertStatus = async () => {
        setCertLoading(true);
        const info = await HttpsProxyService.getCertInfo();
        setCertInfo(info);
        setCertLoading(false);
    };

    const handleInstallCert = async () => {
        setCertLoading(true);

        // 先确保证书存在
        if (!certInfo.exists) {
            const genResult = await HttpsProxyService.generateCert();
            if (genResult.status === 'error') {
                alert('生成证书失败: ' + genResult.message);
                setCertLoading(false);
                return;
            }
        }

        // 安装证书
        const result = await HttpsProxyService.installCert();
        if (result.status === 'success') {
            alert('✅ ' + result.message);
            await checkCertStatus();
        } else {
            alert('❌ 安装失败: ' + result.message);
        }
        setCertLoading(false);
    };

    const handleSelectFile = async () => {
        const path = await ProcessService.openFileDialog();
        if (path) {
            try {
                const result = await ProcessService.launchProcess(path);

                if (result.error) {
                    alert("启动失败: " + result.error);
                } else if (result.pid) {
                    const newProc = {
                        pid: result.pid,
                        name: result.name,
                        title: result.name,
                        cpu: '0.1%',
                        memory: '0MB',
                        icon: 'Rocket'
                    };
                    setSelectedApp(newProc);
                    setConfig({ ...config, targetProcess: newProc });
                }
            } catch (e) {
                alert("网络/服务错误: " + e.message);
            }
        }
    };

    const handlePing = async () => {
        if (!config.serverIp) return;
        const btn = document.getElementById('ping-btn');
        const originalText = btn.innerText;
        btn.innerText = "Pinging...";
        btn.disabled = true;

        const res = await ProcessService.pingAgent(config.serverIp);

        if (res.status === 'ok') {
            btn.innerText = `Success (${res.latency})`;
            btn.className = "bg-green-600 text-white px-3 py-2 rounded text-xs border border-green-500 font-medium transition-all";
            setTimeout(() => {
                btn.innerText = originalText;
                btn.className = "bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded text-xs border border-gray-700 font-medium transition-all";
                btn.disabled = false;
            }, 2000);
        } else {
            alert("Ping Failed: " + (res.error || "Unknown Error"));
            btn.innerText = originalText;
            btn.disabled = false;
        }
    };

    const handleStartSession = () => {
        console.log('[DEBUG] handleStartSession called');
        console.log('[DEBUG] config.serverIp:', config.serverIp);

        // 检查是否填写了服务器IP（可选，但建议填写）
        if (!config.serverIp || config.serverIp.trim() === '') {
            console.log('[DEBUG] Showing custom modal...');
            setShowNoIpWarning(true); // 显示自定义模态框
            return;
        }

        // 继续启动会话
        console.log('[DEBUG] Calling onStart...');
        onStart();
    };

    // 用户确认继续（无IP警告）
    const handleConfirmNoIp = () => {
        setShowNoIpWarning(false);
        onStart();
    };

    // PCAP 文件选择处理
    const handlePcapSelect = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // 验证文件类型
        const validExtensions = ['.pcap', '.pcapng', '.cap'];
        const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
        if (!validExtensions.includes(ext)) {
            setPcapResult({
                status: 'error',
                message: `不支持的文件格式: ${ext}。请上传 .pcap, .pcapng 或 .cap 文件`
            });
            return;
        }

        setPcapLoading(true);
        setPcapResult(null);

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('http://localhost:8000/api/pcap/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`上传失败: ${response.statusText}`);
            }

            const result = await response.json();

            if (result.error) {
                throw new Error(result.error);
            }

            setPcapResult({
                status: 'success',
                message: `成功解析 ${result.packet_count || 0} 个数据包`,
                details: result
            });

            // 通知父组件加载数据包，并传递文件信息
            if (onPcapLoaded && result.packets) {
                const pcapInfo = {
                    filename: file.name,
                    packet_count: result.packet_count || result.packets.length,
                    stream_count: result.stream_count || 0,
                    file_size: file.size
                };
                setTimeout(() => {
                    onPcapLoaded(result.packets, pcapInfo);
                }, 1000);
            }

        } catch (error) {
            console.error('PCAP 上传失败:', error);
            setPcapResult({
                status: 'error',
                message: `解析失败: ${error.message}`
            });
        } finally {
            setPcapLoading(false);
        }
    };

    // 拖拽上传
    const handleDrop = (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && fileInputRef.current) {
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInputRef.current.files = dataTransfer.files;
            handlePcapSelect({ target: fileInputRef.current });
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };

    return (
        <div className="flex h-screen bg-gray-900 text-gray-100 font-sans items-center justify-center p-8">
            <div className="w-full max-w-4xl bg-gray-950 border border-gray-800 rounded-xl shadow-2xl overflow-hidden flex flex-col h-[650px]">
                {/* Header */}
                <div className="p-6 border-b border-gray-800 bg-gray-900/50">
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                                <Activity className="text-blue-500" />
                                NetShark
                            </h1>
                            <p className="text-gray-500 mt-1 text-sm">网络流量分析工具</p>
                        </div>
                        <div className="text-right">
                            <div className="text-xs text-gray-600 font-mono">v1.0.0</div>
                        </div>
                    </div>

                    {/* 模式切换标签 */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => setMode('local')}
                            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all ${mode === 'local'
                                ? 'bg-blue-600 text-white shadow-lg'
                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                                }`}
                        >
                            <Monitor size={16} />
                            本地抓包
                        </button>
                        <button
                            onClick={() => setMode('pcap')}
                            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all ${mode === 'pcap'
                                ? 'bg-green-600 text-white shadow-lg'
                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                                }`}
                        >
                            <Upload size={16} />
                            导入 PCAP
                        </button>
                        <button
                            onClick={() => setMode('ssh')}
                            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all ${mode === 'ssh'
                                ? 'bg-purple-600 text-white shadow-lg'
                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                                }`}
                        >
                            <Terminal size={16} />
                            SSH 抓包
                        </button>
                    </div>
                </div>

                {/* Body - 根据模式切换内容 */}
                {mode === 'local' ? (
                    /* 本地抓包模式 */
                    <div className="flex-1 overflow-hidden flex flex-col p-6 gap-6">
                        <div className="grid grid-cols-2 gap-6 flex-1 min-h-0">
                            {/* Column 1: Local Process Selection */}
                            <div className="flex flex-col min-h-0">
                                <h2 className="text-sm font-bold text-blue-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <Monitor size={16} /> 1. 本地进程
                                </h2>

                                {/* Search */}
                                <div className="mb-3">
                                    <div className="relative">
                                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                                        <input
                                            type="text"
                                            placeholder="搜索进程（名称或PID）..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="w-full bg-gray-950 border border-gray-700 rounded px-10 py-2 text-sm text-white focus:border-blue-500 outline-none"
                                        />
                                        <button
                                            onClick={onRefresh}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-blue-400 transition-colors"
                                        >
                                            <RefreshCw size={16} className={isLoadingProcesses ? 'animate-spin' : ''} />
                                        </button>
                                    </div>
                                </div>

                                {/* Process List */}
                                <div className="flex-1 bg-gray-900 border border-gray-800 rounded-lg overflow-hidden flex flex-col">
                                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                        {isLoadingProcesses ? (
                                            <div className="flex justify-center items-center h-20 text-gray-600 text-xs">
                                                正在扫描进程列表...
                                            </div>
                                        ) : filteredProcesses.length === 0 ? (
                                            <div className="text-center text-gray-500 py-8">
                                                <Search className="mx-auto mb-2 opacity-50" size={32} />
                                                <p>没有找到匹配的进程</p>
                                            </div>
                                        ) : (
                                            filteredProcesses.map(proc => (
                                                <div
                                                    key={proc.pid}
                                                    onClick={() => setConfig({ ...config, targetProcess: proc })}
                                                    className={`p-2 rounded cursor-pointer border transition-all ${config.targetProcess?.pid === proc.pid
                                                        ? 'bg-blue-600/20 border-blue-500/50'
                                                        : 'bg-transparent border-transparent hover:bg-gray-800'
                                                        }`}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <Cpu size={16} className="text-gray-400" />
                                                            <div className="flex items-baseline gap-2">
                                                                <div className="text-sm font-medium text-gray-200">{proc.name}</div>
                                                                <div className="text-xs text-gray-500 font-mono">
                                                                    PID: {proc.pid}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        {config.targetProcess?.pid === proc.pid && (
                                                            <CheckCircle2 size={16} className="text-blue-500" />
                                                        )}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* Launch New App */}
                                <div className="mt-3">
                                    <button
                                        onClick={handleSelectFile}
                                        className="w-full px-4 py-4 rounded-lg border-2 border-dashed border-blue-500/40 bg-blue-500/5 hover:bg-blue-500/10 hover:border-blue-500/70 text-blue-400 hover:text-blue-300 font-bold transition-all group"
                                    >
                                        <div className="flex items-center justify-center gap-2">
                                            <Play size={18} className="group-hover:scale-110 transition-transform" fill="currentColor" />
                                            <span>
                                                {selectedApp
                                                    ? `已启动: ${selectedApp.name} (PID: ${selectedApp.pid})`
                                                    : '启动新应用程序 (.exe)...'
                                                }
                                            </span>
                                        </div>
                                    </button>
                                    <p className="text-xs text-gray-500 mt-2 text-center">
                                        💡 上方列表可直接选择运行中的进程
                                    </p>
                                </div>
                            </div>

                            {/* Column 2: Remote Config */}
                            <div className="flex flex-col min-h-0 overflow-hidden">
                                <h2 className="text-sm font-bold text-purple-400 uppercase tracking-wider mb-4 flex items-center gap-2 flex-shrink-0">
                                    <Server size={16} /> 2. 服务器配置
                                </h2>
                                <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-4 overflow-y-auto flex-1">
                                    <div>
                                        <label className="text-xs text-gray-500 mb-1 block font-semibold">
                                            服务器IP <span className="text-gray-600 font-normal">（可选）</span>
                                        </label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={config.serverIp}
                                                onChange={(e) => setConfig({ ...config, serverIp: e.target.value })}
                                                placeholder="如: 192.168.2.33 或留空抓取全部"
                                                className="flex-1 bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-purple-500 outline-none font-mono"
                                            />
                                            <button
                                                id="ping-btn"
                                                onClick={handlePing}
                                                className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded text-xs border border-gray-700 font-medium transition-all"
                                            >
                                                Ping
                                            </button>
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1">
                                            填写后只抓取与该IP通信的流量，留空则抓取所有流量
                                        </div>
                                    </div>

                                    {/* HTTPS 增强（暂时禁用） */}
                                    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 opacity-60">
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-xs text-gray-400 font-semibold flex items-center gap-2">
                                                <Shield size={14} className="text-gray-500" />
                                                HTTPS 解密
                                                <span className="text-[10px] text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded">开发中</span>
                                            </label>
                                            <label className="relative inline-flex items-center cursor-not-allowed">
                                                <input
                                                    type="checkbox"
                                                    checked={false}
                                                    disabled={true}
                                                    className="sr-only peer"
                                                />
                                                <div className="w-9 h-5 bg-gray-700 rounded-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-500 after:rounded-full after:h-4 after:w-4"></div>
                                            </label>
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            此功能正在开发中，敬请期待。目前可使用 TLS 协议识别功能查看加密流量元数据。
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-xs text-gray-500 mb-1 block font-semibold">数据库端口过滤</label>
                                        <input
                                            type="text"
                                            value={config.dbFilter}
                                            onChange={(e) => setConfig({ ...config, dbFilter: e.target.value })}
                                            placeholder="3306,6379,5432"
                                            className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-purple-500 outline-none font-mono"
                                        />
                                        <div className="text-xs text-gray-600 mt-1">逗号分隔的端口号</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Bottom: Start Button */}
                        <div className="flex justify-end gap-3">
                            <div className="flex-1 text-sm text-gray-500">
                                {config.targetProcess ? (
                                    <span className="flex items-center gap-2">
                                        <CheckCircle2 size={16} className="text-green-500" />
                                        已选择: <span className="font-mono text-white">{config.targetProcess.name}</span>
                                        <span className="text-gray-600">(PID: {config.targetProcess.pid})</span>
                                    </span>
                                ) : (
                                    <span className="text-gray-600">请选择一个进程</span>
                                )}
                            </div>

                            <button
                                onClick={handleStartSession}
                                disabled={!config.targetProcess}
                                className={`px-6 py-3 rounded font-bold text-sm flex items-center gap-2 transition-all ${config.targetProcess
                                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-lg'
                                    : 'bg-gray-800 text-gray-600 cursor-not-allowed'
                                    }`}
                            >
                                <Zap size={16} />
                                开始会话
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                ) : mode === 'pcap' ? (
                    /* PCAP 导入模式 */
                    <div className="flex-1 overflow-auto p-6">
                        <div className="max-w-lg mx-auto">
                            {/* 上传区域 */}
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                onDrop={handleDrop}
                                onDragOver={handleDragOver}
                                className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${pcapLoading
                                    ? 'border-green-500 bg-green-500/10'
                                    : 'border-gray-700 hover:border-green-500 hover:bg-gray-800/50'
                                    }`}
                            >
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".pcap,.pcapng,.cap"
                                    onChange={handlePcapSelect}
                                    className="hidden"
                                />

                                {pcapLoading ? (
                                    <div className="flex flex-col items-center gap-3">
                                        <Loader size={48} className="text-green-500 animate-spin" />
                                        <p className="text-green-400">正在解析文件...</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center">
                                            <FolderOpen size={32} className="text-gray-500" />
                                        </div>
                                        <div>
                                            <p className="text-white font-medium mb-1">点击选择文件或拖拽到此处</p>
                                            <p className="text-gray-500 text-sm">支持 .pcap, .pcapng, .cap 格式</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* 结果提示 */}
                            {pcapResult && (
                                <div className={`mt-4 p-4 rounded-lg flex items-start gap-3 ${pcapResult.status === 'success'
                                    ? 'bg-green-900/20 border border-green-500/30'
                                    : 'bg-red-900/20 border border-red-500/30'
                                    }`}>
                                    {pcapResult.status === 'success' ? (
                                        <CheckCircle2 className="text-green-500 flex-shrink-0" size={20} />
                                    ) : (
                                        <AlertTriangle className="text-red-500 flex-shrink-0" size={20} />
                                    )}
                                    <div>
                                        <p className={pcapResult.status === 'success' ? 'text-green-400' : 'text-red-400'}>
                                            {pcapResult.message}
                                        </p>
                                        {pcapResult.details && (
                                            <p className="text-gray-500 text-sm mt-1">
                                                文件大小: {(pcapResult.details.file_size / 1024).toFixed(2)} KB
                                            </p>
                                        )}
                                        {pcapResult.status === 'success' && (
                                            <p className="text-green-500/70 text-sm mt-1">
                                                正在跳转到分析视图...
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* 使用说明 */}
                            <div className="mt-6 bg-gray-800/50 rounded-lg p-4">
                                <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                                    <Terminal size={14} />
                                    如何在服务器上抓包？
                                </h3>
                                <div className="space-y-2 text-sm">
                                    <div className="bg-black/30 rounded p-2 font-mono text-xs text-gray-400">
                                        <div className="text-gray-500 mb-1"># 抓取指定端口的流量</div>
                                        <div className="text-green-400">$ sudo tcpdump -i any port 80 -w output.pcap</div>
                                    </div>
                                    <div className="bg-black/30 rounded p-2 font-mono text-xs text-gray-400">
                                        <div className="text-gray-500 mb-1"># 抓取指定 IP 的流量</div>
                                        <div className="text-green-400">$ sudo tcpdump -i any host 192.168.1.100 -w output.pcap</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : mode === 'ssh' ? (
                    /* SSH 远程抓包模式 */
                    <SSHCapturePanel onPacketsLoaded={onPcapLoaded} />
                ) : null}
            </div>

            {/* 无IP警告模态框 */}
            {showNoIpWarning && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm">
                    <div className="bg-gray-900 border border-yellow-500/50 rounded-xl p-6 max-w-md mx-4 shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="flex items-start gap-4">
                            <div className="flex-shrink-0">
                                <AlertTriangle className="text-yellow-500" size={32} />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-bold text-white mb-2">服务器IP未配置</h3>
                                <p className="text-gray-400 text-sm mb-4">
                                    您没有设置服务器IP过滤，这会抓取该应用的<span className="text-white font-medium">所有网络流量</span>。
                                </p>
                                <div className="bg-gray-800/50 rounded-lg p-3 mb-4">
                                    <p className="text-yellow-400 text-xs font-medium mb-2">⚠️ 可能导致：</p>
                                    <ul className="text-gray-400 text-xs space-y-1">
                                        <li>• 大量数据包（每秒数百个）</li>
                                        <li>• 界面卡顿</li>
                                        <li>• 难以找到目标请求</li>
                                    </ul>
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setShowNoIpWarning(false)}
                                        className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-all"
                                    >
                                        返回配置
                                    </button>
                                    <button
                                        onClick={handleConfirmNoIp}
                                        className="flex-1 px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg text-sm font-medium transition-all"
                                    >
                                        继续抓取
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
