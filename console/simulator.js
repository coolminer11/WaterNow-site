/*
 * WaterNow Statistics, private console: « Où mettre la prochaine fontaine ? » (admins and cities, never partners).
 * Drop or drag a candidate on the map, or ask for the best spots: residents within about 5 and 10 minutes on foot,
 * those it newly serves, searches with no result around it, refills a day (a range calibrated on the scope's own
 * points), bottles, PET, CO2e and money a year, the cost per resident. All computed here, in the browser (sim-core.js),
 * from the population blocks, the console's points and OpenStreetMap's (Overpass, the app's mirrors).
 * It also builds the area the coverage panels share (window.WNC_AREA). Text through textContent only.
 */
(function () {
  "use strict";
  var P = window.WNC_PAGE, C = window.WNC, S = window.WNS;
  if (!P || !S || !window.WNSI) return;
  var T = window.WNSI.STRINGS[P.lang] || window.WNSI.STRINGS.en, TC = window.WNI.STRINGS[P.lang] || window.WNI.STRINGS.en;
  var $ = function (id) { return document.getElementById(id); };
  var nf = new Intl.NumberFormat(P.lang), nf1 = new Intl.NumberFormat(P.lang, { maximumFractionDigits: 1 });
  var nfc = new Intl.NumberFormat(P.lang, { notation: "compact", maximumFractionDigits: 1 });
  var big = function (v) { return Math.abs(v) >= 1e6 ? nfc.format(v) : nf.format(Math.round(v)); };
  var money = function (cur, v) {
    // "1 200 $", not "1 200 $CA": the factor set is named beside it.
    return new Intl.NumberFormat(P.lang, { style: "currency", currency: cur, currencyDisplay: "narrowSymbol", maximumFractionDigits: v >= 100 ? 0 : 2 }).format(v);
  };
  function meta(n) { var m = document.querySelector('meta[name="' + n + '"]'); return m ? m.getAttribute("content") || "" : ""; }
  var OSM = meta("wn-osm"); // the preview's recorded answers (same origin); empty: the mirrors
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function btn(parent, txt, cls) { var b = el("button", cls == null ? "ghost" : cls, txt); b.type = "button"; parent.appendChild(b); return b; }
  var bk = function (i) { return Math.floor(i / 256); };
  var reduced = P.reduced;

  // ---- The area: residents (samples of the population blocks) and every point (the console's + OpenStreetMap's) ----
  var BOX_MAX = 0.6; // degrees a side: Overpass and the browser stay quick
  var osmCache = []; // [{b, p}]: a box inside one already asked reuses its answer
  function osmGet(b) {
    var hit = osmCache.filter(function (c) { return c.b[0] <= b[0] && c.b[1] <= b[1] && c.b[2] >= b[2] && c.b[3] >= b[3]; })[0];
    if (hit) return hit.p;
    var entry = { b: b, p: null };
    entry.p = S.osmFetch(b, { fetch: window.fetch.bind(window), mirrors: OSM ? [OSM] : null, timeout: 20000 }).then(function (pts) {
      if (!pts) osmCache = osmCache.filter(function (c) { return c !== entry; }); // a failure is asked again next time
      return pts;
    });
    osmCache.push(entry);
    if (osmCache.length > 12) osmCache.shift();
    return entry.p;
  }
  // stats_health (section 83): broken spells, accessible / paid / undrinkable points, monthly growth. Null without it.
  var healthCache = new Map();
  function health() {
    var d = P.data(), key = P.scope() + "|" + d.period.key;
    if (!healthCache.has(key)) {
      healthCache.set(key, P.rpc("stats_health", { p_scope: P.scope(), p_period: d.period.key }).then(S.cleanHealth, function (e) {
        if (e.status === 401) P.lost(); else if (e.code === "WNMFA") P.mfa();
        else if (e.status !== 404) healthCache.delete(key); // missing function (not applied): stays null
        return null;
      }));
    }
    return healthCache.get(key);
  }
  /** What the area is: a city's territory, the map's view (zoom 11 and closer), or why there's none. */
  function spec() {
    var d = P.data(), gl = P.map();
    if (!d || !gl) return { kind: "none" };
    if (d.scope.kind === "partner") return { kind: "partner" };
    if (d.territory && d.territory.length) return { kind: "city", key: "city:" + d.scope.key };
    if (gl.getZoom() < 11) return { kind: "zoom" };
    var b = gl.getBounds(), q = 0.02, r2 = function (v) { return Math.round(v * 100) / 100; };
    // A view on a world copy (panned past ±180°) reads its longitudes back into [-180, 180]: the population grid and
    // Overpass know no other.
    var mid = (b.getWest() + b.getEast()) / 2, sh = ((mid + 180) % 360 + 360) % 360 - 180 - mid;
    var box = [r2(Math.floor((b.getSouth() - 0.01) / q) * q), r2(Math.max(-180, Math.floor((b.getWest() + sh - 0.015) / q) * q)),
               r2(Math.ceil((b.getNorth() + 0.01) / q) * q), r2(Math.min(180, Math.ceil((b.getEast() + sh + 0.015) / q) * q))];
    if (box[2] - box[0] > BOX_MAX || box[3] - box[1] > BOX_MAX) return { kind: "big" };
    return { kind: "view", key: "view:" + box.join(","), box: box };
  }
  var area = null, building = null, areaFns = [];
  function areaGet() {
    var sp = spec(), d = P.data();
    if (!sp.key) { building = null; return Promise.resolve({ spec: sp }); }
    var key = sp.key + "|" + P.scope() + "|" + d.period.key;
    if (area && area.key === key && area.data === d && !area.lost) return Promise.resolve(area);
    if (building && building.key === key && building.data === d) return building.p;
    var p = build(sp, d, key).then(function (a) {
      // Only the latest build becomes the area: a slower one for a view since left never paints over it.
      var latest = !!building && building.p === p;
      if (latest) building = null;
      if (latest && P.data() === d) { area = a; areaFns.forEach(function (fn) { fn(a); }); }
      return a;
    }, function () { if (building && building.p === p) building = null; return { spec: { kind: "failed" } }; });
    building = { key: key, data: d, p: p };
    return p;
  }
  async function build(sp, d, key) {
    // No population blocks (none published yet, or the index didn't load): say so rather than "0 residents".
    if (!(await P.popInit())) return { key: key, data: d, spec: { kind: "nopop" } };
    // A block that didn't load: the same "not loaded", never its cells as 0 residents; the next look tries again.
    var lost = { key: key, data: d, spec: { kind: "nopop" }, lost: true };
    var cells = [], box, keys = new Set(), inTerr = null;
    if (sp.kind === "city") {
      inTerr = new Set();
      d.territory.forEach(function (r) { for (var bx = bk(r[1]); bx <= bk(r[2]); bx++) keys.add(bx + ":" + bk(r[0])); });
      if (!(await P.popLoad(1000, keys))) return lost;
      var ext = [90, 180, -90, -180];
      d.territory.forEach(function (r) {
        for (var ix = r[1]; ix <= r[2]; ix++) {
          inTerr.add(ix + ":" + r[0]);
          var pop = P.popAt(1000, ix, r[0]);
          if (pop > 0) cells.push({ ix: ix, iy: r[0], pop: pop });
        }
        [r[1], r[2]].forEach(function (ix) {
          var c = C.cellCentre(ix, r[0]);
          ext = [Math.min(ext[0], c[1]), Math.min(ext[1], c[0]), Math.max(ext[2], c[1]), Math.max(ext[3], c[0])];
        });
      });
      box = [ext[0] - 0.01, ext[1] - 0.012, ext[2] + 0.01, ext[3] + 0.012];
    } else {
      box = sp.box;
      var a = C.easeForward(box[0], box[1]), b = C.easeForward(box[2], box[3]);
      var ix0 = Math.floor(a[0] / 1000), ix1 = Math.floor(b[0] / 1000), iy0 = Math.floor(a[1] / 1000), iy1 = Math.floor(b[1] / 1000);
      for (var by = bk(iy0); by <= bk(iy1); by++) for (var bx = bk(ix0); bx <= bk(ix1); bx++) keys.add(bx + ":" + by);
      if (!(await P.popLoad(1000, keys))) return lost;
      for (var iy = iy0; iy <= iy1; iy++) for (var ix = ix0; ix <= ix1; ix++) {
        var p = P.popAt(1000, ix, iy);
        if (p > 0) cells.push({ ix: ix, iy: iy, pop: p });
      }
    }
    var inside = function (lat, lon) { return lat >= box[0] && lat <= box[2] && lon >= box[1] && lon <= box[3]; };
    // Searches with no result (anonymous, only cells of 10 or more): kept even on a cell without residents.
    var have = new Set(cells.map(function (c) { return c.ix + ":" + c.iy; })), dem = new Map();
    d.cells.forEach(function (c) {
      var k = c.ix + ":" + c.iy, ctr = C.cellCentre(c.ix, c.iy);
      if (c.demand == null || (inTerr ? !inTerr.has(k) : !inside(ctr[1], ctr[0]))) return;
      dem.set(k, c.demand);
      if (!have.has(k)) cells.push({ ix: c.ix, iy: c.iy, pop: 0 });
    });
    // ponytail: 25 samples a cell past 4,000 cells (a big territory) instead of 100; finer needs a worker.
    var n = cells.length > 4000 ? 5 : 10, PR = S.proj((box[0] + box[2]) / 2, (box[1] + box[3]) / 2);
    var SS = S.sample(cells, PR, n), demand = new Float64Array(SS.N);
    cells.forEach(function (c, ci) {
      var v = dem.get(c.ix + ":" + c.iy);
      if (v) for (var k = ci * n * n; k < (ci + 1) * n * n; k++) demand[k] = v / (n * n);
    });
    // Points: a margin of about 1.2 km around, so a resident at the edge sees the point across it.
    var ob = [+(box[0] - 0.011).toFixed(3), +(box[1] - 0.016).toFixed(3), +(box[2] + 0.011).toFixed(3), +(box[3] + 0.016).toFixed(3)];
    var got = await Promise.all([osmGet(ob), health()]), osm = got[0], h = got[1];
    var acc = new Set(h ? h.access : []), paid = new Set(h ? h.paid : []), und = new Set(h ? h.undrinkable : []);
    var server = d.points.map(function (p) {
      var q = S.fromServer(p);
      q.wheelchair = acc.has(p.id); q.paid = paid.has(p.id); if (und.has(p.id)) q.water = false;
      return q;
    });
    if (d.totals.points > d.points.length) server = server.concat(S.unlisted(d.cells, d.points)); // the ranking stops at 300
    var pts = S.merge(server, osm || []).filter(function (p) { return p.lat >= ob[0] && p.lat <= ob[2] && p.lon >= ob[1] && p.lon <= ob[3]; });
    pts.forEach(function (p) { p.x = PR.x(p.lon); p.y = PR.y(p.lat); });
    var memo = {};
    var water = pts.filter(S.VARIANTS.water), toilets = pts.filter(S.VARIANTS.toilets);
    var cal = await calibration(d), t = d.totals;
    return { key: key, data: d, spec: sp, box: box, P: PR, S: SS, n: n, cells: cells, pts: pts, water: water, toilets: toilets,
             wg: S.pointGrid(water), dist: function (v) { return memo[v] || (memo[v] = S.distances(SS, pts.filter(S.VARIANTS[v]))); },
             demand: demand, osm: osm ? osm.length : null, health: h, cal: cal.cal, calN: cal.n,
             litres: t.litres != null && t.refills ? t.litres / t.refills : 0.5,
             pop: cells.reduce(function (s, c) { return s + c.pop; }, 0) };
  }
  /**
   * Refills a day per resident within 500 m at every water point of the scope (the ranking's, up to 300; under the
   * floor: 0), each point's residents from the 3 x 3 cells around it, sampled as the area is. Once per answer.
   */
  var calCache = new WeakMap();
  function calibration(d) {
    if (calCache.has(d)) return calCache.get(d);
    var days = Math.max(1, S.days(d.period.from, d.period.to) + 1), pts = d.points.filter(function (p) { return S.HUMAN.indexOf(p.type) >= 0; });
    var keys = new Set();
    pts.forEach(function (p) {
      var c = C.cellOf(p.lat, p.lon);
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) keys.add(bk(c.ix + dx) + ":" + bk(c.iy + dy));
    });
    var p = P.popLoad(1000, keys).then(function (all) {
      if (!all) calCache.delete(d); // a block didn't load: its points sit out, and the next look tries again
      var obs = pts.map(function (q) {
        var c = C.cellOf(q.lat, q.lon), cells = [], unknown = false;
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          var pop = P.popAt(1000, c.ix + dx, c.iy + dy);
          if (pop == null) unknown = true;
          else if (pop > 0) cells.push({ ix: c.ix + dx, iy: c.iy + dy, pop: pop });
        }
        if (unknown) return null;
        var S2 = S.sample(cells, S.proj(q.lat, q.lon), 10);
        return { res: cells.length ? S.within(S2, [{ x: 0, y: 0 }], 500) : 0, perDay: (q.refills || 0) / days };
      }).filter(Boolean);
      return { cal: S.calibrate(obs), n: obs.length };
    });
    calCache.set(d, p);
    return p;
  }
  window.WNC_AREA = { get: areaGet, spec: spec, health: health, on: function (fn) { areaFns.push(fn); } };

  // ---- The simulator ----
  var R5 = S.R[0], R10 = S.R[1], LETTERS = ["A", "B", "C", "D"];
  var sim = { on: false, cand: null, kept: [], sugg: [], marker: null, keptMarkers: [], suggMarkers: [], f: null, scope: null,
              toilets: false, byDemand: false, wRes: 1, wDem: 20, install: "", upkeep: "", years: 10, ui: null, last: null };
  function allowed() { var d = P.data(); return !!d && d.scope.kind !== "partner"; }

  // Overlays: rings (5 and 10 min), the newly served squares, the line to the nearest working point today.
  var EMPTY = { type: "FeatureCollection", features: [] }, geo = { rings: EMPTY, news: EMPTY, line: EMPTY, pts: EMPTY };
  function layers() {
    var gl = P.map();
    if (!gl) return;
    try {
      ["rings", "news", "line", "pts"].forEach(function (k) { if (!gl.getSource("sim-" + k)) gl.addSource("sim-" + k, { type: "geojson", data: geo[k] }); });
      var before = gl.getLayer("pts") ? "pts" : undefined, dk = P.dark.matches;
      // Every point the figures count (the console's and OpenStreetMap's): water in teal, toilets only in violet,
      // broken or closed for the season hollow.
      if (!gl.getLayer("sim-pts")) gl.addLayer({ id: "sim-pts", type: "circle", source: "sim-pts", minzoom: 11, paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 2, 14, 4, 16, 6],
        "circle-color": ["case", ["get", "off"], "rgba(0,0,0,0)", ["get", "w"], dk ? "#2fd0c8" : "#0a8f8d", dk ? "#b9a6ff" : "#6d4fd0"],
        "circle-stroke-color": ["case", ["get", "off"], dk ? "#ff7a6b" : "#c2362b", dk ? "#0a0f1a" : "#ffffff"],
        "circle-stroke-width": ["case", ["get", "off"], 1.6, 1] } }, before);
      if (!gl.getLayer("sim-news")) gl.addLayer({ id: "sim-news", type: "fill", source: "sim-news", paint: {
        "fill-color": dk ? "#2fd0c8" : "#0aa5a3", "fill-opacity": ["interpolate", ["linear"], ["zoom"], 11, 0.55, 15, 0.38], "fill-antialias": false } }, before);
      if (!gl.getLayer("sim-rings-fill")) gl.addLayer({ id: "sim-rings-fill", type: "fill", source: "sim-rings", paint: {
        "fill-color": ["case", ["==", ["get", "r"], 5], dk ? "rgba(77,155,255,0.16)" : "rgba(18,104,232,0.12)", dk ? "rgba(77,155,255,0.07)" : "rgba(18,104,232,0.05)"] } }, before);
      if (!gl.getLayer("sim-rings-line")) gl.addLayer({ id: "sim-rings-line", type: "line", source: "sim-rings", paint: {
        "line-color": dk ? "#7db6ff" : "#1268e8", "line-width": ["case", ["==", ["get", "r"], 5], 2, 1.3],
        "line-dasharray": ["case", ["==", ["get", "r"], 5], ["literal", [1, 0]], ["literal", [3, 2]]], "line-opacity": ["case", ["get", "kept"], 0.55, 0.95] } }, before);
      if (!gl.getLayer("sim-line")) gl.addLayer({ id: "sim-line", type: "line", source: "sim-line", layout: { "line-cap": "round" }, paint: {
        "line-color": dk ? "#fbbf24" : "#b45309", "line-width": 2, "line-dasharray": [1.5, 1.8] } }, before);
    } catch (e) { /* the style is still loading: the next styledata adds them */ }
  }
  function setGeo(k, v) { geo[k] = v; var gl = P.map(), s = gl && gl.getSource("sim-" + k); if (s) s.setData(v); }
  var ringRaf = 0;
  function ringFeatures(scale) {
    var A = area, out = [];
    if (!A || !A.P) return EMPTY;
    var at = sim.kept.map(function (k) { return { c: k, kept: true }; });
    if (sim.cand) at.push({ c: sim.cand, kept: false });
    at.forEach(function (o) {
      var x = A.P.x(o.c.lon), y = A.P.y(o.c.lat), sc = o.kept ? 1 : scale;
      [[10, R10], [5, R5]].forEach(function (r) {
        out.push({ type: "Feature", properties: { r: r[0], kept: o.kept }, geometry: { type: "Polygon", coordinates: [S.circle(A.P, x, y, Math.max(1, r[1] * sc))] } });
      });
    });
    return { type: "FeatureCollection", features: out };
  }
  // Rings grow in when a pin lands (at once with reduced motion); while dragging they follow without animating.
  function drawRings(grow) {
    cancelAnimationFrame(ringRaf);
    if (!grow || reduced) { setGeo("rings", ringFeatures(1)); return; }
    var t0 = performance.now();
    (function step(now) {
      var p = C.ease((now - t0) / 480);
      setGeo("rings", ringFeatures(0.25 + 0.75 * p));
      if (p < 1) ringRaf = requestAnimationFrame(step);
    })(t0);
  }

  // Pins: the candidate (draggable), the kept scenarios A to D, the numbered suggestions.
  function pin(cls, label, aria) {
    var e = el("div", "sim-pin " + cls);
    e.appendChild(el("span", null, label));
    e.setAttribute("role", "img"); e.setAttribute("aria-label", aria);
    if (!reduced) e.classList.add("drop");
    return e;
  }
  function marker(e, lon, lat, drag) {
    var m = new window.maplibregl.Marker({ element: e, draggable: !!drag, anchor: "bottom" }).setLngLat([lon, lat]).addTo(P.map());
    return m;
  }
  function placeCandidate(lon, lat, grow) {
    sim.cand = { lon: lon, lat: lat };
    if (!sim.marker) {
      var e = pin("cand", "+", T.simCandidate);
      sim.marker = marker(e, lon, lat, true);
      sim.marker.on("dragstart", function () { e.classList.add("dragging"); });
      sim.marker.on("drag", function () { var ll = sim.marker.getLngLat().wrap(); sim.cand = { lon: ll.lng, lat: ll.lat }; live(); });
      sim.marker.on("dragend", function () { e.classList.remove("dragging"); var ll = sim.marker.getLngLat().wrap(); sim.cand = { lon: ll.lng, lat: ll.lat }; settle(true); });
    } else sim.marker.setLngLat([lon, lat]);
    settle(grow);
  }
  // While dragging: one computation a frame at most, numbers glide quickly. Settled: the rings grow, the table updates.
  var liveRaf = 0;
  function live() {
    if (liveRaf) return;
    liveRaf = requestAnimationFrame(function () { liveRaf = 0; compute(true); drawRings(false); });
  }
  function settle(grow) { cancelAnimationFrame(liveRaf); liveRaf = 0; compute(false); drawRings(grow); compare(); }

  /** Every figure for spots [at] ({lon, lat}): together, a resident near two counts once. */
  function figures(A, at) {
    var c = at.map(function (o) { return { x: A.P.x(o.lon), y: A.P.y(o.lat) }; }), water = A.dist("water");
    var n5 = S.newly(A.S, water, c, R5), n10 = S.newly(A.S, water, c, R10);
    var res500 = S.within(A.S, c, 500), est = S.estimate(A.cal, res500), f = S.FACTORS[sim.f || "WORLD"];
    var near = c.length === 1 ? S.closest(A.wg, c[0].x, c[0].y, S.CAP) : null;
    var imp = est ? S.impact({ lo: est.lo, hi: est.hi }, f, A.litres) : null;
    var years = +sim.years || 0;
    return {
      newly5: n5.pop, idx5: n5.idx, newly10: n10.pop, res5: S.within(A.S, c, R5), res10: S.within(A.S, c, R10),
      near: near ? { d: near.d, p: A.water[near.i] } : null, demand: S.within(A.S, c, R10, A.demand),
      toilets: sim.toilets ? S.newly(A.S, A.dist("toilets"), c, R5).pop : null,
      est: est, impact: imp, factors: f,
      cost: S.cost((+sim.install || 0) * at.length, (+sim.upkeep || 0) * at.length, years, n5.pop, imp ? imp.bottles : null) // one fountain per spot
    };
  }
  function compute(dragging) {
    var A = area;
    if (!sim.ui || !A || !A.S || !sim.cand) { paint(null, dragging); return; }
    var F = figures(A, [sim.cand]);
    sim.last = F;
    paint(F, dragging);
    // Overlays: newly served squares (merged per frame), the line to the nearest working point today.
    setGeo("news", { type: "FeatureCollection", features: F.idx5.slice(0, 4000).map(function (k) {
      return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [S.sampleRing(A.S, k)] } };
    }) });
    setGeo("line", F.near ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {},
      geometry: { type: "LineString", coordinates: [[sim.cand.lon, sim.cand.lat], [F.near.p.lon, F.near.p.lat]] } }] } : EMPTY);
  }

  // Numbers glide to their new value (a quick glide while dragging, none with reduced motion).
  function tween(node, to, fmt, quick) {
    var from = typeof node._v === "number" ? node._v : 0;
    node._v = to;
    cancelAnimationFrame(node._raf);
    if (reduced || from === to) { node.textContent = fmt(to); return; }
    var t0 = performance.now(), dur = quick ? 180 : 650;
    (function step(now) {
      var p = C.ease((now - t0) / dur);
      node.textContent = fmt(from + (to - from) * p);
      if (p < 1) node._raf = requestAnimationFrame(step);
    })(t0);
  }
  var walkMin = function (m) { return Math.max(1, Math.round(m * S.DETOUR / S.WALK_PER_MIN)); };
  function demandText(v) { return v >= 10 ? nf.format(Math.round(v)) : TC.fewerShort(10); }
  function range(lo, hi, fmt) { return fmt(lo) === fmt(hi) ? fmt(lo) : fmt(lo) + " – " + fmt(hi); }

  // ---- The panel ----
  function build_ui() {
    var box = clear($("simPanel")), u = {};
    var head = el("div", "card-head");
    var hd = el("div");
    hd.appendChild(el("div", "eyebrow", T.simBtn));
    hd.appendChild(el("h2", null, T.simTitle));
    head.appendChild(hd);
    var x = btn(head, "×", "ghost small-btn sim-x"); x.setAttribute("aria-label", T.simClose); x.addEventListener("click", stop);
    box.appendChild(head);
    u.lead = box.appendChild(el("p", "muted small sim-lead", T.simLead));
    u.status = box.appendChild(el("p", "tiny muted sim-status"));
    if (P.demo) box.appendChild(el("span", "pill demo sim-demo", TC.demo));
    var acts = el("div", "sim-acts");
    u.suggest = btn(acts, T.simSuggest, "primary sim-suggest");
    u.suggest.addEventListener("click", suggest);
    u.keep = btn(acts, T.simKeep("A"), "ghost");
    u.keep.addEventListener("click", keep);
    box.appendChild(acts);
    var tg = el("div", "sim-toggles");
    u.tToilets = toggle(tg, T.simWithToilets, sim.toilets, function (v) { sim.toilets = v; settle(false); });
    u.tDemand = toggle(tg, T.simByDemand, sim.byDemand, function (v) { sim.byDemand = v; u.weights.classList.toggle("hidden", !v); });
    u.weights = el("div", "sim-weights" + (sim.byDemand ? "" : " hidden"));
    num(u.weights, T.simWRes, sim.wRes, function (v) { sim.wRes = v; });
    num(u.weights, T.simWDem, sim.wDem, function (v) { sim.wDem = v; });
    tg.appendChild(u.weights);
    box.appendChild(tg);
    u.sugg = box.appendChild(el("ol", "need sim-sugg"));
    // The key number.
    var hero = el("div", "sim-hero");
    hero.appendChild(el("div", "l", T.simNew));
    u.newly = hero.appendChild(el("div", "v", "—"));
    u.newly10 = hero.appendChild(el("div", "s", T.simNewSub));
    box.appendChild(hero);
    var g = el("div", "facts sim-facts");
    u.res5 = fact(g, T.simRes5); u.res10 = fact(g, T.simRes10); u.near = fact(g, T.simNearest); u.demand = fact(g, T.simDemand);
    u.toil = fact(g, T.simNewToilets); u.toil.parentNode.classList.toggle("hidden", !sim.toilets);
    box.appendChild(g);
    box.appendChild(el("div", "section-t", T.simRefills));
    var rf = el("div", "sim-range");
    u.refills = rf.appendChild(el("b", null, "—"));
    rf.appendChild(el("span", "chip", T.simEstimate));
    box.appendChild(rf);
    u.refNote = box.appendChild(el("p", "note"));
    var yh = el("div", "card-head sim-yearhead");
    yh.appendChild(el("div", "section-t", T.simYear));
    var fl = el("label", "sim-select"), fs = el("select");
    fl.appendChild(el("span", "sr", T.simFactors));
    ["CA", "US", "FR", "WORLD"].forEach(function (k) { var o = el("option", null, T.factorSets[k]); o.value = k; fs.appendChild(o); });
    fs.addEventListener("change", function () { sim.f = fs.value; settle(false); });
    fl.appendChild(fs); yh.appendChild(fl); u.factors = fs;
    box.appendChild(yh);
    var yl = el("ul", "sim-year");
    u.bottles = yl.appendChild(el("li")); u.pet = yl.appendChild(el("li")); u.co2 = yl.appendChild(el("li")); u.money = yl.appendChild(el("li"));
    box.appendChild(yl);
    box.appendChild(el("div", "section-t", T.simCost));
    var cg = el("div", "sim-cost");
    num(cg, T.simInstall, sim.install, function (v) { sim.install = v; settle(false); }, true);
    num(cg, T.simUpkeep, sim.upkeep, function (v) { sim.upkeep = v; settle(false); }, true);
    num(cg, T.simYears, sim.years, function (v) { sim.years = v; settle(false); });
    box.appendChild(cg);
    u.cost = box.appendChild(el("p", "small sim-costout"));
    var det = el("details", "sim-method"), sm = el("summary", null, T.simMethod), ul = el("ul");
    det.appendChild(sm);
    T.simMethodLines.forEach(function (l) { ul.appendChild(el("li", null, l)); });
    det.appendChild(ul);
    box.appendChild(det);
    sim.ui = u;
  }
  function toggle(parent, label, on, fn) {
    var l = el("label", "sim-toggle"), i = el("input");
    i.type = "checkbox"; i.checked = on;
    i.addEventListener("change", function () { fn(i.checked); });
    l.appendChild(i); l.appendChild(el("span", null, label));
    parent.appendChild(l);
    return i;
  }
  function num(parent, label, v, fn, money) {
    var l = el("label", "sim-num"), i = el("input", "input");
    i.type = "number"; i.min = "0"; i.step = money ? "100" : "1"; i.inputMode = "decimal"; i.value = v;
    i.addEventListener("input", function () { var n = parseFloat(i.value); fn(isFinite(n) && n >= 0 ? n : ""); });
    l.appendChild(el("span", null, label)); l.appendChild(i);
    parent.appendChild(l);
    return i;
  }
  function fact(box, label) {
    var f = el("div", "fact"), b = el("b", null, "—");
    f.appendChild(b); f.appendChild(el("span", null, label)); box.appendChild(f);
    return b;
  }
  function paint(F, dragging) {
    var u = sim.ui;
    if (!u) return;
    u.keep.textContent = T.simKeep(LETTERS[Math.min(sim.kept.length, 3)]);
    u.keep.disabled = !F || sim.kept.length >= 4;
    u.toil.parentNode.classList.toggle("hidden", !sim.toilets);
    if (!F) {
      [u.newly, u.res5, u.res10, u.near, u.demand, u.toil, u.refills].forEach(function (n) { n._v = 0; n.textContent = "—"; });
      u.newly10.textContent = T.simNewSub;
      [u.bottles, u.pet, u.co2, u.money, u.cost, u.refNote].forEach(function (n) { n.textContent = ""; });
      return;
    }
    tween(u.newly, F.newly5, big, dragging);
    u.newly10.textContent = T.simNewSub + " · " + T.simNew10(nf.format(Math.round(F.newly10)));
    tween(u.res5, F.res5, big, dragging);
    tween(u.res10, F.res10, big, dragging);
    u.near.textContent = F.near ? T.simWalk(nf.format(Math.round(F.near.d * S.DETOUR / 10) * 10), walkMin(F.near.d)) : T.simNearestNone;
    u.demand.textContent = demandText(F.demand);
    if (sim.toilets) tween(u.toil, F.toilets, big, dragging);
    if (F.est) {
      u.refills.textContent = range(F.est.lo, F.est.hi, function (v) { return nf1.format(v < 10 ? Math.round(v * 10) / 10 : Math.round(v)); });
      u.refNote.textContent = F.est.src === "band" ? T.simRefillsBand(nf.format(F.est.n), F.est.n) : T.simRefillsAll(nf.format(F.est.n), F.est.n);
    } else { u.refills.textContent = "—"; u.refNote.textContent = T.simRefillsNone; }
    var I = F.impact, f = F.factors;
    if (I) {
      var b0 = Math.round(I.bottles.lo), b1 = Math.round(I.bottles.hi);
      u.bottles.textContent = T.simBottles(range(b0, b1, big), b1);
      u.pet.textContent = T.simPet(nf1.format(I.pet.hi));
      u.co2.textContent = T.simCo2(nf.format(Math.round(I.co2.hi)));
      u.money.textContent = I.money ? T.simMoney(money(f.cur, I.money.lo), money(f.cur, I.money.hi)) : T.simNoMoney;
    } else [u.bottles, u.pet, u.co2, u.money].forEach(function (n) { n.textContent = ""; });
    var c = F.cost, cur = f.cur || "USD";
    u.cost.textContent = !c ? T.simCostEmpty
      : [c.perResident != null ? money(cur, c.perResident) + " " + T.simPerRes : null,
         c.perBottle ? range(c.perBottle.lo, c.perBottle.hi, function (v) { return money(cur, v); }) + " " + T.simPerBottle : null].filter(Boolean).join(" · ") || T.simCostEmpty;
  }
  function status() {
    var u = sim.ui, sp = spec(), A = area;
    if (!u) return;
    if (sp.kind === "zoom") { u.status.textContent = T.simZoom; return; }
    if (sp.kind === "big") { u.status.textContent = T.simTooBig; return; }
    if (!A || A.key.indexOf(sp.key) !== 0) { u.status.textContent = T.simLoading; return; }
    if (!A.S) { u.status.textContent = TC.noPop; return; }
    u.status.textContent = (A.osm != null ? T.simOsmOk(nf.format(A.osm)) : T.simOsmFail) + " · " + T.simResidents(big(A.pop));
  }

  // ---- Suggest, keep, compare ----
  function suggest() {
    var A = area, u = sim.ui;
    if (!A || !A.S || !u || u.suggest.getAttribute("aria-disabled")) return;
    // Busy, not disabled: pressed from the keyboard, the focus stays on the button (as console.js's waiting()).
    u.suggest.setAttribute("aria-disabled", "true"); u.suggest.textContent = T.simSuggesting;
    setTimeout(function () { // lets the button repaint before the search
      var picks = S.suggest(A.S, A.dist("water"), R5, { k: 5, wPop: sim.byDemand ? +sim.wRes || 0 : 1, wDemand: sim.byDemand ? +sim.wDem || 0 : 0, demand: A.demand });
      sim.sugg = picks.map(function (p) { return { lon: A.P.lon(p.x), lat: A.P.lat(p.y), pop: p.pop }; });
      drawSugg();
      u.suggest.removeAttribute("aria-disabled"); u.suggest.textContent = T.simSuggest;
      if (!sim.sugg.length) return;
      placeCandidate(sim.sugg[0].lon, sim.sugg[0].lat, true);
      // The five in view, close enough to read the rings.
      var gl = P.map(), lo = sim.sugg.map(function (s) { return s.lon; }), la = sim.sugg.map(function (s) { return s.lat; });
      if (gl) gl.fitBounds([[Math.min.apply(null, lo) - 0.006, Math.min.apply(null, la) - 0.004], [Math.max.apply(null, lo) + 0.006, Math.max.apply(null, la) + 0.004]],
                           { padding: 60, maxZoom: 14.5, duration: reduced ? 0 : 900 });
    }, 30);
  }
  function drawSugg() {
    sim.suggMarkers.forEach(function (m) { m.remove(); });
    sim.suggMarkers = [];
    var list = clear(sim.ui.sugg);
    if (!sim.sugg.length) { if (sim.ui && area) list.appendChild(el("li", "empty", T.simNone)); return; }
    list.appendChild(el("li", "sim-sugg-h", T.simSuggestLead));
    sim.sugg.forEach(function (s, i) {
      var e = pin("sugg", String(i + 1), T.simSuggestion(i + 1));
      if (!reduced) e.firstChild.style.animationDelay = (i * 70) + "ms";
      e.addEventListener("click", function (ev) { ev.stopPropagation(); placeCandidate(s.lon, s.lat, true); });
      sim.suggMarkers.push(marker(e, s.lon, s.lat, false));
      var li = el("li"), what = el("div", "what");
      li.tabIndex = 0;
      li.appendChild(el("span", "rk", String(i + 1)));
      what.appendChild(el("b", null, T.simPlus(big(s.pop))));
      what.appendChild(el("span", "muted", s.lat.toFixed(4) + ", " + s.lon.toFixed(4)));
      li.appendChild(what);
      var go = function () { placeCandidate(s.lon, s.lat, true); var gl = P.map(); if (gl) gl.easeTo({ center: [s.lon, s.lat], duration: reduced ? 0 : 700 }); };
      li.addEventListener("click", go);
      li.addEventListener("keydown", function (e2) { if (e2.key === "Enter") go(); });
      list.appendChild(li);
    });
  }
  function keep() {
    if (!sim.cand || sim.kept.length >= 4) return;
    var L = LETTERS.filter(function (l) { return !sim.kept.some(function (k) { return k.L === l; }); })[0];
    var k = { L: L, lon: sim.cand.lon, lat: sim.cand.lat, combine: true };
    k.marker = marker(pin("kept", L, T.simPin(L)), k.lon, k.lat, false);
    sim.kept.push(k);
    sim.kept.sort(function (a, b) { return a.L.localeCompare(b.L); });
    drawRings(false); compare(); paint(sim.last, false);
  }
  function unkeep(k) {
    k.marker.remove();
    sim.kept = sim.kept.filter(function (x) { return x !== k; });
    drawRings(false); compare(); paint(sim.last, false);
  }
  // The comparison's rows: [label, fn(F) -> text].
  function rows() {
    var f = S.FACTORS[sim.f || "WORLD"], cur = f.cur || "USD";
    var est = function (F, g) { return F.est ? g(F) : "—"; };
    return [
      [T.simNew, function (F) { return big(F.newly5); }],
      [T.simNew + " · " + T.m10, function (F) { return big(F.newly10); }],
      [T.simRes5, function (F) { return big(F.res5); }],
      [T.simRes10, function (F) { return big(F.res10); }],
      [T.simNearest, function (F) { return F.near ? nf.format(Math.round(F.near.d * S.DETOUR / 10) * 10) + " m" : "—"; }],
      [T.simDemand, function (F) { return demandText(F.demand); }],
      [T.simRefills, function (F) { return est(F, function () { return range(F.est.lo, F.est.hi, function (v) { return nf1.format(v); }); }); }],
      [T.simBottlesRow, function (F) { return F.impact ? range(F.impact.bottles.lo, F.impact.bottles.hi, big) : "—"; }],
      [T.simPetRow, function (F) { return F.impact ? nf1.format(F.impact.pet.hi) : "—"; }],
      [T.simCo2Row, function (F) { return F.impact ? nf.format(Math.round(F.impact.co2.hi)) : "—"; }],
      [T.simMoneyRow, function (F) { return F.impact && F.impact.money ? range(F.impact.money.lo, F.impact.money.hi, function (v) { return money(cur, v); }) : "—"; }],
      [T.simPerResRow, function (F) { return F.cost && F.cost.perResident != null ? money(cur, F.cost.perResident) : "—"; }],
      [T.simPerBottleRow, function (F) { return F.cost && F.cost.perBottle ? range(F.cost.perBottle.lo, F.cost.perBottle.hi, function (v) { return money(cur, v); }) : "—"; }]
    ];
  }
  function columns() {
    var A = area;
    if (!A || !A.S) return [];
    var cols = sim.kept.map(function (k) { return { k: k, title: T.simPin(k.L), F: figures(A, [k]) }; });
    var both = sim.kept.filter(function (k) { return k.combine; });
    if (both.length >= 2) cols.push({ title: T.simCombined + " (" + both.map(function (k) { return k.L; }).join("+") + ")", F: figures(A, both), together: true });
    return cols;
  }
  function compare() {
    var box = $("simCompare");
    if (!box) return;
    if (!sim.on || !sim.kept.length) { box.classList.add("hidden"); clear(box); return; }
    box.classList.remove("hidden");
    clear(box);
    var head = el("div", "card-head"), hd = el("div"), acts = el("div", "head-actions");
    hd.appendChild(el("h2", null, T.simCompare));
    hd.appendChild(el("p", "muted small", T.simCompareLead));
    head.appendChild(hd);
    btn(acts, T.simCsv, "ghost small-btn").addEventListener("click", exportCsv);
    btn(acts, T.simPrint, "ghost small-btn").addEventListener("click", printView);
    head.appendChild(acts);
    box.appendChild(head);
    var cols = columns(), wrap = el("div", "sim-table"), t = el("table", "rank"), th = el("thead"), hr = el("tr");
    hr.appendChild(el("th", null, ""));
    cols.forEach(function (c) {
      var x = el("th", "n" + (c.together ? " together" : ""));
      x.scope = "col";
      if (c.k) {
        var top = el("div", "sim-colhead");
        top.appendChild(el("span", "sim-letter", c.k.L));
        var rm = btn(top, "×", "ghost small-btn"); rm.setAttribute("aria-label", T.simRemove + " " + c.k.L);
        rm.addEventListener("click", function () { unkeep(c.k); });
        x.appendChild(top);
        var lab = el("label", "sim-combine"), cb = el("input");
        cb.type = "checkbox"; cb.checked = c.k.combine;
        cb.addEventListener("change", function () { c.k.combine = cb.checked; compare(); });
        lab.appendChild(cb); lab.appendChild(el("span", null, T.simCombine));
        x.appendChild(lab);
      } else x.appendChild(el("span", null, c.title));
      hr.appendChild(x);
    });
    th.appendChild(hr); t.appendChild(th);
    var tb = el("tbody");
    rows().forEach(function (r) {
      var tr = el("tr");
      tr.appendChild(el("td", "name", r[0]));
      cols.forEach(function (c) { tr.appendChild(el("td", "n" + (c.together ? " together" : ""), r[1](c.F))); });
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t); box.appendChild(wrap);
    box.appendChild(el("p", "note", T.simCompareNote));
  }
  function tableRows() {
    var cols = columns(), out = [[""].concat(cols.map(function (c) { return c.title; }))];
    rows().forEach(function (r) { out.push([r[0]].concat(cols.map(function (c) { return r[1](c.F); }))); });
    out.push([T.simPosition].concat(cols.map(function (c) { return c.k ? c.k.lat.toFixed(5) + ", " + c.k.lon.toFixed(5) : ""; })));
    return out;
  }
  function exportCsv() {
    var d = P.data(), a = el("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + C.csv(tableRows())], { type: "text/csv;charset=utf-8" }));
    a.download = "waternow-simulator-" + P.scope().replace(/[^a-z0-9]+/gi, "-") + "-" + d.period.key + ".csv";
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  // A sheet over the page, the only thing printed (console.css's .report rules): the table, the method, the sources.
  function printView() {
    var rep = $("simReport"), sheet = el("div", "sheet"), bar = el("div", "bar"), last = document.activeElement;
    clear(rep);
    rep.setAttribute("aria-label", T.simReportTitle);
    function close() { rep.classList.add("hidden"); clear(rep); document.body.classList.remove("modal"); document.removeEventListener("keydown", key); if (last) last.focus(); }
    function key(e) { if (e.key === "Escape") close(); }
    btn(bar, TC.print, "ghost").addEventListener("click", function () { window.print(); });
    var x = btn(bar, TC.close, "ghost"); x.addEventListener("click", close);
    sheet.appendChild(bar);
    sheet.appendChild(el("h1", null, T.simReportTitle));
    var sel = $("scope");
    sheet.appendChild(el("p", "sub", (sel && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent + " · " : "") + P.fmtFull.format(new Date())));
    var t = el("table"), rs = tableRows();
    rs.forEach(function (r, i) {
      var tr = el("tr");
      r.forEach(function (v, j) { tr.appendChild(el(i ? "td" : "th", j ? "n" : "", v)); });
      t.appendChild(tr);
    });
    sheet.appendChild(t);
    sheet.appendChild(el("h2", null, T.simMethod));
    var ul = el("ul", "fine-list");
    T.simMethodLines.forEach(function (l) { ul.appendChild(el("li", "fine", l)); });
    sheet.appendChild(ul);
    sheet.appendChild(el("p", "fine", $("popNote").textContent));
    sheet.appendChild(el("p", "fine", T.simOsmCredit + (P.demo ? " · " + TC.demo : "")));
    rep.appendChild(sheet);
    rep.classList.remove("hidden");
    document.body.classList.add("modal");
    document.addEventListener("keydown", key);
    x.focus();
  }

  // The impact report's "Scénarios" slot (report.js dispatches "wn-report" once drawn): the kept scenarios' table, the
  // same rows as the CSV and the print sheet, with the method. Nothing kept: the slot stays hidden.
  document.addEventListener("wn-report", function (e) {
    // Only scenarios kept in the report's own scope (a scope switch that hasn't rendered yet still has the old ones).
    var rep = e.detail && e.detail.report, slot = e.detail && e.detail.slot;
    var rs = sim.kept.length && rep && rep.scope.key === sim.scope && area && area.key.split("|")[1] === sim.scope ? tableRows() : null;
    if (!slot || !rs || rs[0].length < 2) return;
    slot.appendChild(el("h2", null, T.simReportTitle));
    var wrap = el("div", "rpt-tablewrap"), t = el("table", "rpt-table"), th = el("thead"), tb = el("tbody");
    rs.forEach(function (r, i) {
      var tr = el("tr");
      r.forEach(function (v, j) { tr.appendChild(el(i ? "td" : "th", j ? "n" : "", v)); });
      (i ? tb : th).appendChild(tr);
    });
    t.appendChild(th); t.appendChild(tb); wrap.appendChild(t); slot.appendChild(wrap);
    slot.appendChild(el("p", "rpt-note", T.simCompareNote));
    var ul = el("ul", "rpt-list");
    T.simMethodLines.forEach(function (l) { ul.appendChild(el("li", null, l)); });
    slot.appendChild(ul);
    slot.appendChild(el("p", "rpt-note", T.simOsmCredit));
    slot.hidden = false;
  });

  // ---- Start, stop, follow the page ----
  function start() {
    if (!allowed()) return;
    sim.on = true;
    sim.scope = P.scope();
    $("panel").classList.add("hidden");
    $("simPanel").classList.remove("hidden");
    $("simBtn").setAttribute("aria-pressed", "true");
    build_ui();
    layers();
    var gl = P.map();
    if (gl) gl.getCanvas().classList.add("sim-cursor");
    refresh();
    sim.ui.suggest.focus({ preventScroll: true });
  }
  function stop() {
    sim.on = false;
    $("simPanel").classList.add("hidden");
    $("panel").classList.remove("hidden");
    $("simBtn").setAttribute("aria-pressed", "false");
    reset();
    sim.ui = null;
    setGeo("pts", EMPTY);
    var gl = P.map();
    if (gl) gl.getCanvas().classList.remove("sim-cursor");
    $("simBtn").focus({ preventScroll: true });
  }
  // Pins, suggestions, scenarios and the factor set belong to one scope: another scope starts from none.
  function reset() {
    if (sim.marker) { sim.marker.remove(); sim.marker = null; }
    sim.kept.forEach(function (k) { k.marker.remove(); });
    sim.suggMarkers.forEach(function (m) { m.remove(); });
    sim.kept = []; sim.sugg = []; sim.suggMarkers = []; sim.cand = null; sim.last = null; sim.f = null; sim.scope = P.scope();
    ["rings", "news", "line"].forEach(function (k) { setGeo(k, EMPTY); });
    if (sim.ui) clear(sim.ui.sugg);
    compare();
  }
  // The area for the view or the city, then every figure again.
  function refresh() {
    if (!sim.on) return;
    status();
    areaGet().then(function (A) {
      if (!sim.on) return;
      if (!A.S) { status(); paint(null); return; }
      if (A !== area) return; // an older build that lost to a newer one: the newer one paints
      if (!sim.f) { sim.f = S.countryOf((A.box[0] + A.box[2]) / 2, (A.box[1] + A.box[3]) / 2); sim.ui.factors.value = sim.f; }
      setGeo("pts", { type: "FeatureCollection", features: A.pts.filter(function (p) { return p.water || p.toilet; }).map(function (p) {
        return { type: "Feature", properties: { w: p.water, off: !!(p.broken || p.closedNow) }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } };
      }) });
      status();
      settle(false);
    });
  }
  // A click on the map while the simulator is open places the candidate (the console doesn't open a cell then).
  P.claim = function (e) {
    if (!sim.on) return false;
    if (!area || !area.S) { refresh(); return true; }
    var ll = e.lngLat.wrap(); // a click on a world copy
    placeCandidate(ll.lng, ll.lat, true);
    return true;
  };
  var btnSim = $("simBtn");
  if (btnSim) {
    btnSim.textContent = T.simBtn;
    btnSim.addEventListener("click", function () { if (sim.on) stop(); else start(); });
  }
  var wired = false, moveTimer = 0;
  document.addEventListener("wnc:render", function () {
    var ok = allowed();
    if (btnSim) btnSim.classList.toggle("hidden", !ok);
    if (!ok && sim.on) stop();
    if (sim.on && sim.scope !== P.scope()) reset();
    var gl = P.map();
    if (gl && !wired) {
      wired = true;
      gl.on("styledata", layers);
      gl.on("moveend", function () { clearTimeout(moveTimer); moveTimer = setTimeout(function () { if (sim.on) refresh(); }, 250); });
    }
    if (sim.on) refresh();
  });
  // In the demo preview only, its captures place, drag and suggest (scripts/console-preview.mjs).
  if (P.demo) {
    window.WNC_SIM = {
      start: start, suggest: suggest, keep: keep, area: function () { return area; },
      place: function (lon, lat) { placeCandidate(lon, lat, true); },
      dragTo: function (lon, lat) { // mid-drag: the pin lifted, the figures live, nothing settled
        sim.cand = { lon: lon, lat: lat }; sim.marker.setLngLat([lon, lat]); sim.marker.getElement().classList.add("dragging"); compute(true); drawRings(false);
      }
    };
  }
})();
