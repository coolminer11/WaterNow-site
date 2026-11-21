// node --test site/assets/console.test.js  (the private console's helpers, texts and page rules, no browser needed)
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const C = require("../console/core.js");
const { STRINGS } = require("../console/i18n.js");
const { LANGS } = require("./spot-params.js");
const dir = path.join(__dirname, "..", "console");

test("EASE-Grid 2.0 matches PostGIS's EPSG:6933 to the millimetre, and the cells match section 80's", () => {
  // ST_Transform(ST_SetSRID(ST_MakePoint(lon, lat), 4326), 6933), read on the project on 2026-11-12 (PROJ 9.7.1).
  for (const [la, lo, x, y] of [[45.5019, -73.5674, -7098244.7737298, 5225484.76037292], [-54.8, -68.3, -6590012.94113623, -5990718.96184403],
                                [-33.9, 151.2, 14588725.5739356, -4082458.77388926], [64.1, -21.9, -2113049.53749463, 6599099.81366269],
                                [35.68, 139.69, 13478168.4882477, 4269756.25358733], [89.99, 10, 964862.802508965, 7342230.02366433],
                                [-85, -179.99, -17366565.5823589, -7314040.88981197], [0, 0, 0, 0]]) {
    const [gx, gy] = C.easeForward(la, lo);
    assert.ok(Math.abs(gx - x) < 0.001 && Math.abs(gy - y) < 0.001, la + "," + lo + ": " + gx + " " + gy);
  }
  // And back: ST_Transform(ST_SetSRID(ST_MakePoint(x, y), 6933), 4326).
  for (const [x, y, lo, la] of [[-7097500, 4799500, -73.5596810400829, 40.9469370759909], [500, 500, 0.00518208390560641, 0.00391931575762029],
                                [16000500, 7000500, 165.831867063311, 72.5241332179896], [-12345678.9, -3456789.1, -127.952687862949, -28.1935658078909]]) {
    const [glo, gla] = C.easeInverse(x, y);
    assert.ok(Math.abs(glo - lo) < 1e-8 && Math.abs(gla - la) < 1e-8, x + "," + y); // 1e-8 degree: about a millimetre
  }
  // private.stats_cell for the test points of 2026-11-12_private_stats_tests.sql (same query, read on the project).
  assert.deepEqual(C.cellOf(45.5019, -73.5674), { ix: -7099, iy: 5225 });
  assert.deepEqual(C.cellOf(-54.80, -68.30), { ix: -6591, iy: -5991 });
  assert.deepEqual(C.cellOf(-54.79, -68.17), { ix: -6578, iy: -5990 });
  assert.deepEqual(C.cellOf(-54.795, -68.195), { ix: -6580, iy: -5991 });
  for (const [la, lo] of [[0, 0], [45.5, -73.6], [-33.9, 151.2], [64.1, -21.9], [35.68, 139.69], [-89.9, 179.9]]) {
    const c = C.cellOf(la, lo), [clo, cla] = C.cellCentre(c.ix, c.iy);
    assert.deepEqual(C.cellOf(cla, clo), c, "a cell's centre is in the cell");
    // Upright on the web map: the west and east edges share their longitudes, the south and north edges their latitudes.
    const r = C.cellRing(c.ix, c.iy);
    assert.equal(r.length, 5);
    assert.ok(r[0][0] === r[3][0] && r[1][0] === r[2][0] && r[0][1] === r[1][1] && r[2][1] === r[3][1], JSON.stringify(r));
  }
  // Equal-area and cylindrical: every cell spans the same longitudes; near Montréal it spans more latitude than at the
  // equator (a degree of longitude is shorter there), so it keeps its 1 km².
  const m = C.cellRing(-7099, 5225), e = C.cellRing(0, 0);
  assert.ok(Math.abs((m[1][0] - m[0][0]) - (e[1][0] - e[0][0])) < 1e-6 && m[2][1] - m[0][1] > e[2][1] - e[0][1]);
});

test("population cells merge by rows into rectangles that sit exactly on the grid", () => {
  // Classes along two rows: [1, 1, 1, null, 2] then [3, 3, null, null, null].
  const cls = (ix, iy) => (iy === 5225 ? [1, 1, 1, null, 2] : [3, 3, null, null, null])[ix + 7100];
  const f = C.rowRuns(-7100, -7096, 5224, 5225, 1000, cls);
  assert.deepEqual(f.map((x) => x.properties.b), [1, 2, 3], "three runs, north row first");
  const ring = f[0].geometry.coordinates[0], first = C.cellRing(-7100, 5225), last = C.cellRing(-7098, 5225);
  assert.deepEqual([ring[0][0], ring[0][1], ring[2][0], ring[2][1]], [first[0][0], first[0][1], last[2][0], last[2][1]]);
  // The 8 km level's cell is the 8 x 8 block of 1 km cells under it.
  const c8 = C.cellRing(-888, 653, 8000), sw = C.cellRing(-888 * 8, 653 * 8), ne = C.cellRing(-888 * 8 + 7, 653 * 8 + 7);
  assert.deepEqual([c8[0], c8[2]], [sw[0], ne[2]]);
});

test("a population block decodes as built: uint32 people, byte-shuffled", () => {
  const n = 65536, raw = new Uint8Array(n * 4), people = { 0: 348128, 1: 1, 300: 70000, 65535: 7 };
  for (const [i, v] of Object.entries(people)) for (let k = 0; k < 4; k++) raw[k * n + Number(i)] = (v >>> (8 * k)) & 255;
  const got = C.unshuffle(raw);
  assert.equal(got.length, n);
  for (const [i, v] of Object.entries(people)) assert.equal(got[i], v);
  assert.equal(got[2], 0);
});

test("the answer is cleaned: unknown keys out, counts only, null kept as 'under the floor'", () => {
  const d = C.cleanOverview({
    scope: { key: "world", kind: "world", name: null }, period: { key: "30d", from: "2026-10-13", to: "2026-11-11", step: "day" },
    k: { people: 5, anonymous: 10 }, has_demand: true, user_id: "6f1d1c3e-2b5a-4c1e-9f61-6d2a1b7c9e04",
    totals: { refills: 30, people: null, water: 4, repair_days: 3.0, population: 1734 },
    trend: [{ t: "2026-11-07", refills: 20 }, { t: "2026-11-08", refills: null }, { t: "bad", refills: 3 }],
    cells: [{ ix: -4850, iy: -6367, refills: null, people: null, water: 1, population: 1234, demand: "9", extra: 1 }, { ix: 1.5, iy: 2 }],
    points: [{ id: 6999999990003, name: "Fontaine‮evil\u0000", type: "HACK", lat: -54.8, lon: -68.2, refills: 20, status: "drop table", checked_on: "2026-11-10T03:00:00Z" },
             { id: -1, lat: 0, lon: 0 }]
  });
  assert.equal(d.totals.refills, 30);
  assert.equal(d.totals.people, null);
  assert.equal(d.totals.repairDays, 3);
  assert.deepEqual(d.trend.map((t) => t.refills), [20, null]);
  assert.equal(d.cells.length, 1);
  assert.equal(d.cells[0].demand, null, "a string is no count");
  assert.equal(d.cells[0].extra, undefined);
  assert.equal(d.points.length, 1);
  assert.equal(d.points[0].name, "Fontaineevil", "control and direction characters out");
  assert.equal(d.points[0].type, "FOUNTAIN");
  assert.equal(d.points[0].status, null);
  assert.equal(d.points[0].checkedOn, null, "a day, never a time");
  assert.ok(!JSON.stringify(d).includes("6f1d1c3e"), "no account id survives");
  assert.equal(d.cells[0].population, null, "population comes from the files, never from the answer");
  assert.equal(d.territory, null, "no territory outside a city");
  const city = C.cleanOverview({ period: { from: "2026-10-13", to: "2026-11-11" },
    territory: [[5225, -7101, -7097], [5224, -7100, -7098], [1.5, 2, 3], [5223, -7090, -7095], "x", [5222, -7099, -7099]] });
  assert.deepEqual(city.territory, [[5225, -7101, -7097], [5224, -7100, -7098], [5222, -7099, -7099]], "rows of whole cells, first <= last");
  assert.equal(C.cleanOverview({ period: {} }), null);
  assert.equal(C.cleanPoint({ result: "not_found" }), null);
});

test("derived measures and the need score", () => {
  const busy = C.derive({ refills: 50, water: 2, broken: 0, population: 5000, demand: null });
  assert.equal(busy.per1000, 10);
  assert.equal(busy.perPoint, 2500);
  assert.equal(busy.underserved, false);
  const none = C.derive({ refills: null, water: 1, broken: 1, population: 9000, demand: 60 });
  assert.equal(none.noPoint, true, "a broken point doesn't count as one");
  assert.equal(none.score, 1);
  assert.equal(none.underserved, true);
  assert.equal(none.per1000, null, "a hidden figure stays hidden");
  assert.equal(C.derive({ water: 0, population: 0 }).score, 0);
  assert.deepEqual(C.breaks([0, null, 1, 2, 3, 4, 5, 6], 3), [3, 5]);
  assert.equal(C.classOf(4, [3, 5]), 1);
  assert.equal(C.classOf(-2, [3, 5]), -1);
});

test("CSV: quotes, line ends, and no formula a spreadsheet would run", () => {
  assert.equal(C.csv([["a", 1, null], ['say "hi"', "x,y", "=HYPERLINK(1)"], ["-2+3", "@cmd", -4]]),
    'a,1,\r\n"say ""hi""","x,y",\'=HYPERLINK(1)\r\n\'-2+3,\'@cmd,-4\r\n');
  // Tab, line ends and the full-width forms some spreadsheets also read as a formula; "<5" (a hidden figure) stays.
  assert.equal(C.csv([["\tx", "＝1+1", "＋1", "－1", "＠a", "<5"]]), "'\tx,'＝1+1,'＋1,'－1,'＠a,<5\r\n");
  assert.equal(C.csv([["\nx"]]), "\"'\nx\"\r\n");
});

test("the second factor: digits only, the authenticator label never carries the email", () => {
  assert.equal(C.totpDigits(" 123-456 7"), "123456");
  const uri = C.totpUri("JBSWY3DPEHPK3PXP", "otpauth://totp/WaterNow:boss@city.example?secret=JBSWY3DPEHPK3PXP&issuer=WaterNow&algorithm=sha1&digits=6&period=30&image=x");
  assert.equal(uri, "otpauth://totp/WaterNow:Statistics?secret=JBSWY3DPEHPK3PXP&issuer=WaterNow&algorithm=SHA1&digits=6&period=30");
  assert.equal(C.totpUri("not base32!", ""), null);
  assert.equal(C.groupSecret("JBSWY3DPEHPK3PXP"), "JBSW Y3DP EHPK 3PXP");
});

test("seasons, last month, Romanian de", () => {
  assert.deepEqual(["2026-12-01", "2026-03-01", "2026-06-01", "2026-09-01", "2027-02-01"].map(C.seasonOf), ["winter", "spring", "summer", "autumn", "winter"]);
  assert.equal(C.lastMonth(Date.UTC(2026, 10, 12)), "2026-10");
  assert.equal(C.lastMonth(Date.UTC(2027, 0, 3)), "2026-12");
  assert.equal(C.roDe(19), ""); assert.equal(C.roDe(20), " de"); assert.equal(C.roDe(101), ""); assert.equal(C.roDe(200), " de");
  assert.equal(STRINGS.ro.repairOpen("25", 25), "defect de 25 de zile");
  assert.equal(STRINGS.ro.fewer(10), "mai puțin de 10 persoane");
});

test("all 7 languages, the same keys; French tu and courriel; Romanian ș ț with the comma below", () => {
  assert.deepEqual(Object.keys(STRINGS).sort(), LANGS.slice().sort());
  const keys = (o, p = "") => Object.keys(o).flatMap((k) => (typeof o[k] === "object" ? keys(o[k], p + k + ".") : [p + k])).sort();
  for (const l of LANGS) assert.deepEqual(keys(STRINGS[l]), keys(STRINGS.en), l);
  const all = (l) => Object.values(STRINGS[l]).map((v) => (typeof v === "function" ? v("X", 25) : typeof v === "object" ? Object.values(v).join(" ") : v)).join(" ");
  assert.doesNotMatch(all("fr"), /\b(vous|votre|vos|e-mail)\b/i);
  assert.match(all("fr"), /Courriel/);
  assert.doesNotMatch(all("ro"), /[ŞşŢţ]/, "no cedilla ş ţ");
  assert.match(all("ro"), /[șț]/);
  for (const l of LANGS) assert.ok(STRINGS[l].privacy(10).includes("10"), l);
});

test("the page: private, strict CSP, no inline script, text only through textContent", () => {
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  assert.match(html, /<meta name="robots" content="noindex/);
  const csp = /Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  assert.match(csp, /script-src 'self';/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
  assert.match(csp, /form-action 'none'/);
  assert.match(html, /<meta name="wn-pop" content="[^"]*">/, "the population's base URL is configurable");
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, "no inline script");
  assert.doesNotMatch(html, /\son[a-z]+=/i, "no inline handler");
  for (const f of ["console.js", "core.js", "i18n.js"]) {
    assert.doesNotMatch(fs.readFileSync(path.join(dir, f), "utf8"), /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/, f);
  }
  assert.match(fs.readFileSync(path.join(__dirname, "..", "robots.txt"), "utf8"), /Disallow: \/console\//);
  // Not linked from the public pages.
  for (const f of ["index.html", "stats/index.html", "assets/home.js", "assets/stats.js"]) {
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, "..", f), "utf8"), /console\//, f);
  }
});

test("sign-in, code and Suggest are busy while they wait, never disabled: the keyboard's focus stays on them", () => {
  const js = fs.readFileSync(path.join(dir, "console.js"), "utf8"), sim = fs.readFileSync(path.join(dir, "simulator.js"), "utf8");
  // A disabled button drops the focus to <body> (site bug wave 5, bug 3); aria-disabled keeps it, a guard ignores a second press.
  assert.doesNotMatch(js, /go\.disabled/, "the sign-in and code buttons");
  assert.equal((js.match(/if \(isWaiting\(go\)\) return;/g) || []).length, 2, "a second press while it waits does nothing");
  assert.match(js, /waiting\(go, true\); go\.textContent = T\.signingIn/);
  assert.match(js, /function waiting\(b, on\) \{ if \(on\) b\.setAttribute\("aria-disabled", "true"\)/);
  // One name, one function: a later top-level declaration of the same name replaces the first in the whole script
  // (the page's own busy(on), further down, once took these calls over and the button never looked busy).
  for (const [f, s] of [["console.js", js], ["simulator.js", sim]]) {
    const names = [...s.matchAll(/^ {2}(?:async )?function (\w+)/gm)].map((m) => m[1]);
    assert.deepEqual(names.filter((n, i) => names.indexOf(n) !== i), [], f + ": a function declared twice");
  }
  assert.doesNotMatch(sim, /suggest\.disabled/, "Suggest");
  assert.match(sim, /u\.suggest\.getAttribute\("aria-disabled"\)\) return;/);
  const css = fs.readFileSync(path.join(dir, "console.css"), "utf8");
  const rule = /\.primary\[aria-disabled="true"\][^{]*\{([^}]*)\}/.exec(css);
  assert.ok(rule && /var\(--muted\)/.test(rule[1]) && !/opacity/.test(rule[1]), "busy looks busy in the tokens, still readable");
});

test("plain rounded cards: no one-sided colour bar, big numbers no tighter than -.02em (the app's cards)", () => {
  for (const f of ["console/console.css", "console/report.css", "assets/console-sim.css"]) {
    const css = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    assert.doesNotMatch(css, /inset: 0 auto 0 0; width: \d+px|border-(left|top|right|bottom): [2-9]px solid|box-shadow: inset [2-9]px 0 0/, f + ": a side-tab accent");
    for (const m of css.matchAll(/letter-spacing: -\.(\d+)em/g)) assert.ok(+("0." + m[1]) <= 0.02, f + ": letter-spacing -." + m[1] + "em");
  }
});

test("a population block that doesn't load reads 'not known', never 0 residents, and the next look tries again", async () => {
  const js = fs.readFileSync(path.join(dir, "console.js"), "utf8");
  // console.js's own population code, run with a network that fails and then comes back.
  const src = js.slice(js.indexOf("  var POP = meta("), js.indexOf("  function virtualCell("));
  let online = false;
  const fetch = async (url) => {
    if (url.endsWith("index.json")) return { ok: true, json: async () => ({ grid: "EPSG:6933", block: 256, total: 9, levels: [{ dir: "1km", cell: 1000, blocks: [[0, 0]] }] }) };
    if (!online) throw new TypeError("Failed to fetch");
    return { ok: true, arrayBuffer: async () => new Uint8Array(65536 * 4).buffer };
  };
  const P = new Function("meta", "fetch", "C", "fail", "DecompressionStream", src + "; return { popInit, popBlock, popAt, popLoad };")(
    () => "https://pop.example/", fetch, C, (s) => Object.assign(new Error("http " + s), { status: s }), function () {});
  assert.ok(await P.popInit());
  assert.equal(await P.popLoad(1000, ["0:0"]), false, "one block didn't load");
  assert.equal(P.popAt(1000, 5, 5), null, "its cells are not known (not 0 residents)");
  assert.equal(P.popAt(1000, 5, 9000), 0, "a block with no one in it is 0");
  online = true;
  assert.equal(await P.popLoad(1000, ["0:0"]), true, "the next look tries again");
  assert.equal(P.popAt(1000, 5, 5), 0, "and reads the block");
  // Every sum over the residents stops at a block that didn't load: the page, the simulator and the report.
  const sim = fs.readFileSync(path.join(dir, "simulator.js"), "utf8"), rep = fs.readFileSync(path.join(dir, "report.js"), "utf8");
  assert.match(js, /d\.popLost = !ok && d\.scope\.kind !== "world";/);
  assert.match(js, /d\.totals\.population = d\.popLost \? null : sum;/);
  assert.match(js, /if \(x\.lost\) \{[^}]*T\.noPop/, "the residents' tile says 'not loaded'");
  assert.equal((sim.match(/if \(!\(await P\.popLoad\(1000, keys\)\)\) return lost;/g) || []).length, 2, "the simulator: a city and a view");
  assert.match(sim, /&& !area\.lost\) return Promise\.resolve\(area\);/, "a lost area isn't kept");
  assert.match(rep, /if \(!\(await A\.pop\.load\(1000, blocks\)\)\) return x;/);
  assert.match(rep, /if \(j\.popLost\) \{ x\.pop = false; return x; \}/);
  // World copies: the console's own click and population layer read the longitude back into [-180, 180].
  assert.match(js, /var ll = e\.lngLat\.wrap\(\), c = C\.cellOf\(ll\.lat, ll\.lng\);/);
  assert.match(js, /var w = Math\.max\(-180, b\.getWest\(\) \+ sh\), e = Math\.min\(179\.999, b\.getEast\(\) \+ sh\);/);
});
