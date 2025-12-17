import { PacketType } from '../models/types';

class CaptureEngine {
    constructor() {
        this.isActive = false;
        this.subscribers = [];
        this.websocket = null;
        this.config = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    // 配置引擎 (Hook PID, Connect Agent)
    configure(config) {
        this.config = config;
        console.log(`[Engine] Configured: Hook PID=${config.targetProcess?.pid}, Agent=${config.serverAgent}`);
    }

    // 启动抓包会话
    async start() {
        if (!this.config) throw new Error("Engine not configured");
        console.log("[Engine] Starting REAL capture pipeline...");

        // 模拟连接建立过程
        await new Promise(resolve => setTimeout(resolve, 800));

        this.isActive = true;
        this._connectWebSocket();
        return true;
    }

    // 停止抓包
    stop() {
        this.isActive = false;
        if (this.websocket) {
            // 发送停止命令
            try {
                this.websocket.send(JSON.stringify({ command: 'stop' }));
            } catch (e) {
                console.warn("Failed to send stop command:", e);
            }
            this.websocket.close();
            this.websocket = null;
        }
        console.log("[Engine] Capture stopped.");
    }

    // 订阅数据流
    onPacket(callback) {
        this.subscribers.push(callback);
    }

    // 私有：连接 WebSocket
    _connectWebSocket() {
        const sessionId = `session_${this.config.targetProcess.pid}`;
        // 动态获取 WebSocket 地址：使用当前访问的 hostname
        const wsUrl = `ws://${window.location.hostname}:8000/ws/packets/${sessionId}`;


        console.log(`[Engine] Connecting to ${wsUrl}...`);

        this.websocket = new WebSocket(wsUrl);

        this.websocket.onopen = () => {
            console.log("[Engine] WebSocket connected!");
            this.reconnectAttempts = 0;

            // 确保 WebSocket 已经完全打开
            if (this.websocket.readyState === WebSocket.OPEN) {
                // 发送启动配置
                const startConfig = {
                    targetPid: this.config.targetProcess.pid,
                    dbFilter: this.config.dbFilter,
                    serverFilter: this.config.serverIp || ""  // 服务器IP过滤
                };
                this.websocket.send(JSON.stringify(startConfig));
            } else {
                console.warn("[Engine] WebSocket not fully open, retrying in 100ms...");
                setTimeout(() => {
                    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                        const startConfig = {
                            targetPid: this.config.targetProcess.pid,
                            dbFilter: this.config.dbFilter,
                            serverFilter: this.config.serverIp || ""
                        };
                        this.websocket.send(JSON.stringify(startConfig));
                    }
                }, 100);
            }
        };

        this.websocket.onmessage = (event) => {
            try {
                const packet = JSON.parse(event.data);

                // 检查是否是错误消息
                if (packet.error) {
                    console.error("[Engine] Server error:", packet.error);
                    return;
                }

                // DEBUG: 输出完整数据包（包括TCP/HTTP层）
                console.log(`[Engine] Received packet:`, packet);

                // 通知所有订阅者
                this._notifySubscribers(packet);
            } catch (e) {
                console.error("[Engine] Failed to parse packet:", e);
            }
        };

        this.websocket.onerror = (error) => {
            console.error("[Engine] WebSocket error:", error);
        };

        this.websocket.onclose = (event) => {
            console.log("[Engine] WebSocket closed:", event.code, event.reason);

            // 如果仍处于活动状态，尝试重连
            if (this.isActive && this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
                console.log(`[Engine] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);
                setTimeout(() => this._connectWebSocket(), delay);
            }
        };
    }

    _notifySubscribers(packet) {
        this.subscribers.forEach(cb => cb(packet));
    }
}

export const engine = new CaptureEngine();
