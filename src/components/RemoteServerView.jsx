import React from 'react';
import { Terminal, CheckCircle2 } from 'lucide-react';

/**
 * 远程服务器视图组件
 * 功能：SSH 远程抓包（开发中）
 */
export default function RemoteServerView() {
    return (
        <div className="flex-1 flex flex-col bg-gray-900">
            {/* 顶部标题栏 */}
            <div className="bg-gray-800 border-b border-gray-700 py-3 px-6">
                <div className="flex items-center gap-2 text-blue-400">
                    <Terminal size={18} />
                    <span className="font-semibold">SSH 远程抓包</span>
                    <span className="text-[10px] text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded ml-2">开发中</span>
                </div>
            </div>

            {/* 内容区域 */}
            <div className="flex-1 overflow-auto p-6">
                <div className="max-w-2xl mx-auto">
                    <div className="text-center py-16">
                        <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Terminal size={40} className="text-gray-600" />
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">SSH 远程抓包</h2>
                        <p className="text-gray-400 text-sm mb-6">
                            通过 SSH 连接远程服务器，一键执行 tcpdump 并实时查看数据
                        </p>
                        <div className="inline-block bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-2">
                            <span className="text-yellow-500 text-sm">🚧 此功能正在开发中，敬请期待</span>
                        </div>
                    </div>

                    {/* 功能预览 */}
                    <div className="bg-gray-800/50 rounded-lg p-6 mt-8">
                        <h3 className="text-sm font-semibold text-gray-300 mb-4">功能预览</h3>
                        <ul className="space-y-3 text-sm text-gray-400">
                            <li className="flex items-center gap-2">
                                <CheckCircle2 size={14} className="text-gray-600" />
                                SSH 连接（支持密码和密钥认证）
                            </li>
                            <li className="flex items-center gap-2">
                                <CheckCircle2 size={14} className="text-gray-600" />
                                可视化配置 tcpdump 参数
                            </li>
                            <li className="flex items-center gap-2">
                                <CheckCircle2 size={14} className="text-gray-600" />
                                实时流式传输数据包
                            </li>
                            <li className="flex items-center gap-2">
                                <CheckCircle2 size={14} className="text-gray-600" />
                                自动保存抓包历史
                            </li>
                        </ul>
                    </div>

                    {/* tcpdump 命令示例 */}
                    <div className="mt-8 bg-gray-800/50 rounded-lg p-4">
                        <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                            <Terminal size={14} />
                            常用 tcpdump 命令
                        </h3>
                        <div className="space-y-3 text-sm">
                            <div className="bg-black/30 rounded p-3 font-mono text-xs text-gray-400">
                                <div className="text-gray-500 mb-1"># 抓取指定端口的流量（如 HTTP 80端口）</div>
                                <div className="text-green-400">$ sudo tcpdump -i any port 80 -w output.pcap</div>
                            </div>
                            <div className="bg-black/30 rounded p-3 font-mono text-xs text-gray-400">
                                <div className="text-gray-500 mb-1"># 抓取指定 IP 的流量</div>
                                <div className="text-green-400">$ sudo tcpdump -i any host 192.168.1.100 -w output.pcap</div>
                            </div>
                            <div className="bg-black/30 rounded p-3 font-mono text-xs text-gray-400">
                                <div className="text-gray-500 mb-1"># 抓取 100 个数据包后停止</div>
                                <div className="text-green-400">$ sudo tcpdump -i any -c 100 -w output.pcap</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
