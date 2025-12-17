# CA 证书目录

此目录用于存放 HTTPS 代理的 CA 证书。

## 文件说明

- `mitmproxy-ca-cert.pem` - CA 证书（PEM 格式）
- `mitmproxy-ca-cert.cer` - CA 证书（CER 格式，用于 Windows 安装）
- `mitmproxy-ca.pem` - CA 私钥 + 证书

## 安装证书

1. 双击 `mitmproxy-ca-cert.cer`
2. 选择"安装证书"
3. 选择"本地计算机"
4. 选择"将所有证书放入下列存储"
5. 浏览并选择"受信任的根证书颁发机构"
6. 完成安装

或者在 NetShark 中点击"一键安装"按钮（需要管理员权限）。
