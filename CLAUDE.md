# 陈浩谦 · 单词轰炸早读系统

> **AI 入口文档**。任何 AI 接手本项目时，先读此文件即可理解全局。

---

## 一、项目是什么

为高二学生**陈浩谦**定制的 30 天系统化早读工具。每天早晨一次，先复习到期词（艾宾浩斯遗忘曲线），再学今日新词。全自动调度，无需手动安排。

| 属性 | 说明 |
|------|------|
| 学生 | 陈浩谦，高二，男生 |
| 基础 | ~80分/150分，英语薄弱 |
| 目标 | 高考110分 |
| 卷型 | 新高考I卷（湖南） |
| 定位 | 独立早读工具，脱离课件系统单独运行 |
| 姊妹项目 | `../陈浩谦高考英语提升系统/`（上课课件 + 闪卡） |

---

## 二、核心文件

| 文件 | 用途 | 状态 |
|------|------|:--:|
| `word-rain.html` | 🧠 单词轰炸主程序（v3.0） | ✅ |
| `word-bank-data.js` | 900词词库 + 30天分配方案 | ✅ 自动生成 |
| `word-rain-standalone.html` | 独立版（无 MP3 依赖，纯 TTS） | ✅ |
| `word-rain-backup.html` | 备份版本 | 📦 |

---

## 三、单词轰炸 v3.0 — 核心工具详解

### 设计理念

30天系统化早读。屏幕中央开始，向外扩散铺满。前半段拆字母拼读（音形同步），后半段快速轰炸（被动曝光）。全程强节拍器 + 统一声线。

### Session 流程

```
🚀 Welcome（封面屏）
   显示：第N天 / 待复习X词 / 新词Y词
   点击「开始今日轰炸」
   ↓ 播放 welcome.mp3 → 等5秒
🔄 Review 阶段
   参数：2轮拼读 + 8次匀速闪现
   每词完成后自动评分（默认记得），推进间隔
   ↓ 全部复习完 → review-done.mp3 → 等2.5s → new-words-start.mp3 → 等5秒
🆕 New Words 阶段
   参数：5轮拼读 + 30次三档变速闪现
   闪现1-10：350→280ms（正常速）
   闪现11-20：250→180ms（加快）
   闪现21-30：180→140ms（最快）
   每8词触发随机鼓励语音
   ↓ 全部新词完成 → complete.mp3
🎉 Complete（庆祝屏）
   统计：今日复习N词 + 新学M词
   检查是否30词全部完成 → 自动推进天数
```

### 拼读阶段

每轮：逐字母显示 → 朗读字母(TTS) → 完成 → 显示完整单词 + 中文 → 朗读单词 + 中文(MP3)

### 间隔复习引擎

- 算法：简化艾宾浩斯（间隔 1→2→4→7→15 天）
- 存储：localStorage `wordrain_sr`
- 数据结构：`{ word: { learnedDay, learnedDate, reviews[], nextReview, interval, ease } }`
- 每天自动计算到期词 → 加入复习队列

### 30天词库

- 脚本：`scripts/build-d30-plan.py`（一次性生成，已执行）
- 源数据：`vocabulary/gaokao-800-high-frequency-words.md`
- 输出：`word-bank-data.js`（36KB，含 WORD_BANK / D30_PLAN / CAT_META）
- 范围：类别1-4共899词（动词200 + 名词270 + 形副330 + 短语99）
- 分配算法：轮询（round-robin），每类均匀分布到30天，每天约30词

### 关键参数

| 参数 | 新词 | 复习词 |
|------|:---:|:---:|
| 拼读轮数 | 5 | 2 |
| 闪现次数 | 30（三档变速） | 8（匀速） |
| 中途鼓励 | 每8词 | 无 |
| 音频频率 | 每1.8s | 每1.8s |

---

## 四、音频系统（三级回退）

```
Level 1 🥇  Edge TTS MP3 本地文件
            EN: en-US-GuyNeural（自然友好男声）
            CN: zh-CN-YunxiNeural / 云希（阳光活泼男声）
            ↓ 文件缺失
Level 2 🥈  预留（未来可加分类型音效变体）
            ↓
Level 3 🥉  浏览器 speechSynthesis TTS
            EN: Samantha→Daniel→Alex→Tom→Fred
            CN: Eddy→Rocko→Reed（绝不用女声）
            ↓ 找不到白名单声线
→ 静默，不阻塞教学
```

### Web Audio API 短音效

节拍器 + 反馈音使用振荡器合成：

| 音效 | 波形 | 频率 | 场景 |
|------|------|------|------|
| tick | 噪声脉冲 12ms | — | 耳返式节拍器 |
| beat | triangle | 520→880Hz | 字母出现 |
| reveal | triangle | 660→1100Hz | 单词揭示 |
| correct | triangle | 523→1047Hz | 完成确认 |
| finish | triangle | 440→880Hz | 全部完成 |
| click | triangle | 520→740Hz | 按钮 |

### 反馈语音（Edge TTS Yunxi 云希男声）

| 文件 | 触发时机 |
|------|----------|
| `assets/audio/feedback/welcome.mp3` | 封面打开 |
| `assets/audio/feedback/review-start.mp3` | 复习阶段开始 |
| `assets/audio/feedback/review-done.mp3` | 复习→新词过渡 |
| `assets/audio/feedback/new-words-start.mp3` | 新词阶段开始 |
| `assets/audio/feedback/encourage-{1..5}.mp3` | 每8个新词随机鼓励 |
| `assets/audio/feedback/complete.mp3` | 全部完成 |

---

## 五、数据流

```
vocabulary/gaokao-800-high-frequency-words.md  ← 唯一数据源（950词）
    ↓ scripts/build-d30-plan.py（解析+分配）
word-bank-data.js                             ← 30天词库（899词，自动生成）
    ↓ word-rain.html 读取
localStorage                                    ← 进度 + 间隔复习数据
```

---

## 六、启动方式

```bash
# 方式1：HTTP 服务器（推荐，MP3 路径正确）
cd /Users/lihaiou/陈浩谦-单词轰炸早读系统
python3 -m http.server 8080 --bind 0.0.0.0
# 浏览器打开: http://localhost:8080/word-rain.html
# iPad: http://<Mac-IP>:8080/word-rain.html（同一WiFi）

# 方式2：Python 3.12 运行脚本
python3.12 scripts/build-d30-plan.py            # 重新生成词库
python3.12 scripts/generate-all-word-audio.py   # 补全单词MP3
python3.12 scripts/generate-feedback-audio.py   # 重新生成反馈语音
```

---

## 七、设计决策

| 决策 | 原因 |
|------|------|
| 纯静态HTML，不依赖服务器 | 学生双击即开，离线可用 |
| Edge TTS 预生成MP3而非实时TTS | 声线质量可控、离线可用、无API费用 |
| 耳返式节拍器（噪声脉冲） | 只提供节奏参考，不干扰注意力 |
| 艾宾浩斯1-2-4-7-15而非完整SM-2 | 自动评分场景下简化够用 |
| 三档变速闪现 | 保持新鲜感，但确保最快速也能听清 |
| 中文声线绝不用女声 | 维持声线一致性 |
| 淘汰游戏化方案（射箭/跑酷/马厘奥） | 游戏引擎复杂度压倒学习本身 |

---

## 八、关键环境

| 组件 | 路径/版本 |
|------|----------|
| Python | `/opt/homebrew/bin/python3.12` |
| edge-tts CLI | 已安装（`edge-tts --version`） |
| Chrome | `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` |

---

## 九、已知待办

- [ ] 补全全部900词的EN+CN MP3（后台任务运行中）
- [ ] 单词轰炸加入手动评分机制（目前自动默认"记得"）
- [ ] 30天后自动循环或重置逻辑
- [ ] 声线回退测试（MP3缺失时TTS是否正常切换）
