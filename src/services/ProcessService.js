// 动态获取后端地址：使用当前访问的 hostname，端口固定为 8000
const API_BASE = `http://${window.location.hostname}:8000/api`;

// 本地操作（文件对话框、进程启动）始终使用 localhost
const LOCAL_API_BASE = 'http://localhost:8000/api';

export class ProcessService {
    static async openFileDialog() {
        try {
            const response = await fetch(`${LOCAL_API_BASE}/dialog/open-file`, { method: 'POST' });
            const data = await response.json();
            return data.path; // returns path string or empty
        } catch (e) {
            console.error(e);
            return null;
        }
    }

    static async launchProcess(path) {
        const response = await fetch(`${LOCAL_API_BASE}/process/launch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });
        return await response.json();
    }

    static async pingAgent(ip) {
        try {
            const response = await fetch(`${API_BASE}/agent/ping`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ip })
            });
            return await response.json();
        } catch (error) {
            return { error: error.message };
        }
    }

    static async listRunningProcesses() {
        try {
            // Call local Python backend
            const response = await fetch(`${API_BASE}/processes`);
            if (!response.ok) {
                throw new Error(`Backend API Error: ${response.statusText}`);
            }
            const data = await response.json();
            return data;
        } catch (error) {
            console.error("Failed to fetch processes:", error);
            // Fallback or empty list on error
            return [];
        }
    }
}
