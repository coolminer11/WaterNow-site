// node --test site/assets/spot-params.test.js  (the share page's link checks, no browser needed)
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const WN = require("./spot-params.js");

test("a link the app builds comes back whole", () => {
  const s = WN.parseSpotParams("?id=5000000000123&lat=45.523400&lon=-73.567800&n=Fontaine%20du%20parc%20%C3%A9t%C3%A9");
  assert.deepEqual(s, { id: "5000000000123", lat: 45.5234, lon: -73.5678, name: "Fontaine du parc été" });
  assert.equal(WN.appLink(s), "waternow://spot/5000000000123?lat=45.523400&lon=-73.567800&n=Fontaine%20du%20parc%20%C3%A9t%C3%A9");
});

test("bad ids are refused", () => {
  for (const id of ["", "0", "-1", "abc", "1e5", "0123", "12.5", "99999999999999999", "9007199254740993", "1%200", " 1"]) {
    assert.equal(WN.parseSpotParams(`?id=${id}&lat=1&lon=1`), null, id);
  }
  assert.equal(WN.parseSpotParams("?lat=1&lon=1"), null);
});

test("coordinates must be plain numbers in range", () => {
  for (const [lat, lon] of [["91", "0"], ["-90.1", "0"], ["0", "180.5"], ["0", "-181"], ["NaN", "0"], ["Infinity", "0"],
    ["1e2", "0"], ["45,5", "0"], ["0x10", "0"], ["", "0"], ["0", ""], ["4.12345678901", "0"]]) {
    assert.equal(WN.parseSpotParams(`?id=1&lat=${lat}&lon=${lon}`), null, `${lat},${lon}`);
  }
  assert.deepEqual(WN.parseSpotParams("?id=1&lat=-90&lon=180"), { id: "1", lat: -90, lon: 180, name: "" });
});

test("names are plain text, short, or dropped", () => {
  const base = "?id=7&lat=1&lon=2&n=";
  assert.equal(WN.parseSpotParams(base + encodeURIComponent("<script>alert(1)</script>")).name, "<script>alert(1)</script>"); // shown as text only
  assert.equal(WN.parseSpotParams(base + encodeURIComponent("evil‮txt.exe\u0000 \n x")).name, "eviltxt.exe x");
  assert.equal(WN.parseSpotParams(base + "a".repeat(120)).name.length, 80);
  assert.equal(WN.parseSpotParams(base + "a".repeat(301)).name, "");
  assert.equal(WN.parseSpotParams("?id=7&lat=1&lon=2&n=" + "x".repeat(3000)), null); // whole query too long
  assert.equal(WN.cleanName(42), "");
});

test("the names the app stores for unnamed points are not their own", () => {
  for (const n of ["Public Bottle Refill Station", "Drinking Water Fountain", "Public Restroom", "Water Point", "Fontaine à boire"]) {
    assert.ok(WN.isDefaultName(n), n);
  }
  for (const n of ["Fontaine Wallace", "Public restroom", "", undefined]) assert.equal(WN.isDefaultName(n), false, String(n));
});

test("first value wins and unknown parameters are ignored", () => {
  assert.equal(WN.parseSpotParams("?id=3&id=4&lat=1&lat=2&lon=1&x=<b>").id, "3");
});

test("directions pick the platform's maps", () => {
  const s = { id: "1", lat: 48.8566, lon: 2.3522, name: "Wallace" };
  assert.equal(WN.directionsLink(s, "Mozilla/5.0 (Linux; Android 14)"), "geo:48.856600,2.352200?q=48.856600,2.352200(Wallace)");
  assert.equal(WN.directionsLink(s, "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)"), "https://maps.apple.com/?daddr=48.856600,2.352200");
  assert.match(WN.directionsLink(s, "Mozilla/5.0 (Windows NT 10.0)"), /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=48\.856600%2C2\.352200$/);
});

test("only an .apk in the site's download folder is offered", () => {
  const site = "https://coolminer11.github.io/WaterNow-site/";
  const ok = "https://coolminer11.github.io/WaterNow-site/download/WaterNow-31.apk";
  assert.equal(WN.safeApkUrl({ apkUrl: ok }, site), ok);
  for (const bad of ["http://coolminer11.github.io/WaterNow-site/download/WaterNow-31.apk", "https://evil.example/WaterNow-site/download/a.apk",
    "https://coolminer11.github.io/other/download/a.apk", "https://coolminer11.github.io/WaterNow-site/download/a.exe",
    "https://coolminer11.github.io/WaterNow-site/download/../a.apk", ok + "?x=1", "javascript:alert(1)", "", null]) {
    assert.equal(WN.safeApkUrl({ apkUrl: bad }, site), null, String(bad));
  }
  assert.equal(WN.safeApkUrl(null, site), null);
});

test("every read of the site has a deadline: one that never answers fails as an offline one", async () => {
  // A network that swallows the request: it only ends when the page aborts it.
  const hung = (url, o) => new Promise((_, no) => o.signal.addEventListener("abort", () => no(new DOMException("aborted", "AbortError"))));
  const t0 = Date.now();
  await assert.rejects(WN.fetchIn("https://x.test/a", { method: "POST" }, 30, hung), { name: "AbortError" });
  assert.ok(Date.now() - t0 < 1000, "after its deadline, not the browser's minutes");
  const ok = { ok: true, status: 200 };
  let seen = null;
  assert.equal(await WN.fetchIn("https://x.test/b", { method: "POST", body: "{}" }, 30, (url, o) => { seen = o; return Promise.resolve(ok); }), ok);
  assert.equal(seen.method, "POST", "the caller's options go through");
  assert.ok(seen.signal, "with the deadline's signal");
  await assert.rejects(WN.fetchIn("https://x.test/c", {}, 30, () => { throw new TypeError("blocked"); }), TypeError);
  // Every page's own reads go through it, Get WaterNow's too (the account page, without spot-params.js, has its own
  // AbortController).
  const fs = require("node:fs"), path = require("node:path");
  assert.match(fs.readFileSync(path.join(__dirname, "spot-params.js"), "utf8"), /return fetchIn\(siteBase \+ "version\.json"/);
  for (const f of ["home.js", "../s/app.js", "page.js", "live.js", "stats.js"]) {
    const src = fs.readFileSync(path.join(__dirname, f), "utf8");
    assert.doesNotMatch(src.replace(/fetchIn\(/g, ""), /\bfetch\(/, f + ": a read without a deadline");
    assert.match(src, /fetchIn\(/, f);
  }
  const auth = fs.readFileSync(path.join(__dirname, "..", "auth", "auth.js"), "utf8");
  assert.match(auth, /new AbortController\(\), timer = setTimeout\(\(\) => ctl\.abort\(\), 15000\)/);
});

test("a read that failed says so with a button that reads again, which keeps the keyboard's focus while it reads", () => {
  class El {
    constructor(tag) { this.tagName = tag; this.children = []; this.attrs = {}; this.on = {}; this.cls = new Set(["hidden"]); this._text = ""; }
    set textContent(v) { this._text = v; this.children = []; }
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(""); }
    get className() { return [...this.cls].join(" "); }
    set className(v) { this.cls = new Set(v.split(" ")); }
    get classList() { return { remove: (c) => this.cls.delete(c), contains: (c) => this.cls.has(c) }; }
    append(c) { this.children.push(c); }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    removeAttribute(k) { delete this.attrs[k]; }
    addEventListener(t, f) { this.on[t] = f; }
    querySelector(sel) { return this.children.find((c) => sel === "button.retry" && c.tagName === "button" && c.cls.has("retry")) || null; }
  }
  const doc = { createElement: (t) => new El(t) };
  const note = new El("p");
  let reads = 0;
  WN.offlineNote(doc, note, "Impossible de charger les dernières infos.", "Réessayer", () => reads++);
  const b = note.children[0];
  assert.equal(note.cls.has("hidden"), false);
  assert.equal(note.textContent, "Impossible de charger les dernières infos. Réessayer");
  assert.equal(b.type, "button");
  b.on.click();
  b.on.click();
  assert.equal(reads, 1, "one read at a time");
  assert.equal(b.getAttribute("aria-disabled"), "true", "busy, never disabled: the focus stays on it");
  WN.offlineNote(doc, note, "Impossible de charger les dernières infos.", "Réessayer", () => reads++);
  assert.equal(note.children[0], b, "the same button, focus kept");
  assert.equal(b.getAttribute("aria-disabled"), null, "and it works again");
  b.on.click();
  assert.equal(reads, 2);
});

test("when the note's button goes, the keyboard's focus moves to the card's title, not to <body>", () => {
  const fs = require("node:fs"), path = require("node:path");
  const button = {}, doc = { activeElement: button }, note = { contains: (el) => el === button };
  const heading = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, focus() { doc.activeElement = this; } };
  WN.leaveNote(doc, note, heading);
  assert.equal(doc.activeElement, heading, "the read again answered: the title, next to what it brought");
  assert.equal(heading.attrs.tabindex, "-1", "focusable by script only, never a Tab stop");
  const link = {};
  doc.activeElement = link;
  WN.leaveNote(doc, note, heading);
  assert.equal(doc.activeElement, link, "focus elsewhere stays where it is");
  // s/, e/ and p/ call it before an answer hides the note or writes over its button (maintenance); a failed read keeps it.
  const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8").replace(/\r\n/g, "\n");
  assert.match(read("../s/app.js"), /if \(r\.ok \|\| WN\.isMaintenance\(r\.status\)\) WN\.leaveNote\(document, \$\("note"\), \$\("name"\)\);\n {8}\$\("note"\)\.classList\.toggle/);
  assert.match(read("page.js"), /if \(r\.ok \|\| WN\.isMaintenance\(r\.status\)\) WN\.leaveNote\(document, \$\("note"\), \$\("title"\)\);\n {8}show\("note"/);
});

test("home: \"Try again\" takes Space as well as Enter, as a button does (Space scrolled the page)", async () => {
  const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
  const els = {};
  const el = (id) => els[id] || (els[id] = { id, textContent: "", attrs: {}, on: {}, classList: { add() {}, remove() {}, toggle() {} },
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    removeAttribute(k) { delete this.attrs[k]; }, addEventListener(t, f) { this.on[t] = f; }, click() { this.on.click({ preventDefault() {} }); } });
  let reads = 0;
  const ctx = vm.createContext({ document: { getElementById: el, documentElement: { classList: { add() {} } } },
    location: { href: "https://coolminer11.github.io/WaterNow-site/" }, navigator: { languages: ["fr"] },
    URL, AbortController, setTimeout, clearTimeout, fetch: async () => { reads++; return { ok: false, status: 404 }; } });
  ctx.window = ctx;
  for (const f of ["spot-params.js", "home.js"]) vm.runInContext(fs.readFileSync(path.join(__dirname, f), "utf8"), ctx);
  await new Promise((r) => setTimeout(r, 20));
  const dl = els.download;
  assert.equal(dl.getAttribute("role"), "button", "version.json unusable: Try again");
  let kept = true;
  dl.on.keydown({ key: " ", preventDefault() { kept = false; } });
  assert.equal(kept, false, "Space doesn't scroll the page");
  assert.equal(dl.getAttribute("aria-disabled"), "true", "it reads again");
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(reads, 2);
});

test("e/ and p/: what the read brings never moves the buttons (facts under them, one-line placeholders above)", () => {
  const fs = require("node:fs"), path = require("node:path");
  const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8").replace(/\r\n/g, "\n");
  for (const d of ["e", "p"]) {
    const html = read("../" + d + "/index.html");
    assert.ok(html.indexOf('id="open"') < html.indexOf('id="facts"'), d + ": the facts under the buttons, as on s/");
    assert.ok(html.indexOf('id="facts"') < html.indexOf('id="note"'), d);
  }
  assert.match(read("../e/index.html"), /<a class="btn pending" id="ics"/, "Add to calendar keeps its place unseen");
  const page = read("page.js");
  // The title (unless a preview holds the name) and the line under it wait on one line; settle() gives the words back.
  assert.match(page, /if \(id === "title" && mine\) return;\n {4}\$\(id\)\.textContent = "\\u00a0";\n {4}\$\(id\)\.classList\.add\("sk", "sk-text"\);/);
  assert.match(page, /\$\(id\)\.classList\.remove\("sk", "sk-text"\);\n {6}\$\(id\)\.textContent = words\[id\];/);
  assert.match(read("site.css"), /\nh1\.sk-text \{ width: 64%; \}\np\.sk-text \{ width: 88%; \}/);
});

test("Get WaterNow on e/, p/ and s/: version.json's APK when it checks out, else the home page", async () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const site = "https://coolminer11.github.io/WaterNow-site/", apk = site + "download/WaterNow-1063.apk";
  const answer = (status, body) => async (url, o) => {
    assert.equal(url, site + "version.json");
    assert.equal(o.credentials, "omit");
    return { ok: status === 200, status, json: async () => (typeof body === "function" ? body() : body) };
  };
  assert.equal(await WN.apkLink(site, answer(200, { apkUrl: apk })), apk);
  for (const [why, fetchImpl] of [["404", answer(404, {})], ["HTML, not JSON", answer(200, () => { throw new SyntaxError("<html>"); })],
    ["another site's APK", answer(200, { apkUrl: "https://evil.example/WaterNow-site/download/x.apk" })], ["no apkUrl", answer(200, { versionName: "1.1" })],
    ["offline", async () => { throw new TypeError("Failed to fetch"); }], ["fetch throws at once", () => { throw new TypeError("blocked"); }]]) {
    assert.equal(await WN.apkLink(site, fetchImpl), null, why);
  }
  // Each page asks from the site's root (a preview's folder e/<slug>/ included) and its button starts at the home page.
  // Windows checkouts write CRLF: compare the text as LF.
  const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8").split(String.fromCharCode(13)).join("");
  assert.match(read("page.js"), /WN\.apkLink\(ROOT\)\.then\(function \(apk\) \{ if \(apk\) \$\("get"\)\.href = apk; \}\)/);
  assert.match(read("../s/app.js"), /WN\.apkLink\(SITE\)\.then/);
  for (const d of ["e", "p", "s"]) assert.match(read("../" + d + "/index.html"), /id="get" href="\.\.\/">/, d);
  // e/ and p/: the cards under the page's own wait for the read (what it brings comes in above them), never forever.
  const page = read("page.js");
  assert.match(page, /\.then\(reveal\);/, "after every outcome of the read");
  assert.ok(page.indexOf("reveal();\n    return;") > 0, "and at once for a broken link");
  for (const d of ["e", "p"]) {
    const html = read("../" + d + "/index.html");
    assert.match(html, /<section class="card getcard waiting">/, d);
    assert.match(html, /<p class="foot muted waiting" id="foot">/, d);
  }
  assert.match(read("site.css"), /\.page > \.waiting \{ visibility: hidden; animation: wn-hold 0s 3s forwards; \}/);
});

test("the browser's language when the app has it, English otherwise", () => {
  for (const [tag, want] of [["fr-CA", "fr"], ["fr", "fr"], ["FR-fr", "fr"], ["en-US", "en"], ["es-419", "es"], ["es", "es"],
    ["de-AT", "de"], ["de-CH", "de"], ["pt-PT", "pt"], ["pt-BR", "pt"], ["ja-JP", "ja"], ["ja", "ja"], ["fr_CA", "fr"],
    ["ro-RO", "ro"], ["ro", "ro"], ["ro-MD", "ro"], ["RO-ro", "ro"], ["rom", "en"], ["rof", "en"],
    ["fry", "en"], ["frx-CA", "en"], ["it-IT", "en"], ["zh-Hans-CN", "en"], ["dev", "en"], ["japan", "en"], ["", "en"],
    [undefined, "en"], [null, "en"], [42, "en"], ["constructor", "en"]]) {
    assert.equal(WN.lang(tag), want, String(tag));
  }
  assert.deepEqual(WN.LANGS, ["en", "fr", "es", "de", "pt", "ja", "ro"]);
});

test("the first of the browser's languages the app speaks", () => {
  assert.equal(WN.lang(["it-IT", "fr-CA", "en"]), "fr"); // Italian first: French, not English
  assert.equal(WN.lang(["zh-CN", "ko"]), "en");
  assert.equal(WN.lang([]), "en");
  assert.equal(WN.browserLangs({ languages: ["it", "ro"], language: "it" }).join(), "it,ro");
  assert.equal(WN.browserLangs({ languages: [], language: "de-AT" }), "de-AT");
  assert.equal(WN.lang(WN.browserLangs({ languages: ["it", "ro"], language: "it" })), "ro");
});

test("a 503 is WaterNow being updated; nothing else is", () => {
  assert.equal(WN.isMaintenance(503), true);
  for (const s of [200, 204, 400, 401, 403, 404, 429, 500, 502, 504, "503", undefined, null]) assert.equal(WN.isMaintenance(s), false, String(s));
});

test("the verified badge needs a real true from the server", () => {
  assert.equal(WN.isVerified({ verified: true, name: "x" }), true);
  for (const card of [{ verified: false }, { verified: "true" }, { verified: 1 }, { name: "x" }, {}, null, undefined, "verified", [true]]) {
    assert.equal(WN.isVerified(card), false, JSON.stringify(card));
  }
});

test("the share page says maintenance and verified in every language, as plain text", () => {
  const fs = require("node:fs");
  const src = fs.readFileSync(require("node:path").join(__dirname, "..", "s", "app.js"), "utf8");
  for (const key of ["verified", "maintenance"]) assert.equal((src.match(new RegExp("\\b" + key + ": \"[^\"<>]+\"", "g")) || []).length, WN.LANGS.length, key);
  assert.doesNotMatch(src, /innerHTML|insertAdjacentHTML|document\.write/);
  const html = fs.readFileSync(require("node:path").join(__dirname, "..", "s", "index.html"), "utf8");
  assert.match(html, /id="verified"/);
  assert.match(html, /id="note"/);
  assert.doesNotMatch(html.replace(/<script src="[^"]+"[^>]*><\/script>/g, ""), /<script|style=/); // CSP: no inline script or style
});

test("event and partner pages take only a well-formed slug, as the app and the server do", () => {
  assert.equal(WN.parseSlug("?s=end-of-the-world-marathon-2026"), "end-of-the-world-marathon-2026");
  assert.equal(WN.parseSlug("?s=cafe7&s=evil"), "cafe7"); // first value wins
  assert.equal(WN.parseSlug("?s=" + "a".repeat(48)), "a".repeat(48));
  for (const s of ["", "a".repeat(49), "Cafe", "-cafe", "cafe-", "ca--fe", "ca_fe", "café", "ca%20fe", "ca fe", "../x", "a/b",
    "javascript:alert(1)", "<b>x</b>", "a-b%0A"]) {
    assert.equal(WN.parseSlug("?s=" + s), null, s);
  }
  assert.equal(WN.parseSlug("?x=cafe"), null);
  assert.equal(WN.parseSlug("?s=cafe&" + "x".repeat(3000)), null); // whole query too long
  assert.equal(WN.parseSlug(42), null);
  assert.equal(WN.pageAppLink("event", "run-2026"), "waternow://event/run-2026");
  assert.equal(WN.pageAppLink("partner", "cafe-bleu"), "waternow://partner/cafe-bleu");
});

test("an event's or partner's address, from a preview's folder", () => {
  assert.equal(WN.isSlug("marathon-58-a1b2c3"), true);
  for (const s of ["", "A", "-a", "a-", "a--b", "a_b", "café", "a/b", "a".repeat(49), null, 42]) assert.equal(WN.isSlug(s), false, String(s));
  assert.deepEqual(WN.pathSlug("/WaterNow-site/e/marathon-58-a1b2c3/"), { kind: "event", slug: "marathon-58-a1b2c3" });
  assert.deepEqual(WN.pathSlug("/p/cafe-bleu"), { kind: "partner", slug: "cafe-bleu" });
  for (const p of ["/WaterNow-site/e/", "/e/Bad_Slug/", "/x/cafe-bleu/", "/e/cafe-bleu/index.html", "/e/a%2Fb/", "/e/" + "a".repeat(49) + "/", "", null]) {
    assert.equal(WN.pathSlug(p), null, String(p));
  }
});

test("the event and partner pages are plain text and inline-free", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, "page.js"), "utf8"), /innerHTML|insertAdjacentHTML|document\.write/);
  for (const [dir, kind] of [["e", "event"], ["p", "partner"]]) {
    const html = fs.readFileSync(path.join(__dirname, "..", dir, "index.html"), "utf8");
    assert.match(html, new RegExp('<body data-kind="' + kind + '">'));
    for (const id of ["eyebrow", "title", "text", "open", "bad", "badTitle", "badText", "getTitle", "getText", "get", "foot"]) {
      assert.match(html, new RegExp('id="' + id + '"'), dir + " " + id);
    }
    assert.match(html, /<a class="btn wide go" id="get" href="\.\.\/">/); // "Get WaterNow": the site's download page
    assert.doesNotMatch(html.replace(/<script src="[^"]+"[^>]*><\/script>/g, ""), /<script|style=/); // CSP: no inline script or style
    // It talks to WaterNow's server only, and shows images it read itself.
    assert.match(html, /connect-src 'self' https:\/\/pkqsvlbiznrqxfckaxll\.supabase\.co;/);
    assert.match(html, /img-src 'self' blob:;/);
  }
  // Every element page.js writes is in the page it writes it in.
  const js = fs.readFileSync(path.join(__dirname, "page.js"), "utf8");
  const pages = ["e", "p"].map((d) => fs.readFileSync(path.join(__dirname, "..", d, "index.html"), "utf8"));
  for (const [, id] of js.matchAll(/(?:\$|text|show)\("([A-Za-z]+)"/g)) assert.ok(pages.some((h) => h.includes('id="' + id + '"')), id);
});

test("an app share e/<slug> without its preview folder lands on the live page, with or without its last slash", () => {
  const { target } = require("./notfound.js");
  const B = "/WaterNow-site/";
  assert.equal(target(B + "e/run-2026/", "", B, WN), B + "e/?s=run-2026");
  assert.equal(target(B + "e/run-2026", "", B, WN), B + "e/?s=run-2026", "a link that lost its slash");
  assert.equal(target(B + "p/cafe-bleu", "?utm=x&s=evil", B, WN), B + "p/?s=cafe-bleu&utm=x", "the query kept, the slug wins");
  assert.equal(target(B + "e/run-2026/index.html", "", B, WN), B + "e/?s=run-2026");
  for (const p of [B + "e/Run_2026/", B + "e/", B + "e", B + "x/e/run-2026/", B + "e/run-2026/x", B + "s", "/e/run-2026/", "/other/e/run-2026",
    B + "e/a%2Fb/", B + "e/" + "a".repeat(49), null]) {
    assert.equal(target(p, "", B, WN), null, String(p));
  }
});

test("the 404 page is styled and runs its script at any depth, from the site's root folder", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const html = fs.readFileSync(path.join(__dirname, "..", "404.html"), "utf8");
  // The root folder of SITE_URL, the site's address the link previews are written for.
  const gen = fs.readFileSync(path.join(__dirname, "..", ".github", "gen-share-pages.mjs"), "utf8");
  const root = new URL(/process\.env\.SITE_URL \|\| "([^"]+)"/.exec(gen)[1]).pathname;
  assert.equal(root, "/WaterNow-site/");
  const refs = [...html.matchAll(/ (?:href|src)="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length >= 6, refs.join());
  for (const r of refs) assert.ok(r.startsWith(root), r + " must start at " + root + ", not relative to the missing address");
  assert.match(html, /<script src="\/WaterNow-site\/assets\/spot-params\.js"><\/script>\s*<script src="\/WaterNow-site\/assets\/notfound\.js"><\/script>/);
  assert.doesNotMatch(html.replace(/<script src="[^"]+"[^>]*><\/script>/g, ""), /<script|style=/);
  assert.match(html, /script-src 'self';/);
  // In the browser: a share goes (fragment kept); anything else stays and speaks the reader's language.
  const js = fs.readFileSync(path.join(__dirname, "notfound.js"), "utf8");
  const run = (pathname, langs) => {
    const els = {}, out = { went: null, els, lang: null, shown: false, gone: false };
    const document = { currentScript: { src: "https://coolminer11.github.io/WaterNow-site/assets/notfound.js" },
      documentElement: { set lang(v) { out.lang = v; }, classList: { add: (c) => { out.shown = c === "wn-ready"; } } },
      getElementById: (id) => (els[id] = els[id] || {}),
      querySelector: (sel) => (sel === "main" ? { classList: { add: (c) => { out.gone = c === "hidden"; } } } : null) };
    require("node:vm").runInNewContext(js, { WN, URL, URLSearchParams, document, navigator: { languages: langs },
      location: { pathname, search: "?x=1", hash: "#t=a", replace: (u) => { out.went = u; } } });
    return out;
  };
  const share = run("/WaterNow-site/e/run-2026", ["fr"]);
  assert.equal(share.went, "/WaterNow-site/e/?s=run-2026&x=1#t=a");
  assert.equal(share.shown, false, "a share on its way is never painted as \"this page doesn't exist\"");
  assert.equal(share.gone, true, "not even by the hold's 3 s net while a slow network brings its page");
  const lost = run("/WaterNow-site/nowhere/deep/page", ["ro-RO"]);
  assert.equal(lost.went, null);
  assert.equal(lost.gone, false);
  assert.equal(lost.shown, true);
  assert.equal(lost.lang, "ro");
  assert.equal(lost.els.title.textContent, "Această pagină nu există");
  for (const id of ["title", "text", "home"]) assert.match(html, new RegExp('id="' + id + '"'), id);
});

test("the free refill badge needs a real true and a yes under 45 days old (setup section 88), as in the app", () => {
  const day = 86400000, now = Date.parse("2026-11-13T12:00:00Z");
  const at = (d) => new Date(now - d * day).toISOString().replace("Z", "123+00:00"); // Postgres sends microseconds and an offset
  assert.equal(WN.freeRefillSince({ free_refill: true, free_refill_confirmed_at: "2026-11-08T12:00:00.123456+00:00" }, now), now - 5 * day + 123);
  assert.notEqual(WN.freeRefillSince({ free_refill: true, free_refill_confirmed_at: at(44) }, now), null);
  for (const card of [{ free_refill: true, free_refill_confirmed_at: at(46) }, { free_refill: "true", free_refill_confirmed_at: at(1) },
    { free_refill: true, free_refill_confirmed_at: null }, { free_refill: true, free_refill_confirmed_at: "soon" }, { free_refill: false, free_refill_confirmed_at: at(1) },
    { verified: true }, {}, null, undefined, "free_refill"]) {
    assert.equal(WN.freeRefillSince(card, now), null, JSON.stringify(card));
  }
});

test("the share page says Free refill in every language, as plain text, under the name, in a teal that reads at AA", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const src = fs.readFileSync(path.join(__dirname, "..", "s", "app.js"), "utf8");
  assert.equal((src.match(/\bfreeRefill: "[^"<>]+"/g) || []).length, WN.LANGS.length);
  assert.equal((src.match(/\bfreeRefillWhen: function \(when\) \{ return [^}]+; \}/g) || []).length, WN.LANGS.length);
  const html = fs.readFileSync(path.join(__dirname, "..", "s", "index.html"), "utf8");
  assert.match(html, /<h1 id="name">[^<]*<\/h1>\s*<p class="free-refill hidden" id="freeRefill"><span id="freeRefillLabel">/);
  // The teal on the card and on its own 12 % tint (as the browser mixes it), and the muted date on the tint, light and dark.
  const css = fs.readFileSync(path.join(__dirname, "site.css"), "utf8").replace(/\r\n/g, "\n");
  const tok = (block, k) => new RegExp("--" + k + ": (#[0-9a-f]{6})").exec(block)[1];
  const light = /:root \{([^}]*)\}/.exec(css)[1];
  const dark = light + /prefers-color-scheme: dark\) \{\n {2}:root \{([^}]*)\}/.exec(css)[1].replace(/^/, "\n");
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lum = (c) => c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const [name, block] of [["light", light], ["dark", dark.slice(light.length)]]) {
    const teal = rgb(tok(block, "teal")), card = rgb(tok(block, "card")), muted = rgb(tok(block, "muted"));
    const tint = teal.map((v, i) => Math.round(v * 0.12 + card[i] * 0.88));
    for (const [fg, bg, what] of [[teal, card, "teal on card"], [teal, tint, "teal on its tint"], [muted, tint, "muted on the tint"]]) {
      assert.ok(ratio(fg, bg) >= 4.5, `${name}: ${what} ${ratio(fg, bg).toFixed(2)}:1`);
    }
  }
});
