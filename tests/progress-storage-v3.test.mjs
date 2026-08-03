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
    ITEMS_BY_WORD: new Map(),
  });
  vm.runInContext(
    `${storageSource}\n;globalThis.__storageApi={STORE_KEY,SCHEMA_VERSION,BANK_VERSION,emptyStore,loadStore,saveStore,progress};`,
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
