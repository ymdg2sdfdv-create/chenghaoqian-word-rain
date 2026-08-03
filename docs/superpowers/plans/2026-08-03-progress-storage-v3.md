# Progress Storage v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pre-1200-word `wordrain_v2` progress namespace with an isolated, validated `wordrain_v3` store that always starts the 1200-word course at Day 01 when no v3 data exists.

**Architecture:** Keep progress storage inside the existing `word-rain.html` application, but give it explicit schema and word-bank version constants. Load only v3, normalize records against the current `ITEM_BY_ID`, quarantine malformed or incompatible v3 payloads, and leave every legacy key untouched and unread.

**Tech Stack:** Browser JavaScript, `localStorage`, Node.js built-in `node:test`, Node.js `vm` test harness, static HTML application.

## Global Constraints

- The active storage key is exactly `wordrain_v3`.
- The schema version is exactly `3`.
- The word-bank version is exactly `1200-v2.0-2026-08-03`.
- Do not read, migrate, modify, or delete `wordrain_v2`, `wordrain_sr`, or `wordrain_day`.
- Preserve the current `+1、+2、+4、+7、+15天` review schedule.
- Preserve all vocabulary content, 30-day allocation, playback behavior, spelling behavior, audio, and visual layout.
- Do not add cloud sync, accounts, or progress import/export.

---

### Task 1: Add executable v3 storage tests

**Files:**
- Create: `tests/progress-storage-v3.test.mjs`
- Test: `word-rain.html:434-494`

**Interfaces:**
- Consumes: The JavaScript block between `/* ---------------- Versioned progress and strict review ---------------- */` and `/* ---------------- Session ---------------- */` in `word-rain.html`.
- Produces: A Node test harness exposing `STORE_KEY`, `SCHEMA_VERSION`, `BANK_VERSION`, `emptyStore()`, `loadStore()`, `saveStore()`, and `progress` from the actual HTML code.

- [ ] **Step 1: Create a harness that executes the real storage block**

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../word-rain.html", import.meta.url), "utf8");
const start = html.indexOf("/* ---------------- Versioned progress and strict review ---------------- */");
const end = html.indexOf("/* ---------------- Session ---------------- */");
assert.ok(start >= 0 && end > start, "storage block markers must exist");
const storageSource = html.slice(start, end);

function makeStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
    keys: () => [...data.keys()],
  };
}

function runStorage(seed = {}) {
  const localStorage = makeStorage(seed);
  const context = vm.createContext({
    console,
    Date,
    URLSearchParams,
    location: { search: "" },
    localStorage,
    CONFIG: { reviewOffsets: Object.freeze([1, 2, 4, 7, 15]) },
    ITEM_BY_ID: new Map([
      ["day01-01-own", { id: "day01-01-own", word: "own", day: 1, order: 1 }],
      ["day02-01-increase", { id: "day02-01-increase", word: "increase", day: 2, order: 1 }],
    ]),
  });
  vm.runInContext(`${storageSource}\n;globalThis.__storageApi={STORE_KEY,SCHEMA_VERSION,BANK_VERSION,emptyStore,loadStore,saveStore,progress};`, context);
  return { ...context.__storageApi, localStorage };
}
```

- [ ] **Step 2: Add a failing test proving legacy data is ignored and preserved**

```js
test("v3 starts clean without reading or deleting legacy progress", () => {
  const legacyV2 = JSON.stringify({ version: 2, courseDay: 19, entries: { old: {} }, dayCompletion: { "18": "2026-08-01" } });
  const legacySr = JSON.stringify({ own: { learnedDate: "2026-07-01", reviews: [1, 2] } });
  const { progress, localStorage } = runStorage({
    wordrain_v2: legacyV2,
    wordrain_sr: legacySr,
    wordrain_day: "19",
  });
  assert.equal(progress.version, 3);
  assert.equal(progress.bankVersion, "1200-v2.0-2026-08-03");
  assert.equal(progress.courseDay, 1);
  assert.deepEqual(Object.keys(progress.entries), []);
  assert.equal(localStorage.getItem("wordrain_v2"), legacyV2);
  assert.equal(localStorage.getItem("wordrain_sr"), legacySr);
  assert.equal(localStorage.getItem("wordrain_day"), "19");
});
```

- [ ] **Step 3: Add failing tests for valid restore, unknown-ID pruning, and quarantine**

```js
test("valid v3 progress restores", () => {
  const valid = {
    version: 3,
    bankVersion: "1200-v2.0-2026-08-03",
    courseDay: 2,
    lastAdvancedDate: "2026-08-02",
    entries: {
      "day01-01-own": {
        word: "own",
        courseDay: 1,
        learnedDate: "2026-08-01",
        completedReviewOffsets: [1],
        nextReviewOffset: 2,
        nextReviewDate: "2026-08-03",
      },
    },
    dayCompletion: { "1": "2026-08-01" },
  };
  const { progress } = runStorage({ wordrain_v3: JSON.stringify(valid) });
  assert.equal(progress.courseDay, 2);
  assert.ok(progress.entries["day01-01-own"]);
});

test("unknown item IDs are pruned while valid records survive", () => {
  const seeded = {
    version: 3,
    bankVersion: "1200-v2.0-2026-08-03",
    courseDay: 1,
    lastAdvancedDate: null,
    entries: {
      "day01-01-own": { word: "own", courseDay: 1, learnedDate: "2026-08-01", completedReviewOffsets: [], nextReviewOffset: 1, nextReviewDate: "2026-08-02" },
      "old-899-id": { word: "legacy", courseDay: 9, learnedDate: "2026-07-01", completedReviewOffsets: [], nextReviewOffset: 1, nextReviewDate: "2026-07-02" },
    },
    dayCompletion: {},
  };
  const { progress } = runStorage({ wordrain_v3: JSON.stringify(seeded) });
  assert.deepEqual(Object.keys(progress.entries), ["day01-01-own"]);
});

test("incompatible bank version is quarantined and replaced", () => {
  const incompatible = JSON.stringify({ version: 3, bankVersion: "899-v1", courseDay: 20, entries: {}, dayCompletion: {} });
  const { progress, localStorage } = runStorage({ wordrain_v3: incompatible });
  assert.equal(progress.courseDay, 1);
  const quarantineKey = localStorage.keys().find(key => key.startsWith("wordrain_v3_incompatible_"));
  assert.ok(quarantineKey);
  assert.equal(localStorage.getItem(quarantineKey), incompatible);
});
```

- [ ] **Step 4: Run the tests and verify they fail against v2**

Run: `node --test tests/progress-storage-v3.test.mjs`

Expected: FAIL because `SCHEMA_VERSION` and `BANK_VERSION` are not defined and the active key is still `wordrain_v2`.

- [ ] **Step 5: Commit the failing tests**

```bash
git add tests/progress-storage-v3.test.mjs
git commit -m "test: define progress storage v3 behavior"
```

---

### Task 2: Implement isolated and validated v3 storage

**Files:**
- Modify: `word-rain.html:434-494`
- Modify: `word-rain.html:719-722`
- Test: `tests/progress-storage-v3.test.mjs`

**Interfaces:**
- Consumes: `ITEM_BY_ID: Map<string, CourseItem>` and `CONFIG.reviewOffsets: readonly number[]` already defined above the storage block.
- Produces: `STORE_KEY = "wordrain_v3"`, `SCHEMA_VERSION = 3`, `BANK_VERSION = "1200-v2.0-2026-08-03"`, normalized `progress`, and unchanged public functions used by the session code: `saveStore`, `syncCourseDay`, `markLearned`, `markReviewed`, `dueReviews`.

- [ ] **Step 1: Replace legacy migration with v3 constants and an empty store**

```js
const STORE_KEY="wordrain_v3";
const SCHEMA_VERSION=3;
const BANK_VERSION="1200-v2.0-2026-08-03";

function emptyStore(){
  return {
    version:SCHEMA_VERSION,
    bankVersion:BANK_VERSION,
    courseDay:1,
    lastAdvancedDate:null,
    entries:{},
    dayCompletion:{},
  };
}
```

Delete `migrateLegacy()` completely. No replacement may read `wordrain_v2`, `wordrain_sr`, or `wordrain_day`.

- [ ] **Step 2: Add explicit normalization helpers**

```js
function isPlainObject(value){
  return !!value&&typeof value==="object"&&!Array.isArray(value);
}
function isDateString(value){
  return typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value);
}
function normalizeEntry(id,record){
  const item=ITEM_BY_ID.get(id);
  if(!item||!isPlainObject(record)||!isDateString(record.learnedDate))return null;
  const completed=[...new Set(Array.isArray(record.completedReviewOffsets)?record.completedReviewOffsets:[])]
    .filter(offset=>CONFIG.reviewOffsets.includes(offset)).sort((a,b)=>a-b);
  const next=record.nextReviewOffset==null?null:Number(record.nextReviewOffset);
  if(next!==null&&!CONFIG.reviewOffsets.includes(next))return null;
  return {
    word:item.word,
    courseDay:item.day,
    learnedDate:record.learnedDate,
    completedReviewOffsets:completed,
    nextReviewOffset:next,
    nextReviewDate:next===null?null:addDays(record.learnedDate,next),
  };
}
function normalizeStore(parsed){
  if(!isPlainObject(parsed)||parsed.version!==SCHEMA_VERSION||parsed.bankVersion!==BANK_VERSION||
     !isPlainObject(parsed.entries)||!isPlainObject(parsed.dayCompletion))throw new Error("incompatible schema");
  const normalized=emptyStore();
  normalized.courseDay=Math.min(30,Math.max(1,Number(parsed.courseDay)||1));
  normalized.lastAdvancedDate=isDateString(parsed.lastAdvancedDate)?parsed.lastAdvancedDate:null;
  for(const [id,record] of Object.entries(parsed.entries)){
    const clean=normalizeEntry(id,record); if(clean)normalized.entries[id]=clean;
  }
  for(const [day,date] of Object.entries(parsed.dayCompletion)){
    const dayNumber=Number(day);
    if(Number.isInteger(dayNumber)&&dayNumber>=1&&dayNumber<=30&&isDateString(date))normalized.dayCompletion[String(dayNumber)]=date;
  }
  return normalized;
}
```

- [ ] **Step 3: Load only v3 and quarantine incompatible v3 payloads**

```js
function loadStore(){
  const raw=localStorage.getItem(STORE_KEY);
  if(!raw){const fresh=emptyStore();saveStore(fresh);return fresh;}
  try{
    const normalized=normalizeStore(JSON.parse(raw));
    saveStore(normalized);
    return normalized;
  }catch(_){
    try{localStorage.setItem(`${STORE_KEY}_incompatible_${Date.now()}`,raw);}catch(__){}
    const fresh=emptyStore();saveStore(fresh);return fresh;
  }
}
```

Keep `saveStore`, `syncCourseDay`, `markLearned`, `markReviewed`, and `dueReviews` behavior unchanged except that they now operate on v3.

- [ ] **Step 4: Restrict reset to the active v3 key**

Change the reset storage operation to:

```js
localStorage.removeItem(STORE_KEY);
progress=emptyStore();
saveStore();
```

Do not remove `wordrain_v2`, `wordrain_sr`, or `wordrain_day`.

- [ ] **Step 5: Run automated tests**

Run: `node --test tests/progress-storage-v3.test.mjs`

Expected: 4 tests pass, 0 fail.

- [ ] **Step 6: Search for forbidden legacy reads**

Run: `rg -n 'getItem\("wordrain_v2"|getItem\("wordrain_sr"|getItem\("wordrain_day"|removeItem\("wordrain_v2"|removeItem\("wordrain_sr"|removeItem\("wordrain_day"' word-rain.html`

Expected: no matches.

- [ ] **Step 7: Commit the implementation**

```bash
git add word-rain.html tests/progress-storage-v3.test.mjs
git commit -m "feat: isolate 1200-word progress in v3 storage"
```

---

### Task 3: Update documentation and perform browser-level verification

**Files:**
- Modify: `CLAUDE.md:63-72`
- Modify: `CLAUDE.md:193-201`
- Modify: `README.md`
- Test: `tests/progress-storage-v3.test.mjs`

**Interfaces:**
- Consumes: The completed `wordrain_v3` implementation.
- Produces: Accurate operator documentation and evidence that old 899 progress cannot affect the 1200-word welcome screen.

- [ ] **Step 1: Update storage documentation**

Document these exact statements in `CLAUDE.md` and the progress section of `README.md`:

```markdown
- 存储：localStorage `wordrain_v3`
- 词库版本：`1200-v2.0-2026-08-03`
- 旧版 `wordrain_v2` / `wordrain_sr` / `wordrain_day` 不迁移、不读取、不删除
- 首次使用1200词系统时从 Day 01 建立全新进度
```

- [ ] **Step 2: Run the complete automated check**

Run: `node --test tests/progress-storage-v3.test.mjs`

Expected: 4 tests pass, 0 fail.

- [ ] **Step 3: Verify syntax of the application script**

Run:

```bash
node --input-type=module -e 'import fs from "node:fs"; const html=fs.readFileSync("word-rain.html","utf8"); const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match=>match[1]).filter(Boolean); for(const source of scripts)new Function(source); console.log("syntax ok");'
```

Expected: exit code 0 and output `syntax ok`.

- [ ] **Step 4: Perform browser verification with seeded legacy data**

In a browser on the local page:

1. Set `wordrain_v2` to a payload with `courseDay: 19`.
2. Remove only `wordrain_v3` and reload.
3. Confirm the welcome screen shows Day 01.
4. Confirm `wordrain_v3` contains `version:3` and `bankVersion:"1200-v2.0-2026-08-03"`.
5. Confirm `wordrain_v2` remains present and unchanged.
6. Complete or programmatically seed one valid v3 entry, reload, and confirm it restores.
7. Use “重置进度”, confirm v3 returns to Day 01 and v2 remains unchanged.

- [ ] **Step 5: Run final repository checks**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: only `CLAUDE.md` and `README.md` are modified after the Task 2 commit.

- [ ] **Step 6: Commit documentation**

```bash
git add CLAUDE.md README.md
git commit -m "docs: describe progress storage v3 isolation"
```
