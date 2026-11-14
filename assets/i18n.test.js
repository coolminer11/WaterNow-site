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

for (const file of ["home.js", "../s/app.js", "page.js", "notfound.js"]) {
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
  for (const file of ["home.js", "live.js", "../s/app.js", "page.js", "../auth/auth.js", "notfound.js"]) assert.doesNotMatch(read(file), /[şţŞŢ]/, file);
});

test("the legal pages are what scripts/legal-build.js writes: one h1, each language an article with its lang and dir", () => {
  // Built from the app's texts (app/src/main/assets/legal): a page edited by hand would be undone by the next build (the
  // bar's app icon was: the script still wrote the old "W" square).
  const { build } = require("../../scripts/legal-build.js");
  for (const p of build()) {
    const html = fs.readFileSync(p.file, "utf8").replace(/\r\n/g, "\n");
    assert.equal(html, p.html, p.doc + ": run node scripts/legal-build.js");
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1, p.doc + ": one h1");
    assert.match(html, /<html lang="fr" dir="ltr">/);
    assert.match(html, /<img class="logo" src="\.\.\/assets\/icon\.svg"/);
    const articles = [...html.matchAll(/<article class="card" id="(\w+)" lang="(\w+)" dir="(ltr|rtl)">\n {4}<h2>/g)];
    assert.deepEqual(articles.map((m) => m[1]).sort(), [...LANGS].sort(), p.doc + ": every app language");
    for (const m of articles) assert.equal(m[1], m[2], "each article in its own language");
    // Headings in order: h1, then h2 per article, h3 inside.
    const levels = [...html.matchAll(/<h([1-6])[ >]/g)].map((m) => Number(m[1]));
    levels.forEach((l, i) => assert.ok(i === 0 ? l === 1 : l <= levels[i - 1] + 1, p.doc + ": no heading level skipped at " + i));
  }
});
