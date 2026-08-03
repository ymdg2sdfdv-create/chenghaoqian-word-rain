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
