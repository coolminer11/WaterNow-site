// node --test site/assets/console-fetes.test.js : the console's « Fêtes » (fetes.js, section 96): the pure helpers, the
// 7 languages, the page's wiring. No DOM, no network.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const F = require("../console/fetes.js");

const site = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(site, f), "utf8");
const LANGS = ["en", "fr", "es", "de", "pt", "ja", "ro"];

test("fetes: fetes_admin_overview cleaned, with safe defaults", () => {
  const o = F.overview({
    config: { overrides: { christmas: "2026-11-15", easter: "soon" }, advent_min_days: 30, egg_hunt_start: null, egg_max_accuracy_m: 50,
              preview: { holiday: "christmas", until: "2026-11-15T12:00:00Z" } },
    calendar: { year: 2027, holidays: [{ id: "easter", date: "2027-03-28" }, { id: "party", date: "2027-01-02" }], advent: { from: "2027-12-01", to: "2027-12-24" },
                egg_hunt: { from: "2027-03-26", to: "2027-03-29" } },
    eggs: { year: 2027, total: 12, from_spots: 2, from_imports: 10, regions: [{ key: "Montréal", name: "Montréal", eggs: 9, hunters: 3 }, { key: "", eggs: 1 },
            { key: "grid:46:-74", name: null, lat: 46, lon: -74, eggs: 3, hunters: -2 }] },
    advent: { members: 4, done: 1 }, greetings: { christmas: 7 }
  });
  assert.equal(o.year, 2027);
  assert.deepEqual(o.dates, { easter: "2027-03-28" });
  assert.equal(o.overrides.christmas, "2026-11-15");
  assert.equal(o.overrides.easter, null, "a value that isn't a date");
  assert.equal(o.adventMin, 12, "out of 1-24: the default");
  assert.equal(o.accuracy, 50);
  assert.equal(o.speed, 130);
  assert.deepEqual(o.preview, { holiday: "christmas", until: "2026-11-15T12:00:00Z" });
  assert.deepEqual(o.hunt, { from: "2027-03-26", to: "2027-03-29", start: null, end: null });
  assert.equal(o.eggs.regions.length, 2);
  assert.deepEqual(o.eggs.regions[1], { region: { key: "grid:46:-74", name: null, lat: 46, lon: -74 }, eggs: 3, hunters: 0 });
  assert.equal(o.greetings.christmas, 7);
  assert.equal(o.greetings.easter, 0);
  const empty = F.overview(null);
  assert.equal(empty.eggs.total, 0);
  assert.equal(empty.preview, null);
});

test("fetes: the overview's holidays (sample countries) and both hunts", () => {
  const o = F.overview({ calendar: { year: 2027, holidays: [{ id: "easter", date: "2027-03-28" }], egg_hunt: { from: "2027-03-26", to: "2027-03-29" } },
                         holidays: [{ id: "eid_al_fitr", date: "2027-03-09", moved: null }, { id: "diwali", date: null }],
                         hunts: { western: { from: "2027-03-26", to: "2027-03-29" }, orthodox: { from: "2027-04-30", to: "2027-05-03" } } });
  assert.deepEqual(o.dates, { easter: "2027-03-28", eid_al_fitr: "2027-03-09" });
  assert.deepEqual(o.hunts, { western: { from: "2027-03-26", to: "2027-03-29" }, orthodox: { from: "2027-04-30", to: "2027-05-03" } });
  assert.equal(F.IDS.length, 19);
  assert.deepEqual(F.overview(null).hunts, { western: null, orthodox: null });
});

test("fetes: the admins' leaderboard cleaned", () => {
  const b = F.board({ final: true, rows: [{ rank: 1, user_id: "u1", name: " Léa ", eggs: 9, region: { key: "Montréal", name: "Montréal" }, strikes: 2, disqualified: true, reason: "Fake GPS", flagged: true },
                                       { rank: 2, name: "No id" }] });
  assert.equal(b.final, true);
  assert.equal(b.rows.length, 1);
  assert.deepEqual(b.rows[0], { rank: 1, user: "u1", name: "Léa", eggs: 9, region: { key: "Montréal", name: "Montréal", lat: null, lon: null }, strikes: 2, dq: true, reason: "Fake GPS", flagged: true });
});

test("fetes: a region as people read it", () => {
  assert.equal(F.regionLabel({ key: "Montréal", name: "Montréal" }, F.STRINGS.fr), "Montréal");
  assert.equal(F.regionLabel({ key: "grid:46:-74", name: null, lat: 46, lon: -74 }, F.STRINGS.fr), "Carré 46° N, 74° O");
  assert.equal(F.regionLabel({ key: "grid:-34:151", name: null, lat: -34, lon: 151 }, F.STRINGS.en), "Square 34° S, 151° E");
  assert.equal(F.regionLabel(null, F.STRINGS.en), "");
});

test("fetes: pasted points, lines or GeoJSON", () => {
  assert.deepEqual(F.pointsFromText(" 45.5088, -73.5878, Parc Jeanne-Mance \n\n46.8123;-71.2145\n10\t-30\tTab"),
                   { points: [{ lat: 45.5088, lon: -73.5878, name: "Parc Jeanne-Mance" }, { lat: 46.8123, lon: -71.2145 }, { lat: 10, lon: -30, name: "Tab" }] });
  assert.deepEqual(F.pointsFromText("45.5, -73.5\nnope"), { error: "line", line: 2 });
  assert.deepEqual(F.pointsFromText("91, 0"), { error: "line", line: 1 });
  assert.deepEqual(F.pointsFromText("  "), { error: "empty" });
  assert.deepEqual(F.pointsFromText(JSON.stringify({ type: "FeatureCollection", features: [
    { type: "Feature", geometry: { type: "Point", coordinates: [-73.5, 45.5] }, properties: { name: "Fontaine" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-71.2, 46.8] }, properties: {} }] })),
    { points: [{ lat: 45.5, lon: -73.5, name: "Fontaine" }, { lat: 46.8, lon: -71.2 }] });
  assert.deepEqual(F.pointsFromText('{"type":"FeatureCollection","features":[{"geometry":{"type":"LineString","coordinates":[[0,0],[1,1]]}}]}'), { error: "line", line: 1 });
  assert.deepEqual(F.pointsFromText("{broken"), { error: "line", line: 1 });
});

test("fetes: Overpass boxes cover the circle, at most 0.5 degree a side", () => {
  const bs = F.boxes(45.5, -73.6, 60);
  assert.ok(bs.length >= 4);
  for (const [s, w, n, e] of bs) { assert.ok(n - s <= 0.5 + 1e-9 && e - w <= 0.5 + 1e-9); assert.ok(n > s && e > w); }
  const S = Math.min(...bs.map((b) => b[0])), N = Math.max(...bs.map((b) => b[2])), W = Math.min(...bs.map((b) => b[1])), E = Math.max(...bs.map((b) => b[3]));
  assert.ok(S <= 45.5 - 60 / 111.32 + 1e-9 && N >= 45.5 + 60 / 111.32 - 1e-9 && W < -74.3 && E > -72.9);
  assert.equal(F.boxes(45.5, -73.6, 5).length, 1, "a small radius: one box");
  assert.equal(F.boxes(45.5, -73.6, 500).length, F.boxes(45.5, -73.6, 60).length, "60 km at most");
});

test("fetes: OpenStreetMap points kept for eggs: drinking water, inside the radius, once", () => {
  const pts = [{ id: 1, lat: 45.5, lon: -73.6, type: "FOUNTAIN", water: true }, { id: 1, lat: 45.5, lon: -73.6, type: "FOUNTAIN", water: true },
               { id: 2, lat: 45.5, lon: -73.6, type: "RESTROOM", water: false }, { id: 3, lat: 45.5, lon: -73.6, type: "DOG_WATER", water: true },
               { id: 4, lat: 45.5, lon: -73.6, type: "WATER_REFILL", water: false }, { id: 5, lat: 46.5, lon: -73.6, type: "COMBO", water: true },
               { id: 6, lat: 45.6000004, lon: -73.6, type: "COMBO", water: true }];
  assert.deepEqual(F.eggPoints(pts, 45.5, -73.6, 30), [{ lat: 45.5, lon: -73.6 }, { lat: 45.6, lon: -73.6 }]);
  assert.deepEqual(F.chunks([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test("fetes: the 7 languages say the same things", () => {
  const shape = (o) => Object.keys(o).sort().map((k) => k + ":" + (typeof o[k] === "object" ? "{" + shape(o[k]) + "}" : typeof o[k])).join(",");
  assert.deepEqual(Object.keys(F.STRINGS).sort(), [...LANGS].sort());
  for (const l of LANGS) {
    assert.equal(shape(F.STRINGS[l]), shape(F.STRINGS.en), l);
    for (const id of F.IDS) assert.ok(F.STRINGS[l].names[id], l + " " + id);
    for (const r of ["forbidden", "bad_country", "bad_key", "bad_value", "bad_points", "bad_year", "not_found", "bad_reason", "bad_request"]) assert.ok(F.STRINGS[l].reasons[r], l + " " + r);
  }
  assert.match(F.STRINGS.fr.importLead + F.STRINGS.fr.windowLead, /colle/, "French says tu");
  assert.doesNotMatch(Object.values(F.STRINGS.fr).filter((v) => typeof v === "string").join(" "), /\bvous\b/);
  assert.doesNotMatch(JSON.stringify(F.STRINGS.ro), /[şţŞŢ]/, "Romanian: ș ț with a comma");
});

test("fetes: the page loads it after the shop, in its own card, admins only", () => {
  const html = read("console/index.html");
  assert.ok(html.indexOf('<script src="fetes.js"></script>') > html.indexOf('<script src="shop.js"></script>'));
  assert.match(html, /<section class="card hidden" id="fetes"><\/section>/);
  const js = read("console/fetes.js");
  assert.match(js, /A\.admin\(\)/);
  assert.match(js, /addEventListener\("wnc:render", start\)/);
  assert.doesNotMatch(js, /innerHTML/);
});
