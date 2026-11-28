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

for (const file of ["home.js", "../s/app.js", "../l/app.js", "page.js", "notfound.js"]) {
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
    assert.equal(rating("4,5", n), "Notă 4,5/5 (" + want + ")", String(n));
  }
});

test("Romanian is written with comma-below ș ț, never the cedilla ş ţ", () => {
  for (const file of ["home.js", "live.js", "../s/app.js", "../l/app.js", "page.js", "../auth/auth.js", "notfound.js"]) assert.doesNotMatch(read(file), /[şţŞŢ]/, file);
});

// Every quoted text inside each language's block ("\n    fr: {" … its closing brace) of a page's or the console's table.
function languageLiterals(src) {
  const out = {};
  for (const m of src.matchAll(/\n\s+(en|fr|es|de|pt|ja|ro):\s*\{/g)) {
    let i = m.index + m[0].length - 1, depth = 0, q = null, lit = "";
    const list = (out[m[1]] = out[m[1]] || []);
    for (; i < src.length; i++) {
      const c = src[i];
      if (q) {
        if (c === "\\") { lit += src[i + 1] === "n" ? "\n" : src[i + 1]; i++; continue; }
        if (c === q) { list.push(lit); q = null; lit = ""; continue; }
        lit += c; continue;
      }
      if (c === "\"" || c === "'" || c === "`") { q = c; continue; }
      if (c === "/" && src[i + 1] === "/") { i = src.indexOf("\n", i); continue; }
      if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i) + 1; continue; }
      if (c === "{") depth++;
      if (c === "}" && --depth === 0) break;
    }
  }
  return out;
}

test("the site's and the console's words follow the owner's rules in every language", () => {
  // French: « tu », « courriel », a space before ; : ! ? and inside « », « En panne » (not « Brisé »); Spanish « tú », never
  // « reportar »; German nachfüllen / eintragen; Brazilian « você », « bebedouro » for a fountain, « o Stripe »; Japanese
  // counters on their number; Romanian ș ț, « cișmea » for a fountain. Everywhere: « … » is one character, « Día de
  // Muertos » is a name, never translated; the program once called « Fontaine commune » has its name in each language
  // (owner, 2026-11-20), and a language never shows another one's.
  const rules = {
    fr: [[/\b(vous|votre|vos)\b/i, "tu"], [/\b(e-?mails?|mails?)\b/i, "courriel"], [/[^\s  («\d][;:!?](?=[\s»)]|$)/, "space before ; : ! ?"],
      [/«[^\s  ]|[^\s  ]»/, "spaces inside « »"], [/(?<!\p{L})[Bb]risée?s?(?!\p{L})/u, "en panne"]],
    es: [[/\breport(ar|e|es|ado|ada|ados|adas|a|as)\b/i, "reportar"], [/\busted(es)?\b/i, "usted"]],
    de: [[/auffüll|Auffüll/, "nachfüllen"]],
    pt: [[/\b(num|numa|te|teu|tua|contigo|lhe)\b/i, "você, em um"], [/(?<!\p{L})(a|da|na|pela|à) Stripe\b/iu, "o Stripe"],
      // « fonte » stays for a source or a font: only its fountain sense is caught (built, of water, counted).
      [/\bfontes? (construíd|de água|pública|de verdade)|\b(constru\S*|financiar|primeira|futura) (\S+ ){0,2}fontes?\b|(\d|\}|ª) fontes?\b/i, "bebedouro"]],
    ja: [[/(\d|\}) (本|か所|日|人|件|回|枚|年|文字|票)|^ (本|か所|人|件|回|枚|文字|票)/, "counter on its number"]],
    ro: [[/[şţŞŢ]/, "comma-below ș ț"], [/[Ff]ântân/, "cișmea"]]
  };
  const program = { en: /Community Fountain/, fr: /Fontaine de la Communauté/, es: /Fuente de la Comunidad/, de: /Gemeinschaftsbrunnen/,
    pt: /Bebedouro da Comunidade/, ja: /みんなの水飲み場/, ro: /Cișm\p{L}* (a )?Comunității/u };
  for (const lang of Object.keys(program)) {
    (rules[lang] = rules[lang] || []).push(...Object.entries(program).filter(([l]) => l !== lang).map(([l, re]) => [re, "the program's name in " + l]));
  }
  const everywhere = [[/\.\.\./, "ellipsis …"], [/Fontaines? communes?/i, "the program is translated (Community Fountain, Fontaine de la Communauté…)"],
    [/Day of the Dead|Jour des morts|Tag der Toten|Dia dos Mortos|Ziua Morților|Zi a Morților/, "Día de Muertos"]];
  const files = [...fs.readdirSync(__dirname).filter((f) => /\.js$/.test(f) && !/\.test\.js$/.test(f)).map((f) => f),
    ...fs.readdirSync(path.join(__dirname, "../console")).filter((f) => /\.js$/.test(f)).map((f) => "../console/" + f), "../s/app.js", "../auth/auth.js"];
  const problems = [];
  let seen = 0;
  for (const file of files) {
    for (const [lang, list] of Object.entries(languageLiterals(read(file)))) {
      for (const raw of list) {
        seen++;
        const v = raw.replace(/https?:\/\/\S+|mailto:\S*|[\w.+-]+@[\w.-]+|\{\{?email\}\}?/g, " ");
        for (const [re, why] of [...(rules[lang] || []), ...everywhere]) if (re.test(v)) problems.push(file + " [" + lang + "] " + why + ": " + raw.slice(0, 120));
      }
    }
  }
  assert.ok(seen > 5000, "the tables were read: " + seen);
  assert.deepEqual(problems, []);
});

test("no page shows the program's old name « Fontaine commune » (translated since 2026-11-20)", () => {
  const root = path.join(__dirname, "..");
  const pages = fs.readdirSync(root, { recursive: true }).filter((f) => /\.html$/.test(f));
  assert.ok(pages.length > 10, "the pages were read: " + pages.length);
  assert.deepEqual(pages.filter((f) => /Fontaines? communes?/i.test(fs.readFileSync(path.join(root, f), "utf8").replace(/<!--[\s\S]*?-->/g, ""))), []);
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
