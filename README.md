# 陈浩谦 · 单词轰炸早读系统

独立早读工具，脱离课件系统单独运行。

## 核心工具

| 文件 | 用途 |
|------|------|
| `word-rain.html` | 🧠 单词轰炸主程序（v5.0）— 课堂词复习 + 测试 |
| `classroom-bank-data.js` | Unit 1 课堂词库（92 词，自动生成） |
| `陈浩谦高考英语1200高频词终极版_人工修订版.md` | 1200 词主词表 — 课程条目 ID 的唯一数据源，运行时不再使用 |

## 一次早读的完整流程

```text
欢迎屏（早读完成次数 / 测试完成次数）
  → welcome.mp3
  → 早读：92 个课堂词，每词 1 轮拼读 + 1 轮中文提示回忆 + 4 次快速识别
          每 15 词播一条鼓励语音（encourage-1..5 顺序循环）
  → complete.mp3（宣布进入测试）
  → 测试：92 个词只给英文单词，显示的同时朗读英文
          先自己说出中文，再点「想起来了 / 还没想起来」
          点完立刻揭晓中文 + 词族 + 课堂搭配 + 本文义提示，并朗读中文
  → test-complete.mp3
  → 结束屏：列出今天没想起来的词，供下次课复现
```

- **不循环、不排艾宾浩斯节点**：92 词一次走完，本身即复习，不做间隔重复调度。
- 测试覆盖全部 92 词；没想起来的词只记录、不惩罚，界面不出现「错了」类措辞。
- 测试阶段隐藏复习 HUD 和底部条，清空词雨，画面只剩测试词 + 两个按钮。
- 点击画面/空格可暂停，测试阶段只认按钮，避免误触。

## 数据流

```text
../陈浩谦高考英语提升系统/vocabulary/unit-01-key-vocabulary.md   ← 课堂词唯一数据源（92 条）
    ↓ scripts/build_unit_01_classroom_bank.py
../陈浩谦高考英语提升系统/vocabulary/unit-01-classroom-bank.json  ← 提升系统侧权威数据
classroom-bank-data.js                                            ← 早读侧载荷（word-rain.html 直接 <script> 引入）
```

每个词条携带：`id`（沿用 1200 词课程条目 ID `dayNN-NN-xxx`）、`word`、`cn`、`cat`、`family`（词族）、`collocation`（课堂搭配）、`note`（「本文义需另讲」提示，仅 3 条熟词生义有）。

载荷必须是 `.js` 而非 `.json`：双击 `file://` 打开时 `fetch` JSON 会被 CORS 挡住。

## 学习进度

- 存储：浏览器本机 `localStorage` 中的 `wordrain_classroom_v1`
- 词库版本：`unit01-2026-09-05`（取自 `CLASSROOM_BANK.bankVersion`，不匹配则隔离备份后重置）
- 旧 30 天系统 `wordrain_v3` **不读取、不迁移、不删除**；1200 词资产见 `legacy/README.md`
- 记录：早读完成日期与次数、当日已走完的词、测试完成日期与次数、最近一次测试没想起来的词
- 跨自然日自动作废，每天早上从第 1 个词开始

## 音频系统（三级回退）

```text
🥇 Edge TTS MP3 本地文件（assets/audio/）
    EN: en-US-GuyNeural  |  CN: zh-CN-YunxiNeural
🥈 预留
🥉 macOS/iOS speechSynthesis TTS（中文只认 Eddy/Rocko/Reed 白名单，找不到则静默）
```

反馈语音共 9 条（`assets/audio/feedback/`），文案与生成脚本见 `scripts/generate-feedback-audio.py`。

## 启动方式

1. 双击 `word-rain.html` 在浏览器中打开
2. 或启动本地服务器：
   ```bash
   cd /Users/lihaiou/陈浩谦-单词轰炸早读系统
   python3 -m http.server 8080
   ```
3. iPad 访问：`http://<Mac-IP>:8080/word-rain.html`（同一 WiFi）

## 脚本

```bash
# 重新生成课堂词库（在提升系统侧执行，会同时写早读侧 classroom-bank-data.js）
cd ../陈浩谦高考英语提升系统
python3.12 scripts/build_unit_01_classroom_bank.py --root . --early-reading-root '../陈浩谦-单词轰炸早读系统'

# 补缺失的单词 MP3（只补缺，不覆盖）
python3.12 scripts/generate-classroom-audio.py [--dry-run]

# 重新生成反馈语音（文案改动后必须加 --force，否则旧 MP3 会被跳过）
python3.12 scripts/generate-feedback-audio.py --force

# 测试
node --test tests/*.test.mjs
```

## 测试覆盖

`tests/classroom-progress.test.mjs`：进度存储与隔离、单轮流程配置、卡片渲染（词族/搭配/本文义）、测试环节（提示不泄露答案、只记录没想起来的词、防重复点击、走完全部词）、反馈语音引用与磁盘文件一致性。
