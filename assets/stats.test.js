// node --test site/assets/stats.test.js  (the stats page's helpers and texts, no browser needed)
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { cleanImpact, cellsGeoJSON, tween, atLeast, minutesAgo, statusNews, listsParts, qrPath, roDe, HEAT_PAINT, STRINGS, ENDPOINT, K } = require("./stats.js");
const { LANGS, safeApkUrl } = require("./spot-params.js");
const { QrCode } = require("./vendor/qrcodegen/qrcodegen.js");

// "points" is OpenStreetMap plus the official lists, summed by the server (section 79): 514,048 + 55,718 and 526,992 + 87,924.
const sample = {
  updated_at: "2026-11-12T01:25Z",
  bottles: { all: 1234, month: 56, today: 7 }, litres: { all: 617, month: 28, today: 3 }, refills: { all: 1300, today: 9 },
  points: { water: 569766, toilets: 614916 }, official: { lists: 736, water: 55718, toilets: 87924 },
  places: { cities: 4, countries: 2 }, trees_planted: 0, fontaine_commune: null,
  map: { cell_deg: 0.05, before: "2026-11-11", cells: [{ lat: 46.825, lon: -71.225, refills: 42 }] },
  top_cities: [{ name: "Québec", country: "CA", points: 50, refills: 42, bottles: 40 }, { name: "Lévis", country: "CA", points: 3, refills: null, bottles: null }]
};

test("only WaterNow's server, its public RPC", () => {
  assert.equal(ENDPOINT, "https://pkqsvlbiznrqxfckaxll.supabase.co/rest/v1/rpc/get_public_impact");
});

test("the answer becomes whole counts", () => {
  const d = cleanImpact(sample);
  assert.deepEqual(d.bottles, { all: 1234, month: 56, today: 7 });
  assert.equal(d.refillsToday, 9);
  assert.equal(d.water, 569766);
  assert.equal(d.toilets, 614916);
  assert.equal(d.lists, 736);
  assert.equal(d.trees, 0);
  assert.equal(d.fontaine, null);
  assert.equal(d.updatedAt, "2026-11-12T01:25Z");
  assert.deepEqual(d.top[1], { name: "Lévis", country: "CA", points: 3, refills: null });
});

test("bad numbers and bad answers never break the page", () => {
  assert.equal(cleanImpact(null), null);
  assert.equal(cleanImpact([]), null);
  assert.equal(cleanImpact("x"), null);
  const d = cleanImpact({ bottles: { all: -5, month: "abc", today: 2.9 }, updated_at: "<b>now</b>", top_cities: "nope" });
  assert.deepEqual(d.bottles, { all: 0, month: 0, today: 2 });
  assert.equal(d.updatedAt, null);
  assert.deepEqual(d.top, []);
  assert.deepEqual(d.cells, []);
});

test("a cell under k, or off the globe, is dropped here too", () => {
  const d = cleanImpact({ map: { cells: [
    { lat: 1, lon: 1, refills: K - 1 }, { lat: 91, lon: 0, refills: 50 }, { lat: 0, lon: 200, refills: 50 },
    { lat: "x", lon: 0, refills: 50 }, { lat: 10, lon: 20, refills: K, extra: "dropped" }
  ] } });
  assert.deepEqual(d.cells, [{ lat: 10, lon: 20, refills: K }]);
});

test("a city needs a sane name; a country code or nothing", () => {
  const d = cleanImpact({ top_cities: [{ name: "" }, { name: "x".repeat(81) }, { name: "Paris", country: "<FR>", points: 1 }] });
  assert.deepEqual(d.top, [{ name: "Paris", country: "", points: 1, refills: null }]);
});

test("the heat map's GeoJSON puts longitude first", () => {
  const g = cellsGeoJSON([{ lat: 46.825, lon: -71.225, refills: 42 }]);
  assert.equal(g.type, "FeatureCollection");
  assert.deepEqual(g.features[0].geometry.coordinates, [-71.225, 46.825]);
  assert.deepEqual(g.features[0].properties, { refills: 42 });
});

test("the combined totals read \"more than\": rounded down to 3 digits, never up", () => {
  assert.equal(atLeast(569766), 569000);
  assert.equal(atLeast(614916), 614000);
  assert.equal(atLeast(570000), 570000);
  assert.equal(atLeast(1234), 1230);
  assert.equal(atLeast(999), 999);
  assert.equal(atLeast(0), 0);
  assert.equal(STRINGS.fr.over, "plus de");
});

test("the status pill counts minutes since the snapshot, and only from a real time", () => {
  const now = Date.parse("2026-11-12T13:03:30Z");
  assert.equal(minutesAgo("2026-11-12T13:00Z", now), 3);
  assert.equal(minutesAgo("2026-11-12T13:05Z", now), 0, "a clock ahead never says minus");
  assert.equal(minutesAgo(null, now), null);
  assert.equal(minutesAgo("soon", now), null);
  assert.equal(cleanImpact({ updated_at: "2026-11-12T13:00:27.512Z" }).updatedAt, "2026-11-12T13:00:27.512Z", "seconds are fine");
  assert.equal(STRINGS.fr.updated(3), "Mis à jour il y a 3 min");
  assert.equal(STRINGS.fr.updated(0), "Mis à jour à l'instant");
  for (const l of LANGS) assert.notEqual(STRINGS[l].updated(0), STRINGS[l].updated(5), l);
});

test("screen readers hear the pill only when its state changes, never the minute tick", () => {
  const T = STRINGS.fr;
  let s = statusNews("", null, 3, T);
  assert.deepEqual(s, { state: "ok", say: null }, "the first answer is silent");
  s = statusNews(s.state, null, 4, T);
  assert.equal(s.say, null, "3 min -> 4 min: silent");
  s = statusNews(s.state, T.offline, 5, T);
  assert.equal(s.say, T.offline, "offline is said");
  assert.equal(statusNews(s.state, T.offline, 6, T).say, null, "still offline a minute later: silent");
  s = statusNews(s.state, T.maintenance, 6, T);
  assert.equal(s.say, T.maintenance, "maintenance is said");
  s = statusNews(s.state, null, 0, T);
  assert.equal(s.say, "Mis à jour à l'instant", "back after a problem: said");
  assert.equal(statusNews(s.state, null, 1, T).say, null, "and the next minute is silent again");
  assert.equal(statusNews("", T.offline, null, T).say, T.offline, "offline before any answer is said");
  const html = fs.readFileSync(path.join(__dirname, "..", "stats", "index.html"), "utf8");
  assert.match(html, /<span id="status" class="badge">/, "the visible pill is no live region");
  assert.match(html, /<p id="statusLive" class="sr-only" role="status"><\/p>/);
  assert.equal((html.match(/role="status"|aria-live/g) || []).length, 1, "one live region on the page");
});

test("the totals note names both sources and the overlap, in every language", () => {
  for (const l of LANGS) {
    const s = STRINGS[l].lists("736", 736);
    assert.match(s, /OpenStreetMap/, l);
    assert.match(s, /736/, l);
  }
  assert.equal(STRINGS.fr.lists("736", 736), "Points d'eau et toilettes d'OpenStreetMap et de 736 listes officielles de villes. L'app retire les doublons entre les sources.");
});

test("the totals note is there from the first paint, only its number arrives, in every language", () => {
  for (const l of LANGS) {
    const [a, b] = listsParts(STRINGS[l]);
    assert.ok(a.length > 10, l);
    assert.equal(a + "736" + b, STRINGS[l].lists("736", 736), l);
  }
});

test("Romanian: \"de\" from 20 on", () => {
  assert.deepEqual([0, 1, 19, 20, 99, 100, 101, 119, 120, 736].map((n) => roDe(n) === " de"),
    [false, false, false, true, true, true, false, false, true, true]);
  assert.match(STRINGS.ro.lists("736", 736), /736 de liste oficiale/);
  assert.equal(STRINGS.ro.refills("3", 3), "3 reumpleri");
  assert.equal(STRINGS.ro.refills("1.290", 1290), "1.290 de reumpleri");
  assert.equal(STRINGS.ro.points("38", 38), "38 de puncte de apă");
});

// A tiny reader for MapLibre's ["interpolate", ["linear"], input, stop, value, ...] with a number input.
const at = (expr, x) => {
  const s = expr.slice(3);
  for (let i = 0; i < s.length - 2; i += 2) if (x <= s[i + 2]) return s[i + 1] + (s[i + 3] - s[i + 1]) * Math.max(0, (x - s[i]) / (s[i + 2] - s[i]));
  return s[s.length - 1];
};
test("a cell of K refills still shows as a solid spot at world zoom, and a busy one glows warm", () => {
  const centre = (refills, zoom) => at(HEAT_PAINT["heatmap-weight"], refills) * at(HEAT_PAINT["heatmap-intensity"], zoom) * 0.3989;
  const ramp = HEAT_PAINT["heatmap-color"].slice(3);
  const solid = ramp[ramp.indexOf("#3395ff") - 1];
  assert.ok(centre(K, 1) >= solid, "K refills at zoom 1 reach the solid blue: " + centre(K, 1));
  assert.ok(centre(K, 12) > 0.05, "and stay visible at city zoom: " + centre(K, 12));
  assert.ok(centre(1000, 1) >= 0.9, "1000 refills reach the warm end at world zoom");
  assert.ok(at(HEAT_PAINT["heatmap-radius"], 1) >= 15, "a spot of 15 px or more at world zoom");
});

test("Android: on the real site, the stats page trusts version.json's APK", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "version.json"), "utf8"));
  const site = new URL("../", "https://coolminer11.github.io/WaterNow-site/stats/").href; // stats.js: new URL("../", location)
  assert.equal(safeApkUrl(manifest, site), manifest.apkUrl);
  assert.equal(safeApkUrl(manifest, "http://127.0.0.1:8766/WaterNow-site/"), null, "a local preview doesn't: the button keeps its fallback");
});

test("the QR code: qrcodegen's matrix for the APK link, as zxing read it back, drawn as one SVG path", () => {
  const q = QrCode.encodeText("https://coolminer11.github.io/WaterNow-site/download/WaterNow-1063.apk", QrCode.Ecc.MEDIUM);
  assert.equal(q.version, 5);
  assert.equal(q.size, 37);
  const rows = [];
  for (let y = 0; y < q.size; y++) { let r = ""; for (let x = 0; x < q.size; x++) r += q.getModule(x, y) ? 1 : 0; rows.push(r); }
  // zxing 3.5.3 decoded this exact matrix to the link on 2026-11-12 (docs/work/stats-handoff.md, "QR code").
  assert.equal(crypto.createHash("sha256").update(rows.join("\n")).digest("hex"), "88f0baac848897f2a682756b9d4574e2ee0b8ba3482be057b24e087f9c944ed7");
  assert.equal(qrPath({ size: 2, getModule: (x, y) => x === y }), "M4 4h1v1h-1zM5 5h1v1h-1z");
  const d = qrPath(q);
  assert.equal((d.match(/M/g) || []).length, rows.join("").split("1").length - 1, "one square per dark module");
  assert.throws(() => QrCode.encodeText("x".repeat(3000), QrCode.Ecc.MEDIUM), RangeError);
});

test("counters ease up and land exactly", () => {
  assert.equal(tween(0, 1000, 0), 0);
  assert.equal(tween(0, 1000, 1), 1000);
  assert.equal(tween(0, 1000, 5), 1000);
  assert.ok(tween(0, 1000, 0.5) > 500, "eased out: past half way at half time");
  assert.equal(tween(200, 100, 1), 100);
});

test("every app language has every text", () => {
  const keys = (o) => Object.keys(o).sort();
  assert.deepEqual(Object.keys(STRINGS).sort(), [...LANGS].sort());
  for (const l of LANGS) {
    assert.deepEqual(keys(STRINGS[l]), keys(STRINGS.en), l);
    assert.deepEqual(keys(STRINGS[l].text), keys(STRINGS.en.text), l);
    for (const k of ["lists", "refills", "points", "updated"]) assert.equal(typeof STRINGS[l][k](3), "string", l + " " + k);
  }
});

test("French says tu, Romanian writes ș and ț with the comma below", () => {
  const all = (l) => JSON.stringify(STRINGS[l]) + ["lists", "refills", "points", "updated"].map((k) => STRINGS[l][k](1)).join(" ");
  assert.doesNotMatch(all("fr"), /\b(vous|votre|vos)\b/i);
  assert.doesNotMatch(all("ro"), /[ŞşŢţ]/, "no cedilla ş ţ");
  assert.match(all("ro"), /[șț]/);
  assert.doesNotMatch(all("es"), /\busted\b/i);
});

test("every element the texts name is on the page, and the page writes no HTML", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "stats", "index.html"), "utf8");
  for (const id of Object.keys(STRINGS.en.text).concat(["map", "status", "download", "topList", "topEmpty", "lists", "litresMonthLabel",
    "litresTodayLabel", "waterOver", "toiletsOver", "qr", "qrPath", "qrBox"])) {
    assert.match(html, new RegExp('id="' + id + '"'), id);
  }
  const js = fs.readFileSync(path.join(__dirname, "stats.js"), "utf8");
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.match(html, /script-src 'self';/);
  assert.doesNotMatch(html, /<script>/);
  // Every script from this site (no CDN), the QR encoder before the page's script.
  for (const [, src] of html.matchAll(/<script src="([^"]+)"/g)) assert.match(src, /^\.\.\/assets\//, src);
  assert.ok(html.indexOf("vendor/qrcodegen/qrcodegen.js") < html.indexOf("assets/stats.js"));
  // The Android button shows even when version.json can't be read: it then opens the home page.
  assert.match(html, /<a class="btn primary wide go" id="download" href="\.\.\/">/);
});

test("before the first answer (slow network, offline, maintenance) no counter claims a number", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "stats", "index.html"), "utf8");
  const js = fs.readFileSync(path.join(__dirname, "stats.js"), "utf8");
  const ids = [...js.matchAll(/countUp\("(\w+)"/g)].map((m) => m[1]).concat(["water", "toilets"]); // the loop's two
  assert.ok(ids.length >= 12, ids.join());
  for (const id of ids) assert.match(html, new RegExp('id="' + id + '">–<'), id + " starts as a dash, not 0");
  assert.doesNotMatch(html, /id="\w+">\d/, "no counter starts with a digit");
});

test("the vendored QR encoder keeps its MIT notice", () => {
  const src = fs.readFileSync(path.join(__dirname, "vendor", "qrcodegen", "qrcodegen.js"), "utf8");
  assert.match(src, /Copyright \(c\) Project Nayuki\. \(MIT License\)/);
  assert.match(src, /Permission is hereby granted, free of charge/);
});

test("the pill's problem lines fit one line on a 320 px phone, and a dash keeps its shimmer's width", () => {
  // 12 px semi-bold in a 248 px card: about 33 Latin characters or 16 Japanese ones. Longer, the pill took two lines when
  // a problem came and pushed the page down (CLS 0.013 in Japanese with no answer).
  for (const lang of LANGS) {
    for (const key of ["offline", "maintenance"]) {
      const t = STRINGS[lang][key];
      const width = Array.from(t).reduce((w, c) => w + (/[　-鿿＀-￯]/.test(c) ? 2 : 1), 0);
      assert.ok(width <= 33, lang + "." + key + " (" + width + "): " + t);
    }
  }
  const src = fs.readFileSync(path.join(__dirname, "stats.js"), "utf8");
  assert.match(src, /if \(el\.tagName === "B"\) el\.style\.minWidth = Math\.ceil\(el\.getBoundingClientRect\(\)\.width\) \+ "px";\s+el\.classList\.remove\("sk"\);/);
});
