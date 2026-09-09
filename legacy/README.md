# legacy｜1200 词系统归档

> 归档日期：2026-09-09。原因：早读系统改用 **Unit 1 课堂词库**（92 词，见根目录 `classroom-bank-data.js`）。

## 这里放什么

| 文件 | 原位置 | 说明 |
|---|---|---|
| `word-bank-data.js` | 根目录 | 1200 词词库 + 30 天分配方案（`WORD_BANK` / `D30_PLAN` / `CAT_META`），自动生成 |
| `scripts/build-d30-plan.py` | `scripts/` | 1200 词库生成脚本 |
| `vocabulary/2026-08-03-词义词性大小写修订清单.md` | `vocabulary/` | 142 项人工修订清单 |
| `vocabulary/vocabulary-corrections-2026-08-03.json` | `vocabulary/` | 修订项机读版 |
| `audio-feedback/review-done.mp3` | `assets/audio/feedback/` | 「复习完成，接下来是新词」— 新流程没有新词阶段，已退役 |
| `audio-feedback/new-words-start.mp3` | `assets/audio/feedback/` | 「开始今天的新词学习」— 同上 |

**归档 = 不删除、不再被运行时引用。** 需要回退时把 `word-bank-data.js` 移回根目录、把两条反馈语音移回 `assets/audio/feedback/`，并还原 `word-rain.html` 即可。

## 为什么主词表没有归档

`陈浩谦高考英语1200高频词终极版_人工修订版.md` **保留在根目录**，原因：

1. 它是 1200 词的**唯一数据源**（人工修订定稿），不是运行时产物；
2. 姊妹项目 `../陈浩谦高考英语提升系统/scripts/vocabulary_pipeline.py` 的 `load_early_reading_index()` 与 `sync_early_reading_queue()` 都按根目录路径读取它；
3. 课堂词库生成脚本 `build_unit_01_classroom_bank.py` 需要它来复用课程条目 ID（`dayNN-NN-xxx`）。

## 保留在原地、未归档的资产

- `assets/audio/words-en/`（1289 个）、`assets/audio/words-cn/`（1209 个）—— 92 个课堂词里 83 个直接复用现成 MP3，**不能移走**；
- `scripts/generate-*-audio.py`（含 `generate-classroom-audio.py`）—— 补音频仍要用。
