# NetShark Payload 编码修复说明

## 问题
用户报告 PAYLOAD 显示乱码，例如显示为 `哥["strUserTokenID":"1_2"]`

## 原因
1. 原代码使用 `decode('utf-8', errors='replace')` 强制解码所有数据
2. 对于非 UTF-8 编码的中文数据（如 GBK、GB2312），会出现乱码
3. 对于二进制数据，也会被错误解码为不可读字符

## 解决方案

### 1. 智能编码检测
```python
# 尝试多种编码
for encoding in ['utf-8', 'gbk', 'gb2312', 'latin-1']:
    try:
        text = payload.decode(encoding)
        # 检查可打印字符比例
        printable = sum(1 for c in text if c.isprintable() or c in '\r\n\t ')
        if printable / len(text) > 0.7:  # 70%以上可打印
            return text
    except UnicodeDecodeError:
        continue
```

### 2. 二进制数据处理
如果所有编码都失败，显示为格式化的十六进制：
```python
hex_data = payload.hex()
formatted = ' '.join(hex_data[i:i+2] for i in range(0, min(len(hex_data), 256), 2))
return f"[Binary {len(payload)}B] {formatted}..."
```

## 改进效果
- ✅ 正确显示 UTF-8 中文
- ✅ 正确显示 GBK/GB2312 中文
- ✅ 二进制数据显示为易读的十六进制
- ✅ 限制显示长度，避免界面卡顿

## 测试建议
1. 捕获包含中文的 HTTP 请求
2. 捕获包含 JSON 数据的请求
3. 捕获二进制协议（如数据库协议）
