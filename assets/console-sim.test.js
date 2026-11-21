// The private console's fountain simulator and coverage panels: the pure maths of site/console/sim-core.js.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../console/core.js");
const S = require("../console/sim-core.js");
const fs = require("node:fs");
const path = require("node:path");

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);
// A synthetic area: samples on a [step] m lattice over [-half, half]², weight [w(x, y)] each, as sample() returns them.
function lattice(half, step, w) {
  const xs = [], ys = [], ws = [];
  for (let y = -half; y <= half; y += step) for (let x = -half; x <= half; x += step) { xs.push(x); ys.push(y); ws.push(w ? w(x, y) : 1); }
  const x = Float64Array.from(xs), y = Float64Array.from(ys), N = xs.length;
  return { x, y, w: Float64Array.from(ws), n: 1, N, cells: xs.map(() => ({})), g: S.grid(x, y, N, 250) };
}
const brute = (L, fn) => { let s = 0; for (let i = 0; i < L.N; i++) if (fn(L.x[i], L.y[i])) s += L.w[i]; return s; };
const d = (x, y, p) => Math.hypot(x - p.x, y - p.y);

test("rings: 5 and 10 minutes walked are 308 and 615 m as the crow flies (detour 1.3)", () => {
  assert.deepEqual(S.WALK, [400, 800]);
  near(S.R[0], 307.7, 0.1, "5 min"); near(S.R[1], 615.4, 0.1, "10 min");
});

test("ring overlap: a cell's residents are taken in proportion to the ring's area inside it", () => {
  // One EASE cell in Montréal (0.8 x 1.25 km there, 1 km² everywhere): a 308 m ring at its centre holds π r² / 1 km².
  const c = C.cellOf(45.5, -73.6), ctr = C.cellCentre(c.ix, c.iy), P = S.proj(ctr[1], ctr[0]);
  const pop = 10000, want = pop * Math.PI * S.R[0] ** 2 / 1e6;
  for (const [n, tol] of [[40, 0.03], [10, 0.1]]) {
    const A = S.sample([{ ix: c.ix, iy: c.iy, pop }], P, n);
    near(A.w.reduce((s, v) => s + v, 0), pop, 1e-6, "every resident kept");
    near(S.within(A, [{ x: 0, y: 0 }], S.R[0]), want, want * tol, "n=" + n);
  }
  // A ring on the corner of four cells takes a quarter of each.
  const pops = [1000, 2000, 3000, 4000], cells = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dy], i) => ({ ix: c.ix + dx, iy: c.iy + dy, pop: pops[i] }));
  const corner = C.easeInverse((c.ix + 1) * 1000, (c.iy + 1) * 1000), P2 = S.proj(corner[1], corner[0]);
  const A = S.sample(cells, P2, 40), q = Math.PI * S.R[0] ** 2 / 4 / 1e6;
  near(S.within(A, [{ x: 0, y: 0 }], S.R[0]), 10000 * q, 10000 * q * 0.04, "corner");
  // The cell's true size in local metres: about 1 km² (equal-area), 0.81 km wide at 45.5°.
  const ring = C.cellRing(c.ix, c.iy), w = P.x(ring[1][0]) - P.x(ring[0][0]), h = P.y(ring[2][1]) - P.y(ring[0][1]);
  near(w * h, 1e6, 1e6 * 0.006, "area"); near(w, 810, 5, "width");
});

test("newly served: residents whose nearest working point is past the ring and the new one brings inside", () => {
  const L = lattice(2000, 100), today = [{ x: 0, y: 0 }], r = S.R[0];
  const dist = S.distances(L, today);
  assert.equal(dist[L.x.findIndex((x, i) => x === 0 && L.y[i] === 0)], 0);
  assert.equal(dist[0], Infinity, "past the cap: nothing within reach");
  // Far from the existing point: every lattice sample within 308 m, (i, j) with i² + j² <= 9.48: 29 of them.
  assert.equal(S.newly(L, dist, [{ x: 1000, y: 1000 }], r).pop, 29);
  // Overlapping the existing ring: only the part outside it is new.
  const cand = { x: 200, y: 0 }, got = S.newly(L, dist, [cand], r);
  assert.equal(got.pop, brute(L, (x, y) => d(x, y, cand) <= r && d(x, y, today[0]) > r));
  assert.equal(got.idx.length, got.pop);
  assert.ok(got.pop > 0 && got.pop < 29);
  // On top of the existing point: nobody new.
  assert.equal(S.newly(L, dist, [{ x: 0, y: 0 }], r).pop, 0);
  // Residents within 5 and 10 minutes, whoever serves them.
  assert.equal(S.within(L, [{ x: 1000, y: 1000 }], S.R[1]), brute(L, (x, y) => d(x, y, { x: 1000, y: 1000 }) <= S.R[1]));
});

test("combining scenarios: two fountains at once never count a resident twice", () => {
  const L = lattice(2000, 100), dist = S.distances(L, [{ x: 0, y: 0 }]), r = S.R[0];
  const A = { x: 1000, y: 1000 }, B = { x: 1300, y: 1000 };
  const a = S.newly(L, dist, [A], r).pop, b = S.newly(L, dist, [B], r).pop, ab = S.newly(L, dist, [A, B], r).pop;
  assert.equal(ab, brute(L, (x, y) => (d(x, y, A) <= r || d(x, y, B) <= r) && d(x, y, { x: 0, y: 0 }) > r));
  assert.ok(ab < a + b, "the overlap counts once");
  assert.equal(S.within(L, [A, B], r), brute(L, (x, y) => d(x, y, A) <= r || d(x, y, B) <= r));
  assert.equal(S.newly(L, dist, [A, A], r).pop, a, "the same spot twice adds nothing");
});

test("suggest: the greedy picks go to the biggest unserved crowd first, then elsewhere; demand can weigh in", () => {
  const big = { x: -1200, y: 0 }, small = { x: 1200, y: 0 };
  const w = (x, y) => (d(x, y, big) <= 300 ? 5 : d(x, y, small) <= 300 ? 2 : 0.01);
  const L = lattice(2000, 100, w), dist = new Float64Array(L.N).fill(Infinity);
  const picks = S.suggest(L, dist, S.R[0], { k: 5 });
  assert.equal(picks.length, 5);
  assert.ok(d(picks[0].x, picks[0].y, big) <= 200, "first: the big crowd");
  assert.ok(d(picks[1].x, picks[1].y, small) <= 200, "second: the other crowd");
  for (let i = 1; i < picks.length; i++) assert.ok(picks[i].gain <= picks[i - 1].gain + 1e-9, "gains never grow");
  const total = L.w.reduce((s, v) => s + v, 0);
  assert.ok(picks.reduce((s, p) => s + p.pop, 0) <= total + 1e-9, "no resident served twice");
  near(picks[0].pop, S.newly(L, dist, [picks[0]], S.R[0]).pop, 1e-9, "a pick's residents are its newly served");
  // Already served residents don't attract a pick.
  const served = S.distances(L, [big]);
  assert.ok(d(S.suggest(L, served, S.R[0], { k: 1 })[0].x, 0, small) <= 200);
  // Searches with no result around the small crowd, weighted: it goes first.
  const dem = Float64Array.from(L.x, (x, i) => (d(x, L.y[i], small) <= 300 ? 3 : 0));
  const byDemand = S.suggest(L, dist, S.R[0], { k: 1, wPop: 1, wDemand: 20, demand: dem });
  assert.ok(d(byDemand[0].x, byDemand[0].y, small) <= 200);
  assert.deepEqual(S.suggest(L, new Float64Array(L.N), S.R[0], { k: 3 }), [], "everyone served: nothing to suggest");
});

test("calibration: the interquartile range of refills per resident, by density band, else all points, else nothing", () => {
  const obs = [0.001, 0.002, 0.003, 0.004, 0.005].map((v) => ({ res: 1000, perDay: v * 1000 }));
  const cal = S.calibrate(obs.concat([{ res: 50, perDay: 99 }, { res: 3000, perDay: 30 }]));
  assert.equal(cal.bands[0].length, 5, "under 100 residents: left out");
  assert.equal(cal.all.length, 6);
  const e = S.estimate(cal, 1500);
  assert.equal(e.src, "band"); assert.equal(e.band, 0);
  near(e.lo, 3, 1e-9, "q1"); near(e.mid, 4.5, 1e-9, "median"); near(e.hi, 6, 1e-9, "q3");
  const f = S.estimate(cal, 8000); // the dense band has no point: every point's rates
  assert.equal(f.src, "all"); assert.equal(f.n, 6);
  near(f.lo, 8000 * S.quantile(cal.all, 0.25), 1e-9, "all q1");
  assert.equal(S.estimate(S.calibrate(obs.slice(0, 4)), 1500), null, "4 points: too little");
  assert.equal(S.quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(S.band(1999), 0); assert.equal(S.band(2000), 1); assert.equal(S.band(6000), 2);
});

test("impact and cost: the factors doc's worked example (Montréal, 1,000 refills of 0.5 L)", () => {
  const f = S.FACTORS.CA, per = { lo: 1000 / 365, hi: 1000 / 365 }, i = S.impact(per, f, 0.5);
  near(i.bottles.lo, 1000, 1e-9, "bottles"); near(i.pet.lo, 9.25, 1e-9, "PET kg"); near(i.co2.lo, 91, 1e-9, "CO2e kg");
  near(i.money.lo, 720, 1e-9, "floor"); near(i.money.hi, 2210, 1e-9, "on the go");
  assert.equal(S.impact(per, S.FACTORS.WORLD, 0.5).money, null, "no price without a country");
  near(S.impact(per, f, 1).bottles.lo, 2000, 1e-9, "1 L refills are 2 bottle-equivalents");
  const c = S.cost(5000, 500, 10, 1000, { lo: 1000, hi: 2000 });
  assert.equal(c.total, 10000); assert.equal(c.perResident, 10);
  near(c.perBottle.lo, 0.5, 1e-9, "per bottle, many refills"); near(c.perBottle.hi, 1, 1e-9, "per bottle, few refills");
  assert.equal(S.cost(0, 0, 10, 100, null), null);
  assert.equal(S.cost(1000, 0, 10, 0, null).perResident, null);
  assert.equal(S.countryOf(45.5, -73.6), "CA"); assert.equal(S.countryOf(46.81, -71.21), "CA");
  assert.equal(S.countryOf(48.86, 2.35), "FR"); assert.equal(S.countryOf(40.71, -74.0), "US"); assert.equal(S.countryOf(35.68, 139.7), "WORLD");
  // Bug wave 3: the report's outlines, not a box (Geneva, Brussels, Barcelona, Milan were France; London and Kingston
  // (Ontario) the United States; Presque Isle (Maine) and Watertown (NY) Canada).
  for (const [la, lo] of [[46.2, 6.14], [50.85, 4.35], [41.39, 2.17], [45.46, 9.19]]) assert.equal(S.countryOf(la, lo), "WORLD", la + "," + lo);
  assert.equal(S.countryOf(42.98, -81.25), "CA", "London ON"); assert.equal(S.countryOf(44.23, -76.49), "CA", "Kingston ON");
  assert.equal(S.countryOf(46.68, -68.02), "US", "Presque Isle ME"); assert.equal(S.countryOf(43.97, -75.91), "US", "Watertown NY");
});

test("coverage: working points only; winter closes the seasonal ones; accessible and free toilets", () => {
  const L = lattice(1000, 100), P = S.proj(45, -73);
  const at = (x, y, o) => Object.assign({ x, y, water: true, toilet: false, broken: false, closedNow: false, seasonal: false, wheelchair: false, paid: false }, o);
  const pts = [at(-500, 0, { seasonal: true }), at(500, 0, { wheelchair: true }), at(0, 500, { broken: true }), at(0, -500, { water: false, toilet: true, paid: true })];
  const cov = (v, r) => S.share(L, S.distances(L, pts.filter(S.VARIANTS[v])), r);
  const disk = (cs, r) => brute(L, (x, y) => cs.some((c) => d(x, y, c) <= r)) / L.N;
  near(cov("water", S.R[0]), disk([pts[0], pts[1]], S.R[0]), 1e-12, "now: the broken one doesn't count");
  near(cov("summer", S.R[0]), cov("water", S.R[0]), 1e-12, "summer = now here (nothing closed for the season yet)");
  near(cov("winter", S.R[0]), disk([pts[1]], S.R[0]), 1e-12, "winter: the seasonal fountain is closed");
  near(cov("waterAccess", S.R[1]), disk([pts[1]], S.R[1]), 1e-12, "accessible");
  near(cov("toilets", S.R[0]), disk([pts[3]], S.R[0]), 1e-12, "toilets");
  assert.equal(cov("toiletsFree", S.R[0]), 0, "the only toilets are paid");
  // A point closed for the season now still counts in summer.
  const closed = [at(0, 0, { closedNow: true, seasonal: true })];
  assert.equal(S.share(L, S.distances(L, closed.filter(S.VARIANTS.water)), S.R[0]), 0);
  assert.ok(S.share(L, S.distances(L, closed.filter(S.VARIANTS.summer)), S.R[0]) > 0);
  assert.equal(S.share({ N: 0, w: [] }, [], 300), null);
  void P;
});

test("equity: the Lorenz curve over cells, the Gini index and the worst-served fifth", () => {
  // Five cells of 100 samples: one fully served, four with nobody within reach.
  const cells = Array.from({ length: 5 }, () => ({})), N = 500, n = 10;
  const A = { x: new Float64Array(N), y: new Float64Array(N), w: new Float64Array(N).fill(1), n, N, cells };
  const dist = Float64Array.from({ length: N }, (_, i) => (i < 100 ? 50 : Infinity));
  const e = S.equity(A, dist, S.R[0]);
  assert.deepEqual(e.lorenz.map((p) => p.map((v) => +v.toFixed(3))), [[0, 0], [0.2, 0], [0.4, 0], [0.6, 0], [0.8, 0], [1, 1]]);
  near(e.gini, 0.8, 1e-9, "all access in one cell of five");
  assert.equal(e.worst.cells, 1); near(e.worst.popShare, 0.2, 1e-9, "a fifth of the cells, a fifth of the people");
  near(e.worst.walk, S.CAP * S.DETOUR, 1e-9, "capped walk");
  const even = S.equity(A, new Float64Array(N).fill(50), S.R[0]);
  near(even.gini, 0, 1e-9, "everyone served alike");
  assert.equal(S.equity(A, new Float64Array(N).fill(Infinity), S.R[0]), null, "nobody served: no curve");
});

test("reliability: uptime, recurring failures, points broken now and for how long", () => {
  const r = S.reliability([
    { id: 1, from: "2026-10-01", to: "2026-10-06" }, { id: 1, from: "2026-10-10", to: "2026-10-11" }, { id: 1, from: "2026-10-20", to: "2026-10-21" },
    { id: 2, from: "2026-09-25", to: "2026-10-03" }, // started before the period: 2 days inside
    { id: 3, from: "2026-10-25", to: null } // still broken: to today
  ], 10, "2026-10-01", "2026-10-31", "2026-10-31");
  assert.equal(r.downDays, 5 + 1 + 1 + 2 + 6);
  near(r.uptime, 1 - 15 / 300, 1e-12, "uptime");
  assert.deepEqual(r.recurring, [{ id: 1, n: 3 }]);
  assert.deepEqual(r.open, [{ id: 3, since: "2026-10-25", days: 6 }]);
  assert.equal(S.reliability([], 0, "2026-10-01", "2026-10-31", "2026-10-31").uptime, null);
  assert.equal(S.days("2026-10-01", "2026-11-01"), 31); assert.equal(S.addDays("2026-12-31", 1), "2027-01-01");
});

test("freshness: checked in 30 and 90 days, the stale ones never-checked first", () => {
  const f = S.freshness([{ id: 1, checkedOn: "2026-11-01" }, { id: 2, checkedOn: "2026-09-01" }, { id: 3, checkedOn: "2026-06-01" },
                         { id: 4, checkedOn: null }, { id: 5, checkedOn: "2026-05-01" }], "2026-11-12");
  assert.equal(f.n, 5); assert.equal(f.in30, 1); assert.equal(f.in90, 2); assert.equal(f.never, 1);
  assert.deepEqual(f.stale.map((p) => p.id), [4, 5, 3]);
});

test("Overpass: the app's query and tags, its classes, and what isn't an answer", () => {
  const q = S.osmQuery(45.5, -73.6, 45.6, -73.5);
  assert.match(q, /\[bbox:45\.500000,-73\.600000,45\.600000,-73\.500000\]/);
  for (const t of ['nw[amenity~"^(drinking_water|water_point|toilets)$"]', "nw[drinking_water=yes]", "nw[man_made=water_tap]", 'nw["drinking_water:refill"=yes]', "out center qt"]) {
    assert.ok(q.includes(t), t);
  }
  const el = (id, tags, extra) => Object.assign({ type: "node", id, lat: 45.5, lon: -73.6, tags }, extra);
  const pts = S.parseOsm({ elements: [
    el(1, { amenity: "drinking_water" }), el(2, { amenity: "toilets" }), el(3, { amenity: "toilets", drinking_water: "yes", wheelchair: "yes" }),
    el(4, { amenity: "drinking_water", dog: "yes" }), el(5, { leisure: "pitch", drinking_water: "yes" }), el(6, { man_made: "water_tap", drinking_water: "no" }),
    el(7, { amenity: "drinking_water", seasonal: "summer" }), el(8, { amenity: "drinking_water", seasonal: "winter" }),
    el(9, { amenity: "toilets", fee: "yes" }), { type: "way", id: 10, center: { lat: 45.51, lon: -73.61 }, tags: { amenity: "drinking_water" } },
    { type: "relation", id: 11, tags: { amenity: "toilets" } }, el(12, {}, { lat: 95 }), el(13, { amenity: "drinking_water", bottle: "yes" })
  ] });
  const by = Object.fromEntries(pts.map((p) => [p.id, p]));
  assert.deepEqual(Object.keys(by), ["n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8", "n9", "w10", "n13"], "relations and bad positions out");
  assert.deepEqual([by.n1.type, by.n2.type, by.n3.type, by.n4.type, by.n5.type, by.n13.type], ["FOUNTAIN", "RESTROOM", "COMBO", "DOG_WATER", "WATER_REFILL", "WATER_REFILL"]);
  assert.equal(by.n2.water, false); assert.equal(by.n2.toilet, true);
  assert.equal(by.n3.water && by.n3.toilet && by.n3.wheelchair, true);
  assert.equal(by.n6.water, false, "tagged not drinkable");
  assert.equal(by.n7.seasonal, true); assert.equal(by.n8.seasonal, false, "open in winter");
  assert.equal(by.n9.paid, true); assert.equal(by.n1.paid, false);
  assert.equal(by.w10.lat, 45.51);
  assert.equal(S.parseOsm({ remark: "x" }), null, "no elements: not an answer");
  assert.equal(S.parseOsm({ elements: [1] }), null, "an element that isn't an object");
  assert.equal(S.parseOsm("<html>"), null);
  assert.deepEqual(S.parseOsm({ elements: [] }), [], "a real 'nothing here'");
  assert.equal(S.osmIncomplete('{"elements":[],"remark":"runtime error: Query timed out"}'), true);
  assert.equal(S.osmIncomplete('{"elements":[]}'), false);
  assert.equal(S.closedInWinter("spring;summer;autumn"), true); assert.equal(S.closedInWinter("no"), false); assert.equal(S.closedInWinter(""), false);
  assert.deepEqual(S.MIRRORS.map((u) => new URL(u).host), ["overpass.openstreetmap.fr", "overpass.kumi.systems", "overpass.private.coffee"]);
});

test("Overpass: two mirrors raced, then the next; incomplete or broken answers fall through; all down is null", async () => {
  const good = JSON.stringify({ elements: [{ type: "node", id: 1, lat: 45.5, lon: -73.6, tags: { amenity: "drinking_water" } }] });
  const res = (body, ok = true) => ({ ok, text: async () => body });
  const calls = [];
  const fetchFrom = (plan) => (url, opts) => {
    calls.push(url);
    assert.equal(opts.method, "POST"); assert.equal(opts.credentials, "omit");
    assert.match(opts.body, /^data=%5Bout%3Ajson%5D/);
    const p = plan[url];
    return typeof p === "function" ? p(opts) : p;
  };
  const m = ["https://a/i", "https://b/i", "https://c/i"];
  // a: HTTP 504, b: an incomplete answer, c: good.
  let got = await S.osmFetch([45, -74, 46, -73], { mirrors: m, fetch: fetchFrom({ [m[0]]: Promise.resolve(res("", false)),
    [m[1]]: Promise.resolve(res('{"elements":[],"remark":"runtime error: timeout"}')), [m[2]]: Promise.resolve(res(good)) }) });
  assert.equal(got.length, 1); assert.deepEqual(calls, m);
  // The race: a hangs until aborted, b answers: b wins and a is aborted.
  calls.length = 0;
  let aborted = false;
  got = await S.osmFetch([45, -74, 46, -73], { mirrors: m, timeout: 5000, fetch: fetchFrom({
    [m[0]]: (o) => new Promise((_, no) => o.signal.addEventListener("abort", () => { aborted = true; no(new Error("abort")); })),
    [m[1]]: Promise.resolve(res(good)), [m[2]]: Promise.resolve(res("[]")) }) });
  assert.equal(got.length, 1); assert.ok(aborted, "the slower mirror is cancelled"); assert.deepEqual(calls, m.slice(0, 2));
  // A mirror that never answers times out; a captive portal page isn't "nothing here"; every mirror down: null.
  got = await S.osmFetch([45, -74, 46, -73], { mirrors: m, timeout: 30, fetch: fetchFrom({
    [m[0]]: (o) => new Promise((_, no) => o.signal.addEventListener("abort", () => no(new Error("abort")))),
    [m[1]]: Promise.resolve(res("<html>login</html>")), [m[2]]: () => Promise.reject(new Error("offline")) }) });
  assert.equal(got, null);
});

test("points: the console's own as points, the unlisted rest at their cell's centre, OpenStreetMap duplicates merged", () => {
  const sp = S.fromServer({ id: 7, lat: 45.5, lon: -73.6, type: "COMBO", seasonal: "spring;summer;autumn", status: "closed_season", flagged: false, refills: 12 });
  assert.equal(sp.water && sp.toilet && sp.seasonal && sp.closedNow, true); assert.equal(sp.broken, false);
  assert.equal(S.fromServer({ id: 8, lat: 0, lon: 0, type: "FOUNTAIN", seasonal: "", status: "working", flagged: true }).broken, true);
  assert.equal(S.fromServer({ id: 9, lat: 0, lon: 0, type: "DOG_WATER", seasonal: "", status: "working", flagged: false }).water, false,
               "a dog bowl isn't drinking water for residents (the report's working water point)");
  const c = C.cellOf(45.5, -73.6);
  const extra = S.unlisted([{ ix: c.ix, iy: c.iy, water: 3, toilets: 1, broken: 1 }], [{ ix: c.ix, iy: c.iy, type: "FOUNTAIN", status: "working", flagged: false }]);
  assert.equal(extra.filter((p) => p.water).length, 1, "3 water - 1 broken - 1 listed");
  assert.equal(extra.filter((p) => p.toilet).length, 1);
  const osm = [{ id: "n1", lat: 45.50005, lon: -73.6, water: true, toilet: false }, { id: "n2", lat: 45.50005, lon: -73.6, water: false, toilet: false },
               { id: "n3", lat: 45.51, lon: -73.6, water: true, toilet: false }];
  const all = S.merge([S.fromServer({ id: 1, lat: 45.5, lon: -73.6, type: "FOUNTAIN", seasonal: "", status: null, flagged: false })], osm);
  assert.deepEqual(all.map((p) => p.id), ["s1", "n2", "n3"], "6 m away and also water: the same point");
});

test("stats_health's answer is cleaned: spells, months, floors kept as null", () => {
  const h = S.cleanHealth({ k: { people: 10 }, period: { from: "2026-10-13", to: "2026-11-12" }, today: "2026-11-12", points: 4,
    access: [5, "x", 0], paid: [6], undrinkable: "no",
    spells: [[5, "2026-10-01", null], [6, "2026-10-02", "2026-10-04"], [0, "2026-10-01", null], ["x", "2026-10-01", null], [7, "bad", null]],
    months: [{ t: "2026-10-01", added: 3, imported: 120, checks: null, photos: 14, user: "nope" }], extra: 1 });
  assert.deepEqual(h.spells, [{ id: 5, from: "2026-10-01", to: null }, { id: 6, from: "2026-10-02", to: "2026-10-04" }]);
  assert.deepEqual(h.months, [{ t: "2026-10-01", added: 3, imported: 120, checks: null, photos: 14 }]);
  assert.equal(h.k, 10); assert.equal(h.points, 4);
  assert.deepEqual([h.access, h.paid, h.undrinkable], [[5], [6], []]);
  assert.equal(S.cleanHealth({ period: {} }), null);
});

test("the simulator's words: 7 languages, the same keys; French says tu; Romanian ș ț and « de » from 20", () => {
  const { STRINGS } = require("../console/sim-i18n.js");
  const { LANGS } = require("./spot-params.js");
  assert.deepEqual(Object.keys(STRINGS).sort(), LANGS.slice().sort());
  const keys = (o, p = "") => Object.keys(o).flatMap((k) => (o[k] && typeof o[k] === "object" && !Array.isArray(o[k]) ? keys(o[k], p + k + ".") : [p + k])).sort();
  for (const l of LANGS) assert.deepEqual(keys(STRINGS[l]), keys(STRINGS.en), l);
  for (const l of LANGS) assert.equal(STRINGS[l].simMethodLines.length, STRINGS.en.simMethodLines.length, l + ": every method line");
  const all = (l) => Object.values(STRINGS[l]).map((v) => (typeof v === "function" ? v("X", 25, 25) : Array.isArray(v) ? v.join(" ") : typeof v === "object" ? Object.values(v).join(" ") : v)).join(" ");
  assert.doesNotMatch(all("fr"), /\b(vous|votre|vos|e-mail)\b/i);
  assert.doesNotMatch(all("ro"), /[ŞşŢţ]/, "no cedilla ş ţ");
  assert.match(all("ro"), /[șț]/);
  assert.equal(STRINGS.ro.simBottles("25", 25), "echivalentul a 25 de sticle de 500 ml");
  assert.equal(STRINGS.ro.simBottles("19", 19), "echivalentul a 19 sticle de 500 ml");
  assert.equal(STRINGS.fr.simBottles("1 200"), "l'équivalent de 1 200 bouteilles de 500 ml", "the factors doc's wording");
  assert.match(STRINGS.fr.simPet("9"), /^jusqu'à /);
  // Every saving hedged in every language (bug wave 3: the money line and its row claimed what people "would have paid").
  const hedge = { en: /up to|equivalent/i, fr: /jusqu'à|l'équivalent/i, es: /hasta|equivalente/i, de: /bis zu|so viel wie/i,
                  pt: /até|equivalente/i, ja: /最大|相当/, ro: /până la|echivalentul/i };
  for (const l of LANGS) {
    const S2 = STRINGS[l];
    for (const t of [S2.simBottles("X", 25), S2.simPet("X"), S2.simCo2("X"), S2.simMoney("X", "Y"), S2.simPetRow, S2.simCo2Row, S2.simMoneyRow]) {
      assert.match(t, hedge[l], l + ": " + t);
    }
  }
  for (const l of LANGS) assert.ok(STRINGS[l].mMethodGrowth(10).includes("10"), l);
});

test("the page: Overpass's mirrors in connect-src only, the scripts in order, no HTML written by the new files", () => {
  const dir = path.join(__dirname, "..", "console"), html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  const csp = /Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  const dirs = Object.fromEntries(csp.split(";").map((d) => d.trim().split(/\s+/)).map((a) => [a[0], a.slice(1)]));
  for (const u of S.MIRRORS) assert.ok(dirs["connect-src"].includes(new URL(u).origin), u);
  for (const [k, v] of Object.entries(dirs)) if (k !== "connect-src") assert.ok(!v.some((x) => /overpass/.test(x)), k + " stays without Overpass");
  assert.deepEqual(dirs["script-src"], ["'self'"]);
  assert.match(html, /<meta name="wn-osm" content="">/, "production uses the mirrors");
  const order = ["core.js", "i18n.js", "sim-core.js", "sim-i18n.js", "console.js", "simulator.js", "coverage.js"].map((f) => html.indexOf('<script src="' + f + '"'));
  assert.ok(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1])), "helpers before the page, the page before its panels");
  for (const id of ["simBtn", "simPanel", "simCompare", "metrics", "simReport"]) assert.match(html, new RegExp('id="' + id + '"'), id);
  for (const f of ["sim-core.js", "sim-i18n.js", "simulator.js", "coverage.js"]) {
    assert.doesNotMatch(fs.readFileSync(path.join(dir, f), "utf8"), /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/, f);
  }
  // Bug wave 3, in the browser code: only the latest area build paints; no population says so (not "0 residents");
  // a view or a click on a world copy reads back into [-180, 180].
  const sim = fs.readFileSync(path.join(dir, "simulator.js"), "utf8"), cov = fs.readFileSync(path.join(dir, "coverage.js"), "utf8");
  assert.match(sim, /if \(latest && P\.data\(\) === d\)/, "a slower, older build never becomes the area");
  assert.match(sim, /if \(A !== area\) return;/, "nor paints the simulator");
  assert.match(sim, /kind: "nopop"/); assert.match(cov, /"nopop" \? TC\.noPop/);
  assert.match(cov, /hid && hid === n \? "—" : \(hid \? "≥ " : ""\)/, "a growth total over hidden months isn't a zero");
  assert.match(sim, /e\.lngLat\.wrap\(\)/); assert.match(sim, /% 360 \+ 360\) % 360 - 180 - mid/);
});
