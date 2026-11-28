// node --test site/assets/scan-source.test.js  (the share page's stronger install call after a QR or NFC scan)
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const WN = require("./spot-params.js");

test("only src=qr or src=nfc count as a scan", () => {
  assert.equal(WN.scanSource("?id=1&lat=1&lon=2&src=qr"), "qr");
  assert.equal(WN.scanSource("?id=1&lat=1&lon=2&n=Fontaine&src=nfc"), "nfc");
  for (const s of ["", "?id=1", "?src=QR", "?src=qr2", "?src=", "?src=%3Cb%3E", "?src=javascript:alert(1)", "?src[]=qr", null, undefined, 42,
    "?src=qr&" + "x".repeat(2100)]) {
    assert.equal(WN.scanSource(s), null, String(s));
  }
  // The first value wins, as the app reads queries.
  assert.equal(WN.scanSource("?src=nfc&src=evil"), "nfc");
});

test("the call is written in all 7 languages, as text only, and the CSP stays strict", () => {
  const app = fs.readFileSync(path.join(__dirname, "../s/app.js"), "utf8");
  assert.equal((app.match(/scanned: "/g) || []).length, WN.LANGS.length);
  assert.match(app, /fr: \{[\s\S]*scanned: "Tu as scanné un point WaterNow : ouvre-le dans l'app"/);
  assert.match(app, /text\("scan", T\.scanned\)/);
  assert.equal((app.match(/scanText: "/g) || []).length, WN.LANGS.length);
  assert.match(app, /text\("scanText", T\.scanText\)/);
  assert.doesNotMatch(app, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  const html = fs.readFileSync(path.join(__dirname, "../s/index.html"), "utf8");
  // A banner hidden until a scan, empty until the page's language fills it.
  assert.match(html, /<section class="card scan-card hidden" id="scanCard">/);
  assert.match(html, /<p class="scan-title" id="scan"><\/p>/);
  // It leads to the download first (the same APK link as "Get WaterNow"), and opens the app for those who have it.
  assert.match(html, /<a class="btn primary go" id="scanGet" href="\.\.\/">/);
  assert.match(app, /\$\("get"\)\.href = \$\("scanGet"\)\.href = apk/);
  assert.match(app, /\$\("open"\)\.href = \$\("scanOpen"\)\.href = WN\.appLink\(s\)/);
  assert.match(app, /\$\("scanCard"\)\.classList\.remove\("hidden"\);\s*\$\("getCard"\)\.classList\.add\("hidden"\);/);
  assert.match(html, /script-src 'self';/);
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval/);
});
