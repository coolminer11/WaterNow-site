// node --test site/assets/i18n.test.js  (the landing and share pages' texts, no browser needed; live and auth have their own)
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { LANGS } = require("./spot-params.js");

const read = (file) => fs.readFileSync(path.join(__dirname, file), "utf8");
// A page's STRINGS table, read from its script (the pages themselves only run in a browser).
const table = (file) => vm.runInNewContext("(" + /var STRINGS = (\{[\s\S]*?\n  \});/.exec(read(file))[1] + ")");
const shape = (o) => Object.keys(o).sort().map((k) => k + ":" + (typeof o[k] === "object" ? "{" + shape(o[k]) + "}" : typeof o[k])).join(",");
const texts = (o) => Object.values(o).flatMap((v) => (typeof v === "object" ? texts(v) : [v]));

for (const file of ["home.js", "../s/app.js", "page.js"]) {
  test(file + ": every app language has every text, in the same shape as English", () => {
    const STRINGS = table(file);
    assert.deepEqual(Object.keys(STRINGS).sort(), [...LANGS].sort());
    for (const lang of LANGS) {
      assert.equal(shape(STRINGS[lang]), shape(STRINGS.en), lang);
      for (const v of texts(STRINGS[lang])) if (typeof v === "string") assert.ok(v.trim(), lang);
    }
  });
}

test("Romanian review counts: 1 recenzie, 3 recenzii, 20 de recenzii", () => {
  const { rating } = table("../s/app.js").ro;
  for (const [n, want] of [[1, "1 recenzie"], [3, "3 recenzii"], [19, "19 recenzii"], [20, "20 de recenzii"], [100, "100 de recenzii"],
    [101, "101 recenzii"], [120, "120 de recenzii"]]) {
    assert.equal(rating("4,5", n), "Evaluare 4,5/5 (" + want + ")", String(n));
  }
});

test("Romanian is written with comma-below ș ț, never the cedilla ş ţ", () => {
  for (const file of ["home.js", "live.js", "../s/app.js", "page.js", "../auth/index.html"]) assert.doesNotMatch(read(file), /[şţŞŢ]/, file);
});
