import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../word-rain.html", import.meta.url), "utf8");
const start = html.indexOf("/* ---------------- Classroom review progress ---------------- */");
const end = html.indexOf("/* ---------------- Session ---------------- */");
assert.ok(start >= 0 && end > start, "storage block markers must exist");
const storageSource = html.slice(start, end);

const BANK_VERSION = "unit01-2026-09-05";
const STORE_KEY = "wordrain_classroom_v1";
const ITEM_IDS = ["day24-22-combine", "day01-05-salt", "day13-09-trick"];

function makeStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
    keys: () => [...data.keys()],
  };
}

/** vm-realm objects carry another realm's prototype; compare plain copies. */
const plain = value => JSON.parse(JSON.stringify(value));

function runStorage(seed = {}, search = "") {
  const localStorage = makeStorage(seed);
  const context = vm.createContext({
    console,
    Date,
    URLSearchParams,
    location: { search },
    localStorage,
    CLASSROOM_BANK: { bankVersion: BANK_VERSION },
    ITEM_BY_ID: new Map(ITEM_IDS.map((id, index) => [id, { id, word: id, order: index + 1 }])),
  });
  vm.runInContext(
    `${storageSource}\n;globalThis.__api={STORE_KEY,SCHEMA_VERSION,BANK_VERSION,emptyStore,normalizeStore,loadStore,saveStore,markWordDone,markSessionComplete,markTestComplete,todayCompletedIds,completedToday,testCompletedToday,progress};`,
    context,
  );
  return { ...context.__api, localStorage };
}

test("fresh store is empty and lives under its own key", () => {
  const { progress, localStorage } = runStorage();
  assert.equal(progress.version, 1);
  assert.equal(progress.bankVersion, BANK_VERSION);
  assert.equal(progress.runCount, 0);
  assert.equal(progress.lastCompletedDate, null);
  assert.deepEqual(plain(progress.resume), { date: null, completedIds: [] });
  assert.ok(localStorage.getItem(STORE_KEY));
});

test("legacy 30-day progress is neither read, migrated nor deleted", () => {
  const legacy = JSON.stringify({ version: 3, bankVersion: "1200-v2.0-2026-08-03", cycle: 1, courseDay: 19, entries: { "1:day01-01-own": {} }, dayCompletion: { "1:18": "2026-08-01" } });
  const { progress, localStorage } = runStorage({ wordrain_v3: legacy });
  assert.equal(progress.runCount, 0);
  assert.deepEqual(plain(progress.resume.completedIds), []);
  assert.equal(localStorage.getItem("wordrain_v3"), legacy);
});

test("markWordDone records today's words once each", () => {
  const api = runStorage({}, "?testDate=2026-09-09");
  api.markWordDone(ITEM_IDS[0]);
  api.markWordDone(ITEM_IDS[0]);
  api.markWordDone(ITEM_IDS[1]);
  assert.deepEqual(plain(api.todayCompletedIds()), [ITEM_IDS[0], ITEM_IDS[1]]);
  assert.equal(api.completedToday(), false);
});

test("resume ids from another day are discarded, so every morning starts whole", () => {
  const stored = JSON.stringify({ version: 1, bankVersion: BANK_VERSION, lastCompletedDate: null, runCount: 2, resume: { date: "2026-09-08", completedIds: [ITEM_IDS[0]] } });
  const api = runStorage({ [STORE_KEY]: stored }, "?testDate=2026-09-09");
  assert.deepEqual(plain(api.todayCompletedIds()), []);
  assert.equal(api.progress.resume.completedIds.length, 1);
});

test("markSessionComplete stamps the day, counts the run and clears the resume", () => {
  const api = runStorage({}, "?testDate=2026-09-09");
  api.markWordDone(ITEM_IDS[0]);
  api.markSessionComplete();
  assert.equal(api.progress.lastCompletedDate, "2026-09-09");
  assert.equal(api.progress.runCount, 1);
  assert.deepEqual(plain(api.progress.resume), { date: null, completedIds: [] });
  assert.equal(api.completedToday(), true);
  assert.deepEqual(plain(api.todayCompletedIds()), []);
});

test("stored resume ids that are not in the classroom bank are pruned", () => {
  const stored = JSON.stringify({ version: 1, bankVersion: BANK_VERSION, lastCompletedDate: null, runCount: 0, resume: { date: "2026-09-09", completedIds: [ITEM_IDS[0], "day01-01-own", ITEM_IDS[0]] } });
  const api = runStorage({ [STORE_KEY]: stored }, "?testDate=2026-09-09");
  assert.deepEqual(plain(api.todayCompletedIds()), [ITEM_IDS[0]]);
});

test("a 1200-word store under this key is quarantined and replaced", () => {
  const incompatible = JSON.stringify({ version: 3, bankVersion: "1200-v2.0-2026-08-03", cycle: 2, courseDay: 7, entries: {}, dayCompletion: {} });
  const { progress, localStorage } = runStorage({ [STORE_KEY]: incompatible });
  assert.equal(progress.version, 1);
  assert.equal(progress.runCount, 0);
  const quarantineKey = localStorage.keys().find(key => key.startsWith(`${STORE_KEY}_incompatible_`));
  assert.ok(quarantineKey, "quarantine backup must be written");
  assert.equal(localStorage.getItem(quarantineKey), incompatible);
});

test("the 1200-word engine and its day/cycle vocabulary are gone", () => {
  assert.doesNotMatch(html, /wordrain_v3/);
  assert.doesNotMatch(html, /D30_PLAN|word-bank-data\.js|ITEMS_BY_WORD/);
  assert.doesNotMatch(html, /dueReviews|markLearned|markReviewed|syncCourseDay/);
  assert.doesNotMatch(html, /review-done\.mp3|new-words-start\.mp3/);
  assert.doesNotMatch(html, /reviewOffsets/);
  assert.match(html, /classroom-bank-data\.js/);
});

test("every word runs exactly one pass: 1 spell + 1 recall + 4 rapid", () => {
  assert.match(html, /word: Object\.freeze\(\{ spellRounds: 1, recallRounds: 1, flashCount: 4 \}\)/);
  assert.match(html, /function itemConfig\(\)\{return CONFIG\.word;\}/);
  assert.match(html, /markWordDone\(entry\.item\.id\)/);
  assert.match(html, /markSessionComplete\(\)/);
});

test("the card shows bank form with word family, classroom collocation and new-sense note", () => {
  assert.match(html, /cFamily\.textContent=item\.family\|\|""/);
  assert.match(html, /cColloc\.textContent=item\.collocation\|\|""/);
  assert.match(html, /cNote\.textContent=item\.note\|\|""/);
});

const cardStart = html.indexOf("function clearWordDetail()");
const cardEnd = html.indexOf("async function playReveal");
assert.ok(cardStart >= 0 && cardEnd > cardStart, "card rendering block must exist");
const cardSource = html.slice(cardStart, cardEnd);

function makeCard() {
  const nodes = {};
  for (const name of ["central", "cEN", "cCN", "cFamily", "cColloc", "cNote"]) {
    nodes[name] = { textContent: "", className: "", style: {} };
  }
  const context = vm.createContext({
    central: nodes.central,
    cEN: nodes.cEN, cCN: nodes.cCN,
    cFamily: nodes.cFamily, cColloc: nodes.cColloc, cNote: nodes.cNote,
    W: 1200, H: 800,
    setCentralSizes: () => {},
    animateCentral: name => { nodes.central.className = name; },
    visualPulse: () => {},
    spawnBurst: () => {},
  });
  vm.runInContext(`${cardSource}\n;globalThis.__card={clearWordDetail,showLetters,revealItem,showRecallCue};`, context);
  return { api: context.__card, nodes };
}

const SAMPLE = {
  word: "combine",
  cn: "结合",
  family: "combine → combination",
  collocation: "a combination of A and B",
  note: "",
};

test("reveal paints the word family and classroom collocation", () => {
  const { api, nodes } = makeCard();
  api.revealItem(SAMPLE);
  assert.equal(nodes.cEN.textContent, "combine");
  assert.equal(nodes.cCN.textContent, "结合");
  assert.equal(nodes.cFamily.textContent, "combine → combination");
  assert.equal(nodes.cColloc.textContent, "a combination of A and B");
  assert.equal(nodes.cNote.textContent, "");
  assert.equal(nodes.central.className, "revealed");
});

test("reveal paints the new-sense note for a reused word", () => {
  const { api, nodes } = makeCard();
  api.revealItem({ word: "lies in", cn: "在于", family: "", collocation: "本文：The answer lies in …", note: "本文义需另讲：lie 在 1200 词中为「躺」，本文 lies in 是另一个义项" });
  assert.equal(nodes.cNote.textContent.startsWith("本文义需另讲"), true);
});

test("spelling and recall cues clear the detail lines instead of leaking the last word", () => {
  const { api, nodes } = makeCard();
  api.revealItem(SAMPLE);
  api.showRecallCue(SAMPLE);
  assert.deepEqual([nodes.cFamily.textContent, nodes.cColloc.textContent, nodes.cNote.textContent], ["", "", ""]);
  assert.equal(nodes.central.className, "recall");
  api.revealItem(SAMPLE);
  api.showLetters(SAMPLE, "co");
  assert.deepEqual([nodes.cFamily.textContent, nodes.cColloc.textContent, nodes.cNote.textContent], ["", "", ""]);
  assert.equal(nodes.central.className, "letter");
});

/* ---------------- Test phase: 中文提示 → 自评揭晓 ---------------- */

test("markTestComplete records today's unknowns and counts the test run", () => {
  const api = runStorage({}, "?testDate=2026-09-09");
  assert.equal(api.testCompletedToday(), false);
  api.markTestComplete([ITEM_IDS[1], ITEM_IDS[2]]);
  assert.deepEqual(plain(api.progress.lastTest), { date: "2026-09-09", unknownIds: [ITEM_IDS[1], ITEM_IDS[2]] });
  assert.equal(api.progress.testRunCount, 1);
  assert.equal(api.testCompletedToday(), true);
});

test("a store written before the test phase normalizes instead of being quarantined", () => {
  const reviewOnly = JSON.stringify({ version: 1, bankVersion: BANK_VERSION, lastCompletedDate: "2026-09-08", runCount: 3, resume: { date: null, completedIds: [] } });
  const { progress, localStorage } = runStorage({ [STORE_KEY]: reviewOnly });
  assert.equal(progress.runCount, 3);
  assert.equal(progress.testRunCount, 0);
  assert.deepEqual(plain(progress.lastTest), { date: null, unknownIds: [] });
  assert.equal(localStorage.keys().some(key => key.startsWith(`${STORE_KEY}_incompatible_`)), false);
});

test("test unknowns that are not in the classroom bank are pruned on load", () => {
  const stored = JSON.stringify({ version: 1, bankVersion: BANK_VERSION, lastCompletedDate: null, runCount: 0, resume: { date: null, completedIds: [] }, lastTest: { date: "2026-09-09", unknownIds: [ITEM_IDS[0], "day01-01-own", ITEM_IDS[0]] }, testRunCount: 2 });
  const api = runStorage({ [STORE_KEY]: stored }, "?testDate=2026-09-09");
  assert.deepEqual(plain(api.progress.lastTest.unknownIds), [ITEM_IDS[0]]);
  assert.equal(api.testCompletedToday(), true);
});

const phaseStart = html.indexOf("/* ---------------- Test phase: 中文提示 → 自评揭晓 ---------------- */");
const phaseEnd = html.indexOf("/* ---------------- Overlay UI ---------------- */");
assert.ok(phaseStart >= 0 && phaseEnd > phaseStart, "test phase block must exist");
const phaseSource = html.slice(phaseStart, phaseEnd);

function makeTestPhase() {
  const els = {};
  const el = id => (els[id] ||= {
    textContent: "", className: "",
    classList: { shown: new Set(), add(name) { this.shown.add(name); }, remove(name) { this.shown.delete(name); }, contains(name) { return this.shown.has(name); } },
    style: { display: "", width: "", setProperty() {} },
  });
  const calls = { complete: undefined, feedback: [], spoken: [], spokenEN: [] };
  const context = vm.createContext({
    console, Date, URLSearchParams,
    location: { search: "?testDate=2026-09-09" },
    document: { body: { classList: { shown: new Set(), add(name) { this.shown.add(name); }, remove(name) { this.shown.delete(name); }, contains(name) { return this.shown.has(name); } } } },
    localStorage: makeStorage(),
    CLASSROOM_BANK: { bankVersion: BANK_VERSION },
    ITEM_BY_ID: new Map(ITEM_IDS.map((id, index) => [id, { id, word: id, cn: `中文${index}`, order: index + 1 }])),
    ALL_ITEMS: ITEM_IDS.map((id, index) => ({ id, word: id, cn: `中文${index}`, order: index + 1, cat: "verb" })),
    CAT_META: { verb: { label: "动词" } },
    CONFIG: { revealHoldMs: 0 },
    $: el,
    central: el("central"), cEN: el("cEN"), cCN: el("cCN"),
    cFamily: el("cFamily"), cColloc: el("cColloc"), cNote: el("cNote"),
    phaseLabel: el("phaseLabel"), fillBar: el("fillBar"), catLabel: el("catLabel"), statsEl: el("statsEl"),
    welcomeOverlay: el("welcomeOverlay"), completeOverlay: el("completeOverlay"),
    state: { active: false, runToken: 0, pauseWaiters: [], testQueue: [], testIdx: 0, unknownIds: [], testAnswered: false, current: null, phase: "idle", stageText: "" },
    ensureAudio() {}, loadVoices() {}, invalidateRun() {}, stopSpeech() {}, pauseSpeech() {}, resumeSpeech() {},
    setCentralSizes() {}, animateCentral(name) { el("central").className = name; }, visualPulse() {},
    clearWordDetail() { el("cFamily").textContent = ""; el("cColloc").textContent = ""; el("cNote").textContent = ""; },
    catMeta: () => ({ label: "动词" }),
    updateStage(text) { el("statsEl").textContent = text; },
    revealItem(item) { el("cEN").textContent = item.word; el("cCN").textContent = item.cn; },
    speakEN: async text => { calls.spokenEN.push(text); return true; },
    speakCN: async item => { calls.spoken.push(item.cn); return true; },
    stepDelay: async () => true,
    playSound() {},
    playFeedback: async name => { calls.feedback.push(name); return true; },
    showComplete(unknownIds) { calls.complete = unknownIds; },
  });
  vm.runInContext(`${storageSource}\n${phaseSource}\n;globalThis.__t={beginTest,answerTestItem,finishTest,state,progress};`, context);
  return { api: context.__t, els, calls, doc: context.document };
}

test("the test prompt shows only the English, speaks it, and never leaks the Chinese answer", () => {
  const { api, els, calls } = makeTestPhase();
  api.beginTest();
  assert.equal(api.state.phase, "test");
  assert.equal(api.state.testQueue.length, ITEM_IDS.length);
  assert.equal(api.state.testIdx, 0);
  assert.equal(els.cEN.textContent, ITEM_IDS[0]);
  assert.equal(els.cCN.textContent, "");
  assert.equal(els.curWord.textContent, "—");
  assert.equal(els.testActions.classList.contains("show"), true);
  assert.equal(els.phaseLabel.textContent, `测试  1/${ITEM_IDS.length}`);
  assert.equal(els.statsEl.textContent, "根据英文说出中文");
  assert.deepEqual([...calls.spokenEN], [ITEM_IDS[0]], "the English prompt must be read aloud");
});

test("the test runs on a clean background: canvas cleared and review HUD hidden", () => {
  const { api, doc } = makeTestPhase();
  api.state.instances = [{ text: "come from" }];
  api.state.pinned = [1];
  api.state.rapidBoxes = [{}];
  api.beginTest();
  assert.deepEqual([...api.state.instances], []);
  assert.equal(api.state.pinned.length, 0);
  assert.equal(api.state.rapidBoxes.length, 0);
  assert.equal(doc.body.classList.contains("testing"), true);
});

test("the answer reveal paints the Chinese meaning and speaks it", async () => {
  const { api, els, calls, doc } = makeTestPhase();
  api.beginTest();
  await api.answerTestItem(true);
  assert.equal(calls.spoken[0], "中文0");
  assert.equal(doc.body.classList.contains("testing"), true);
  await api.answerTestItem(true);
  await api.answerTestItem(true);
  assert.equal(doc.body.classList.contains("testing"), false);
});

test("only the words the student could not recall are recorded", async () => {
  const { api, calls } = makeTestPhase();
  api.beginTest();
  await api.answerTestItem(false);
  await api.answerTestItem(true);
  assert.deepEqual([...api.state.unknownIds], [ITEM_IDS[0]]);
  await api.answerTestItem(false);
  assert.deepEqual([...api.state.unknownIds], [ITEM_IDS[0], ITEM_IDS[2]]);
  assert.deepEqual(plain(calls.complete), [ITEM_IDS[0], ITEM_IDS[2]]);
  assert.equal(api.state.active, false);
  assert.equal(api.progress.testRunCount, 1);
  assert.deepEqual(plain(api.progress.lastTest), { date: "2026-09-09", unknownIds: [ITEM_IDS[0], ITEM_IDS[2]] });
  assert.deepEqual(calls.feedback, ["test-complete.mp3"]);
});

test("a second tap while the answer is still revealing is ignored", async () => {
  const { api } = makeTestPhase();
  api.beginTest();
  const first = api.answerTestItem(false);
  const second = api.answerTestItem(false);
  await Promise.all([first, second]);
  assert.deepEqual([...api.state.unknownIds], [ITEM_IDS[0]]);
  assert.equal(api.state.testIdx, 1);
});

test("the test walks all 92 items, not just the ones answered wrong", async () => {
  const { api } = makeTestPhase();
  api.beginTest();
  for (let index = 0; index < ITEM_IDS.length; index += 1) await api.answerTestItem(true);
  assert.equal(api.state.testIdx, ITEM_IDS.length);
  assert.deepEqual([...api.state.unknownIds], []);
});

test("encouragement fires every 15 words and cycles through the five clips", () => {
  assert.match(html, /state\.queueIdx%15===0&&state\.queueIdx<state\.queue\.length/);
  assert.match(html, /const round=Math\.floor\(state\.queueIdx\/15\)/);
  assert.match(html, /encourage-\$\{\(\(round-1\)%5\)\+1\}\.mp3/);
});

test("every feedback clip the page plays exists on disk and is non-empty", () => {
  const names = [...html.matchAll(/playFeedback\(\s*"([^"$]+\.mp3)"\s*\)/g)].map(match => match[1]);
  assert.deepEqual([...new Set(names)].sort(), ["complete.mp3", "review-start.mp3", "test-complete.mp3", "welcome.mp3"]);
  for (const name of names) {
    const file = new URL(`../assets/audio/feedback/${name}`, import.meta.url);
    assert.ok(fs.existsSync(file), `${name} must exist`);
    assert.ok(fs.statSync(file).size > 100, `${name} must not be empty`);
  }
});

test("the feedback script regenerates exactly the clips the page can play", () => {
  const script = fs.readFileSync(new URL("../scripts/generate-feedback-audio.py", import.meta.url), "utf8");
  const listed = [...script.matchAll(/\(\s*"([^"]+\.mp3)"/g)].map(match => match[1]).sort();
  assert.deepEqual(listed, ["complete.mp3", "encourage-1.mp3", "encourage-2.mp3", "encourage-3.mp3", "encourage-4.mp3", "encourage-5.mp3", "review-start.mp3", "test-complete.mp3", "welcome.mp3"]);
  assert.doesNotMatch(script, /review-done\.mp3|new-words-start\.mp3/);
});

test("the welcome buttons sit side by side in the stats row's two columns", () => {
  assert.match(html, /#welcomeContent \.welcome-actions\{width:min\(390px,88%\);display:grid;grid-template-columns:1fr 1fr;gap:10px\}/);
  assert.match(html, /<div class="welcome-actions\$\{actions\.length===1\?" single":""\}">/);
  assert.doesNotMatch(html, /\$\{actions\}/, "actions must be injected through the grid wrapper, not bare");
});

test("every word, phrase and spelling block has its own EN and CN clip on disk", () => {
  const source = fs.readFileSync(new URL("../classroom-bank-data.js", import.meta.url), "utf8");
  const bank = JSON.parse(source.split("const CLASSROOM_BANK = ", 2)[1].split(";\n", 1)[0]);
  const safe = value => value.replace(/ /g, "-").replace(/\//g, "-").replace(/\\/g, "-");
  const missing = [];
  for (const item of bank.items) {
    const blocks = item.cat === "phrase"
      ? [...item.word.matchAll(/[A-Za-z]+/g)].map(match => match[0]).concat(item.word)
      : [item.word];
    for (const block of blocks) {
      const file = new URL(`../assets/audio/words-en/${safe(block)}.mp3`, import.meta.url);
      if (!fs.existsSync(file)) missing.push(`EN ${block}`);
    }
    const cn = new URL(`../assets/audio/words-cn/${safe(item.word)}.mp3`, import.meta.url);
    if (!fs.existsSync(cn)) missing.push(`CN ${item.word}`);
  }
  assert.deepEqual(missing, [], "missing clips fall back to browser TTS and mispronounce abbreviations");
});
