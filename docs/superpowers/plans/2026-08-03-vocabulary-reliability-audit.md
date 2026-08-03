# Vocabulary Reliability Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 全量核验人工修订 1200 词表与原始 688 词表的拼写、词性、中文释义、覆盖关系和仓库同步完整性，并交付可追溯的可靠词库。

**Architecture:** 以 1200 词 Markdown 为应用唯一数据源，以原始 688 Excel 为外部基准；新增只读审计脚本解析两份数据、执行结构与词条规则、输出异常和覆盖报告。确认后的修订先落到 Markdown，再通过现有生成脚本同步运行时 JavaScript，并导出经过视觉验证的 Excel 成果。

**Tech Stack:** Python 3（解析与审计）、现有 `scripts/build-d30-plan.py`（运行时词库生成）、Node.js + `@oai/artifact-tool`（Excel 导入、导出、渲染验证）、Node.js 测试。

## Global Constraints

- 保留 30 天、每天 40 项、课程日和日内顺序。
- 不把 1200 表中标记的 58 个“688 独有”误当作原始 688 全集。
- 拼写采用词典可接受的英式或美式形式；国籍、地区称谓等专名按规范大小写。
- 词性必须与当前中文释义相符；多词性词条允许选择高考最常用主词性，但不得出现词性与释义冲突。
- 中文释义面向高中学习，优先保留常见核心义，删除明显误译、技术化误义和残缺使役义。
- 不改动用户已有的音频暂存改动。

---

### Task 1: 数据源解析与结构审计

**Files:**
- Create: `scripts/audit-vocabulary-repository.py`
- Create: `tests/vocabulary-audit.test.mjs`
- Read: `陈浩谦高考英语1200高频词终极版_人工修订版.md`
- Read: `/Users/lihaiou/Documents/Codex/2026-07-22/2025-docx-2008-2025-1-top50/688高频词专业版.xlsx`

**Interfaces:**
- Produces: Markdown 词条 JSON、688 词条 JSON、结构错误列表、集合覆盖统计。

- [ ] **Step 1: 写结构测试**

验证 1200 表为 30 天 × 40 项、Order 连续、总计 1100 单词 + 100 短语，且关键字段非空。

- [ ] **Step 2: 运行测试并确认现有异常**

Run: `node --test tests/vocabulary-audit.test.mjs`

- [ ] **Step 3: 实现解析和结构规则**

解析 Markdown 表格、Excel 688 表，按标准化英文词形建立集合，同时保留原始行号、Day、Order、词性和中文释义。

- [ ] **Step 4: 运行审计并保存机器可读结果**

Run: `python3 scripts/audit-vocabulary-repository.py`

输出 `vocabulary/vocabulary-audit-2026-08-03.json`。

### Task 2: 拼写、词性与词义复核

**Files:**
- Modify: `陈浩谦高考英语1200高频词终极版_人工修订版.md`
- Create: `vocabulary/2026-08-03-全量词库可靠性审计.md`
- Modify: `scripts/audit-vocabulary-repository.py`

**Interfaces:**
- Consumes: Task 1 的标准化词条与异常列表。
- Produces: 每项修订的旧值、新值、原因、位置与来源；未进入 1200 表的 688 词覆盖清单。

- [ ] **Step 1: 审核自动标记项**

逐项判断拼写变体、专名大小写、词性—中文义匹配、多词性选择和短语完整性。

- [ ] **Step 2: 应用确认后的最小修订**

只修改错误字段，不改变课程结构、日内顺序或无关元数据。

- [ ] **Step 3: 记录审计结论**

报告列出总数、交集、688 未入库项、实际修订项和需保留的合理变体。

### Task 3: 同步应用词库与 Excel 成果

**Files:**
- Modify: `word-bank-data.js`
- Modify: `backups/2026-08-03-v5-1200words/word-bank-data.js`
- Create: `outputs/019fc724-1b7a-73d1-9b52-496c4b12e2e1/陈浩谦高考英语全量词库_可靠性审核版.xlsx`

**Interfaces:**
- Consumes: 修订后的 Markdown 唯一数据源。
- Produces: 与 Markdown 一致的运行时词库和可筛选的审核版工作簿。

- [ ] **Step 1: 重新生成 JavaScript 词库**

Run: `python3 scripts/build-d30-plan.py`

- [ ] **Step 2: 生成审核版 Excel**

工作簿至少包含“1200词库”“688原表”“覆盖与修订摘要”，并保留来源定位字段。

- [ ] **Step 3: 检查工作簿关键范围和公式错误**

使用 `workbook.inspect` 检查表头、代表行、数量汇总及公式错误。

- [ ] **Step 4: 渲染所有工作表并视觉复核**

检查标题、列宽、冻结行、筛选和长中文释义是否可读。

### Task 4: 仓库级验收

**Files:**
- Test: `tests/vocabulary-audit.test.mjs`
- Test: `tests/spelling-units.test.mjs`
- Test: `tests/progress-storage-v3.test.mjs`

**Interfaces:**
- Consumes: 最终 Markdown、JavaScript 与 Excel。
- Produces: 可重复的完整性验收结果。

- [ ] **Step 1: 运行词库审计测试**

Run: `node --test tests/vocabulary-audit.test.mjs`

- [ ] **Step 2: 运行现有回归测试**

Run: `node --test tests/*.test.mjs`

- [ ] **Step 3: 做同步与差异核验**

确认 Markdown 与 `D30_PLAN` 的 1200 项英文、词性分类、中文释义逐项一致，两个生成的 JavaScript 文件完全一致。

- [ ] **Step 4: 自查计划覆盖和占位符**

确认用户要求的拼写、词性、中文意思、可靠性和完整性均有对应产物与测试，不留未解释异常。
