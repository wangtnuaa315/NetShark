import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, Pause, Trash2, Search, Activity, Server, Monitor, 
  Database, ChevronRight, ChevronDown, X, Copy, Terminal, 
  Cloud, Box, CheckCircle2, AlertCircle, Cpu, Cable,
  Settings, Save, Plus, RefreshCw, Power, Zap
} from 'lucide-react';

/**
 * =================================================================
 * LAYER 1: DOMAIN MODELS & TYPES (领域模型)
 * 在真实项目中，这些通常定义在 *.d.ts 文件中
 * =================================================================
 */

// 数据包结构定义
const PacketType = {
  CLIENT: 'client',
  SERVER: 'server', 
  DB: 'db'
};

// 模拟 Windows 进程对象
class WinProcess {
  constructor(pid, name, title, cpu, icon) {
    this.pid = pid;
    this.name = name;
    this.title = title;
    this.cpu = cpu;
    this.icon = icon;
  }
}

/**
 * =================================================================
 * LAYER 2: INFRASTRUCTURE & MOCK SERVICES (基础设施层)
 * 负责与底层（C++ Driver / Linux Agent）通信
 * =================================================================
 */

// 1. ProcessService: 模拟调用 Windows API (EnumProcesses)
class ProcessService {
  static async listRunningProcesses() {
    // 模拟异步 API 调用延迟
    await new Promise(resolve => setTimeout(resolve, 600));
    
    return [
      new WinProcess(14022, 'chrome.exe', 'Google Chrome', '1.2%', 'Globe'),
      new WinProcess(8892, 'TradeClient_Debug.exe', 'Trade Terminal (Debug)', '4.5%', 'TrendingUp'),
      new WinProcess(4421, 'WeChat.exe', 'WeChat', '0.1%', 'MessageSquare'),
      new WinProcess(1024, 'java.exe', 'IntelliJ IDEA Backend', '12.0%', 'Coffee'),
      new WinProcess(5566, 'node.exe', 'Local Web Server', '0.8%', 'Hexagon'),
      new WinProcess(9921, 'python.exe', 'Data Analysis Script', '15.2%', 'Terminal'),
    ];
  }
}

// 2. CaptureEngine: 核心抓包引擎 (模拟 Npcap + eBPF Stream)
class CaptureEngine {
  constructor() {
    this.isActive = false;
    this.subscribers = [];
    this.intervalId = null;
    this.config = null;
  }

  // 配置引擎 (Hook PID, Connect Agent)
  configure(config) {
    this.config = config;
    console.log(`[Engine] Configured: Hook PID=${config.targetProcess?.pid}, Agent=${config.serverAgent}`);
  }

  // 启动抓包会话
  async start() {
    if (!this.config) throw new Error("Engine not configured");
    console.log("[Engine] Starting capture pipeline...");
    
    // 模拟连接建立过程
    await new Promise(resolve => setTimeout(resolve, 800));
    
    this.isActive = true;
    this._startDataStream();
    return true;
  }

  // 停止抓包
  stop() {
    this.isActive = false;
    if (this.intervalId) clearInterval(this.intervalId);
    console.log("[Engine] Capture stopped.");
  }

  // 订阅数据流
  onPacket(callback) {
    this.subscribers.push(callback);
  }

  // 私有：模拟数据生成流 (在真实App中，这里会通过 WebSocket 或 IPC 接收数据)
  _startDataStream() {
    const MOCK_METHODS = ['GET', 'POST', 'PUT', 'GRPC', 'SQL'];
    const MOCK_PATHS = ['/order/submit', '/market/data', '/user/auth', 'SELECT * FROM users', 'UPDATE account SET balance...'];

    this.intervalId = setInterval(() => {
      if (!this.isActive) return;

      const traceId = `trc_${Math.floor(Math.random() * 100000).toString(16)}`;
      const path = MOCK_PATHS[Math.floor(Math.random() * MOCK_PATHS.length)];
      const isDb = path.includes('SELECT') || path.includes('UPDATE');
      const method = isDb ? 'SQL' : MOCK_METHODS[Math.floor(Math.random() * (MOCK_METHODS.length - 1))];

      // 模拟根据配置生成源/目标IP
      const sourceName = 'WinClient'; // 简化逻辑
      
      const packet = {
        id: Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        source: this.config.targetProcess?.name || 'Unknown',
        sourceIP: '127.0.0.1',
        destination: isDb ? 'DB-Cluster' : 'Gateway',
        method: method,
        path: path,
        status: 200,
        latency: Math.floor(Math.random() * 50) + 'ms',
        size: Math.floor(Math.random() * 2000) + 'B',
        traceId,
        // 关键逻辑：由引擎判断数据包类型
        category: isDb ? PacketType.DB : 'client', 
        body: isDb ? `/* Filter: ${this.config.dbFilter} */\n${path}` : JSON.stringify({ pid: this.config.targetProcess?.pid, traceId }, null, 2)
      };

      // 还要模拟偶尔收到的服务端包
      if (Math.random() > 0.6) {
         const serverPacket = { ...packet, id: Date.now() + 1, source: `Agent(${this.config.serverAgent})`, sourceIP: this.config.serverAgent, category: PacketType.SERVER };
         this._notifySubscribers(serverPacket);
      }
      
      this._notifySubscribers(packet);

    }, 800);
  }

  _notifySubscribers(packet) {
    this.subscribers.forEach(cb => cb(packet));
  }
}

// 单例模式：整个应用共享一个抓包引擎实例
const engine = new CaptureEngine();

/**
 * =================================================================
 * LAYER 3: VIEW COMPONENTS (UI层)
 * 只负责展示和用户交互，逻辑委托给 Engine
 * =================================================================
 */

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
    serverAgent: '192.168.1.100',
    dbFilter: '3306, 6379',
    connectionState: 'idle' // idle, connecting, connected
  });

  // 进程列表 (异步加载)
  const [processList, setProcessList] = useState([]);
  const [isLoadingProcesses, setIsLoadingProcesses] = useState(false);

  const listRef = useRef(null);

  // 初始化：订阅引擎数据
  useEffect(() => {
    engine.onPacket((packet) => {
      setPackets(prev => {
        const newBuffer = [...prev, packet];
        if (newBuffer.length > 500) newBuffer.shift(); // 限制内存占用
        return newBuffer;
      });
      
      // 自动滚动
      if (listRef.current) {
         // 简单的自动滚动逻辑 (实际开发需更复杂判断)
         listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    });
  }, []);

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
      // 1. 配置引擎
      engine.configure(config);
      // 2. 启动引擎 (包含握手)
      await engine.start();
      
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
    } else {
      engine.start().catch(console.error); // 简化处理
    }
    setIsCapturing(!isCapturing);
  };

  // 动作：清空
  const clearPackets = () => {
    setPackets([]);
    setSelectedPacket(null);
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
        setActiveView={setActiveView} 
        onConfig={() => {
          engine.stop();
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

// ================= SUB-COMPONENTS (UI Modules) =================

function ConfigScreen({ config, setConfig, processList, isLoadingProcesses, onRefresh, onStart }) {
  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 font-sans items-center justify-center p-8">
      <div className="w-full max-w-4xl bg-gray-950 border border-gray-800 rounded-xl shadow-2xl overflow-hidden flex flex-col h-[600px]">
        {/* Header */}
        <div className="p-6 border-b border-gray-800 bg-gray-900/50 flex justify-between items-center">
           <div>
             <h1 className="text-2xl font-bold text-white flex items-center gap-3">
               <Activity className="text-blue-500" />
               New Capture Session
             </h1>
             <p className="text-gray-500 mt-2 text-sm">Select a local process to hook and configure remote agents.</p>
           </div>
           <div className="text-right">
             <div className="text-xs text-gray-600 font-mono">NetShark v4.0.1</div>
           </div>
        </div>

        <div className="flex-1 flex p-6 gap-8 overflow-hidden">
          {/* Column 1: Process Selection */}
          <div className="flex-1 flex flex-col min-h-0">
             <div className="flex items-center justify-between mb-4 shrink-0">
                <h2 className="text-sm font-bold text-blue-400 uppercase tracking-wider flex items-center gap-2">
                  <Monitor size={16}/> 1. Target Process
                </h2>
                <button 
                  onClick={onRefresh}
                  className="text-xs text-gray-500 hover:text-white flex items-center gap-1 hover:bg-gray-800 px-2 py-1 rounded transition-colors"
                >
                  <RefreshCw size={12} className={isLoadingProcesses ? 'animate-spin' : ''}/> Refresh
                </button>
             </div>
             
             <div className="flex-1 bg-gray-900 border border-gray-800 rounded-lg overflow-hidden flex flex-col">
                <div className="p-2 border-b border-gray-800 shrink-0">
                  <div className="relative">
                    <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-600"/>
                    <input type="text" placeholder="Filter processes..." className="w-full bg-gray-950 text-sm text-gray-300 outline-none rounded pl-8 py-1.5 focus:bg-black transition-colors"/>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-gray-700">
                  {isLoadingProcesses ? (
                    <div className="flex justify-center items-center h-20 text-gray-600 text-xs">Scanning process table...</div>
                  ) : (
                    processList.map(proc => (
                      <div 
                        key={proc.pid}
                        onClick={() => setConfig({...config, targetProcess: proc})}
                        className={`p-3 rounded cursor-pointer border flex items-center justify-between transition-all group
                          ${config.targetProcess?.pid === proc.pid 
                            ? 'bg-blue-600/20 border-blue-500/50' 
                            : 'bg-transparent border-transparent hover:bg-gray-800'}
                        `}
                      >
                         <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded bg-gray-800 flex items-center justify-center text-gray-400 group-hover:text-white transition-colors`}>
                               {/* Mock Icon mapping */}
                               <Cpu size={16}/>
                            </div>
                            <div>
                               <div className="text-sm font-medium text-gray-200">{proc.name}</div>
                               <div className="text-xs text-gray-500 group-hover:text-gray-400">{proc.title}</div>
                            </div>
                         </div>
                         <div className="text-right">
                            <div className="text-xs font-mono text-gray-500 group-hover:text-gray-300">#{proc.pid}</div>
                         </div>
                      </div>
                    ))
                  )}
                </div>
             </div>
          </div>

          {/* Column 2: Remote Config */}
          <div className="flex-1 flex flex-col min-h-0">
             <div className="mb-6">
                <h2 className="text-sm font-bold text-purple-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Server size={16}/> 2. Remote Agent
                </h2>
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-4">
                   <div>
                      <label className="text-xs text-gray-500 mb-1 block font-semibold">Agent IP / Hostname</label>
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          value={config.serverAgent}
                          onChange={(e) => setConfig({...config, serverAgent: e.target.value})}
                          className="flex-1 bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-purple-500 outline-none font-mono"
                        />
                        <button className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded text-xs border border-gray-700 font-medium">Ping</button>
                      </div>
                   </div>
                   <div className="flex items-center gap-2 text-xs text-green-500 bg-green-500/10 p-2 rounded border border-green-500/20">
                      <CheckCircle2 size={12}/> 
                      <span>eBPF Driver Compatible (Kernel 5.4+)</span>
                   </div>
                </div>
             </div>

             <div>
                <h2 className="text-sm font-bold text-yellow-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Database size={16}/> 3. Protocol Filter
                </h2>
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                   <div>
                      <label className="text-xs text-gray-500 mb-1 block font-semibold">Database Ports</label>
                      <input 
                        type="text" 
                        value={config.dbFilter}
                        onChange={(e) => setConfig({...config, dbFilter: e.target.value})}
                        className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-yellow-500 outline-none font-mono"
                        placeholder="e.g. 3306, 6379, 5432"
                      />
                      <p className="text-[10px] text-gray-600 mt-2">Packets on these ports will be tagged as 'DB' and parsed via binary protocol analyzers.</p>
                   </div>
                </div>
             </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-800 bg-gray-900/50 flex justify-between items-center shrink-0">
           <div className="text-xs text-gray-500 flex items-center gap-2">
              <Zap size={12}/>
              {config.targetProcess ? `Targeting: ${config.targetProcess.name}` : 'Select a process to proceed'}
           </div>
           <div className="flex gap-3">
              <button className="px-6 py-2 rounded text-gray-400 hover:text-white font-medium text-sm transition-colors">Cancel</button>
              <button 
                onClick={onStart}
                disabled={!config.targetProcess || config.connectionState === 'connecting'}
                className={`px-6 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-900/20 flex items-center gap-2 transition-all
                  ${(!config.targetProcess || config.connectionState === 'connecting') ? 'opacity-50 cursor-not-allowed grayscale' : ''}
                `}
              >
                {config.connectionState === 'connecting' ? 'Initializing...' : 'Start Session'}
                {config.connectionState !== 'connecting' && <ChevronRight size={16}/>}
              </button>
           </div>
        </div>
      </div>
    </div>
  );
}

function Sidebar({ config, activeView, setActiveView, onConfig }) {
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
        label="Application"
        active={activeView === 'client'} 
        onClick={() => setActiveView('client')}
      />
      <NavItem 
        icon={<Server />} 
        label="Remote Server" 
        active={activeView === 'server'} 
        onClick={() => setActiveView('server')}
      />
      <NavItem 
        icon={<Database />} 
        label="Database"
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

function TopBar({ config, isCapturing, onToggle, onClear, onDisconnect, filterText, setFilterText }) {
  return (
    <div className="h-16 bg-gray-800 border-b border-gray-700 flex items-center px-4 justify-between shrink-0">
      <div className="flex items-center gap-4">
        {/* Info Blocks */}
        <div className="flex flex-col">
           <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-0.5">Application</label>
           <div className="flex items-center gap-2 text-sm font-bold text-gray-200">
              <Box size={14} className="text-blue-400"/>
              <span>{config.targetProcess?.name}</span>
              <span className="text-xs text-gray-500 font-normal border border-gray-600 px-1 rounded bg-gray-700">PID {config.targetProcess?.pid}</span>
           </div>
        </div>
        <div className="h-8 w-px bg-gray-700 mx-2"></div>
        <div className="flex flex-col">
           <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-0.5">Agent</label>
           <div className="flex items-center gap-2 text-sm text-gray-300">
              <Cloud size={14} className="text-purple-400"/>
              <span className="font-mono">{config.serverAgent}</span>
              <div className="w-2 h-2 rounded-full bg-green-500 ml-1 animate-pulse"></div>
           </div>
        </div>
        <div className="h-8 w-px bg-gray-700 mx-2"></div>

        {/* Controls */}
        <button 
          onClick={onToggle}
          className={`flex items-center gap-2 px-4 py-2 rounded shadow-sm text-sm font-bold transition-all ${isCapturing ? 'bg-red-500/10 text-red-400 border border-red-500/50 hover:bg-red-500/20' : 'bg-green-600 text-white hover:bg-green-500 shadow-green-900/20'}`}
        >
          {isCapturing ? <><Pause size={16} fill="currentColor" /> PAUSE</> : <><Play size={16} fill="currentColor" /> RESUME</>}
        </button>
        <button onClick={onClear} className="p-2 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors">
          <Trash2 size={18} />
        </button>
      </div>

      <div className="flex items-center gap-3">
         <div className="relative">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500"/>
            <input 
              type="text" 
              placeholder="Filter packets..." 
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="bg-gray-900 border border-gray-600 rounded pl-8 py-1.5 text-xs text-gray-300 w-48 focus:border-blue-500 outline-none"
            />
         </div>
         <button 
            onClick={onDisconnect}
            className="flex items-center gap-2 px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-xs text-gray-200 border border-gray-600 transition-colors"
         >
            <Power size={12}/> Disconnect
         </button>
      </div>
    </div>
  );
}

function PacketList({ packets, selectedId, onSelect, listRef, isWaiting, activeView }) {
  const getMethodColor = (method) => {
    if (method.includes('GET')) return 'text-green-400';
    if (method.includes('POST')) return 'text-blue-400';
    if (method.includes('DB') || method.includes('SQL')) return 'text-yellow-400';
    return 'text-purple-400';
  };

  return (
    <div className="w-1/2 flex flex-col border-r border-gray-700 transition-all duration-300 bg-gray-900">
      {/* Table Header */}
      <div className="grid grid-cols-12 bg-gray-800/80 backdrop-blur-sm text-gray-400 text-xs font-semibold py-2 px-4 border-b border-gray-700 select-none sticky top-0 z-10">
        <div className="col-span-2">Time</div>
        <div className="col-span-3">Source</div>
        <div className="col-span-1">Method</div>
        <div className="col-span-4">Path</div>
        <div className="col-span-1">Size</div>
        <div className="col-span-1 text-right">Latency</div>
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
              <div className="col-span-2 font-mono opacity-70">{pkt.timestamp}</div>
              <div className="col-span-3 flex flex-col truncate pr-2">
                 <span className={`font-medium ${pkt.category === PacketType.CLIENT ? 'text-blue-300' : (pkt.category === PacketType.SERVER ? 'text-purple-300' : 'text-yellow-300')}`}>{pkt.source}</span>
                 <span className="text-[9px] text-gray-500 font-mono">{pkt.sourceIP}</span>
              </div>
              <div className={`col-span-1 font-bold ${getMethodColor(pkt.method)}`}>{pkt.method}</div>
              <div className="col-span-4 truncate font-mono text-gray-400" title={pkt.path}>
                {pkt.path}
              </div>
              <div className="col-span-1 text-gray-500">{pkt.size}</div>
              <div className="col-span-1 text-right text-gray-500 font-mono">{pkt.latency}</div>
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

function PacketDetail({ packet, onClose, config }) {
  const [activeTab, setActiveTab] = useState('headers');

  return (
    <div className="w-1/2 flex flex-col bg-gray-900 h-full border-l border-black shadow-2xl animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="h-12 bg-gray-800 border-b border-gray-700 flex items-center px-4 justify-between shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
           <div className="flex flex-col">
              <span className="text-[10px] text-gray-500 uppercase font-bold">Trace Context</span>
              <span className="text-sm text-gray-200 truncate font-mono max-w-[200px]">{packet.path}</span>
           </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={16}/></button>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-800 border-b border-gray-700 shrink-0">
         {['headers', 'payload', 'hex'].map(tab => (
           <button 
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-blue-500 text-blue-400 bg-gray-700/50' : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-700/30'}`}
           >
             {tab.toUpperCase()}
           </button>
         ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 bg-[#0d1117] font-mono text-sm">
        {activeTab === 'headers' && (
          <div className="space-y-4">
            <div className="border border-gray-700 rounded bg-gray-800/20 p-3 space-y-2">
              <div className="text-xs font-bold text-gray-400 mb-2 border-b border-gray-700 pb-1">General</div>
              <DetailRow label="Hooked PID" value={config.targetProcess.pid} highlight />
              <DetailRow label="Packet Source" value={packet.source} />
              <DetailRow label="Remote Agent" value={config.serverAgent} />
            </div>
            
            <div className="border border-gray-700 rounded bg-gray-800/20 p-3 space-y-2">
              <div className="text-xs font-bold text-gray-400 mb-2 border-b border-gray-700 pb-1">Headers</div>
               <DetailRow label="Method" value={packet.method} />
               <DetailRow label="Source IP" value={packet.sourceIP} />
               <DetailRow label="Trace-ID" value={packet.traceId} />
            </div>
          </div>
        )}

        {activeTab === 'payload' && (
          <div className="text-gray-300 whitespace-pre-wrap break-all leading-relaxed p-2">
            {packet.body}
          </div>
        )}
        
        {activeTab === 'hex' && (
          <div className="text-gray-400 text-xs p-2">
             {packet.body.split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ')}...
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value, highlight }) {
  return (
    <div className="grid grid-cols-[100px_1fr] text-xs gap-2 items-start">
      <div className="text-gray-500 mt-0.5">{label}:</div>
      <div className={`font-mono break-all leading-relaxed ${highlight ? 'text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded -ml-1 w-fit' : 'text-gray-300'}`}>
        {value}
      </div>
    </div>
  );
}