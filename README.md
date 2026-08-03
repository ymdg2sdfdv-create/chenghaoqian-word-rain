# 陈浩谦 · 单词轰炸早读系统

独立早读工具，脱离课件系统单独运行。

## 核心工具

| 文件 | 用途 |
|------|------|
| `word-rain.html` | 🧠 单词轰炸主程序 — 30天系统化早读 |
| `word-bank-data.js` | 1200词词库 + 30天分配方案（自动生成） |

## 启动方式

1. 双击 `word-rain.html` 在浏览器中打开
2. 或启动本地服务器：
   ```bash
   cd /Users/lihaiou/陈浩谦-单词轰炸早读系统
   python3 -m http.server 8080
   ```
3. iPad 访问：`http://<Mac-IP>:8080/word-rain.html`（同一WiFi）

## 学习进度

- 存储：浏览器本机 `localStorage` 中的 `wordrain_v3`
- 词库版本：`1200-v2.0-2026-08-03`
- 旧版 `wordrain_v2`、`wordrain_sr`、`wordrain_day` 不迁移、不读取、不删除
- 首次使用1200词系统时从 Day 01 建立全新进度
- 复习节点保持为学习后第 `1、2、4、7、15` 天

## 音频系统（三级回退）

```
🥇 Edge TTS MP3 本地文件（assets/audio/）
    EN: en-US-GuyNeural  |  CN: zh-CN-YunxiNeural
🥈 预留
🥉 macOS/iOS speechSynthesis TTS
```

## 重新生成词库

```bash
python3.12 scripts/build-d30-plan.py
# → 同步生成根目录及 backups/2026-08-03-v5-1200words/word-bank-data.js
```

## 生成单词 MP3

```bash
python3.12 scripts/generate-all-word-audio.py
# EN → assets/audio/words-en/
# CN → assets/audio/words-cn/
```
