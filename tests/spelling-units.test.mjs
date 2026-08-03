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
