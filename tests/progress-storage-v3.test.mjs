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
  assert.ok(progress.entries["1:day01-01-own"]);
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
  assert.deepEqual(Object.keys(progress.entries), ["1:day01-01-own"]);
});

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
  assert.deepEqual(Array.from(due, task => task.instanceId), ["1:day01-01-own"]);
  api.markReviewed(due[0]);
  assert.equal(api.progress.entries["1:day01-01-own"].nextReviewOffset, 2);
  assert.equal(api.progress.entries["2:day01-01-own"].nextReviewOffset, 1);
});

test("cycle-aware records require a positive integer cycle and an exact instance key", () => {
  const record = (itemId, cycle) => ({
    itemId, cycle, learnedDate: "2026-08-01", completedReviewOffsets: [],
    nextReviewOffset: 1, nextReviewDate: "2026-08-02",
  });
  const api = runStorage();
  const normalized = api.normalizeStore({
    version: 3, bankVersion: "1200-v2.0-2026-08-03", cycle: 2,
    courseDay: 1, lastAdvancedDate: null,
    entries: {
      "2:day01-01-own": record("day01-01-own", 2),
      "1.5:day02-01-increase": record("day02-01-increase", 1.5),
      "Infinity:day30-01-proud": record("day30-01-proud", Infinity),
      "1:day01-01-own": record("day01-01-own", 0),
      "1:day02-01-increase": record("day02-01-increase", -2),
      "3:day30-01-proud": record("day30-01-proud", 2),
    },
    dayCompletion: {},
  });
  assert.deepEqual(Object.keys(normalized.entries), ["2:day01-01-own"]);
});

test("replaying a stale review task does not advance a later offset", () => {
  const seeded = {
    version: 3, bankVersion: "1200-v2.0-2026-08-03", cycle: 1,
    courseDay: 1, lastAdvancedDate: null,
    entries: {
      "1:day01-01-own": { itemId: "day01-01-own", cycle: 1, word: "own", courseDay: 1, learnedDate: "2026-08-01", completedReviewOffsets: [], nextReviewOffset: 1, nextReviewDate: "2026-08-02" },
    },
    dayCompletion: {},
  };
  const api = runStorage({ wordrain_v3: JSON.stringify(seeded) }, "?testDate=2026-08-02");
  const task = api.dueReviews()[0];
  api.markReviewed(task);
  assert.equal(api.progress.entries[task.instanceId].nextReviewOffset, 2);
  api.markReviewed(task);
  assert.equal(api.progress.entries[task.instanceId].nextReviewOffset, 2);
});

test("session uses cycle-aware keys and does not keep a terminal courseComplete branch", () => {
  assert.match(html, /entryKey\(progress\.cycle,item\.id\)/);
  assert.match(html, /completionKey\(progress\.cycle,day\)/);
  assert.doesNotMatch(html, /const courseComplete=/);
  assert.match(html, /markReviewed\(entry\)/);
});

test("incompatible bank version is quarantined and replaced", () => {
  const incompatible = JSON.stringify({ version: 3, bankVersion: "899-v1", courseDay: 20, entries: {}, dayCompletion: {} });
  const { progress, localStorage } = runStorage({ wordrain_v3: incompatible });
  assert.equal(progress.courseDay, 1);
  const quarantineKey = localStorage.keys().find(key => key.startsWith("wordrain_v3_incompatible_"));
  assert.ok(quarantineKey);
  assert.equal(localStorage.getItem(quarantineKey), incompatible);
});
