# Word and Phrase Spelling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ordinary vocabulary entries spell by letter while phrase entries spell by spoken word block, with spaces, parentheses, and placeholder ellipses producing no speech and no independent delay.

**Architecture:** Keep the implementation in the existing `word-rain.html` application and add one pure `buildSpellingSteps(item)` boundary between vocabulary data and playback. Test that boundary directly with Node's built-in test runner, then make the existing spelling loop consume those steps and use awaited browser TTS only for phrase word blocks.

**Tech Stack:** Static HTML, browser JavaScript, Web Speech API, existing audio helpers, Node.js built-in `node:test`, Node.js `vm` test harness.

## Global Constraints

- Ordinary words spell one English letter at a time.
- Entries whose `cat` is exactly `phrase` spell one continuous English word block at a time.
- Spaces, `(`, `)`, `...`, and `…` never form a spoken step and never receive an independent delay.
- Parenthesized English words remain spoken word blocks; only the punctuation is ignored.
- The cumulative spelling display must finish with text exactly equal to the original `item.word`.
- Preserve full-item reveal, Chinese prompt, recall, rapid recognition, review scheduling, progress storage, vocabulary data, audio filenames, repetition counts, and visual styling.
- Do not add dependencies or generate component-word MP3 files.

---

### Task 1: Define executable spelling-step behavior

**Files:**
- Create: `tests/spelling-units.test.mjs`
- Test: `word-rain.html` block between `/* ---------------- Spelling units ---------------- */` and `/* ---------------- Spelling playback ---------------- */`

**Interfaces:**
- Consumes: A course item shaped as `{ word: string, cat: string }`.
- Produces: Tests for `buildSpellingSteps(item): Array<{ spokenText: string, visibleText: string }>` using code extracted from the real application.

- [ ] **Step 1: Create the real-code test harness**

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../word-rain.html", import.meta.url), "utf8");
const start = html.indexOf("/* ---------------- Spelling units ---------------- */");
const end = html.indexOf("/* ---------------- Spelling playback ---------------- */");
assert.ok(start >= 0 && end > start, "spelling unit block markers must exist");
const source = html.slice(start, end);

function build(item) {
  const context = vm.createContext({});
  vm.runInContext(`${source}\n;globalThis.__buildSpellingSteps=buildSpellingSteps;`, context);
  return Array.from(context.__buildSpellingSteps(item), step => ({ ...step }));
}
```

- [ ] **Step 2: Add word and ordinary phrase expectations**

```js
test("ordinary words produce cumulative letter steps", () => {
  assert.deepEqual(build({ word: "present", cat: "verb" }), [
    { spokenText: "p", visibleText: "p" },
    { spokenText: "r", visibleText: "pr" },
    { spokenText: "e", visibleText: "pre" },
    { spokenText: "s", visibleText: "pres" },
    { spokenText: "e", visibleText: "prese" },
    { spokenText: "n", visibleText: "presen" },
    { spokenText: "t", visibleText: "present" },
  ]);
});

test("phrases produce cumulative word-block steps", () => {
  assert.deepEqual(build({ word: "go through", cat: "phrase" }), [
    { spokenText: "go", visibleText: "go " },
    { spokenText: "through", visibleText: "go through" },
  ]);
});
```

- [ ] **Step 3: Add placeholder and parenthesis expectations**

```js
test("placeholder ellipsis is visible but never becomes a step", () => {
  assert.deepEqual(build({ word: "keep ... going", cat: "phrase" }), [
    { spokenText: "keep", visibleText: "keep ... " },
    { spokenText: "going", visibleText: "keep ... going" },
  ]);
});

test("parentheses are visible while their English word remains spoken", () => {
  assert.deepEqual(build({ word: "be supposed (to)", cat: "phrase" }), [
    { spokenText: "be", visibleText: "be " },
    { spokenText: "supposed", visibleText: "be supposed (" },
    { spokenText: "to", visibleText: "be supposed (to)" },
  ]);
});

test("a single-character ellipsis never becomes a step", () => {
  assert.deepEqual(build({ word: "keep … going", cat: "phrase" }).map(step => step.spokenText), ["keep", "going"]);
});

test("an item with no English content produces no spelling steps", () => {
  assert.deepEqual(build({ word: "(...) ", cat: "phrase" }), []);
});
```

- [ ] **Step 4: Run the new test and verify it fails before implementation**

Run: `node --test tests/spelling-units.test.mjs`

Expected: FAIL with `spelling unit block markers must exist` because the parser has not been added.

- [ ] **Step 5: Commit the failing behavior tests**

```bash
git add tests/spelling-units.test.mjs
git commit -m "test: define word and phrase spelling units"
```

---

### Task 2: Parse spelling steps and use them in playback

**Files:**
- Modify: `word-rain.html:560-644`
- Test: `tests/spelling-units.test.mjs`

**Interfaces:**
- Consumes: `item.word`, `item.cat`, `showLetters`, `playSound`, `visualPulse`, `fallbackTTS`, `speakEN`, `stepDelay`, `gate`, `CONFIG.letterMs`, and `CONFIG.silentFlashMs`.
- Produces: `buildSpellingSteps(item): Array<{ spokenText: string, visibleText: string }>` and `runOneSpellRound(item, round, total, token): Promise<boolean>`.

- [ ] **Step 1: Add the pure spelling-step parser above the spelling loop**

Insert this block before `runOneSpellRound`:

```js
/* ---------------- Spelling units ---------------- */
function buildSpellingSteps(item){
  const word=String(item?.word||"");
  const pattern=item?.cat==="phrase"?/[A-Za-z]+/g:/[A-Za-z]/g;
  const matches=[...word.matchAll(pattern)];
  return matches.map((match,index)=>({
    spokenText:match[0],
    visibleText:word.slice(0,matches[index+1]?.index??word.length),
  }));
}
/* ---------------- Spelling playback ---------------- */
```

The next match's start index makes ignored separators appear immediately after the preceding spoken unit without creating another loop iteration. The final step always includes trailing punctuation.

- [ ] **Step 2: Run parser tests and verify they pass**

Run: `node --test tests/spelling-units.test.mjs`

Expected: PASS for all six tests.

- [ ] **Step 3: Replace character traversal in the active spelling loop**

Replace `runOneSpellRound` with:

```js
async function runOneSpellRound(item,round,total,token){
  const steps=buildSpellingSteps(item),isPhrase=item.cat==="phrase";
  for(const step of steps){
    if(!(await gate(token)))return false;
    showLetters(item,step.visibleText);playSound("beat");visualPulse("beat");
    if(isPhrase){
      const spoken=await fallbackTTS(step.spokenText,"en-US");
      if(!(await gate(token)))return false;
      if(!spoken&&!(await stepDelay(CONFIG.silentFlashMs,token)))return false;
    }else{
      speakEN(step.spokenText,true);
      if(!(await stepDelay(CONFIG.letterMs,token)))return false;
    }
  }
  if(!(await playReveal(item,token)))return false;
  state.pinned.push(round+1);rebuildPinned(item,total);return true;
}
```

Do not modify `playReveal`, `runRecallRounds`, or `runRapid`. Those functions must continue speaking the complete original `item.word`.

- [ ] **Step 4: Remove the unused duplicate spelling function**

Delete `runSpellRounds(item,rounds,token)` at the current `word-rain.html:583-597`. Confirm its only occurrence before deletion:

Run: `rg -n "runSpellRounds" word-rain.html`

Expected before deletion: one function declaration and no call sites. Expected after deletion: no matches.

- [ ] **Step 5: Run the focused and existing automated tests**

Run: `node --test tests/spelling-units.test.mjs tests/progress-storage-v3.test.mjs`

Expected: All tests PASS. The storage tests must remain unchanged by this feature.

- [ ] **Step 6: Commit parser and playback behavior**

```bash
git add word-rain.html
git commit -m "feat: spell phrases by word block"
```

---

### Task 3: Document and manually verify the teaching flow

**Files:**
- Modify: `CLAUDE.md:58-64`
- Test: `word-rain.html`

**Interfaces:**
- Consumes: The implemented `buildSpellingSteps` and `runOneSpellRound` behavior from Task 2.
- Produces: Updated project documentation and a browser-level acceptance record in the final implementation handoff.

- [ ] **Step 1: Update the spelling-stage documentation**

Replace the single sentence under `### 拼读阶段` with:

```markdown
每轮：普通单词逐字母显示并朗读字母；短语逐单词块显示并朗读单词块。空格、括号和占位省略号只显示，不发音、不等待。拼读完成后显示完整词条 + 中文，再朗读完整词条 + 中文(MP3)。
```

- [ ] **Step 2: Run all automated tests**

Run: `node --test tests/*.test.mjs`

Expected: All tests PASS with zero failures.

- [ ] **Step 3: Start a local static server for browser verification**

Run: `python3 -m http.server 8000`

Open: `http://localhost:8000/word-rain.html`

Expected: The welcome screen loads without console errors and the course can start.

- [ ] **Step 4: Verify one ordinary word and representative phrase fixtures**

Use the browser console only for temporary inspection; do not save fixture changes to the repository. Evaluate:

```js
buildSpellingSteps({word:"present",cat:"verb"})
buildSpellingSteps({word:"go through",cat:"phrase"})
buildSpellingSteps({word:"keep ... going",cat:"phrase"})
buildSpellingSteps({word:"be supposed (to)",cat:"phrase"})
```

Expected spoken sequences:

- `present`: `p`, `r`, `e`, `s`, `e`, `n`, `t`
- `go through`: `go`, `through`
- `keep ... going`: `keep`, `going`
- `be supposed (to)`: `be`, `supposed`, `to`

Expected final `visibleText` for every fixture: exactly equal to its original `word`.

- [ ] **Step 5: Verify runtime pause, mute, and downstream playback**

During a phrase spelling round, pause after the first word block. Confirm no later visual step appears until Continue is pressed. Toggle mute and confirm the phrase still advances without hanging. Let the item finish and confirm the full English phrase, Chinese meaning, recall rounds, and rapid-recognition rounds still execute in their existing order.

- [ ] **Step 6: Commit documentation**

```bash
git add CLAUDE.md
git commit -m "docs: explain phrase spelling playback"
```
