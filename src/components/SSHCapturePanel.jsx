import React, { useState, useEffect } from 'react';
import {
    Terminal, Server, Play, Loader, CheckCircle2,
    AlertCircle, Save, Settings, Lock, Eye, EyeOff,
    Plus, Edit2, Trash2, X, RefreshCw, Square
} from 'lucide-react';

/**
 * SSH 远程抓包配置面板
 * 功能：
 * 1. 下拉选择已保存的服务器
 * 2. 服务器管理（添加/编辑/删除）
 * 3. tcpdump 参数配置
 * 4. 开始抓包
 */
export default function SSHCapturePanel({ onPacketsLoaded }) {
    // SSH 连接配置
    const [host, setHost] = useState('');
    const [port, setPort] = useState(22);
    const [username, setUsername] = useState('root');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    // 服务器管理
    const [savedServers, setSavedServers] = useState([]);
    const [selectedServerId, setSelectedServerId] = useState('');
    const [showServerManager, setShowServerManager] = useState(false);
    const [editingServer, setEditingServer] = useState(null);
    const [showServerDialog, setShowServerDialog] = useState(false);

    // 服务器表单
    const [serverForm, setServerForm] = useState({
        name: '',
        host: '',
        port: 22,
        username: 'root',
        password: '',
        save_password: false
    });

    // 抓包配置
    const [captureInterface, setCaptureInterface] = useState('any');
    const [filterExpr, setFilterExpr] = useState('');
    const [packetCount, setPacketCount] = useState(100);
    const [availableInterfaces, setAvailableInterfaces] = useState(['any']);

    // 状态
    const [isConnecting, setIsConnecting] = useState(false);
    const [isCapturing, setIsCapturing] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState(null);
    const [captureResult, setCaptureResult] = useState(null);
    const [dialogTestResult, setDialogTestResult] = useState(null); // 对话框中的测试结果

    // 加载保存的服务器列表
    useEffect(() => {
        loadServers();
    }, []);

    const loadServers = async () => {
        try {
            const response = await fetch('http://localhost:8000/api/ssh/servers');
            const data = await response.json();
            setSavedServers(data.servers || []);
        } catch (error) {
            console.error('加载服务器列表失败:', error);
        }
    };

    // 选择服务器
    const handleServerSelect = (e) => {
        const serverId = e.target.value;
        setSelectedServerId(serverId);

        console.log('[SSH] Selected server:', serverId);

        if (serverId === 'new') {
            setHost('');
            setPort(22);
            setUsername('root');
            setPassword('');
            setConnectionStatus(null);
        } else if (serverId === 'manage') {
            setShowServerManager(true);
            setSelectedServerId('');
        } else if (serverId) {
            const server = savedServers.find(s => s.id === serverId);
            console.log('[SSH] Server data:', server);
            if (server) {
                setHost(server.host);
                setPort(server.port);
                setUsername(server.username);
                setPassword(server.password || '');
                console.log('[SSH] Password loaded:', server.password ? '(有密码)' : '(无密码)');

                // 如果服务器没有保存密码，显示提示
                if (!server.has_password || !server.password) {
                    setConnectionStatus({
                        status: 'warning',
                        message: '⚠️ 该服务器未保存密码，请在下方输入密码后再测试连接'
                    });
                } else {
                    setConnectionStatus(null);
                }
            }
        }

        setCaptureResult(null);
    };

    // 打开添加服务器对话框
    const handleAddServer = () => {
        setServerForm({
            name: '',
            host: '',
            port: 22,
            username: 'root',
            password: '',
            save_password: false
        });
        setEditingServer(null);
        setShowServerDialog(true);
    };

    // 打开编辑服务器对话框
    const handleEditServer = (server) => {
        setServerForm({
            name: server.name,
            host: server.host,
            port: server.port,
            username: server.username,
            password: server.password || '',
            save_password: server.has_password
        });
        setEditingServer(server);
        setShowServerDialog(true);
    };

    // 测试连接（对话框中）
    const handleTestInDialog = async () => {
        if (!serverForm.host || !serverForm.username || !serverForm.password) {
            setDialogTestResult({ status: 'error', message: '请填写完整的连接信息' });
            return;
        }

        setIsTesting(true);
        setDialogTestResult(null);
        try {
            const response = await fetch('http://localhost:8000/api/ssh/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    host: serverForm.host,
                    port: serverForm.port,
                    username: serverForm.username,
                    password: serverForm.password
                })
            });
            const result = await response.json();
            setDialogTestResult(result);
        } catch (error) {
            setDialogTestResult({ status: 'error', message: `连接失败: ${error.message}` });
        } finally {
            setIsTesting(false);
        }
    };

    // 保存服务器
    const handleSaveServer = async () => {
        if (!serverForm.name || !serverForm.host || !serverForm.username) return;

        try {
            let response;

            if (editingServer) {
                // 更新现有服务器
                response = await fetch(`http://localhost:8000/api/ssh/servers/${editingServer.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(serverForm)
                });
            } else {
                // 添加新服务器
                response = await fetch('http://localhost:8000/api/ssh/servers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(serverForm)
                });
            }

            const result = await response.json();
            if (result.status === 'ok') {
                await loadServers();
                setShowServerDialog(false);
                setDialogTestResult(null);
                if (result.server) {
                    setSelectedServerId(result.server.id);
                    setHost(serverForm.host);
                    setPort(serverForm.port);
                    setUsername(serverForm.username);
                    setPassword(serverForm.password);
                }
            }
        } catch (error) {
            console.error('保存服务器失败:', error);
        }
    };

    // 删除服务器
    const handleDeleteServer = async (serverId, e) => {
        if (e) e.stopPropagation();
        console.log('[SSH] Delete server:', serverId);

        try {
            const response = await fetch(`http://localhost:8000/api/ssh/servers/${serverId}`, {
                method: 'DELETE'
            });
            console.log('[SSH] Delete response:', response.status);
            await loadServers();
            if (selectedServerId === serverId) {
                setSelectedServerId('');
                setHost('');
                setPort(22);
                setUsername('root');
                setPassword('');
            }
        } catch (error) {
            console.error('删除服务器失败:', error);
        }
    };

    // 测试连接
    const handleTestConnection = async () => {
        console.log('[SSH] Test connection clicked');
        console.log('[SSH] Current state:', { host, port, username, password: password ? '(有)' : '(空)' });

        if (!host || !username || !password) {
            console.log('[SSH] Missing info, showing error');
            setConnectionStatus({ status: 'error', message: '请填写完整的连接信息' });
            return;
        }

        setIsConnecting(true);
        setConnectionStatus(null);

        try {
            console.log('[SSH] Sending test request...');
            const response = await fetch('http://localhost:8000/api/ssh/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ host, port, username, password })
            });

            const result = await response.json();
            console.log('[SSH] Test result:', result);
            setConnectionStatus(result);

            if (result.status === 'ok') {
                await loadInterfaces();
            }
        } catch (error) {
            console.error('[SSH] Test error:', error);
            setConnectionStatus({ status: 'error', message: `连接失败: ${error.message}` });
        } finally {
            setIsConnecting(false);
        }
    };

    // 获取网络接口
    const loadInterfaces = async () => {
        try {
            const response = await fetch('http://localhost:8000/api/ssh/interfaces', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ host, port, username, password })
            });

            const result = await response.json();
            if (result.status === 'ok') {
                setAvailableInterfaces(result.interfaces || ['any']);
            }
        } catch (error) {
            console.error('获取网络接口失败:', error);
        }
    };

    // 快速保存当前配置
    const handleQuickSave = () => {
        setServerForm({
            name: '',
            host: host,
            port: port,
            username: username,
            password: password,
            save_password: true
        });
        setEditingServer(null);
        setShowServerDialog(true);
    };

    // 开始抓包
    const handleStartCapture = async () => {
        if (!host || !username || !password) {
            setCaptureResult({ status: 'error', message: '请先配置 SSH 连接信息' });
            return;
        }

        setIsCapturing(true);
        setCaptureResult(null);

        try {
            const response = await fetch('http://localhost:8000/api/ssh/capture', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    host,
                    port,
                    username,
                    password,
                    interface: captureInterface,
                    filter_expr: filterExpr,
                    count: packetCount
                })
            });

            const result = await response.json();

            if (result.status === 'ok') {
                setCaptureResult({
                    status: 'success',
                    message: `成功抓取 ${result.packet_count} 个数据包`
                });

                if (onPacketsLoaded && result.packets) {
                    onPacketsLoaded(result.packets, {
                        filename: `ssh_capture_${host}`,
                        packet_count: result.packet_count,
                        stream_count: result.stream_count
                    });
                }
            } else {
                const errorMsg = result.message || result.detail || `请求失败 (${response.status})`;
                setCaptureResult({ status: 'error', message: errorMsg });
            }
        } catch (error) {
            setCaptureResult({ status: 'error', message: `网络错误: ${error.message}` });
        } finally {
            setIsCapturing(false);
        }
    };

    // 停止抓包
    const handleStopCapture = async () => {
        try {
            setCaptureResult({ status: 'warning', message: '正在停止抓包...' });
            const response = await fetch('http://localhost:8000/api/ssh/stop-capture', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            const result = await response.json();
            console.log('[SSH] Stop capture result:', result);
        } catch (error) {
            console.error('[SSH] Stop capture error:', error);
        }
    };

    // 生成 tcpdump 命令预览
    const generateCommand = () => {
        let cmd = `sudo tcpdump -i ${captureInterface}`;
        if (filterExpr) cmd += ` ${filterExpr}`;
        if (packetCount > 0) cmd += ` -c ${packetCount}`;
        cmd += ' -w output.pcap';
        return cmd;
    };

    return (
        <div className="flex-1 overflow-auto p-4">
            <div className="max-w-3xl mx-auto space-y-3">

                {/* SSH 连接配置 */}
                <div className="bg-gray-800/50 rounded-lg p-3">
                    <h3 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
                        <Terminal size={14} />
                        SSH 连接配置
                    </h3>

                    {/* 服务器选择器 */}
                    <div className="mb-2">
                        <label className="block text-xs text-gray-500 mb-1">选择服务器</label>
                        <div className="flex gap-2">
                            <select
                                value={selectedServerId}
                                onChange={handleServerSelect}
                                className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-purple-500 outline-none"
                            >
                                <option value="">-- 选择已保存的服务器 --</option>
                                {savedServers.map(server => (
                                    <option key={server.id} value={server.id}>
                                        {server.name} ({server.username}@{server.host})
                                        {server.has_password ? ' 🔒' : ''}
                                    </option>
                                ))}
                                <option value="new">➕ 手动输入新服务器...</option>
                                <option value="manage">⚙️ 管理服务器...</option>
                            </select>
                            {host && (
                                <button
                                    onClick={handleQuickSave}
                                    className="flex items-center gap-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
                                    title="保存为新服务器"
                                >
                                    <Save size={14} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* 连接详情 */}
                    <div className="grid grid-cols-4 gap-2">
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">主机地址</label>
                            <input
                                type="text"
                                value={host}
                                onChange={(e) => { setHost(e.target.value); setSelectedServerId('new'); }}
                                placeholder="192.168.1.100"
                                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-purple-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">端口</label>
                            <input
                                type="number"
                                value={port}
                                onChange={(e) => setPort(parseInt(e.target.value) || 22)}
                                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-purple-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">用户名</label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="root"
                                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-purple-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">密码</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 pr-10 text-sm text-white focus:border-purple-500 outline-none"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                                >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-2 mt-2">
                        <button
                            onClick={handleTestConnection}
                            disabled={isConnecting || !host || !password}
                            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 text-white rounded text-sm font-medium transition-colors"
                        >
                            {isConnecting ? <Loader size={14} className="animate-spin" /> : <Terminal size={14} />}
                            测试连接
                        </button>
                    </div>

                    {/* 连接状态 */}
                    {connectionStatus && (
                        <div className={`mt-3 p-3 rounded-lg flex items-center gap-2 text-sm ${connectionStatus.status === 'ok'
                            ? 'bg-green-900/30 text-green-400 border border-green-500/30'
                            : connectionStatus.status === 'warning'
                                ? 'bg-yellow-900/30 text-yellow-400 border border-yellow-500/30'
                                : 'bg-red-900/30 text-red-400 border border-red-500/30'
                            }`}>
                            {connectionStatus.status === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                            {connectionStatus.message}
                        </div>
                    )}
                </div>

                {/* 抓包配置 */}
                <div className="bg-gray-800/50 rounded-lg p-3">
                    <h3 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
                        <Settings size={14} />
                        抓包配置
                    </h3>

                    <div className="grid grid-cols-3 gap-2">
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">网络接口</label>
                            <select
                                value={captureInterface}
                                onChange={(e) => setCaptureInterface(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-purple-500 outline-none"
                            >
                                {availableInterfaces.map(iface => (
                                    <option key={iface} value={iface}>{iface}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">包数量</label>
                            <input
                                type="number"
                                value={packetCount}
                                onChange={(e) => setPacketCount(parseInt(e.target.value) || 0)}
                                placeholder="100"
                                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-purple-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">过滤条件 <span className="text-gray-600">(可直接输入端口号)</span></label>
                            <input
                                type="text"
                                value={filterExpr}
                                onChange={(e) => setFilterExpr(e.target.value)}
                                placeholder="8080 或 port 80 or host 192.168.1.1"
                                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-purple-500 outline-none"
                            />
                        </div>
                    </div>

                    {/* 命令预览 */}
                    <div className="mt-2 bg-black/30 rounded p-2">
                        <div className="text-xs text-gray-500">命令: <span className="font-mono text-green-400">{generateCommand()}</span></div>
                    </div>
                </div>

                {/* 开始/停止抓包按钮 */}
                <div className="flex gap-2">
                    <button
                        onClick={handleStartCapture}
                        disabled={isCapturing || !host || !password}
                        className={`flex-1 py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all ${isCapturing
                            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                            : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white shadow-lg disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500'
                            }`}
                    >
                        {isCapturing ? (
                            <>
                                <Loader size={18} className="animate-spin" />
                                正在抓包...
                            </>
                        ) : (
                            <>
                                <Play size={18} />
                                开始远程抓包
                            </>
                        )}
                    </button>

                    {isCapturing && (
                        <button
                            onClick={handleStopCapture}
                            className="px-6 py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white transition-all"
                        >
                            <Square size={16} />
                            停止
                        </button>
                    )}
                </div>

                {/* 抓包结果 */}
                {captureResult && (
                    <div className={`p-4 rounded-lg flex items-start gap-3 ${captureResult.status === 'success'
                        ? 'bg-green-900/20 border border-green-500/30'
                        : 'bg-red-900/20 border border-red-500/30'
                        }`}>
                        {captureResult.status === 'success' ? (
                            <CheckCircle2 className="text-green-500 flex-shrink-0" size={20} />
                        ) : (
                            <AlertCircle className="text-red-500 flex-shrink-0" size={20} />
                        )}
                        <div className={captureResult.status === 'success' ? 'text-green-400' : 'text-red-400'}>
                            {captureResult.message}
                        </div>
                    </div>
                )}

                {/* 服务器管理弹窗 */}
                {showServerManager && (
                    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm">
                        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-2xl w-full mx-4 shadow-2xl max-h-[80vh] overflow-hidden flex flex-col">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Server size={20} />
                                    服务器管理
                                </h3>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={loadServers}
                                        className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
                                        title="刷新"
                                    >
                                        <RefreshCw size={16} />
                                    </button>
                                    <button
                                        onClick={handleAddServer}
                                        className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-sm"
                                    >
                                        <Plus size={14} />
                                        添加
                                    </button>
                                    <button
                                        onClick={() => setShowServerManager(false)}
                                        className="p-2 text-gray-400 hover:text-white"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-auto">
                                {savedServers.length === 0 ? (
                                    <div className="text-center py-8 text-gray-500">
                                        暂无保存的服务器
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {savedServers.map(server => (
                                            <div
                                                key={server.id}
                                                className="bg-gray-800 border border-gray-700 rounded-lg p-3 flex items-center justify-between hover:border-gray-600"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <Server className="text-purple-400" size={18} />
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-medium text-white text-sm">{server.name}</span>
                                                            {server.has_password && (
                                                                <span className="text-xs text-green-400 flex items-center gap-1">
                                                                    <Lock size={10} />
                                                                    密码已保存
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-gray-500">{server.username}@{server.host}:{server.port}</div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => handleEditServer(server)}
                                                        className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
                                                        title="编辑"
                                                    >
                                                        <Edit2 size={14} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => handleDeleteServer(server.id, e)}
                                                        className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded"
                                                        title="删除"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* 添加/编辑服务器对话框 */}
                {showServerDialog && (
                    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] backdrop-blur-sm">
                        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-white">
                                    {editingServer ? '编辑服务器' : '添加服务器'}
                                </h3>
                                <button
                                    onClick={() => setShowServerDialog(false)}
                                    className="text-gray-500 hover:text-white"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">服务器名称 *</label>
                                    <input
                                        type="text"
                                        value={serverForm.name}
                                        onChange={(e) => setServerForm({ ...serverForm, name: e.target.value })}
                                        placeholder="例如: 生产服务器"
                                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-purple-500 outline-none"
                                        autoFocus
                                    />
                                </div>

                                <div className="grid grid-cols-3 gap-3">
                                    <div className="col-span-2">
                                        <label className="block text-xs text-gray-500 mb-1">主机地址 *</label>
                                        <input
                                            type="text"
                                            value={serverForm.host}
                                            onChange={(e) => setServerForm({ ...serverForm, host: e.target.value })}
                                            placeholder="192.168.1.100"
                                            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-purple-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">端口</label>
                                        <input
                                            type="number"
                                            value={serverForm.port}
                                            onChange={(e) => setServerForm({ ...serverForm, port: parseInt(e.target.value) || 22 })}
                                            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-purple-500 outline-none"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">用户名 *</label>
                                        <input
                                            type="text"
                                            value={serverForm.username}
                                            onChange={(e) => setServerForm({ ...serverForm, username: e.target.value })}
                                            placeholder="root"
                                            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-purple-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">密码</label>
                                        <input
                                            type="password"
                                            value={serverForm.password}
                                            onChange={(e) => setServerForm({ ...serverForm, password: e.target.value })}
                                            placeholder="••••••••"
                                            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-purple-500 outline-none"
                                        />
                                    </div>
                                </div>

                                <label className="flex items-center gap-2 cursor-pointer p-3 bg-gray-800 rounded-lg">
                                    <input
                                        type="checkbox"
                                        checked={serverForm.save_password}
                                        onChange={(e) => setServerForm({ ...serverForm, save_password: e.target.checked })}
                                        className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-purple-500"
                                    />
                                    <span className="text-sm text-gray-300 flex items-center gap-1">
                                        <Lock size={14} className={serverForm.save_password ? 'text-yellow-500' : 'text-gray-500'} />
                                        保存密码（加密存储）
                                    </span>
                                </label>

                                {serverForm.save_password && (
                                    <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded text-yellow-400 text-xs">
                                        ⚠️ 密码将以加密形式保存，请确保在可信环境使用
                                    </div>
                                )}
                            </div>

                            {/* 对话框中的测试结果 */}
                            {dialogTestResult && (
                                <div className={`p-3 rounded-lg flex items-center gap-2 text-sm ${dialogTestResult.status === 'ok'
                                    ? 'bg-green-900/30 text-green-400 border border-green-500/30'
                                    : 'bg-red-900/30 text-red-400 border border-red-500/30'
                                    }`}>
                                    {dialogTestResult.status === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                                    {dialogTestResult.message}
                                </div>
                            )}

                            <div className="flex gap-2 mt-4">
                                <button
                                    onClick={handleTestInDialog}
                                    disabled={isTesting || !serverForm.host || !serverForm.password}
                                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white rounded text-sm"
                                >
                                    {isTesting ? '测试中...' : '测试连接'}
                                </button>
                                <div className="flex-1" />
                                <button
                                    onClick={() => { setShowServerDialog(false); setDialogTestResult(null); }}
                                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={handleSaveServer}
                                    disabled={!serverForm.name || !serverForm.host || !serverForm.username}
                                    className="px-6 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 text-white rounded text-sm font-medium"
                                >
                                    保存
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
