/*
 * WaterNow Statistics, the impact report's pure parts (window.WNR; the node test reads module.exports): the conversion
 * factors of docs/15b_IMPACT_FACTORS.md by country, the country of a scope, the impact of a volume, the report's
 * periods, the reach of points over the population cells, the auto-written recommendations and a CSS string for the
 * print header. Nothing here touches the DOM.
 *
 * Wording rules (15b, sections 0 and 9): every saving is "the equivalent of" or "up to"; no study measures how many
 * refills replace a bought bottle, so a refill is never "a bottle not bought", and no "X times tap water" ratio.
 */
(function (root) {
  "use strict";
  var D = Math.PI / 180;

  // ---- Factors (docs/15b_IMPACT_FACTORS.md, section 10), per 500 ml bottle-equivalent unless said ----
  // src: the source keys of SOURCES below. Bottled and tap GHG are per litre; net = bottled - tap.
  var FACTORS = {
    CA: { pet: 9.25, bottled: 0.183, tap: 0.0009, car: 0.244, collect: 0.65, price: [0.72, 2.21], currency: "CAD",
          src: { pet: "ibwa15", bottled: "quantis17", tap: "fantin14", car: "epa26", collect: "eunomia24", price: "numbeo26" } },
    US: { pet: 9.25, bottled: 0.183, tap: 0.0009, car: 0.244, collect: 0.325, price: [0.41, 1.60], currency: "USD",
          src: { pet: "ibwa15", bottled: "quantis17", tap: "fantin14", car: "epa26", collect: "napcor24", price: "wfg_ibwa" } },
    FR: { pet: 12, bottled: 0.32, tap: 0.00034, car: 0.142, collect: 0.583, price: [0.24, 1.88], currency: "EUR",
          src: { pet: "sidel", bottled: "agribalyse", tap: "agribalyse_tap", car: "ademe_car", collect: "mte26", price: "numbeo26" } },
    WORLD: { pet: 10, bottled: 0.166, tap: 0.0009, car: 0.244, collect: null, price: null, currency: null,
             src: { pet: "greenalliance", bottled: "kim22", tap: "fantin14", car: "epa26" } }
  };
  // Short citations (15b section 11) with their grade: A government or peer-reviewed, B industry LCA or national
  // database read through a secondary page, C crowd-sourced, vendor or press.
  var SOURCES = {
    ibwa15: { cite: "Beverage Marketing Corp. / IBWA, 2015", grade: "B" },
    quantis17: { cite: "Quantis LCI for IBWA, 2017", grade: "B" },
    fantin14: { cite: "Fantin et al., Sci. Total Environ. 476-477, 2014", grade: "A" },
    epa26: { cite: "US EPA, GHG Equivalencies Calculator, 2026", grade: "A" },
    eunomia24: { cite: "Eunomia et al. for BCRNC, 2024 (2022 data)", grade: "B" },
    numbeo26: { cite: "Numbeo, cost of living, Nov. 2026", grade: "C" },
    napcor24: { cite: "NAPCOR, 2023 PET Recycling Report", grade: "B" },
    wfg_ibwa: { cite: "Water Filter Guru (on the go); IBWA / BMC 2025 (floor)", grade: "C" },
    sidel: { cite: "Sidel RightWeight (vendor baseline)", grade: "C" },
    agribalyse: { cite: "ADEME Agribalyse 3.2, eau embouteillée (18430), 2025", grade: "B" },
    agribalyse_tap: { cite: "ADEME Agribalyse 3.2, eau du robinet (18066)", grade: "B" },
    ademe_car: { cite: "ADEME Impact CO2, voiture thermique, 2025", grade: "B" },
    mte26: { cite: "Ministère de la Transition écologique, 2026 (2024 data)", grade: "A" },
    greenalliance: { cite: "Green Alliance, Losing the bottle, 2019", grade: "C" },
    kim22: { cite: "Kim et al., J. Korean Soc. Environ. Eng. 44(10), 2022", grade: "A" }
  };

  /** The impact of [litres] with the factors of [country] (CA, US, FR, else the world's): every figure an upper bound. */
  function impact(litres, country) {
    var f = FACTORS[country] || FACTORS.WORLD, l = typeof litres === "number" && isFinite(litres) && litres > 0 ? litres : 0;
    var bottles = l / 0.5, pet = bottles * f.pet / 1000, co2 = l * (f.bottled - f.tap);
    return {
      country: FACTORS[country] ? country : "WORLD", litres: l, bottles: bottles, petKg: pet, co2Kg: co2, carKm: co2 / f.car,
      money: f.price ? { low: bottles * f.price[0], high: bottles * f.price[1], currency: f.currency } : null,
      notCollected: f.collect == null ? null : { bottles: bottles * (1 - f.collect), kg: pet * (1 - f.collect), rate: f.collect }
    };
  }

  // ---- The country of a scope: coarse outlines (a few km near a border may pick the neighbour's factors) ----
  var US48 = [[-124.8, 48.4], [-123.2, 48.3], [-123.0, 49.0], [-95.15, 49.0], [-95.15, 49.38], [-94.8, 49.32], [-93.4, 48.6],
    [-91.4, 48.05], [-89.6, 48.0], [-88.4, 48.3], [-84.8, 46.9], [-84.4, 46.5], [-83.5, 46.0], [-82.5, 45.3], [-82.4, 43.0],
    [-82.5, 42.6], [-83.1, 42.05], [-82.7, 41.7], [-81.0, 42.25], [-79.8, 42.5], [-78.9, 42.9], [-79.05, 43.25], [-79.2, 43.45],
    [-78.0, 43.6], [-76.8, 43.6], [-76.4, 44.1], [-75.8, 44.45], [-74.8, 45.0], [-71.5, 45.01], [-71.08, 45.3], [-70.6, 45.6],
    [-70.25, 45.95], [-70.0, 46.7], [-69.23, 47.45], [-68.3, 47.35], [-67.8, 47.07], [-67.8, 45.7], [-67.43, 45.6], [-67.2, 45.2],
    [-66.95, 44.8], [-67.0, 44.4], [-70.0, 43.6], [-70.6, 41.4], [-72.0, 40.9], [-74.0, 40.4], [-75.5, 38.3], [-75.6, 35.2],
    [-77.9, 33.8], [-80.4, 31.5], [-80.0, 26.0], [-80.4, 25.0], [-81.8, 24.5], [-81.8, 26.0], [-82.8, 28.0], [-83.5, 29.8],
    [-85.0, 29.6], [-88.0, 30.4], [-89.6, 29.0], [-91.5, 29.4], [-94.0, 29.6], [-97.2, 26.0], [-99.1, 26.4], [-100.3, 28.0],
    [-101.4, 29.8], [-102.4, 29.9], [-103.3, 29.0], [-104.6, 29.9], [-106.45, 31.74], [-108.2, 31.78], [-108.2, 31.33], [-111.1, 31.33],
    [-114.8, 32.5], [-117.1, 32.54], [-118.5, 34.0], [-120.6, 34.5], [-122.5, 37.5], [-124.0, 40.4], [-124.2, 43.0], [-124.0, 46.2]];
  var PANHANDLE = [[-133.5, 54.6], [-130.6, 54.7], [-130.0, 56.1], [-131.9, 56.9], [-133.5, 58.4], [-135.0, 59.4], [-137.5, 59.8],
    [-139.1, 60.3], [-141.0, 60.3], [-141.0, 59.5], [-137.0, 57.0]];
  var FRANCE = [[2.55, 51.09], [3.1, 50.78], [4.15, 50.27], [4.85, 50.15], [5.8, 49.55], [6.4, 49.45], [8.2, 48.97], [7.55, 47.55],
    [7.0, 47.5], [6.45, 47.0], [6.1, 46.6], [5.97, 46.2], [6.12, 46.13], [6.25, 46.18], [6.3, 46.38], [6.8, 46.42], [7.0, 45.9],
    [6.8, 45.15], [7.1, 44.85], [6.85, 44.4], [7.7, 44.15], [7.5, 43.78], [7.0, 43.55], [6.2, 43.1], [5.0, 43.35], [4.0, 43.5],
    [3.1, 43.0], [3.15, 42.43], [1.7, 42.5], [0.7, 42.85], [-0.6, 42.8], [-1.8, 43.35], [-1.25, 44.6], [-1.2, 46.0], [-2.2, 47.1],
    [-2.6, 47.5], [-4.4, 47.8], [-4.8, 48.4], [-3.0, 48.85], [-1.6, 48.65], [-1.95, 49.7], [-1.2, 49.65], [0.2, 49.45], [1.5, 50.1],
    [1.6, 50.9]];
  function inside(lon, lat, ring) {
    var ins = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) ins = !ins;
    }
    return ins;
  }
  /** "CA", "US", "FR" or null for a WGS 84 position (metropolitan France with Corsica; the US with Alaska and Hawaii). */
  function countryOf(lat, lon) {
    if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return null;
    if (inside(lon, lat, FRANCE) || (lon >= 8.5 && lon <= 9.6 && lat >= 41.3 && lat <= 43.05)) return "FR";
    if (inside(lon, lat, US48) || (lat > 51 && lat < 72 && (lon < -141 || lon > 172)) || inside(lon, lat, PANHANDLE) ||
        (lat > 18.8 && lat < 22.4 && lon > -160.5 && lon < -154.7)) return "US";
    var greenland = lat > 59.7 && (lon > -60 || (lat > 76 && lon > -71));
    var stPierre = lat > 46.7 && lat < 47.2 && lon > -56.5 && lon < -56.1;
    if (lon >= -141 && lon <= -52.6 && lat >= 41.6 && lat <= 83.5 && !greenland && !stPierre) return "CA";
    return null;
  }
  /**
   * The factor set of a scope: the country of at least 90 % of its points (a stray point doesn't flip it); with no
   * point, the country of [centre] ({lat, lon}); else the world's. The world scope always takes the world's.
   */
  function scopeCountry(kind, points, centre) {
    if (kind === "world") return "WORLD";
    var n = 0, by = {};
    (points || []).forEach(function (p) { var c = countryOf(p.lat, p.lon); n++; by[c] = (by[c] || 0) + 1; });
    if (n) {
      for (var c in by) if (c !== "null" && by[c] >= 0.9 * n) return c;
      return "WORLD";
    }
    return (centre && countryOf(centre.lat, centre.lon)) || "WORLD";
  }

  // ---- Periods: whole complete months (section 80's stats_months) ----
  var ym = function (y, m) { return y + "-" + (m < 10 ? "0" : "") + m; };
  /** The month keys a report may take, newest first: the [n] complete months before [now] (UTC). */
  function months(now, n) {
    var d = new Date(now), y = d.getUTCFullYear(), m = d.getUTCMonth(), out = []; // m: the month under way (0-based)
    for (var i = 0; i < n; i++) { m--; if (m < 0) { m = 11; y--; } out.push(ym(y, m + 1)); }
    return out;
  }
  /** Quarter keys ("2026-Q3") holding at least one complete month among [list] (month keys), newest first. */
  function quarters(list) {
    var out = [];
    list.forEach(function (k) { var q = k.slice(0, 4) + "-Q" + Math.ceil(+k.slice(5, 7) / 3); if (out.indexOf(q) < 0) out.push(q); });
    return out;
  }
  function years(list) {
    var out = [];
    list.forEach(function (k) { if (out.indexOf(k.slice(0, 4)) < 0) out.push(k.slice(0, 4)); });
    return out;
  }
  /** A period key the server takes, or null: "YYYY-MM", "YYYY-Qn", "YYYY", "YYYY-MM..YYYY-MM" (first <= last, <= 36). */
  function periodKey(kind, a, b) {
    var M = /^20\d\d-(0[1-9]|1[0-2])$/;
    if (kind === "month") return M.test(a) ? a : null;
    if (kind === "quarter") return /^20\d\d-Q[1-4]$/.test(a) ? a : null;
    if (kind === "year") return /^20\d\d$/.test(a) ? a : null;
    if (kind !== "range" || !M.test(a) || !M.test(b)) return null;
    var n = (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7)) + 1;
    return n >= 1 && n <= 36 ? (n === 1 ? a : a + ".." + b) : null;
  }
  /** Days between two ISO days, both in. */
  function spanDays(from, to) { return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 864e5) + 1; }
  /** The change from [prev] to [cur] in %, or null when either is hidden or the previous is 0. */
  function change(cur, prev) { return cur == null || prev == null || prev <= 0 ? null : (cur - prev) * 100 / prev; }

  // ---- Reach: residents near points, over the 1 km population cells (EASE-Grid 2.0) ----
  // A cell's residents are taken as spread evenly over it; 10 x 10 samples per cell measure the share within [r] metres.
  var R_EARTH = 6371008.8;
  function metres(lat1, lon1, lat2, lon2) {
    var x = (lon2 - lon1) * D * Math.cos((lat1 + lat2) / 2 * D), y = (lat2 - lat1) * D;
    return Math.sqrt(x * x + y * y) * R_EARTH;
  }
  /** Points bucketed by cell, for [near]. */
  function index(C, pts) {
    var m = new Map();
    pts.forEach(function (p) { var c = C.cellOf(p.lat, p.lon), k = c.ix + ":" + c.iy; if (!m.has(k)) m.set(k, []); m.get(k).push(p); });
    return m;
  }
  /** The cells a point within [r] metres of cell (ix, iy) can be in: [dx, dy] ranges, wider in x near the poles. */
  function span(C, iy, r) {
    var lat = C.cellCentre(0, iy)[1], w = Math.max(50, 1000 * Math.cos(lat * D) / 0.8668), h = 1e6 / w; // a cell is 1 km²
    return [Math.ceil(r / w) + 1, Math.ceil(r / h) + 1];
  }
  function near(C, idx, ix, iy, r) {
    var s = span(C, iy, r), out = [];
    for (var y = iy - s[1]; y <= iy + s[1]; y++) for (var x = ix - s[0]; x <= ix + s[0]; x++) {
      var l = idx.get(x + ":" + y); if (l) out = out.concat(l);
    }
    return out;
  }
  /** The share (0..1) of cell (ix, iy) within [r] metres of one of [pts]. */
  function share(C, ix, iy, pts, r) {
    if (!pts.length) return 0;
    var lons = [], lats = [], hit = 0;
    for (var i = 0; i < 10; i++) { lons.push(C.easeInverse(ix * 1000 + i * 100 + 50, 0)[0]); lats.push(C.easeInverse(0, iy * 1000 + i * 100 + 50)[1]); }
    for (var a = 0; a < 10; a++) for (var b = 0; b < 10; b++) {
      for (var k = 0; k < pts.length; k++) if (metres(lats[a], lons[b], pts[k].lat, pts[k].lon) <= r) { hit++; break; }
    }
    return hit / 100;
  }
  /** The cells (as "ix:iy" keys) whose population [reach] reads for points [pts] and radius [r]. */
  function reachCells(C, pts, r) {
    var keys = new Set();
    pts.forEach(function (p) {
      var c = C.cellOf(p.lat, p.lon), s = span(C, c.iy, r);
      for (var y = c.iy - s[1]; y <= c.iy + s[1]; y++) for (var x = c.ix - s[0]; x <= c.ix + s[0]; x++) keys.add(x + ":" + y);
    });
    return keys;
  }
  /** Residents within [r] metres of at least one of [pts] (each counted once), [popAt](ix, iy) giving a cell's people. */
  function reach(C, pts, r, popAt) {
    var idx = index(C, pts), sum = 0;
    reachCells(C, pts, r).forEach(function (k) {
      var c = k.split(":").map(Number), p = popAt(c[0], c[1]);
      if (p > 0) sum += p * share(C, c[0], c[1], near(C, idx, c[0], c[1], r), r);
    });
    return Math.round(sum);
  }
  /** For [cells] ({ix, iy, population}): the residents farther than [r] from all [pts], in all and by cell. */
  function beyond(C, cells, pts, r) {
    var idx = index(C, pts), sum = 0, by = [];
    cells.forEach(function (c) {
      if (!(c.population > 0)) return;
      var v = c.population * (1 - share(C, c.ix, c.iy, near(C, idx, c.ix, c.iy, r), r));
      sum += v;
      if (v >= 1) by.push({ ix: c.ix, iy: c.iy, people: Math.round(v) });
    });
    by.sort(function (a, b) { return b.people - a.people; });
    return { people: Math.round(sum), cells: by };
  }

  // ---- Recommendations: short, factual, from figures already in the report ----
  /**
   * [d]: { kind, points: [{name, longest, open, uptime, incidents}], repairDays (the scope's median), change (refills
   * vs the previous period, %), beyond: {people, cells: [{people, ix, iy}]} | null, demandTop: {demand, ix, iy} | null }.
   * Returns [{key, ...values}], the most useful first; the page words them in its language.
   */
  function recommendations(d) {
    var out = [], pts = d.points || [];
    var worst = pts.filter(function (p) { return p.longest >= 3; }).sort(function (a, b) { return b.longest - a.longest; })[0];
    if (worst && (d.repairDays == null || worst.longest > d.repairDays)) {
      out.push({ key: worst.open ? "stillBroken" : "longBreak", name: worst.name, days: worst.longest, median: d.repairDays });
    }
    if (d.beyond && d.beyond.people >= 50) {
      var top = d.beyond.cells[0];
      out.push({ key: "beyond", people: d.beyond.people, top: top && top.people >= 50 ? top : null });
    }
    if (d.demandTop) out.push({ key: "demand", demand: d.demandTop.demand, ix: d.demandTop.ix, iy: d.demandTop.iy });
    var low = pts.filter(function (p) { return p.uptime != null && p.uptime < 90; });
    if (low.length) out.push({ key: "lowUptime", n: low.length, names: low.slice(0, 3).map(function (p) { return p.name; }) });
    var never = pts.filter(function (p) { return p.uptime == null; }).length;
    if (never) out.push({ key: "neverChecked", n: never });
    if (d.change != null && Math.abs(d.change) >= 20) out.push({ key: d.change > 0 ? "up" : "down", pct: Math.round(Math.abs(d.change)) });
    return out.slice(0, 6);
  }

  // ---- stats_report's answer, cleaned: unknown keys out, counts only, null kept as "under the floor" ----
  var DAY = /^\d{4}-\d\d-\d\d$/, LOGO = /^[0-9]{1,18}\/logo-[0-9a-f]{32}\.(jpg|png|webp)$/;
  var TYPES = ["FOUNTAIN", "WATER_REFILL", "DOG_WATER", "RESTROOM", "COMBO"], STATUSES = ["working", "not_working", "low_pressure", "dirty", "closed_season"];
  function cnt(v) { return typeof v === "number" && isFinite(v) && v >= 0 ? Math.floor(v) : null; }
  function num(v, max) { return typeof v === "number" && isFinite(v) && v >= 0 && v <= max ? v : null; }
  function day(v) { return typeof v === "string" && DAY.test(v) ? v : null; }
  function series(a, n) {
    return (Array.isArray(a) ? a : []).filter(function (x) { return x && day(x.t); }).slice(0, n)
      .map(function (x) { return { t: x.t, refills: cnt(x.refills) }; });
  }
  /** [b] cleaned with core.js's helpers [C] (its text cleaner and its territory check); null when unusable. */
  function cleanReport(b, C) {
    if (!b || typeof b !== "object" || Array.isArray(b)) return null;
    var pe = b.period || {}, t = b.totals || {}, pv = b.previous || {}, sc = b.scope || {}, k = b.k || {};
    if (!day(pe.from) || !day(pe.to)) return null;
    var buckets = function (a, n) { return Array.isArray(a) && a.length === n ? a.map(cnt) : null; };
    var points = (Array.isArray(b.points) ? b.points : []).filter(function (p) {
      return p && typeof p.id === "number" && Math.floor(p.id) === p.id && p.id > 0 && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
    }).slice(0, 1000).map(function (p) {
      return { id: p.id, name: C.text(p.name), type: TYPES.indexOf(p.type) >= 0 ? p.type : "FOUNTAIN", lat: +p.lat, lon: +p.lon,
               status: STATUSES.indexOf(p.status) >= 0 ? p.status : null, checkedOn: day(p.checked_on), flagged: p.flagged === true,
               refills: cnt(p.refills), people: cnt(p.people), arrivals: cnt(p.arrivals), checks: cnt(p.checks), photos: cnt(p.photos),
               reviews: cnt(p.reviews), rating: num(p.rating, 5), cleanliness: num(p.cleanliness, 5), pressure: num(p.pressure, 5),
               uptime: num(p.uptime, 100), incidents: cnt(p.incidents) || 0, repairDays: num(p.repair_days, 1e5),
               longest: cnt(p.longest), open: p.open === true };
    });
    return {
      scope: { key: C.text(sc.key, 40), kind: ["world", "partner", "org"].indexOf(sc.kind) >= 0 ? sc.kind : "world", name: C.text(sc.name, 80),
               logo: typeof sc.logo === "string" && LOGO.test(sc.logo) ? sc.logo : null },
      period: { key: C.text(pe.key, 20), from: pe.from, to: pe.to, step: pe.step === "month" ? "month" : "day", months: cnt(pe.months) || 1,
                prevFrom: day(pe.prev_from), prevTo: day(pe.prev_to) },
      generated: day(b.generated), k: { people: cnt(k.people) || 10, anonymous: cnt(k.anonymous) || 10 }, rounded: b.rounded === true,
      hasDemand: b.has_demand === true,
      totals: { refills: cnt(t.refills), people: cnt(t.people), litres: cnt(t.litres), unplaced: cnt(t.unplaced), points: cnt(t.points) || 0,
                water: cnt(t.water) || 0, toilets: cnt(t.toilets) || 0, broken: cnt(t.broken) || 0, arrivals: cnt(t.arrivals),
                demand: cnt(t.demand), checks: cnt(t.checks), photos: cnt(t.photos), reviews: cnt(t.reviews), rating: num(t.rating, 5),
                cleanliness: num(t.cleanliness, 5), pressure: num(t.pressure, 5), repairs: cnt(t.repairs) || 0,
                repairDays: num(t.repair_days, 1e5), openRepairs: cnt(t.open_repairs) || 0, uptime: num(t.uptime, 100) },
      previous: { refills: cnt(pv.refills), people: cnt(pv.people), litres: cnt(pv.litres), arrivals: cnt(pv.arrivals), demand: cnt(pv.demand) },
      series: series(b.series, 400), months: series(b.months, 24), seasons: series(b.seasons, 8),
      weekdays: buckets(b.weekdays, 7), hours: buckets(b.hours, 4), points: points,
      demandCells: (Array.isArray(b.demand_cells) ? b.demand_cells : []).filter(function (c) {
        return c && typeof c.ix === "number" && typeof c.iy === "number" && Math.floor(c.ix) === c.ix && Math.floor(c.iy) === c.iy && cnt(c.demand) !== null;
      }).slice(0, 200).map(function (c) { return { ix: c.ix, iy: c.iy, demand: cnt(c.demand) }; }),
      territory: C.cleanOverview({ period: { from: pe.from, to: pe.to }, territory: b.territory }).territory
    };
  }

  /**
   * Section 80's controlled rounding (private.stats_round), for the demo preview and the test: [n] to a multiple of 5,
   * up when [h] (the first 32 bits of md5(salt|n), the server's draw) is under (n mod 5) / 5 of 2^32.
   */
  function round5(n, h) { return n % 5 === 0 ? n : n - (n % 5) + (h < (n % 5) * 858993459.2 ? 5 : 0); }

  /** [s] as a CSS string literal, every character but letters, digits and spaces escaped (the print header's text). */
  function cssString(s) {
    return '"' + String(s).replace(/[^A-Za-z0-9 ]/gu, function (c) { return "\\" + c.codePointAt(0).toString(16) + " "; }) + '"';
  }

  var api = { FACTORS: FACTORS, SOURCES: SOURCES, impact: impact, countryOf: countryOf, scopeCountry: scopeCountry,
              months: months, quarters: quarters, years: years, periodKey: periodKey, spanDays: spanDays, change: change,
              metres: metres, share: share, reach: reach, reachCells: reachCells, beyond: beyond, recommendations: recommendations,
              cleanReport: cleanReport, round5: round5, cssString: cssString };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WNR = api;
})(this);
