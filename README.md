# 陈浩谦 · 单词轰炸早读系统

独立早读工具，脱离课件系统单独运行。

## 核心工具

| 文件 | 用途 |
|------|------|
| `word-rain.html` | 🧠 单词轰炸主程序 — 30天系统化早读 |
| `word-bank-data.js` | 1200词词库 + 30天分配方案（自动生成） |

## 课程词汇优先补充队列

`vocabulary/course-priority-supplements.json` 由姐妹项目 `../陈浩谦高考英语提升系统/` 根据真实完形填空选项、语法填词提示词和原文情绪词自动生成。

- `review_existing`：已匹配当前1200词课程条目，保留对应课程ID和新的真题来源。
- `add_supplement`：当前1200词中未匹配，进入后续优先补充序列。
- 每条数据保留真题、校内考试、周末作业的分类出现次数和具体来源。
- 该队列不直接改写人工修订的1200词主词库，也不擅自插入当前Day 01—30日程；具体调度由早读系统后续统一安排。

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
- 课程按 Day 01–30 永久循环；Day 30 完成后的下一自然日回到 Day 01，页面不显示内部轮次
- 每轮学习实例和复习任务独立保留，旧轮未完成或逾期的任务不会被新轮覆盖
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
