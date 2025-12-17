import React from 'react';
import { Settings, Monitor, Server, Database } from 'lucide-react';

export default function Sidebar({ config, activeView, setActiveView, onConfig }) {
    const NavItem = ({ icon, active, label, onClick }) => (
        <div
            onClick={onClick}
            className={`p-3 my-2 rounded-xl cursor-pointer transition-all relative group flex justify-center w-10 h-10 items-center
        ${active ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50 scale-110' : 'text-gray-500 hover:bg-gray-800 hover:text-gray-200'}
      `}
        >
            {icon}
            <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-gray-800 text-white text-xs px-3 py-2 rounded border border-gray-700 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 shadow-xl">
                {label}
                <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-gray-800 border-l border-b border-gray-700 transform rotate-45"></div>
            </div>
        </div>
    );

    return (
        <div className="w-16 bg-gray-950 flex flex-col items-center py-4 border-r border-gray-800 z-20 shrink-0">
            <div className="p-2 bg-blue-600 rounded-lg mb-6 shadow-lg shadow-blue-900/50 cursor-pointer hover:bg-blue-500 transition-colors" onClick={onConfig} title="Config">
                <Settings size={24} className="text-white" />
            </div>

            <NavItem
                icon={<Monitor />}
                label="应用"
                active={activeView === 'client'}
                onClick={() => setActiveView('client')}
            />
            <NavItem
                icon={<Server />}
                label="远程服务器"
                active={activeView === 'server'}
                onClick={() => setActiveView('server')}
            />
            <NavItem
                icon={<Database />}
                label="数据库"
                active={activeView === 'db'}
                onClick={() => setActiveView('db')}
            />

            <div className="mt-auto flex flex-col gap-4">
                <div className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-900 border border-gray-800 text-[10px] font-bold text-green-500 cursor-help" title={`Hooked PID: ${config.targetProcess?.pid}`}>
                    {config.targetProcess?.pid || '--'}
                </div>
            </div>
        </div>
    );
}
