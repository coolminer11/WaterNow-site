// node --test site/assets/auth.test.js  (the account page's texts, no browser needed)
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { LANGS } = require("./spot-params.js");

const html = fs.readFileSync(path.join(__dirname, "..", "auth", "index.html"), "utf8");
const STRINGS = vm.runInNewContext("(" + /const STRINGS = (\{[\s\S]*?\n  \});/.exec(html)[1] + ")");

test("every app language has every text of the account page", () => {
  assert.deepEqual(Object.keys(STRINGS).sort(), [...LANGS].sort());
  for (const lang of LANGS) {
    assert.deepEqual(Object.keys(STRINGS[lang]).sort(), Object.keys(STRINGS.en).sort(), lang);
    for (const v of Object.values(STRINGS[lang])) assert.ok(typeof v === "string" && v.trim(), lang);
  }
  // Every text the script shows exists (T.same, T.weak… on a refused password).
  for (const [, key] of html.matchAll(/\bT\.(\w+)/g)) assert.ok(Object.hasOwn(STRINGS.en, key), key);
  assert.doesNotMatch(html, /innerHTML|insertAdjacentHTML|document\.write/);
});
