import React, { useState } from 'react';
import {
    Activity, Monitor, RefreshCw, Search, Cpu, Server,
    CheckCircle2, Database, Zap, ChevronRight, FileCode, Play
} from 'lucide-react';
import { ProcessService } from '../services/ProcessService';

export default function ConfigScreen({ config, setConfig, processList, isLoadingProcesses, onRefresh, onStart }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedApp, setSelectedApp] = useState(null);

    const filteredProcesses = processList.filter(proc =>
        proc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(proc.pid).includes(searchTerm)
    );

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

    return (
        <div className="flex h-screen bg-gray-900 text-gray-100 font-sans items-center justify-center p-8">
            <div className="w-full max-w-4xl bg-gray-950 border border-gray-800 rounded-xl shadow-2xl overflow-hidden flex flex-col h-[600px]">
                {/* Header */}
                <div className="p-6 border-b border-gray-800 bg-gray-900/50 flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                            <Activity className="text-blue-500" />
                            新建抓包会话
                        </h1>
                        <p className="text-gray-500 mt-2 text-sm">选择本地进程进行 Hook，或配置远程 Agent。</p>
                    </div>
                    <div className="text-right">
                        <div className="text-xs text-gray-600 font-mono">NetShark v1.0.0</div>
                    </div>
                </div>

                {/* Body */}
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
                                                className={`p-3 rounded cursor-pointer border transition-all ${config.targetProcess?.pid === proc.pid
                                                    ? 'bg-blue-600/20 border-blue-500/50'
                                                    : 'bg-transparent border-transparent hover:bg-gray-800'
                                                    }`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <Cpu size={16} className="text-gray-400" />
                                                        <div>
                                                            <div className="text-sm font-medium text-gray-200">{proc.name}</div>
                                                            <div className="text-xs text-gray-500 font-mono">
                                                                PID: {proc.pid} | CPU: {proc.cpu} | RAM: {proc.memory}
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
                                    className="w-full px-4 py-3 rounded border font-medium transition-all bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
                                >
                                    <div className="flex items-center justify-center gap-2">
                                        <Play size={16} />
                                        <span>
                                            {selectedApp
                                                ? `已启动: ${selectedApp.name} (PID: ${selectedApp.pid})`
                                                : '或者：启动新应用程序 (.exe)...'
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
                        <div className="flex flex-col min-h-0">
                            <h2 className="text-sm font-bold text-purple-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <Server size={16} /> 2. 服务器配置
                            </h2>
                            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-4">
                                <div>
                                    <label className="text-xs text-gray-500 mb-1 block font-semibold">服务器IP</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={config.serverIp}
                                            onChange={(e) => setConfig({ ...config, serverIp: e.target.value })}
                                            placeholder="192.168.2.33"
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
                                    <div className="text-xs text-gray-600 mt-1">目标应用的后端服务器地址</div>
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
                            onClick={onStart}
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
            </div>
        </div>
    );
}
