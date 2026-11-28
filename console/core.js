/*
 * WaterNow Statistics, the private console (console/): pure helpers shared by the page (window.WNC), the preview
 * server and import script (scripts/), and the node test (site/assets/console.test.js). Nothing here touches the DOM.
 *
 * The grid is EASE-Grid 2.0 Global (EPSG:6933: Lambert cylindrical equal-area on the WGS 84 ellipsoid, true scale at
 * 30°) cut in 1000 m squares, as section 80 cuts it. Cylindrical: a cell's edges are a meridian and a parallel, so on
 * the web map every cell is an upright rectangle and the grid tiles without a slant; equal-area: every cell is 1 km².
 * The formulas below give PostGIS's ST_Transform to the millimetre (checked in the test).
 */
(function (root) {
  "use strict";
  var A = 6378137, F = 1 / 298.257223563, E2 = F * (2 - F), E = Math.sqrt(E2), D = Math.PI / 180;
  var K0 = Math.cos(30 * D) / Math.sqrt(1 - E2 * 0.25); // the scale along the parallels at 30°
  var TYPES = ["FOUNTAIN", "WATER_REFILL", "DOG_WATER", "RESTROOM", "COMBO"];
  var STATUSES = ["working", "not_working", "low_pressure", "dirty", "closed_season"];
  var DAY = /^\d{4}-\d\d-\d\d$/;

  /** Snyder's q (authalic), (3-12). */
  function qOf(s) { return (1 - E2) * (s / (1 - E2 * s * s) - Math.log((1 - E * s) / (1 + E * s)) / (2 * E)); }
  var QP = qOf(1);

  /** [x, y] in metres (EPSG:6933) of a WGS 84 position. */
  function easeForward(lat, lon) { return [A * K0 * lon * D, A * qOf(Math.sin(lat * D)) / (2 * K0)]; }

  /** [lon, lat] of a point in metres (EPSG:6933): Newton on q (Snyder 3-16), a few steps to 1e-15. */
  function easeInverse(x, y) {
    var q = Math.max(-QP, Math.min(QP, 2 * y * K0 / A)), lon = x / (A * K0) / D;
    if (Math.abs(q) >= QP - 1e-15) return [lon, q > 0 ? 90 : -90];
    var p = Math.asin(q / 2);
    for (var i = 0; i < 12; i++) {
      var s = Math.sin(p), w = 1 - E2 * s * s;
      var dp = w * w / (2 * Math.cos(p)) * (q / (1 - E2) - s / w + Math.log((1 - E * s) / (1 + E * s)) / (2 * E));
      p += dp;
      if (Math.abs(dp) < 1e-15) break;
    }
    return [lon, p / D];
  }

  /** The 1 km cell of a position: {ix, iy}, as private.stats_cell. */
  function cellOf(lat, lon) {
    var m = easeForward(lat, lon);
    return { ix: Math.floor(m[0] / 1000), iy: Math.floor(m[1] / 1000) };
  }

  /** A cell's centre as [lon, lat]. */
  function cellCentre(ix, iy) { return easeInverse((ix + 0.5) * 1000, (iy + 0.5) * 1000); }

  var r7 = function (v) { return Math.round(v * 1e7) / 1e7; };
  /**
   * A cell's outline, a closed GeoJSON ring of [lon, lat]: two meridians and two parallels, an upright rectangle.
   * [size] in metres: 1000 for the 1 km grid, 8000 or 64000 for the population's zoomed-out levels.
   */
  function cellRing(ix, iy, size) {
    var z = size || 1000, sw = easeInverse(ix * z, iy * z), ne = easeInverse(ix * z + z, iy * z + z);
    var w = r7(sw[0]), s = r7(sw[1]), e = r7(ne[0]), n = r7(ne[1]);
    return [[w, s], [e, s], [e, n], [w, n], [w, s]];
  }

  /**
   * The cells ix0..ix1 × iy0..iy1 (of [size] metres) as GeoJSON rectangles, [cls](ix, iy) giving each one's class (a
   * number) or null for nothing. A row's neighbours of the same class merge into one rectangle (a row of cells shares
   * its parallels), so a city is a few hundred features, not tens of thousands.
   */
  function rowRuns(ix0, ix1, iy0, iy1, size, cls) {
    var out = [];
    for (var iy = iy1; iy >= iy0; iy--) {
      var s = r7(easeInverse(0, iy * size)[1]), n = r7(easeInverse(0, iy * size + size)[1]), start = 0, b = null;
      for (var ix = ix0; ix <= ix1 + 1; ix++) {
        var c = ix <= ix1 ? cls(ix, iy) : null;
        if (c === b) continue;
        if (b !== null) {
          var w = r7(easeInverse(start * size, 0)[0]), e = r7(easeInverse(ix * size, 0)[0]);
          out.push({ type: "Feature", properties: { b: b }, geometry: { type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } });
        }
        b = c; start = ix;
      }
    }
    return out;
  }

  /**
   * A population block, inflated (scripts/build-population-tiles.mjs): uint32 people per cell, little-endian, stored
   * byte-shuffled (all the low bytes, then the next…). 256 × 256 cells, rows north to south.
   */
  function unshuffle(b) {
    var n = b.length >> 2, out = new Uint32Array(n);
    for (var i = 0; i < n; i++) out[i] = b[i] | (b[n + i] << 8) | (b[2 * n + i] << 16) | (b[3 * n + i] << 24);
    return out;
  }

  /** A whole count >= 0, or null (the server's "under the floor", or anything that isn't a count). */
  function count(v) { return typeof v === "number" && isFinite(v) && v >= 0 ? Math.floor(v) : null; }
  function int(v) { return typeof v === "number" && isFinite(v) && Math.floor(v) === v ? v : null; }
  function day(v) { return typeof v === "string" && DAY.test(v) ? v : null; }
  function real(v) { return typeof v === "number" && isFinite(v) && v >= 0 ? v : null; }

  // Control characters and direction overrides out, one line, at most 120 characters (a point's or a city's name).
  var UNSAFE = /[\u0000-\u001F\u007F-\u009F‎‏‪-‮⁦-⁩]/g;
  function text(v, max) {
    if (typeof v !== "string") return "";
    return Array.from(v.replace(/\s+/g, " ").replace(UNSAFE, "").trim()).slice(0, max || 120).join("");
  }

  /** stats_overview's answer reduced to what the page draws; null when unusable. Unknown keys are dropped. */
  function cleanOverview(b) {
    if (!b || typeof b !== "object" || Array.isArray(b)) return null;
    var pe = b.period || {}, k = b.k || {}, t = b.totals || {}, sc = b.scope || {};
    if (!day(pe.from) || !day(pe.to)) return null;
    var cells = (Array.isArray(b.cells) ? b.cells : []).filter(function (c) {
      return c && int(c.ix) !== null && int(c.iy) !== null && Math.abs(c.ix) <= 18041 && Math.abs(c.iy) <= 9021;
    }).slice(0, 25000).map(function (c) {
      return { ix: c.ix, iy: c.iy, refills: count(c.refills), people: count(c.people), water: count(c.water) || 0,
               toilets: count(c.toilets) || 0, broken: count(c.broken) || 0, demand: count(c.demand), population: null };
    });
    // A city's cells, as rows [iy, first ix, last ix] (the page sums their population).
    var territory = Array.isArray(b.territory) ? b.territory.filter(function (r) {
      return Array.isArray(r) && r.length === 3 && int(r[0]) !== null && int(r[1]) !== null && int(r[2]) !== null && r[1] <= r[2] &&
             r[2] - r[1] < 20000 && Math.abs(r[0]) <= 7343 && Math.abs(r[1]) <= 17368 && Math.abs(r[2]) <= 17368;
    }).slice(0, 40000).map(function (r) { return [r[0], r[1], r[2]]; }) : null;
    var points = (Array.isArray(b.points) ? b.points : []).filter(function (p) {
      return p && int(p.id) !== null && p.id > 0 && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
    }).slice(0, 300).map(function (p) {
      return { id: p.id, name: text(p.name), type: TYPES.indexOf(p.type) >= 0 ? p.type : "FOUNTAIN", lat: +p.lat, lon: +p.lon,
               ix: int(p.ix), iy: int(p.iy), seasonal: typeof p.seasonal === "string" ? p.seasonal.slice(0, 40) : "",
               status: STATUSES.indexOf(p.status) >= 0 ? p.status : null, checkedOn: day(p.checked_on), flagged: p.flagged === true,
               refills: count(p.refills), people: count(p.people), arrivals: count(p.arrivals), works: count(p.works),
               broken: count(p.broken) };
    });
    return {
      scope: { key: text(sc.key, 40), kind: ["world", "partner", "org"].indexOf(sc.kind) >= 0 ? sc.kind : "world", name: text(sc.name, 80) },
      period: { key: text(pe.key, 10), from: pe.from, to: pe.to, step: pe.step === "month" ? "month" : "day" },
      k: { people: count(k.people) || 10, anonymous: count(k.anonymous) || 10 },
      hasDemand: b.has_demand !== false,
      totals: { refills: count(t.refills), people: count(t.people), bottles: count(t.bottles), litres: count(t.litres),
                unplaced: count(t.unplaced), water: count(t.water) || 0, toilets: count(t.toilets) || 0, points: count(t.points) || 0,
                broken: count(t.broken) || 0, demand: count(t.demand), arrivals: count(t.arrivals), repairs: count(t.repairs) || 0,
                repairDays: real(t.repair_days), openRepairs: count(t.open_repairs) || 0, population: 0 },
      territory: territory,
      trend: (Array.isArray(b.trend) ? b.trend : []).filter(function (x) { return x && day(x.t); }).slice(0, 400)
        .map(function (x) { return { t: x.t, refills: count(x.refills) }; }),
      cells: cells, points: points
    };
  }

  /** stats_point's answer, cleaned; null when it isn't one (not_found included). */
  function cleanPoint(b) {
    if (!b || b.result !== "ok" || !b.point || int(b.point.id) === null) return null;
    var p = b.point, s = b.series || {}, rp = b.repairs || {};
    function series(a) {
      return (Array.isArray(a) ? a : []).filter(function (x) { return x && day(x.t); }).slice(0, 40)
        .map(function (x) { return { t: x.t, refills: count(x.refills) }; });
    }
    return {
      k: count((b.k || {}).people) || 10,
      point: { id: p.id, name: text(p.name), type: TYPES.indexOf(p.type) >= 0 ? p.type : "FOUNTAIN", lat: +p.lat, lon: +p.lon,
               seasonal: typeof p.seasonal === "string" ? p.seasonal.slice(0, 40) : "",
               status: STATUSES.indexOf(p.status) >= 0 ? p.status : null, checkedOn: day(p.checked_on), flagged: p.flagged === true },
      allTime: { refills: count((b.all_time || {}).refills), people: count((b.all_time || {}).people) },
      series: { day: series(s.day), week: series(s.week), month: series(s.month), season: series(s.season) },
      months: (Array.isArray(b.months) ? b.months : []).filter(function (x) { return x && day(x.t); }).slice(0, 13)
        .map(function (x) { return { t: x.t, works: count(x.works), broken: count(x.broken), arrivals: count(x.arrivals) }; }),
      repairs: { median: real(rp.median_days),
                 list: (Array.isArray(rp.list) ? rp.list : []).filter(function (x) { return x && day(x.broken_on); }).slice(0, 12)
                   .map(function (x) { return { from: x.broken_on, to: day(x.fixed_on), days: count(x.days) }; }) }
    };
  }

  /**
   * What a cell tells once its figures are known: refills per 1,000 residents, residents per working water point, and
   * a need score in [0, 1]: (no working point = 1, one = 1/2, n = 1/(n+1)) x (60 % population up to 5,000 per km2
   * + 40 % searches without result up to 50). "Underserved" from 0.35. Only what the page shows goes in: a hidden
   * figure (null) counts as nothing.
   */
  function derive(c) {
    var working = Math.max(0, (c.water || 0) - (c.broken || 0)), pop = c.population || 0;
    var gap = 1 / (1 + working);
    var score = gap * (0.6 * Math.min(1, pop / 5000) + 0.4 * Math.min(1, (c.demand || 0) / 50));
    return {
      per1000: c.refills != null && pop >= 1 ? c.refills * 1000 / pop : null,
      perPoint: pop >= 1 ? (working > 0 ? pop / working : null) : null,
      noPoint: pop >= 1 && working === 0,
      density: pop || null,
      score: Math.round(score * 100) / 100,
      underserved: score >= 0.35
    };
  }

  /** Up to [n] class breaks of the positive values [vs] (quantiles, distinct, ascending). */
  function breaks(vs, n) {
    var a = vs.filter(function (v) { return typeof v === "number" && isFinite(v) && v > 0; }).sort(function (x, y) { return x - y; });
    if (!a.length) return [];
    var out = [];
    for (var i = 1; i < n; i++) {
      var q = a[Math.min(a.length - 1, Math.floor(i * a.length / n))];
      if (out.indexOf(q) < 0) out.push(q);
    }
    return out;
  }
  /** The class (0..breaks.length) of [v]; -1 without a value. */
  function classOf(v, br) {
    if (typeof v !== "number" || !isFinite(v) || v <= 0) return -1;
    var i = 0;
    while (i < br.length && v >= br[i]) i++;
    return i;
  }

  /**
   * CSV (RFC 4180, CRLF) of rows of values; a text that a spreadsheet would run as a formula (= + - @, tab, line ends,
   * and their full-width forms, which some spreadsheets read as the same) gets a leading quote.
   */
  function csv(rows) {
    return rows.map(function (r) {
      return r.map(function (v) {
        if (v == null) return "";
        var s = String(v);
        if (typeof v !== "number" && /^[=+\-@\t\r\n＝＋－＠]/.test(s)) s = "'" + s;
        return /[",\r\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(",");
    }).join("\r\n") + "\r\n";
  }

  /** Romanian puts "de" between a number and its noun from 20 on (20 de, 101, 120 de). */
  function roDe(n) { return n % 100 >= 20 || (n > 0 && n % 100 === 0) ? " de" : ""; }

  /** The meteorological season a bucket starting on [d] ("YYYY-MM-DD") begins: winter (Dec), spring, summer, autumn. */
  function seasonOf(d) {
    var m = +String(d).slice(5, 7);
    return m === 12 || m <= 2 ? "winter" : m <= 5 ? "spring" : m <= 8 ? "summer" : "autumn";
  }

  /** "YYYY-MM" of the last complete month before [now] (UTC). */
  function lastMonth(now) {
    var d = new Date(now);
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toISOString().slice(0, 7);
  }

  /** The digits of a typed or pasted code ("123 456"), at most 6. */
  function totpDigits(raw) { return String(raw || "").replace(/\D/g, "").slice(0, 6); }

  /**
   * The otpauth link for an authenticator, rebuilt as the app does (SupabaseMfa.totpUri): labelled
   * "WaterNow:Statistics", never the account's email (the server puts it in its label); the server's code settings
   * kept when sane. Null for a secret that isn't base32.
   */
  function totpUri(secret, server) {
    if (typeof secret !== "string" || !/^[A-Z2-7]{16,128}=*$/.test(secret)) return null;
    var keep = [], seen = {};
    (String(server || "").split("?")[1] || "").split("&").forEach(function (p) {
      var kv = p.split("="), k = kv[0], v = kv[1] || "";
      var ok = (k === "algorithm" && /^(SHA1|SHA256|SHA512)$/i.test(v)) || (k === "digits" && v === "6") ||
               (k === "period" && +v >= 15 && +v <= 120);
      if (ok && !seen[k]) { seen[k] = 1; keep.push(k + "=" + (k === "algorithm" ? v.toUpperCase() : v)); }
    });
    return ["otpauth://totp/WaterNow:Statistics?secret=" + secret + "&issuer=WaterNow"].concat(keep).join("&");
  }

  /** "ABCD EFGH …": easier to type into an app on another phone. */
  function groupSecret(s) { return String(s).replace(/(.{4})/g, "$1 ").trim(); }

  /** easeOutCubic, for the count-up. */
  function ease(t) { return 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3); }

  var api = {
    TYPES: TYPES, STATUSES: STATUSES,
    easeForward: easeForward, easeInverse: easeInverse, cellOf: cellOf, cellCentre: cellCentre, cellRing: cellRing, rowRuns: rowRuns,
    unshuffle: unshuffle,
    cleanOverview: cleanOverview, cleanPoint: cleanPoint, derive: derive, breaks: breaks, classOf: classOf, csv: csv,
    roDe: roDe, seasonOf: seasonOf, lastMonth: lastMonth, totpDigits: totpDigits, totpUri: totpUri, groupSecret: groupSecret,
    ease: ease, text: text
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WNC = api;
})(this);
