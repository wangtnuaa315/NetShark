/**
 * HTTPS 代理服务客户端
 * 用于控制 MITM 代理的启动/停止和订阅 HTTPS 流量
 */

// 动态获取后端地址
const API_BASE = `http://${window.location.hostname}:8000/api`;

export class HttpsProxyService {
    /**
     * 启动 HTTPS 代理
     * @param {number} port 代理端口，默认 8888
     * @returns {Promise<object>} 启动结果
     */
    static async startProxy(port = 8888) {
        try {
            const response = await fetch(`${API_BASE}/https/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ port })
            });
            return await response.json();
        } catch (error) {
            console.error('Failed to start HTTPS proxy:', error);
            return { status: 'error', message: error.message };
        }
    }

    /**
     * 停止 HTTPS 代理
     * @returns {Promise<object>} 停止结果
     */
    static async stopProxy() {
        try {
            const response = await fetch(`${API_BASE}/https/stop`, {
                method: 'POST'
            });
            return await response.json();
        } catch (error) {
            console.error('Failed to stop HTTPS proxy:', error);
            return { status: 'error', message: error.message };
        }
    }

    /**
     * 获取代理状态
     * @returns {Promise<object>} 代理状态
     */
    static async getStatus() {
        try {
            const response = await fetch(`${API_BASE}/https/status`);
            return await response.json();
        } catch (error) {
            console.error('Failed to get HTTPS proxy status:', error);
            return { running: false };
        }
    }

    /**
     * 安装 CA 证书
     * @returns {Promise<object>} 安装结果
     */
    static async installCert() {
        try {
            const response = await fetch(`${API_BASE}/https/install-cert`, {
                method: 'POST'
            });
            return await response.json();
        } catch (error) {
            console.error('Failed to install certificate:', error);
            return { status: 'error', message: error.message };
        }
    }

    /**
     * 获取证书信息
     * @returns {Promise<object>} 证书信息
     */
    static async getCertInfo() {
        try {
            const response = await fetch(`${API_BASE}/https/cert-info`);
            return await response.json();
        } catch (error) {
            console.error('Failed to get cert info:', error);
            return { exists: false, installed: false };
        }
    }

    /**
     * 生成证书
     * @returns {Promise<object>} 生成结果
     */
    static async generateCert() {
        try {
            const response = await fetch(`${API_BASE}/https/generate-cert`, {
                method: 'POST'
            });
            return await response.json();
        } catch (error) {
            console.error('Failed to generate certificate:', error);
            return { status: 'error', message: error.message };
        }
    }
}


/**
 * HTTPS 抓包引擎
 * 订阅 MITM 代理的 HTTPS 流量
 */
export class HttpsCaptureEngine {
    constructor() {
        this.isActive = false;
        this.subscribers = [];
        this.websocket = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    /**
     * 启动 HTTPS 抓包
     */
    async start() {
        console.log("[HTTPS] Starting capture...");

        // 先启动代理服务
        const result = await HttpsProxyService.startProxy();

        if (result.status === 'error') {
            throw new Error(result.message);
        }

        // 连接 WebSocket
        this.isActive = true;
        this._connectWebSocket();

        return {
            proxyUrl: result.proxy_url,
            caCert: result.ca_cert
        };
    }

    /**
     * 停止 HTTPS 抓包
     */
    async stop() {
        this.isActive = false;

        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
        }

        // 停止代理服务
        await HttpsProxyService.stopProxy();

        console.log("[HTTPS] Capture stopped");
    }

    /**
     * 订阅数据流
     * @param {function} callback 回调函数
     */
    onPacket(callback) {
        this.subscribers.push(callback);
    }

    /**
     * 清空订阅者
     */
    clearSubscribers() {
        this.subscribers = [];
    }

    /**
     * 连接 WebSocket
     * @private
     */
    _connectWebSocket() {
        const wsUrl = `ws://${window.location.hostname}:8000/ws/https`;

        console.log(`[HTTPS] Connecting to ${wsUrl}...`);

        this.websocket = new WebSocket(wsUrl);

        this.websocket.onopen = () => {
            console.log("[HTTPS] WebSocket connected!");
            this.reconnectAttempts = 0;
        };

        this.websocket.onmessage = (event) => {
            try {
                const packet = JSON.parse(event.data);
                console.log("[HTTPS] Received packet:", packet);
                this._notifySubscribers(packet);
            } catch (e) {
                console.error("[HTTPS] Failed to parse packet:", e);
            }
        };

        this.websocket.onerror = (error) => {
            console.error("[HTTPS] WebSocket error:", error);
        };

        this.websocket.onclose = (event) => {
            console.log("[HTTPS] WebSocket closed:", event.code, event.reason);

            // 如果仍处于活动状态，尝试重连
            if (this.isActive && this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
                console.log(`[HTTPS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);
                setTimeout(() => this._connectWebSocket(), delay);
            }
        };
    }

    /**
     * 通知订阅者
     * @private
     */
    _notifySubscribers(packet) {
        this.subscribers.forEach(cb => cb(packet));
    }
}

// 导出单例
export const httpsEngine = new HttpsCaptureEngine();
