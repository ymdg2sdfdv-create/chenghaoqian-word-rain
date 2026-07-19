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
| `word-rain.html` | 🧠 单词轰炸主程序（v4.0） | ✅ |
| `word-bank-data.js` | 900词词库 + 30天分配方案 | ✅ 自动生成 |
| `word-rain-standalone.html` | 独立版（无 MP3 依赖，纯 TTS） | ✅ |
| `word-rain-backup.html` | 备份版本 | 📦 |

---

## 三、单词轰炸 v4.0 — 核心工具详解

### 设计理念

30天系统化早读。课程日与高频词系统 Day N 逐项一致；每天先完成全部到期复习，再学习当天新词。学习过程结合拼读、自动提取和快速识别，保持全自动播放与统一声线。

### Session 流程

```
🚀 Welcome（封面屏）
   显示：DAY N/30 / 到期复习X词 / 今日新词Y词
   点击「开始今日早读」
   ↓ 播放 welcome.mp3（结束后再进入阶段语音）
🔄 Review 阶段
   +1/+2节点：1轮拼读 + 1轮中文提示回忆 + 3次逐次发音快速识别
   +4/+7/+15节点：1轮中文提示回忆 + 2次逐次发音快速识别
   每词完成后自动推进到下一个严格复习节点
   ↓ 全部复习完 → review-done.mp3 → new-words-start.mp3
🆕 New Words 阶段
   参数：3轮拼读 + 2轮中文提示回忆 + 4次逐次发音快速识别
   快速识别：每出现一组中英文，完整播放一次英文 MP3，结束后再出现下一组
   每8词触发随机鼓励语音
   ↓ 全部新词完成 → complete.mp3
🎉 Complete（庆祝屏）
   统计：今日复习N词 + 新学M词
   检查是否30词全部完成 → 自动推进天数
```

### 拼读阶段

每轮：逐字母显示 → 朗读字母(TTS) → 完成 → 显示完整单词 + 中文 → 朗读单词 + 中文(MP3)

### 严格复习引擎

- 算法：严格艾宾浩斯节点（学习后 +1、+2、+4、+7、+15 天）
- 存储：localStorage `wordrain_v2`（旧版 `wordrain_sr` 只用于保守迁移）
- 每个课程条目使用独立 ID；同形词在不同课程日分别学习和复习
- 课程日决定新词，真实日历日期决定到期复习
- 同一天最多完成一个课程日；漏学不跳课，逾期复习不丢失

### 30天词库

- 脚本：`scripts/build-d30-plan.py`（一次性生成，已执行）
- 源数据：`vocabulary/gaokao-800-high-frequency-words.md`
- 输出：`word-bank-data.js`（含 WORD_BANK / D30_PLAN / CAT_META）
- 范围：类别1-4共899个课程条目、871个唯一拼写（动词200 + 名词270 + 形副330 + 短语99）
- 分配算法：轮询（round-robin），每类均匀分布到30天，每天约30词
- 每个 D30_PLAN 条目包含 `id / word / cn / cat / day / order`

### 关键参数

| 参数 | 新词 | +1/+2复习 | +4/+7/+15复习 |
|------|:---:|:---:|:---:|
| 拼读轮数 | 3 | 1 | 0 |
| 自动提取 | 2 | 1 | 1 |
| 快速识别 | 4 | 3 | 2 |
| 中途鼓励 | 每8词 | 无 |
| 完整词音频 | 拼读揭示 + 提取揭示 + 每次快速识别 | 揭示 + 每次快速识别 | 揭示 + 每次快速识别 |

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

节拍器 + 反馈音使用振荡器合成，并统一经过峰值压缩，避免 iPad 扬声器削波：

| 音效 | 波形 | 频率 | 场景 |
|------|------|------|------|
| tick | 噪声脉冲 12ms | — | 耳返式节拍器 |
| beat | 双正弦短音 | 1174Hz + 2348Hz | 字母出现，木琴 / 玻璃珠质感 |
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
| 每字母一个短促节奏点 + 视觉节拍 | 声画同步，使用快速衰减与峰值压缩避免破音 |
| 每次快速识别完整朗读1次英文 | 等上一遍 MP3 结束后再出现下一组，避免截断和叠音 |
| 快速识别自适应防碰撞铺屏 | 优先填补空白并避开HUD、底栏和已有中英文；外圈放不下时回退内圈 |
| 严格1-2-4-7-15，不乘ease | 全自动场景下规则透明、日期可预测 |
| 拼读→自动提取→快速识别 | 避免只靠密集重复造成熟悉感错觉 |
| 课程条目ID而非英文拼写 | 保持与高频词系统899个条目逐日一致 |
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

- [x] 871个唯一拼写均有EN+CN MP3；899个课程条目按拼写复用
- [ ] 如需跨设备使用，手动导出/导入进度（当前保持单机简洁）
- [ ] 声线回退测试（MP3缺失时TTS是否正常切换）
