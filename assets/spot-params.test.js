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
    assert.match(html, /<a class="btn wide" id="get" href="\.\.\/">/); // "Get WaterNow": the site's download page
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

test("an app share e/<slug>/ without its preview folder lands on the live page", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const html = fs.readFileSync(path.join(__dirname, "..", "404.html"), "utf8");
  assert.match(html, /<script src="\.\.\/\.\.\/assets\/spot-params\.js"><\/script>\s*<script src="\.\.\/\.\.\/assets\/notfound\.js"><\/script>/);
  assert.doesNotMatch(html.replace(/<script src="[^"]+"[^>]*><\/script>/g, ""), /<script|style=/);
  const js = fs.readFileSync(path.join(__dirname, "notfound.js"), "utf8");
  let went = null;
  require("node:vm").runInNewContext(js, { window: { WN }, location: { pathname: "/WaterNow-site/e/run-2026/", replace: (u) => { went = u; } } });
  assert.equal(went, "/WaterNow-site/e/?s=run-2026");
  went = null;
  require("node:vm").runInNewContext(js, { window: { WN }, location: { pathname: "/WaterNow-site/e/Run_2026/", replace: (u) => { went = u; } } });
  assert.equal(went, null);
});
