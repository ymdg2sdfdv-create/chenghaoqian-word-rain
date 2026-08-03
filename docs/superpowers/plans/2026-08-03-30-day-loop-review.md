# 30 天课程循环与跨轮复习 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让课程在 Day 30 后永久回到 Day 01 循环，并让每轮学习实例保持各自独立的严格复习任务。

**Architecture:** 延续 `word-rain.html` 现有的内联进度引擎和 `wordrain_v3` 隔离存储，在 v3 内增加隐藏轮次，并把学习记录键和课程完成键改为“轮次 + 原 ID”。复用现有 `tests/progress-storage-v3.test.mjs` 的 VM 测试框架验证旧 v3 数据升级、日期边界、跨轮任务保留和实例隔离，不引入新依赖或第二套存储。

**Tech Stack:** 原生 JavaScript、静态 HTML、浏览器 `localStorage`、Node.js `node:test`、`assert/strict`、`vm`。

## Global Constraints

- 页面只显示 Day 01–30，不显示内部轮次。
- Day 30 完成当天保持 Day 30；下一个自然日才回到 Day 01。
- 每个自然日最多完成一个课程日，漏学不跳课。
- 旧轮到期或逾期任务排在新词之前，不能被新轮学习覆盖。
- 每轮学习实例独立使用 `+1、+2、+4、+7、+15 天` 节点。
- 继续使用 `wordrain_v3` 和 `bankVersion: "1200-v2.0-2026-08-03"`；不读取、迁移或删除 v2 及更旧进度。
- 当前平面结构的有效 v3 进度无损升级为第一轮实例。
- 不修改词库、音频、复习间隔、教学动画或页面视觉。

---

### Task 1: 扩展 v3 存储为多轮学习实例

**Files:**
- Modify: `tests/progress-storage-v3.test.mjs`
- Modify: `word-rain.html:435-516`

**Interfaces:**
- Consumes: 现有 v3 对象、`ITEM_BY_ID`、`CONFIG.reviewOffsets` 和 ISO 日期。
- Produces: `entryKey(cycle, itemId): string`、`completionKey(cycle, day): string`、带 `cycle` 的 v3 进度、实例感知的 `normalizeStore`、`syncCourseDay`、`markLearned`、`markReviewed`、`dueReviews`。

- [ ] **Step 1: 扩充测试工具以注入日期并暴露进度函数**

把 `runStorage` 改成接收查询串，并暴露需要验证的接口：

```js
function runStorage(seed = {}, search = "") {
  const localStorage = makeStorage(seed);
  const context = vm.createContext({
    console,
    Date,
    URLSearchParams,
    location: { search },
    localStorage,
    CONFIG: { reviewOffsets: Object.freeze([1, 2, 4, 7, 15]) },
    ITEM_BY_ID: new Map([
      ["day01-01-own", { id: "day01-01-own", word: "own", day: 1, order: 1 }],
      ["day02-01-increase", { id: "day02-01-increase", word: "increase", day: 2, order: 1 }],
      ["day30-01-proud", { id: "day30-01-proud", word: "proud", day: 30, order: 1 }],
    ]),
    ITEMS_BY_WORD: new Map(),
  });
  vm.runInContext(
    `${storageSource}\n;globalThis.__storageApi={STORE_KEY,SCHEMA_VERSION,BANK_VERSION,entryKey,completionKey,emptyStore,normalizeStore,loadStore,saveStore,syncCourseDay,markLearned,markReviewed,dueReviews,progress};`,
    context,
  );
  return { ...context.__storageApi, localStorage };
}
```

- [ ] **Step 2: 写当前 v3 数据升级和 Day 30 边界的失败测试**

```js
test("existing flat v3 data upgrades into cycle 1 without changing dates", () => {
  const existing = {
    version: 3,
    bankVersion: "1200-v2.0-2026-08-03",
    courseDay: 30,
    lastAdvancedDate: "2026-08-02",
    entries: {
      "day30-01-proud": {
        word: "proud", courseDay: 30, learnedDate: "2026-08-02",
        completedReviewOffsets: [], nextReviewOffset: 1, nextReviewDate: "2026-08-03",
      },
    },
    dayCompletion: { "30": "2026-08-02" },
  };
  const { progress } = runStorage({ wordrain_v3: JSON.stringify(existing) });
  assert.equal(progress.cycle, 1);
  assert.equal(progress.entries["1:day30-01-proud"].nextReviewDate, "2026-08-03");
  assert.equal(progress.dayCompletion["1:30"], "2026-08-02");
});

test("Day 30 completed today stays on Day 30", () => {
  const existing = {
    version: 3, bankVersion: "1200-v2.0-2026-08-03", cycle: 1,
    courseDay: 30, lastAdvancedDate: "2026-08-03", entries: {},
    dayCompletion: { "1:30": "2026-08-03" },
  };
  const api = runStorage({ wordrain_v3: JSON.stringify(existing) }, "?testDate=2026-08-03");
  api.syncCourseDay();
  assert.deepEqual([api.progress.cycle, api.progress.courseDay], [1, 30]);
});

test("Day 30 completed before today rolls to hidden cycle 2 Day 1", () => {
  const existing = {
    version: 3, bankVersion: "1200-v2.0-2026-08-03", cycle: 1,
    courseDay: 30, lastAdvancedDate: "2026-08-02", entries: {},
    dayCompletion: { "1:30": "2026-08-02" },
  };
  const api = runStorage({ wordrain_v3: JSON.stringify(existing) }, "?testDate=2026-08-03");
  api.syncCourseDay();
  assert.deepEqual([api.progress.cycle, api.progress.courseDay], [2, 1]);
});
```

- [ ] **Step 3: 运行测试并确认失败**

Run: `node --test tests/progress-storage-v3.test.mjs`

Expected: FAIL，原因包括 `entryKey`/`completionKey` 未定义、平面键未升级以及 Day 30 不会循环。

- [ ] **Step 4: 实现轮次键、空进度和兼容标准化**

在存储块加入：

```js
const entryKey=(cycle,itemId)=>`${cycle}:${itemId}`;
const completionKey=(cycle,day)=>`${cycle}:${day}`;

function emptyStore(){
  return {version:SCHEMA_VERSION,bankVersion:BANK_VERSION,cycle:1,courseDay:1,lastAdvancedDate:null,entries:{},dayCompletion:{}};
}
```

`normalizeStore(parsed)` 必须执行以下转换：

```js
const hasCycle=Number.isInteger(Number(parsed.cycle))&&Number(parsed.cycle)>=1;
normalized.cycle=hasCycle?Number(parsed.cycle):1;
for(const [storedKey,record] of Object.entries(parsed.entries)){
  const recordCycle=hasCycle?Math.max(1,Number(record?.cycle)||1):1;
  const itemId=hasCycle?record?.itemId:storedKey;
  const clean=normalizeEntry(itemId,record,recordCycle);
  if(clean)normalized.entries[entryKey(recordCycle,itemId)]=clean;
}
for(const [storedKey,date] of Object.entries(parsed.dayCompletion)){
  const parts=hasCycle?storedKey.split(":"):["1",storedKey];
  const cycleNumber=Number(parts[0]),dayNumber=Number(parts[1]);
  if(Number.isInteger(cycleNumber)&&cycleNumber>=1&&Number.isInteger(dayNumber)&&dayNumber>=1&&dayNumber<=30&&isDateString(date)){
    normalized.dayCompletion[completionKey(cycleNumber,dayNumber)]=date;
  }
}
```

把 `normalizeEntry` 的签名改为 `(itemId, record, cycle)`，返回记录时增加 `itemId` 和 `cycle`。对已经带轮次的实例，只有 `storedKey === entryKey(recordCycle, itemId)` 且 `ITEM_BY_ID` 存在该 ID 时才保留。

同步更新已有测试断言：`valid v3 progress restores` 应检查 `progress.entries["1:day01-01-own"]`，`unknown item IDs are pruned while valid records survive` 应期望键数组为 `["1:day01-01-own"]`。旧版隔离、未知 ID 清理、词库版本不兼容隔离的原测试必须继续通过。

- [ ] **Step 5: 实现课程循环和实例感知的学习、复习函数**

```js
function syncCourseDay(){
  const today=getToday();let changed=false;
  while(true){
    const completed=progress.dayCompletion[completionKey(progress.cycle,progress.courseDay)];
    if(!completed||completed>=today)break;
    if(progress.courseDay<30)progress.courseDay++;
    else{progress.cycle++;progress.courseDay=1;}
    progress.lastAdvancedDate=today;changed=true;
  }
  if(changed)saveStore();
}

function markLearned(item){
  const id=entryKey(progress.cycle,item.id);
  if(progress.entries[id])return;
  const learnedDate=getToday(),nextReviewOffset=CONFIG.reviewOffsets[0];
  progress.entries[id]={itemId:item.id,cycle:progress.cycle,word:item.word,courseDay:item.day,learnedDate,completedReviewOffsets:[],nextReviewOffset,nextReviewDate:addDays(learnedDate,nextReviewOffset)};
  saveStore();
}

function markReviewed(entry){
  const record=progress.entries[entry.instanceId];if(!record||record.nextReviewOffset==null)return;
  const current=record.nextReviewOffset;
  if(!record.completedReviewOffsets.includes(current))record.completedReviewOffsets.push(current);
  const index=CONFIG.reviewOffsets.indexOf(current),next=CONFIG.reviewOffsets[index+1]??null;
  record.nextReviewOffset=next;record.nextReviewDate=next?addDays(record.learnedDate,next):null;saveStore();
}

function dueReviews(){
  const today=getToday();
  return Object.entries(progress.entries)
    .filter(([,record])=>record.nextReviewDate&&record.nextReviewDate<=today)
    .map(([instanceId,record])=>({instanceId,item:ITEM_BY_ID.get(record.itemId),kind:"review",offset:record.nextReviewOffset,dueDate:record.nextReviewDate}))
    .filter(task=>task.item)
    .sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||a.item.day-b.item.day||a.item.order-b.item.order);
}
```

- [ ] **Step 6: 写跨轮任务保留和独立推进的失败测试**

```js
test("old overdue task survives beside a new-cycle instance", () => {
  const seeded = {
    version: 3, bankVersion: "1200-v2.0-2026-08-03", cycle: 2,
    courseDay: 1, lastAdvancedDate: "2026-08-03",
    entries: {
      "1:day01-01-own": { itemId: "day01-01-own", cycle: 1, word: "own", courseDay: 1, learnedDate: "2026-07-01", completedReviewOffsets: [], nextReviewOffset: 1, nextReviewDate: "2026-07-02" },
      "2:day01-01-own": { itemId: "day01-01-own", cycle: 2, word: "own", courseDay: 1, learnedDate: "2026-08-03", completedReviewOffsets: [], nextReviewOffset: 1, nextReviewDate: "2026-08-04" },
    }, dayCompletion: {},
  };
  const api = runStorage({ wordrain_v3: JSON.stringify(seeded) }, "?testDate=2026-08-03");
  const due = api.dueReviews();
  assert.deepEqual(due.map(task => task.instanceId), ["1:day01-01-own"]);
  api.markReviewed(due[0]);
  assert.equal(api.progress.entries["1:day01-01-own"].nextReviewOffset, 2);
  assert.equal(api.progress.entries["2:day01-01-own"].nextReviewOffset, 1);
});
```

- [ ] **Step 7: 运行存储测试并提交**

Run: `node --test tests/progress-storage-v3.test.mjs && git diff --check`

Expected: 所有测试 PASS，空白检查退出码为 0。

```bash
git add word-rain.html tests/progress-storage-v3.test.mjs
git commit -m "feat: support recurring learning instances"
```

### Task 2: 将会话和首页接入当前轮次

**Files:**
- Modify: `word-rain.html:520-526`
- Modify: `word-rain.html:642-706`
- Modify: `tests/progress-storage-v3.test.mjs`

**Interfaces:**
- Consumes: Task 1 的 `entryKey`、`completionKey`、`progress.cycle` 和带 `instanceId` 的复习队列。
- Produces: 当前轮新词队列、实例级复习完成、轮次级课程完成和 Day 30 次日正常入口。

- [ ] **Step 1: 写源码级防回归断言并确认失败**

在测试文件增加：

```js
test("session uses cycle-aware keys and does not keep a terminal courseComplete branch", () => {
  assert.match(html, /entryKey\(progress\.cycle,item\.id\)/);
  assert.match(html, /completionKey\(progress\.cycle,day\)/);
  assert.doesNotMatch(html, /const courseComplete=/);
  assert.match(html, /markReviewed\(entry\)/);
});
```

Run: `node --test tests/progress-storage-v3.test.mjs`

Expected: FAIL，因为会话仍按原课程条目 ID 判断，且首页仍有永久终点分支。

- [ ] **Step 2: 修改会话队列和复习完成调用**

`buildSession()` 的新词过滤改为：

```js
const newItems=mode==="redo"
  ?(D30_PLAN[day]||[]).map(item=>({item,kind:"redo",offset:null}))
  :(D30_PLAN[day]||[]).filter(item=>!progress.entries[entryKey(progress.cycle,item.id)]).map(item=>({item,kind:"new",offset:null}));
```

在单词完成处理处把 `markReviewed(entry.item)` 改为 `markReviewed(entry)`，确保只推进该学习实例。

- [ ] **Step 3: 修改课程日完成记录**

`finishSession()` 的正常模式分支改为：

```js
const day=progress.courseDay,key=completionKey(progress.cycle,day);
const allDone=(D30_PLAN[day]||[]).every(item=>progress.entries[entryKey(progress.cycle,item.id)]);
if(allDone&&!progress.dayCompletion[key]){
  progress.dayCompletion[key]=getToday();progress.lastAdvancedDate=getToday();saveStore();
}
```

- [ ] **Step 4: 删除 Day 30 永久终点并保留当天重温**

`showWelcome()` 使用当前轮完成键：

```js
const completedToday=progress.dayCompletion[completionKey(progress.cycle,day)]===today;
const motto=completedToday?"今天的课程已经完成，重复巩固不会推进天数。":"先复习到期词，再学习今天的新词。";
```

文案直接渲染 `${motto}`，按钮只按 `completedToday` 决定“重温第 N 天词汇”或“开始今日早读”；不再定义或判断 `courseComplete`。

- [ ] **Step 5: 运行自动化测试和静态检查**

Run: `node --test tests/progress-storage-v3.test.mjs && git diff --check`

Expected: 所有测试 PASS，检查退出码为 0。

- [ ] **Step 6: 用测试日期完成浏览器冒烟验证**

通过现有 `?testDate=` 开关验证：

- `2026-08-03` 当天完成 `1:30`：首页仍为 `DAY 30 / 30`，按钮为“重温第 30 天词汇”；
- `2026-08-04` 打开同一进度：首页为 `DAY 01 / 30`，不出现轮次文案；
- 第二轮 Day 01 首页显示 40 个新词，并统计第一轮遗留到期任务；
- 开始后先执行旧轮复习，再进入 Day 01 新词。

- [ ] **Step 7: 提交会话接入**

```bash
git add word-rain.html tests/progress-storage-v3.test.mjs
git commit -m "feat: loop course after day 30"
```

### Task 3: 更新说明并完成全量回归

**Files:**
- Modify: `CLAUDE.md:36-70`
- Modify: `CLAUDE.md:143-180`
- Modify: `README.md:19-32`

**Interfaces:**
- Consumes: 已验证的 v3 循环行为。
- Produces: 与永久循环、隐藏轮次和跨轮复习一致的项目说明。

- [ ] **Step 1: 更新课程与存储说明**

在 `CLAUDE.md` 明确：30 天课程永久循环；Day 30 后的下一自然日回到 Day 01；内部按“轮次 + 课程条目 ID”保存学习实例；页面不显示轮次；旧轮未完成复习不会被新轮覆盖。保留现有 `wordrain_v3`、词库版本及旧版数据隔离说明。

- [ ] **Step 2: 更新用户启动说明**

在 `README.md` 的“学习进度”中增加两条：课程按 Day 01–30 永久循环；每轮复习任务独立保留。不得修改现有 v3 隔离和复习节点文案。

- [ ] **Step 3: 运行最终回归检查**

Run: `node --test tests/*.test.mjs && git diff --check && git status --short`

Expected: 所有测试 PASS；空白检查退出码为 0；状态只包含本计划涉及的文件。

- [ ] **Step 4: 对照规格逐项核验**

确认设计规格的 8 条验收条件均由自动化测试或 Task 2 的浏览器冒烟步骤覆盖，并确认页面没有新增轮次文案。

- [ ] **Step 5: 提交说明更新**

```bash
git add CLAUDE.md README.md
git commit -m "docs: describe recurring vocabulary cycles"
```
