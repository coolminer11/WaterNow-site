// node --test site/assets/console-report.test.js  (the private impact report: factors, country, wording, rounding, periods,
// reach, recommendations, answer cleaning, print rules, 7 languages; no browser needed)
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const C = require("../console/core.js");
const R = require("../console/impact.js");
const { STRINGS } = require("../console/report-i18n.js");
const { LANGS } = require("./spot-params.js");
const dir = path.join(__dirname, "..", "console");

test("factors by country: docs/15b's defaults and its worked example", () => {
  // Montréal, 1,000 refills of 0.5 L: 9.25 kg of PET, about 3.2 kg likely not collected, 91 kg CO2e, about 373 km,
  // C$720 to C$2,210 (15b, section 10).
  const ca = R.impact(500, "CA");
  assert.equal(ca.bottles, 1000);
  assert.ok(Math.abs(ca.petKg - 9.25) < 1e-9);
  assert.ok(Math.abs(ca.co2Kg - 91.05) < 1e-9, "net of tap water: 0.183 - 0.0009 per litre");
  assert.equal(Math.round(ca.carKm), 373);
  assert.deepEqual([Math.round(ca.money.low), Math.round(ca.money.high), ca.money.currency], [720, 2210, "CAD"]);
  assert.ok(Math.abs(ca.notCollected.kg - 3.2375) < 1e-9);
  const fr = R.impact(500, "FR"), us = R.impact(500, "US"), w = R.impact(500, "WORLD");
  assert.ok(Math.abs(fr.petKg - 12) < 1e-9 && Math.abs(fr.co2Kg - 500 * (0.32 - 0.00034)) < 1e-9 && fr.money.currency === "EUR");
  assert.equal(Math.round(fr.carKm), Math.round(fr.co2Kg / 0.142));
  assert.ok(Math.abs(us.notCollected.bottles - 675) < 1e-9, "US: 32.5 % collected");
  assert.equal(w.money, null, "no money without a country");
  assert.equal(w.notCollected, null, "no recycling without a country");
  assert.equal(R.impact(500, "XX").country, "WORLD");
  assert.equal(R.impact(null, "CA").bottles, 0);
  // Every factor in use has a source with a grade.
  for (const c of Object.keys(R.FACTORS)) {
    for (const k of Object.values(R.FACTORS[c].src)) assert.ok(R.SOURCES[k] && /^[ABC]$/.test(R.SOURCES[k].grade), c + " " + k);
  }
});

test("the scope's country: coarse outlines, 90 % of the points, else the territory, else the world", () => {
  const where = { CA: [[45.5, -73.57], [46.81, -71.21], [43.65, -79.38], [49.28, -123.12], [48.43, -123.37], [44.65, -63.57], [60.72, -135.06]],
                  US: [[40.71, -74.0], [47.6, -122.33], [42.89, -78.88], [44.48, -73.21], [58.3, -134.42], [21.3, -157.86], [31.76, -106.49]],
                  FR: [[48.86, 2.35], [45.76, 4.84], [43.3, 5.37], [48.58, 7.75], [50.63, 3.06], [48.39, -4.49], [41.93, 8.74]],
                  null: [[50.85, 4.35], [46.2, 6.14], [41.39, 2.17], [47.99, 7.85], [51.5, -0.13], [64.18, -51.72], [32.51, -117.04]] };
  for (const [c, list] of Object.entries(where)) for (const [la, lo] of list) assert.equal(String(R.countryOf(la, lo)), c, la + "," + lo);
  const mtl = { lat: 45.5, lon: -73.57 }, nyc = { lat: 40.71, lon: -74 };
  assert.equal(R.scopeCountry("partner", Array(9).fill(mtl).concat([nyc])), "CA", "a stray point doesn't flip it");
  assert.equal(R.scopeCountry("partner", [mtl, nyc]), "WORLD", "a mix takes the world's");
  assert.equal(R.scopeCountry("org", [], { lat: 46.81, lon: -71.21 }), "CA", "no point: the territory");
  assert.equal(R.scopeCountry("world", [mtl]), "WORLD", "the world is the world");
});

test("wording: up to / the equivalent of in every language, never a ratio to tap water, never a bottle not bought", () => {
  const hedge = { en: /up to|equivalent/i, fr: /jusqu'à|l'équivalent/i, es: /hasta|equivalente/i, de: /bis zu|entspricht/i,
                  pt: /até|equivalente/i, ja: /最大|相当/, ro: /până la|echivalentul/i };
  for (const l of LANGS) {
    const S = STRINGS[l];
    for (const line of [S.bottlesLine("1 000", 1000), S.petLine("9,3"), S.co2Line("91"), S.carLine("373", 373), S.moneyLine("2 210 $", "720 $"),
                        S.collectLine("350", "65 %", 350), S.sumBottles("1 000", 1000)]) assert.match(line, hedge[l], l + ": " + line);
    // The cover's big figures too (bug wave 3: "kg CO₂e évités" stood there without « jusqu'à »).
    for (const label of [S.kCo2, S.kPet]) assert.match(label, hedge[l], l + ": " + label);
    const all = JSON.stringify(Object.values(S).map((v) => (typeof v === "function" ? [].concat(v("X", "Y", "Z", 25)).join(" ") : v)));
    assert.doesNotMatch(all, /\d+\s*(x|×|times|fois|veces|mal|vezes|倍|ori)\b[^.]{0,40}(tap|robinet|grifo|Leitung|torneira|水道)/i, l);
    assert.doesNotMatch(all, /not bought|non achetée|no comprada|nicht gekauft|não comprada|買わ|necumpărat/i, l);
  }
});

test("controlled rounding: section 80's formula, deterministic, within 4, multiples kept, unbiased", () => {
  // Only the salt and the value enter the hash (the seed is a label): one count rounds one way under every label and
  // in every scope (bug wave 3, security wave 4 #5).
  const h = (salt, seed, n) => parseInt(crypto.createHash("md5").update(salt + "|" + n).digest("hex").slice(0, 8), 16);
  // private.stats_round itself, salt 'vector-salt', seeds 'partner:12|refills' and 'org:3|p:7:refills' (the same
  // vector), from the bug wave 3 dry run on the project (2026-11-13, rolled back).
  const sql = "0,5,0,5,5,5,5,10,10,10,10,10,10,15,15,15,20,15,15,20,20,20,25,25,25,25,30,30,25,30,30,35,35,30,35,40,35,40,40,40".split(",").map(Number);
  assert.deepEqual(Array.from({ length: 40 }, (_, i) => R.round5(i + 1, h("vector-salt", "partner:12|refills", i + 1))), sql, "the JS mirror = the SQL");
  for (let n = 0; n <= 300; n++) {
    const a = R.round5(n, h("s", "org:3|refills", n));
    assert.equal(a, R.round5(n, h("s", "org:3|refills", n)), "the same answer twice");
    assert.ok(a % 5 === 0 && Math.abs(a - n) <= 4 && (n % 5 !== 0 || a === n), n + " -> " + a);
  }
  let sum = 0, ups = 0;
  for (let i = 0; i < 4000; i++) { const a = R.round5(23, h("salt" + i, "partner:12|p:1:refills", 23)); sum += a; ups += a === 25; }
  assert.ok(Math.abs(sum / 4000 - 23) < 0.15 && ups > 0 && ups < 4000, "23 reads 20 or 25, 23 on average: " + sum / 4000);
  // Differencing: with the salt secret, a published total 30 and a shown point 20 allow many hidden remainders.
  const hidden = new Set();
  for (let i = 0; i < 400; i++) for (let t = 26; t <= 34; t++) for (let v = 16; v <= 24; v++) {
    if (R.round5(t, h("x" + i, "partner:12|refills", t)) === 30 && R.round5(v, h("x" + i, "partner:12|p:1:refills", v)) === 20) hidden.add(t - v);
  }
  assert.ok(hidden.size >= 15, "total minus the shown point: " + [...hidden].sort((a, b) => a - b).join(","));
});

test("periods: whole complete months, newest first; keys the server takes", () => {
  const list = R.months(Date.UTC(2026, 10, 12), 36);
  assert.equal(list[0], "2026-10");
  assert.equal(list.length, 36);
  assert.equal(list[35], "2023-11");
  assert.deepEqual(R.quarters(list).slice(0, 3), ["2026-Q4", "2026-Q3", "2026-Q2"]);
  assert.deepEqual(R.years(list), ["2026", "2025", "2024", "2023"]);
  assert.equal(R.periodKey("month", "2026-10"), "2026-10");
  assert.equal(R.periodKey("quarter", "2026-Q3"), "2026-Q3");
  assert.equal(R.periodKey("year", "2026"), "2026");
  assert.equal(R.periodKey("range", "2026-01", "2026-06"), "2026-01..2026-06");
  assert.equal(R.periodKey("range", "2026-06", "2026-06"), "2026-06", "one month is a month");
  assert.equal(R.periodKey("range", "2023-01", "2026-01"), null, "37 months");
  assert.equal(R.periodKey("range", "2026-06", "2026-01"), null, "backwards");
  assert.equal(R.periodKey("month", "2026-13"), null);
  assert.equal(R.spanDays("2026-10-01", "2026-10-31"), 31);
  assert.equal(R.change(120, 100), 20);
  assert.equal(R.change(120, null), null);
  assert.equal(R.change(120, 0), null);
});

test("reach: residents near points over 1 km cells, each counted once, approximate", () => {
  const flat = () => 1000; // 1,000 people per km² everywhere
  const mtl = { lat: 45.5, lon: -73.57 };
  const r5 = R.reach(C, [mtl], 500, flat), r1 = R.reach(C, [mtl], 1000, flat);
  assert.ok(Math.abs(r5 - Math.PI * 0.25 * 1000) / (Math.PI * 250) < 0.06, "500 m: " + r5);
  assert.ok(Math.abs(r1 - Math.PI * 1000) / (Math.PI * 1000) < 0.04, "1 km: " + r1);
  assert.equal(R.reach(C, [mtl, mtl], 1000, flat), r1, "two points at one place: no one counted twice");
  const far = R.reach(C, [mtl, { lat: 46.81, lon: -71.21 }], 1000, flat);
  assert.ok(Math.abs(far - 2 * r1) < 0.05 * r1, "two far points add up");
  assert.ok(R.reach(C, [{ lat: 70, lon: 25 }], 1000, flat) > 2900, "far north, where cells are narrow: still the whole circle");
  const c = C.cellOf(45.5, -73.57), b = R.beyond(C, [{ ix: c.ix, iy: c.iy, population: 1000 }, { ix: c.ix + 20, iy: c.iy, population: 500 }], [mtl], 1000);
  assert.equal(b.people, 500, "the far cell is beyond 1 km, the point's own isn't");
  assert.equal(b.cells[0].ix, c.ix + 20);
});

test("recommendations: short and factual, from the report's own figures", () => {
  const recs = R.recommendations({ kind: "org", repairDays: 4, change: 34,
    points: [{ name: "Parc A", longest: 9, open: false, uptime: 71 }, { name: "Parc B", longest: 2, uptime: 100 }, { name: "Parc C", uptime: null }],
    beyond: { people: 1240, cells: [{ people: 860, ix: 1, iy: 2 }] }, demandTop: { demand: 35, ix: 3, iy: 4 } });
  assert.deepEqual(recs.map((r) => r.key), ["longBreak", "beyond", "demand", "lowUptime", "neverChecked", "up"]);
  assert.deepEqual([recs[0].name, recs[0].days, recs[0].median], ["Parc A", 9, 4]);
  assert.equal(STRINGS.fr.recLongBreak("Parc A", "9", "4,0", 9), "Parc A est resté brisé 9 jours (réparation médiane 4,0 j).");
  assert.equal(R.recommendations({ points: [{ name: "X", longest: 5, open: true }], repairDays: null })[0].key, "stillBroken");
  assert.equal(R.recommendations({ points: [{ name: "X", longest: 3, uptime: 99 }], repairDays: 6 }).length, 0, "a breakdown shorter than the median isn't news");
  assert.equal(R.recommendations({ points: [], change: -19 }).length, 0, "under 20 %: no comment");
  assert.equal(R.recommendations({ points: [], beyond: { people: 40, cells: [] } }).length, 0, "fewer than 50 residents: no comment");
});

test("the answer is cleaned: unknown keys out, counts only, a logo name or nothing", () => {
  const d = R.cleanReport({
    scope: { key: "partner:12", kind: "partner", name: "Café‮x", logo: "../../etc/passwd" }, user_id: "6f1d1c3e-2b5a-4c1e-9f61-6d2a1b7c9e04",
    period: { key: "2026-10", from: "2026-10-01", to: "2026-10-31", step: "day", months: 1, prev_from: "2026-09-01", prev_to: "2026-09-30" },
    k: { people: 10 }, rounded: true, totals: { refills: 460, people: null, rating: 7, uptime: 98.4 }, previous: { refills: "445" },
    weekdays: [1, 2, 3], hours: [10, 20, 30, 40], months: [{ t: "2026-10-01", refills: 460 }, { t: "x" }],
    points: [{ id: 5, name: "Parc", type: "HACK", lat: 45.5, lon: -73.6, uptime: 120, longest: 4, open: true, owner: "a@b.c" }, { id: -1, lat: 0, lon: 0 }],
    demand_cells: [{ ix: 1, iy: 2, demand: 15 }, { ix: 1.5, iy: 2, demand: 10 }], territory: [[5225, -7101, -7097], [1, 3, 2]]
  }, C);
  assert.equal(d.scope.logo, null, "only a partner-media logo name");
  assert.equal(d.scope.name, "Caféx", "direction overrides out");
  assert.equal(d.totals.people, null);
  assert.equal(d.totals.rating, null, "a rating is out of 5");
  assert.equal(d.previous.refills, null, "a string is no count");
  assert.equal(d.weekdays, null, "7 weekdays or none");
  assert.deepEqual(d.hours, [10, 20, 30, 40]);
  assert.equal(d.months.length, 1);
  assert.deepEqual([d.points.length, d.points[0].type, d.points[0].uptime, d.points[0].owner], [1, "FOUNTAIN", null, undefined]);
  assert.equal(d.demandCells.length, 1);
  assert.deepEqual(d.territory, [[5225, -7101, -7097]]);
  assert.ok(!JSON.stringify(d).includes("6f1d1c3e") && !JSON.stringify(d).includes("a@b.c"));
  assert.equal(R.cleanReport({ period: {} }, C), null);
  assert.equal(R.cleanReport({ period: { from: "2026-10-01", to: "2026-10-31" }, scope: { logo: "12/logo-" + "a".repeat(32) + ".png" } }, C).scope.logo,
               "12/logo-" + "a".repeat(32) + ".png");
});

test("the print header is a safe CSS string", () => {
  const s = R.cssString('Café "La Gourde" } @import url(x); 東京 😀');
  assert.ok(/^"[^"{}]*"$/.test(s), s);
  assert.ok(!/[;@(){}]/.test(s.slice(1, -1).replace(/\\[0-9a-f]+ /g, "")), "only letters, digits, spaces and escapes");
  assert.ok(s.includes("\\1f600 "), "a character outside the BMP is one escape");
});

test("print rules: Letter and A4, the cover alone, nothing split, a running header, light in dark mode", () => {
  const css = fs.readFileSync(path.join(dir, "report.css"), "utf8").replace(/\r\n/g, "\n");
  const print = css.slice(css.indexOf("@media print"));
  assert.match(css, /@page \{\s*size: auto;/, "the print dialog's paper: Letter or A4");
  assert.match(css, /@page :first \{ @top-left \{ content: none; \}/, "no running header on the cover");
  assert.match(print, /\.rpt-cover \{ break-after: page;/);
  assert.match(print, /\ntr \{ break-inside: avoid; \}|\n  tr \{ break-inside: avoid; \}/, "a table row never splits");
  assert.match(print, /thead \{ display: table-header-group; \}/, "a table's head repeats on each page");
  assert.match(print, /figure, \.rpt-chart[^{]*\{ break-inside: avoid; \}/, "a chart never splits");
  assert.match(print, /h2, h3 \{ break-after: avoid; \}/);
  assert.match(print, /--bg: #fff;[^}]*--fg: #0f172a;/, "light tokens even in dark mode");
  assert.match(print, /body > \*:not\(\.report\) \{ display: none !important; \}/, "only the report prints");
  assert.match(print, /\.rv \{ opacity: 1 !important;/, "sections not yet revealed print anyway");
  const js = fs.readFileSync(path.join(dir, "report.js"), "utf8");
  assert.match(js, /@top-left \{ content: /, "the running header");
  assert.match(js, /counter\(page\) \\" \/ \\" counter\(pages\)/, "page numbers: n / total");
});

test("the report's 7 languages: the same keys, French tu, Romanian ș ț and de", () => {
  assert.deepEqual(Object.keys(STRINGS).sort(), LANGS.slice().sort());
  const keys = (o) => Object.keys(o).flatMap((k) => (typeof o[k] === "object" && !Array.isArray(o[k]) ? Object.keys(o[k]).map((x) => k + "." + x) : [k])).sort();
  for (const l of LANGS) {
    assert.deepEqual(keys(STRINGS[l]), keys(STRINGS.en), l);
    assert.equal(STRINGS[l].bands.length, 4, l);
    assert.equal(STRINGS[l].privacyLines(10, true).length, 5, l);
    assert.equal(STRINGS[l].limitLines.length, 5, l);
  }
  const all = (l) => JSON.stringify(Object.values(STRINGS[l]).map((v) => (typeof v === "function" ? [].concat(v("X", "Y", "Z", 25)).join(" ") : v)));
  assert.doesNotMatch(all("fr"), /\b(vous|votre|vos)\b/i);
  assert.match(all("fr"), /\btes\b|\bTes\b/);
  assert.doesNotMatch(all("ro"), /[ŞşŢţ]/);
  assert.match(all("ro"), /[șț]/);
  assert.equal(STRINGS.ro.bottlesLine("25", 25), "Echivalentul a până la 25 de sticle de 500 ml.");
  assert.equal(STRINGS.ro.bottlesLine("19", 19), "Echivalentul a până la 19 sticle de 500 ml.");
  assert.match(STRINGS.ro.privacyLines(10, true)[1], /de la 10 persoane/);
  assert.match(STRINGS.fr.brandTitle, /Rapport d'impact WaterNow/);
});

test("the report page: private, strict CSP, text only, no link to share", () => {
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  for (const f of ["report.css", "impact.js", "report-i18n.js", "report.js"]) assert.ok(html.includes('"' + f + '"'), f);
  for (const f of ["report.js", "impact.js", "report-i18n.js"]) {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    assert.doesNotMatch(src, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/, f);
    assert.doesNotMatch(src, /navigator\.share|clipboard|history\.(push|replace)State|location\.hash\s*=/, f + ": nothing to share");
  }
  const js = fs.readFileSync(path.join(dir, "report.js"), "utf8");
  assert.match(js, /"stats_report"/);
  assert.match(js, /new CustomEvent\("wn-report"/, "the slot for the scenarios");
  const sim = fs.readFileSync(path.join(dir, "simulator.js"), "utf8");
  assert.match(sim, /addEventListener\("wn-report"/, "the simulator fills it with its scenarios");
  // Bug wave 3: only the report's own scope's scenarios (they used to follow the admin into another city's report).
  assert.match(sim, /rep\.scope\.key === sim\.scope/, "scenarios of the report's scope only");
  assert.match(sim, /sim\.scope !== P\.scope\(\)\) reset\(\)/, "another scope starts with no pins nor scenarios");
  // Screen readers: a short status, not the whole report as a live region.
  assert.doesNotMatch(js, /doc\.setAttribute\("aria-live"/, "the report itself isn't a live region");
  assert.match(js, /live\.setAttribute\("role", "status"\)/);
});
