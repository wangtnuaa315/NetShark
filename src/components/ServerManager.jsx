import React, { useState, useEffect } from 'react';
import {
    Server, Plus, Trash2, Edit2, Save, X, Lock, Unlock,
    CheckCircle2, AlertCircle, Eye, EyeOff, RefreshCw
} from 'lucide-react';

/**
 * 服务器管理页面
 * 功能：完整的服务器 CRUD 管理
 */
export default function ServerManager() {
    const [servers, setServers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editingServer, setEditingServer] = useState(null);
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [message, setMessage] = useState(null);

    // 新增/编辑表单
    const [formData, setFormData] = useState({
        name: '',
        host: '',
        port: 22,
        username: 'root',
        password: '',
        save_password: false
    });
    const [showPassword, setShowPassword] = useState(false);
    const [isTesting, setIsTesting] = useState(false);

    // 加载服务器列表
    useEffect(() => {
        loadServers();
    }, []);

    const loadServers = async () => {
        setIsLoading(true);
        try {
            const response = await fetch('http://localhost:8000/api/ssh/servers');
            const data = await response.json();
            setServers(data.servers || []);
        } catch (error) {
            setMessage({ type: 'error', text: '加载服务器列表失败' });
        } finally {
            setIsLoading(false);
        }
    };

    // 重置表单
    const resetForm = () => {
        setFormData({
            name: '',
            host: '',
            port: 22,
            username: 'root',
            password: '',
            save_password: false
        });
        setShowPassword(false);
    };

    // 打开新增对话框
    const handleAdd = () => {
        resetForm();
        setEditingServer(null);
        setShowAddDialog(true);
    };

    // 打开编辑对话框
    const handleEdit = (server) => {
        setFormData({
            name: server.name,
            host: server.host,
            port: server.port,
            username: server.username,
            password: server.password || '',
            save_password: server.has_password
        });
        setEditingServer(server);
        setShowAddDialog(true);
    };

    // 测试连接
    const handleTestConnection = async () => {
        if (!formData.host || !formData.username || !formData.password) {
            setMessage({ type: 'error', text: '请填写完整的连接信息' });
            return;
        }

        setIsTesting(true);
        try {
            const response = await fetch('http://localhost:8000/api/ssh/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    host: formData.host,
                    port: formData.port,
                    username: formData.username,
                    password: formData.password
                })
            });
            const result = await response.json();
            setMessage({
                type: result.status === 'ok' ? 'success' : 'error',
                text: result.message
            });
        } catch (error) {
            setMessage({ type: 'error', text: `连接失败: ${error.message}` });
        } finally {
            setIsTesting(false);
        }
    };

    // 保存服务器
    const handleSave = async () => {
        if (!formData.name || !formData.host || !formData.username) {
            setMessage({ type: 'error', text: '请填写名称、主机和用户名' });
            return;
        }

        try {
            if (editingServer) {
                // 编辑现有服务器 - 先删除再添加
                await fetch(`http://localhost:8000/api/ssh/servers/${editingServer.id}`, {
                    method: 'DELETE'
                });
            }

            const response = await fetch('http://localhost:8000/api/ssh/servers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const result = await response.json();
            if (result.status === 'ok') {
                setMessage({ type: 'success', text: editingServer ? '服务器已更新' : '服务器已添加' });
                setShowAddDialog(false);
                await loadServers();
            } else {
                setMessage({ type: 'error', text: result.message || '保存失败' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: `保存失败: ${error.message}` });
        }
    };

    // 删除服务器
    const handleDelete = async (serverId) => {
        if (!window.confirm('确定要删除这个服务器吗？')) return;

        try {
            const response = await fetch(`http://localhost:8000/api/ssh/servers/${serverId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                setMessage({ type: 'success', text: '服务器已删除' });
                await loadServers();
            }
        } catch (error) {
            setMessage({ type: 'error', text: `删除失败: ${error.message}` });
        }
    };

    // 自动清除消息
    useEffect(() => {
        if (message) {
            const timer = setTimeout(() => setMessage(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [message]);

    return (
        <div className="flex-1 overflow-auto bg-gray-900">
            {/* 头部 */}
            <div className="h-16 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-6">
                <div className="flex items-center gap-3">
                    <Server className="text-purple-400" size={24} />
                    <div>
                        <h1 className="text-lg font-bold text-white">服务器管理</h1>
                        <p className="text-xs text-gray-500">管理 SSH 远程服务器配置</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={loadServers}
                        className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
                    >
                        <RefreshCw size={14} />
                        刷新
                    </button>
                    <button
                        onClick={handleAdd}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded text-sm font-medium transition-colors"
                    >
                        <Plus size={16} />
                        添加服务器
                    </button>
                </div>
            </div>

            {/* 消息提示 */}
            {message && (
                <div className={`mx-6 mt-4 p-3 rounded-lg flex items-center gap-2 text-sm ${message.type === 'success'
                        ? 'bg-green-900/30 text-green-400 border border-green-500/30'
                        : 'bg-red-900/30 text-red-400 border border-red-500/30'
                    }`}>
                    {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                    {message.text}
                </div>
            )}

            {/* 服务器列表 */}
            <div className="p-6">
                {isLoading ? (
                    <div className="text-center py-12 text-gray-500">加载中...</div>
                ) : servers.length === 0 ? (
                    <div className="text-center py-12">
                        <Server className="mx-auto text-gray-600 mb-4" size={48} />
                        <p className="text-gray-400 mb-4">暂无保存的服务器</p>
                        <button
                            onClick={handleAdd}
                            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded text-sm font-medium transition-colors"
                        >
                            添加第一个服务器
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {servers.map(server => (
                            <div
                                key={server.id}
                                className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex items-center justify-between hover:border-gray-600 transition-colors"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 bg-purple-900/30 border border-purple-500/30 rounded-lg flex items-center justify-center">
                                        <Server className="text-purple-400" size={20} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-white">{server.name}</span>
                                            {server.has_password && (
                                                <span className="flex items-center gap-1 px-2 py-0.5 bg-green-900/30 border border-green-500/30 rounded text-xs text-green-400">
                                                    <Lock size={10} />
                                                    已保存密码
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-sm text-gray-400 mt-0.5">
                                            {server.username}@{server.host}:{server.port}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleEdit(server)}
                                        className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                                        title="编辑"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(server.id)}
                                        className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                                        title="删除"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* 添加/编辑对话框 */}
            {showAddDialog && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm">
                    <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-bold text-white">
                                {editingServer ? '编辑服务器' : '添加服务器'}
                            </h3>
                            <button
                                onClick={() => setShowAddDialog(false)}
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
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
                                        value={formData.host}
                                        onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                                        placeholder="192.168.1.100"
                                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-purple-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">端口</label>
                                    <input
                                        type="number"
                                        value={formData.port}
                                        onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 22 })}
                                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-purple-500 outline-none"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">用户名 *</label>
                                    <input
                                        type="text"
                                        value={formData.username}
                                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                        placeholder="root"
                                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-purple-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">密码</label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            value={formData.password}
                                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                            placeholder="••••••••"
                                            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 pr-10 text-sm text-white focus:border-purple-500 outline-none"
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

                            {/* 保存密码选项 */}
                            <label className="flex items-center gap-2 cursor-pointer p-3 bg-gray-800 rounded-lg hover:bg-gray-750 transition-colors">
                                <input
                                    type="checkbox"
                                    checked={formData.save_password}
                                    onChange={(e) => setFormData({ ...formData, save_password: e.target.checked })}
                                    className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-purple-500 focus:ring-purple-500 focus:ring-offset-0"
                                />
                                <span className="flex items-center gap-1 text-sm text-gray-300">
                                    {formData.save_password ? <Lock size={14} className="text-yellow-500" /> : <Unlock size={14} />}
                                    保存密码（加密存储）
                                </span>
                            </label>

                            {formData.save_password && (
                                <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-400 text-xs">
                                    ⚠️ 密码将以加密形式保存在服务器本地，请确保只在可信环境使用
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2 mt-6">
                            <button
                                onClick={handleTestConnection}
                                disabled={isTesting || !formData.host || !formData.password}
                                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white rounded text-sm font-medium transition-colors"
                            >
                                {isTesting ? '测试中...' : '测试连接'}
                            </button>
                            <div className="flex-1" />
                            <button
                                onClick={() => setShowAddDialog(false)}
                                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm font-medium transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={!formData.name || !formData.host || !formData.username}
                                className="px-6 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 text-white rounded text-sm font-medium transition-colors"
                            >
                                保存
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
