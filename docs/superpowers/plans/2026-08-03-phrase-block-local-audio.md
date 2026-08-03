# Phrase Block Local Audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every phrase spelling word block play its matching local English MP3 first and use browser TTS only when local playback fails.

**Architecture:** Reuse the existing `speakEN(text)` local-file-first audio interface instead of adding another player. Keep parsing and ordinary-word spelling unchanged, add an isolated VM playback harness for control-flow tests, and verify that all phrase components map to valid local assets.

**Tech Stack:** Static HTML, browser JavaScript, existing HTML Audio and Web Speech APIs, Node.js built-in `node:test`, Node.js `vm`, macOS `afinfo`.

## Global Constraints

- Phrase word blocks load `assets/audio/words-en/<lowercase-word>.mp3` through the existing `speakEN(text)` interface.
- Local playback failure falls back to browser English TTS through the existing `speak` implementation.
- Local playback and TTS failure performs exactly one `CONFIG.silentFlashMs` delay before continuing.
- Spaces, `(`, `)`, `...`, and `…` never form a spoken step or receive an independent delay.
- Preserve ordinary-word letter spelling, full-item reveal, Chinese audio, recall, rapid recognition, repetition counts, review scheduling, and visual styling.
- Keep the 80 new MP3 assets separate from code commits.
- Do not generate, replace, concatenate, or edit any other audio file.
- Do not add dependencies.

---

### Task 1: Verify and commit the phrase component audio assets

**Files:**
- Create: `assets/audio/words-en/{a,able,about,according,add,after,all,also,apart,apply,around,as,ask,at,back,based,be,because,but,call,calm,clean,come,difference,down,end,even,faced,filled,find,for,from,get,give,go,going,good,grow,if,in,keep,lead,learn,long,look,make,more,no,not,number,of,off,on,one,only,out,pick,place,put,rather,rely,responsible,search,show,so,speed,stand,take,than,that,the,think,to,turn,up,used,wake,well,with,work}.mp3`
- Test: `word-bank-data.js`

**Interfaces:**
- Consumes: Every `item.word` whose `item.cat === "phrase"` in `D30_PLAN`.
- Produces: A non-empty, decodable local MP3 for every unique `/[A-Za-z]+/g` phrase component.

- [ ] **Step 1: Verify all phrase components have non-empty files**

Run:

```bash
node -e 'const fs=require("fs"),src=fs.readFileSync("word-bank-data.js","utf8"),plan=new Function(src+";return D30_PLAN")(),parts=[...new Set(Object.values(plan).flat().filter(x=>x.cat==="phrase").flatMap(x=>x.word.match(/[A-Za-z]+/g)||[]).map(x=>x.toLowerCase()))],dir="assets/audio/words-en",missing=parts.filter(x=>!fs.existsSync(`${dir}/${x}.mp3`)||fs.statSync(`${dir}/${x}.mp3`).size===0);console.log({uniqueBlocks:parts.length,missing});if(parts.length!==108||missing.length)process.exit(1)'
```

Expected: `{ uniqueBlocks: 108, missing: [] }` and exit code 0.

- [ ] **Step 2: Verify all 80 added MP3 files decode**

Run:

```bash
failed=0
for audio_file in $(git diff --cached --name-only --diff-filter=A); do
  /usr/bin/afinfo "$audio_file" >/dev/null 2>&1 || { echo "decode-failed $audio_file"; failed=$((failed+1)); }
done
echo "decode-failures=$failed"
test "$failed" -eq 0
```

Expected: `decode-failures=0`.

- [ ] **Step 3: Verify the staged asset scope**

Run:

```bash
test "$(git diff --cached --name-only --diff-filter=A | wc -l | tr -d ' ')" = "80"
test -z "$(git diff --cached --name-only --diff-filter=A | rg -v '^assets/audio/words-en/[a-z]+\.mp3$')"
```

Expected: Both commands exit 0; exactly 80 staged additions exist and every path matches the asset directory and lowercase filename contract.

- [ ] **Step 4: Commit only the audio assets**

```bash
git commit -m "audio: add phrase spelling word blocks"
```

Expected: One commit containing exactly 80 binary additions and no source or documentation files.

---

### Task 2: Add executable phrase playback tests

**Files:**
- Create: `tests/phrase-block-audio.test.mjs`
- Test: `word-rain.html` function `runOneSpellRound(item, round, total, token)`

**Interfaces:**
- Consumes: The real `runOneSpellRound` function extracted from `word-rain.html`.
- Produces: A VM harness that records calls to `speakEN`, `fallbackTTS`, `stepDelay`, `showLetters`, and `playReveal`.

- [ ] **Step 1: Create a playback harness around the real function**

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../word-rain.html", import.meta.url), "utf8");
const start = html.indexOf("async function runOneSpellRound");
const end = html.indexOf("async function finishCurrentItem", start);
assert.ok(start >= 0 && end > start, "active spelling function must exist");
const source = html.slice(start, end);
const audioStart = html.indexOf("async function speak(text");
const audioEnd = html.indexOf("const speakEN", audioStart);
assert.ok(audioStart >= 0 && audioEnd > audioStart, "shared speech function must exist");
const audioSource = html.slice(audioStart, audioEnd);

async function runRound({ item, steps, speakResult = true }) {
  const calls = [];
  const context = vm.createContext({
    CONFIG: { letterMs: 340, silentFlashMs: 620 },
    state: { pinned: [] },
    buildSpellingSteps: () => steps,
    gate: async () => true,
    showLetters: (_item, text) => calls.push(["show", text]),
    playSound: kind => calls.push(["sound", kind]),
    visualPulse: kind => calls.push(["pulse", kind]),
    speakEN: async (...args) => { calls.push(["speakEN", ...args]); return speakResult; },
    fallbackTTS: async (...args) => { calls.push(["fallbackTTS", ...args]); return true; },
    stepDelay: async ms => { calls.push(["delay", ms]); return true; },
    playReveal: async () => { calls.push(["reveal"]); return true; },
    rebuildPinned: (_item, total) => calls.push(["pinned", total]),
  });
  vm.runInContext(`${source}\n;globalThis.__runOneSpellRound=runOneSpellRound;`, context);
  const result = await context.__runOneSpellRound(item, 0, 1, 7);
  return { calls, result };
}

async function runSpeak({ fileResult, ttsResult }) {
  const calls = [];
  const context = vm.createContext({
    muted: false,
    EN_DIR: "assets/audio/words-en/",
    CN_DIR: "assets/audio/words-cn/",
    safeFn: text => text,
    playFile: async url => { calls.push(["file", url]); return fileResult; },
    fallbackTTS: async (...args) => { calls.push(["tts", ...args]); return ttsResult; },
  });
  vm.runInContext(`${audioSource}\n;globalThis.__speak=speak;`, context);
  const result = await context.__speak("keep", "en-US");
  return { calls, result };
}
```

- [ ] **Step 2: Test that phrase blocks use awaited `speakEN` calls**

```js
test("phrase blocks use local-first speakEN in order", async () => {
  const { calls, result } = await runRound({
    item: { word: "keep ... going", cat: "phrase" },
    steps: [
      { spokenText: "keep", visibleText: "keep ... " },
      { spokenText: "going", visibleText: "keep ... going" },
    ],
  });
  assert.equal(result, true);
  assert.deepEqual(calls.filter(call => call[0] === "speakEN"), [
    ["speakEN", "keep"],
    ["speakEN", "going"],
  ]);
  assert.equal(calls.some(call => call[0] === "fallbackTTS"), false);
  assert.equal(calls.some(call => call[0] === "delay"), false);
  assert.ok(calls.findIndex(call => call[0] === "reveal") > calls.findIndex(call => call[1] === "going"));
});
```

- [ ] **Step 3: Test silent fallback and ordinary-word isolation**

```js
test("failed phrase speech receives one silent fallback delay", async () => {
  const { calls } = await runRound({
    item: { word: "go through", cat: "phrase" },
    steps: [{ spokenText: "go", visibleText: "go" }],
    speakResult: false,
  });
  assert.deepEqual(calls.filter(call => call[0] === "delay"), [["delay", 620]]);
});

test("ordinary words keep the letter spelling path", async () => {
  const { calls } = await runRound({
    item: { word: "present", cat: "verb" },
    steps: [{ spokenText: "p", visibleText: "p" }],
  });
  assert.deepEqual(calls.filter(call => call[0] === "speakEN"), [["speakEN", "p", true]]);
  assert.deepEqual(calls.filter(call => call[0] === "delay"), [["delay", 340]]);
});

test("shared speech uses local MP3 before browser TTS", async () => {
  const local = await runSpeak({ fileResult: true, ttsResult: true });
  assert.equal(local.result, true);
  assert.deepEqual(local.calls, [["file", "assets/audio/words-en/keep.mp3"]]);

  const fallback = await runSpeak({ fileResult: false, ttsResult: true });
  assert.equal(fallback.result, true);
  assert.deepEqual(fallback.calls, [
    ["file", "assets/audio/words-en/keep.mp3"],
    ["tts", "keep", "en-US"],
  ]);
});
```

- [ ] **Step 4: Run the new tests and verify the phrase test fails**

Run: `node --test tests/phrase-block-audio.test.mjs`

Expected: FAIL because the current phrase branch calls `fallbackTTS(step.spokenText, "en-US")` instead of `speakEN(step.spokenText)`.

- [ ] **Step 5: Commit the failing playback tests**

```bash
git add tests/phrase-block-audio.test.mjs
git commit -m "test: require local phrase block audio"
```

---

### Task 3: Route phrase blocks through local-first playback

**Files:**
- Modify: `word-rain.html:658-668`
- Test: `tests/phrase-block-audio.test.mjs`
- Test: `tests/spelling-units.test.mjs`
- Test: `tests/progress-storage-v3.test.mjs`

**Interfaces:**
- Consumes: `speakEN(text, single = false): Promise<boolean>` and parsed `step.spokenText`.
- Produces: Phrase spelling that waits for local MP3 or TTS completion and preserves the existing Boolean failure contract.

- [ ] **Step 1: Replace the direct phrase TTS call**

Change only the phrase branch inside `runOneSpellRound`:

```js
if(isPhrase){
  const spoken=await speakEN(step.spokenText);
  if(!(await gate(token)))return false;
  if(!spoken&&!(await stepDelay(CONFIG.silentFlashMs,token)))return false;
}else{
  speakEN(step.spokenText,true);
  if(!(await stepDelay(CONFIG.letterMs,token)))return false;
}
```

- [ ] **Step 2: Run all automated tests**

Run: `node --test tests/*.test.mjs`

Expected: All storage, spelling parser, and phrase playback tests PASS with zero failures.

- [ ] **Step 3: Confirm the source change is narrowly scoped**

Run:

```bash
git diff --check -- word-rain.html
git diff -- word-rain.html
```

Expected: The source diff replaces only `fallbackTTS(step.spokenText,"en-US")` with `speakEN(step.spokenText)`.

- [ ] **Step 4: Commit the playback implementation**

```bash
git add word-rain.html
git commit -m "feat: use local audio for phrase blocks"
```

---

### Task 4: Document and verify the complete browser flow

**Files:**
- Modify: `CLAUDE.md:60-64`
- Test: `word-rain.html`

**Interfaces:**
- Consumes: The complete local-first phrase block playback from Task 3.
- Produces: Current project documentation and browser acceptance evidence.

- [ ] **Step 1: Update the spelling-stage documentation**

Replace the current paragraph under `### 拼读阶段` with:

```markdown
每轮：普通单词逐字母显示并朗读字母；短语逐单词块显示，并优先播放对应的本地英文 MP3，文件播放失败时回退浏览器 TTS。空格、括号和占位省略号只显示，不发音、不等待。拼读完成后显示完整词条 + 中文，再朗读完整词条 + 中文(MP3)。
```

- [ ] **Step 2: Run the full automated suite once more**

Run: `node --test tests/*.test.mjs`

Expected: All tests PASS with zero failures.

- [ ] **Step 3: Start a local server and open the page**

Run: `python3 -m http.server 8000`

Open: `http://localhost:8000/word-rain.html`

Expected: The welcome screen loads without console errors.

- [ ] **Step 4: Verify playback controls and downstream stages**

Start the course, pause during spelling, wait at least 800 ms, and confirm neither the stage nor displayed English advances. Continue and confirm playback resumes. Toggle mute and confirm the course advances from spelling or recall into rapid recognition without hanging.

- [ ] **Step 5: Verify representative phrase assets through HTTP**

Open or request these local URLs and confirm HTTP 200 with playable MP3 content:

```text
http://localhost:8000/assets/audio/words-en/go.mp3
http://localhost:8000/assets/audio/words-en/through.mp3
http://localhost:8000/assets/audio/words-en/keep.mp3
http://localhost:8000/assets/audio/words-en/going.mp3
http://localhost:8000/assets/audio/words-en/not.mp3
http://localhost:8000/assets/audio/words-en/only.mp3
http://localhost:8000/assets/audio/words-en/but.mp3
http://localhost:8000/assets/audio/words-en/also.mp3
```

- [ ] **Step 6: Commit documentation and the executed plan**

```bash
git add CLAUDE.md docs/superpowers/plans/2026-08-03-phrase-block-local-audio.md
git commit -m "docs: explain local phrase block audio"
```
