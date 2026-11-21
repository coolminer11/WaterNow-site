/*
 * WaterNow Statistics, private console: the pure maths of the fountain simulator and of the coverage, equity,
 * reliability and freshness panels (window.WNS), shared with the node test (site/assets/console-sim.test.js) and the
 * preview (scripts/console-preview.mjs). Nothing here touches the DOM.
 *
 * Residents: the console's 1 km EASE-Grid 2.0 cells (GHS-POP 2025, real), each cut in n x n samples of equal area (the
 * grid is equal-area), each holding 1/n² of the cell's residents at its centre. A ring then takes the samples inside
 * it, which weights a partly covered cell by its overlap. Distances are local metres (equirectangular around the
 * area's centre: well under 1 % off across a city). Walking: about 80 m a minute with a street detour of 1.3 over the
 * straight line, so the 5 and 10 minute rings are 400 and 800 m walked, 308 and 615 m as the crow flies.
 */
(function (root) {
  "use strict";
  var C = typeof module === "object" && module.exports ? require("./core.js") : root.WNC;
  var WALK_PER_MIN = 80, DETOUR = 1.3, WALK = [400, 800];
  var R = WALK.map(function (w) { return w / DETOUR; });
  var CAP = 1000; // straight-line metres: farther is "nothing within reach" (1.3 km walked and more)
  var DAY = 86400000;

  /** Local metres around (lat0, lon0), and back. */
  function proj(lat0, lon0) {
    var p = lat0 * Math.PI / 180;
    var ky = 111132.954 - 559.822 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p);
    var kx = 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p);
    return { x: function (lon) { return (lon - lon0) * kx; }, y: function (lat) { return (lat - lat0) * ky; },
             lon: function (x) { return lon0 + x / kx; }, lat: function (y) { return lat0 + y / ky; } };
  }

  /** A bucket grid over positions xs, ys (count of them), [size] metres: linked lists in typed arrays. */
  function grid(xs, ys, count, size) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, i;
    for (i = 0; i < count; i++) { if (xs[i] < x0) x0 = xs[i]; if (xs[i] > x1) x1 = xs[i]; if (ys[i] < y0) y0 = ys[i]; if (ys[i] > y1) y1 = ys[i]; }
    if (!count) { x0 = y0 = x1 = y1 = 0; }
    var nx = Math.floor((x1 - x0) / size) + 1, ny = Math.floor((y1 - y0) / size) + 1;
    var head = new Int32Array(nx * ny).fill(-1), next = new Int32Array(Math.max(1, count));
    for (i = 0; i < count; i++) {
      var b = Math.floor((ys[i] - y0) / size) * nx + Math.floor((xs[i] - x0) / size);
      next[i] = head[b]; head[b] = i;
    }
    return { xs: xs, ys: ys, x0: x0, y0: y0, nx: nx, ny: ny, size: size, head: head, next: next };
  }
  /** fn(i, d²) for every position of [g] within [r] of (x, y). */
  function near(g, x, y, r, fn) {
    var s = g.size, r2 = r * r;
    var gx0 = Math.max(0, Math.floor((x - r - g.x0) / s)), gx1 = Math.min(g.nx - 1, Math.floor((x + r - g.x0) / s));
    var gy0 = Math.max(0, Math.floor((y - r - g.y0) / s)), gy1 = Math.min(g.ny - 1, Math.floor((y + r - g.y0) / s));
    for (var gy = gy0; gy <= gy1; gy++) for (var gx = gx0; gx <= gx1; gx++) {
      for (var i = g.head[gy * g.nx + gx]; i >= 0; i = g.next[i]) {
        var dx = g.xs[i] - x, dy = g.ys[i] - y, d2 = dx * dx + dy * dy;
        if (d2 <= r2) fn(i, d2);
      }
    }
  }

  /**
   * The samples of [cells] ([{ix, iy, pop}], pop > 0) in projection [P]: n x n per cell, each 1/n² of its residents.
   * Sample k is in cell floor(k / n²), sub-square (k mod n², row-major from the south-west).
   */
  function sample(cells, P, n) {
    n = n || 10;
    var N = cells.length * n * n, x = new Float64Array(N), y = new Float64Array(N), w = new Float64Array(N), k = 0, rows = new Map();
    cells.forEach(function (cl) {
      var lats = rows.get(cl.iy), share = cl.pop / (n * n), j, i;
      if (!lats) { lats = []; for (j = 0; j < n; j++) lats.push(P.y(C.easeInverse(0, (cl.iy + (j + 0.5) / n) * 1000)[1])); rows.set(cl.iy, lats); }
      for (j = 0; j < n; j++) for (i = 0; i < n; i++) {
        x[k] = P.x(C.easeInverse((cl.ix + (i + 0.5) / n) * 1000, 0)[0]); y[k] = lats[j]; w[k] = share; k++;
      }
    });
    return { x: x, y: y, w: w, n: n, N: N, cells: cells, g: grid(x, y, N, 250) };
  }
  /** Sample k's square as a closed GeoJSON ring of [lon, lat] (for the map). */
  function sampleRing(S, k) {
    var n = S.n, cl = S.cells[Math.floor(k / (n * n))], sub = k % (n * n), i = sub % n, j = Math.floor(sub / n);
    var sw = C.easeInverse((cl.ix + i / n) * 1000, (cl.iy + j / n) * 1000), ne = C.easeInverse((cl.ix + (i + 1) / n) * 1000, (cl.iy + (j + 1) / n) * 1000);
    return [[sw[0], sw[1]], [ne[0], sw[1]], [ne[0], ne[1]], [sw[0], ne[1]], [sw[0], sw[1]]];
  }

  /** Points ({x, y}) as a grid, for nearest(). */
  function pointGrid(pts) {
    var xs = new Float64Array(pts.length), ys = new Float64Array(pts.length);
    pts.forEach(function (p, i) { xs[i] = p.x; ys[i] = p.y; });
    return grid(xs, ys, pts.length, 500);
  }
  /** The nearest point of grid [g] to (x, y) within [cap]: {i, d}, or null. */
  function closest(g, x, y, cap) {
    var best = -1, b2 = Infinity;
    near(g, x, y, cap == null ? CAP : cap, function (i, d2) { if (d2 < b2) { b2 = d2; best = i; } });
    return best < 0 ? null : { i: best, d: Math.sqrt(b2) };
  }
  /** For each sample, the straight-line distance to the nearest of [pts]: Infinity past [cap] (CAP by default). */
  function distances(S, pts, cap) {
    var g = pointGrid(pts), out = new Float64Array(S.N);
    for (var k = 0; k < S.N; k++) { var c = closest(g, S.x[k], S.y[k], cap); out[k] = c ? c.d : Infinity; }
    return out;
  }

  /** The sum of [w] (the residents by default) over the samples within [r] of at least one of [at] ({x, y}): no double count. */
  function within(S, at, r, w) {
    w = w || S.w;
    var seen = new Uint8Array(S.N), sum = 0;
    at.forEach(function (c) { near(S.g, c.x, c.y, r, function (i) { if (!seen[i]) { seen[i] = 1; sum += w[i]; } }); });
    return sum;
  }
  /**
   * Residents newly within [r] (straight line) of one of the candidates [at]: their nearest point today ([dist]) is
   * farther than [r]. A resident near two candidates counts once. {pop, idx: the samples}.
   */
  function newly(S, dist, at, r) {
    var seen = new Uint8Array(S.N), pop = 0, idx = [];
    at.forEach(function (c) {
      near(S.g, c.x, c.y, r, function (i) { if (!seen[i] && dist[i] > r) { seen[i] = 1; pop += S.w[i]; idx.push(i); } });
    });
    return { pop: pop, idx: idx };
  }

  /**
   * The best spots, one after the other (greedy): each the candidate adding the most among the samples not served yet,
   * scored wPop x residents + wDemand x searches with no result. Candidates: a lattice of [step] m over the samples left
   * unserved. Up to [k] picks: [{x, y, gain, pop}] (pop: the residents it newly serves, after the picks before it).
   */
  function suggest(S, dist, r, o) {
    o = o || {};
    var k = o.k || 5, step = o.step || 200, wp = o.wPop == null ? 1 : o.wPop, wd = o.wDemand || 0, dem = o.demand || null;
    var val = new Float64Array(S.N), pop = new Float64Array(S.N), cands = new Map(), picks = [];
    for (var i = 0; i < S.N; i++) {
      if (!(dist[i] > r)) continue;
      pop[i] = S.w[i];
      val[i] = wp * S.w[i] + (dem ? wd * dem[i] : 0);
      if (val[i] > 0) { var gx = Math.round(S.x[i] / step), gy = Math.round(S.y[i] / step); cands.set(gx + ":" + gy, [gx * step, gy * step]); }
    }
    for (var t = 0; t < k; t++) {
      var best = null, bg = 0;
      cands.forEach(function (c) {
        var g = 0;
        near(S.g, c[0], c[1], r, function (j) { g += val[j]; });
        if (g > bg + 1e-9) { bg = g; best = c; }
      });
      if (!best) break;
      var got = 0;
      near(S.g, best[0], best[1], r, function (j) { got += pop[j]; val[j] = 0; pop[j] = 0; });
      picks.push({ x: best[0], y: best[1], gain: bg, pop: got });
    }
    return picks;
  }

  /** The share of the residents within [r] of a point (by [dist]); null without residents. */
  function share(S, dist, r) {
    var a = 0, t = 0;
    for (var i = 0; i < S.N; i++) { t += S.w[i]; if (dist[i] <= r) a += S.w[i]; }
    return t > 0 ? a / t : null;
  }

  /**
   * How evenly access is spread over the area's cells, by [dist] and the 5 minute ring [r]:
   * - lorenz: the cells from the worst served to the best, [cumulative share of residents, of residents served];
   * - gini: 0 when every cell is served alike, towards 1 when the access sits in a few cells;
   * - worst: the fifth of the populated cells farthest from a point: their share of the residents and their mean walk
   *   (m, straight line x 1.3, capped at CAP x 1.3).
   * Null without residents or without anyone served.
   */
  function equity(S, dist, r) {
    var n2 = S.n * S.n, cells = S.cells.map(function () { return { pop: 0, served: 0, d: 0 }; });
    for (var i = 0; i < S.N; i++) {
      var c = cells[Math.floor(i / n2)];
      c.pop += S.w[i]; c.d += S.w[i] * Math.min(dist[i], CAP);
      if (dist[i] <= r) c.served += S.w[i];
    }
    var list = cells.filter(function (c) { return c.pop > 0; });
    var tp = list.reduce(function (s, c) { return s + c.pop; }, 0), ts = list.reduce(function (s, c) { return s + c.served; }, 0);
    if (!(tp > 0) || !(ts > 0)) return null;
    list.sort(function (a, b) { return a.served / a.pop - b.served / b.pop || b.d / b.pop - a.d / a.pop; });
    var lorenz = [[0, 0]], cx = 0, cy = 0, area = 0;
    list.forEach(function (c) {
      var nx = cx + c.pop / tp, ny = cy + c.served / ts;
      area += (nx - cx) * (ny + cy) / 2;
      cx = nx; cy = ny; lorenz.push([cx, cy]);
    });
    var byDist = list.slice().sort(function (a, b) { return b.d / b.pop - a.d / a.pop; }), m = Math.max(1, Math.ceil(list.length * 0.2));
    var wp = 0, wd = 0;
    byDist.slice(0, m).forEach(function (c) { wp += c.pop; wd += c.d; });
    return { lorenz: lorenz, gini: Math.max(0, Math.min(1, 1 - 2 * area)), cells: list.length,
             worst: { cells: m, popShare: wp / tp, walk: wd / wp * DETOUR } };
  }

  /** Type-7 quantile of an ascending array. */
  function quantile(a, q) {
    if (!a.length) return null;
    var h = (a.length - 1) * q, lo = Math.floor(h), hi = Math.min(lo + 1, a.length - 1);
    return a[lo] + (a[hi] - a[lo]) * (h - lo);
  }
  /** Density bands by the residents within 500 m of a point: under 2,000, 2,000 to 6,000, from 6,000. */
  var BANDS = [2000, 6000];
  function band(res) { return res < BANDS[0] ? 0 : res < BANDS[1] ? 1 : 2; }
  /**
   * Refills per resident per day at the scope's own points, by band: [{res, perDay}] in (res: residents within 500 m,
   * perDay: refills a day, a point under the floor counted as 0). Points with under 100 residents around are left out.
   */
  function calibrate(obs) {
    var bands = [[], [], []], all = [];
    obs.forEach(function (o) {
      if (!(o.res >= 100) || !(o.perDay >= 0)) return;
      var v = o.perDay / o.res;
      bands[band(o.res)].push(v); all.push(v);
    });
    var up = function (a, b) { return a - b; };
    bands.forEach(function (b) { b.sort(up); }); all.sort(up);
    return { bands: bands, all: all };
  }
  /**
   * Refills a day at a new point with [res] residents within 500 m: the interquartile range of its band's rates (at
   * least [min] points), else of every point ("all"), else null (too little data).
   */
  function estimate(cal, res, min) {
    min = min || 5;
    var b = band(res), a = cal.bands[b], src = "band";
    if (a.length < min) { a = cal.all; src = "all"; }
    if (a.length < min) return null;
    return { lo: res * quantile(a, 0.25), mid: res * quantile(a, 0.5), hi: res * quantile(a, 0.75), n: a.length, band: b, src: src };
  }

  /**
   * Country defaults of docs/15b_IMPACT_FACTORS.md (section 10), per 500 ml bottle-equivalent: PET g (bottle only),
   * net kg CO2e per litre (bottled minus tap), bottle price floor and on-the-go. The world set has no price.
   */
  var FACTORS = {
    CA: { pet: 9.25, co2: 0.182, cur: "CAD", lo: 0.72, hi: 2.21 },
    US: { pet: 9.25, co2: 0.182, cur: "USD", lo: 0.41, hi: 1.60 },
    FR: { pet: 12, co2: 0.320, cur: "EUR", lo: 0.24, hi: 1.88 },
    WORLD: { pet: 10, co2: 0.165, cur: null, lo: null, hi: null }
  };
  /**
   * A first guess of the factor set from a position (the page lets the user change it): the impact report's own
   * country outlines (impact.js), so Geneva, Brussels or Barcelona aren't France and Windsor isn't the United States.
   */
  function countryOf(lat, lon) {
    var R = typeof module === "object" && module.exports ? require("./impact.js") : root.WNR;
    return (R && R.countryOf(lat, lon)) || "WORLD";
  }
  /**
   * A year of [perDay] refills ({lo, hi}) of [litres] each: bottle-equivalents (500 ml), kg of PET, kg CO2e (net) and
   * the money people would have paid (low refills at the floor price, high refills at the on-the-go price).
   */
  function impact(perDay, f, litres) {
    var l = litres > 0 ? litres : 0.5, y = 365;
    var b = { lo: perDay.lo * y * l / 0.5, hi: perDay.hi * y * l / 0.5 };
    return { bottles: b, pet: { lo: b.lo * f.pet / 1000, hi: b.hi * f.pet / 1000 },
             co2: { lo: perDay.lo * y * l * f.co2, hi: perDay.hi * y * l * f.co2 },
             money: f.cur ? { lo: b.lo * f.lo, hi: b.hi * f.hi } : null };
  }
  /** Install plus upkeep over [years]: per newly served resident, and per bottle-equivalent ({lo, hi} a year). */
  function cost(install, upkeep, years, newlyPop, bottles) {
    var total = (install > 0 ? install : 0) + (upkeep > 0 ? upkeep : 0) * (years > 0 ? years : 0);
    if (!(total > 0)) return null;
    return { total: total, perResident: newlyPop >= 1 ? total / newlyPop : null,
             perBottle: bottles && bottles.lo > 0 && years > 0 ? { lo: total / (bottles.hi * years), hi: total / (bottles.lo * years) } : null };
  }

  // ---- Points: OpenStreetMap (Overpass, the app's tags and mirrors) and the console's own ----
  /** The mirrors the privacy policy names (OpenStreetMap France, Kumi Systems, private.coffee), in race order. */
  var MIRRORS = ["https://overpass.openstreetmap.fr/api/interpreter", "https://overpass.kumi.systems/api/interpreter",
                 "https://overpass.private.coffee/api/interpreter"];
  /** The app's query (OverpassApiClient.bboxQuery: the same tags), with a longer server timeout for a city's box. */
  function osmQuery(s, w, n, e) {
    var b = [s, w, n, e].map(function (v) { return v.toFixed(6); }).join(",");
    return "[out:json][timeout:25][maxsize:67108864][bbox:" + b + "];" +
      "(nw[amenity~\"^(drinking_water|water_point|toilets)$\"];nw[drinking_water=yes];nw[man_made=water_tap];" +
      "nw[\"drinking_water:refill\"=yes];);out center qt;";
  }
  /** A timed-out or over-budget query still answers 200, with a "remark" instead of complete data. */
  function osmIncomplete(body) {
    var i = body.lastIndexOf("\"remark\"");
    return i >= 0 && /error/i.test(body.slice(i, i + 200));
  }
  var WATER_AMENITIES = ["drinking_water", "water_point", "toilets", "fountain"];
  var PLACE_KEYS = ["tourism", "leisure", "shop", "sport", "building", "landuse", "club", "craft", "office"];
  /**
   * An Overpass answer as points, classified as the app's parser does (OverpassApiClient.parseOverpassJson):
   * {id, lat, lon, type, water, toilet, seasonal, wheelchair, paid}. "water" leaves out a point tagged not drinkable.
   * Null when it isn't an Overpass answer (never read as "nothing here").
   */
  function parseOsm(j) {
    if (!j || typeof j !== "object" || !Array.isArray(j.elements)) return null;
    var out = [];
    for (var k = 0; k < j.elements.length; k++) {
      var el = j.elements[k];
      if (!el || typeof el !== "object") return null;
      if ((el.type !== "node" && el.type !== "way") || !(el.id >= 1 && el.id <= 999999999999)) continue;
      var lat = el.lat != null ? el.lat : el.center && el.center.lat, lon = el.lon != null ? el.lon : el.center && el.center.lon;
      if (typeof lat !== "number" || typeof lon !== "number" || !isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
      var t = el.tags && typeof el.tags === "object" ? el.tags : {};
      var tag = function (key, d) { return typeof t[key] === "string" ? t[key] : d; };
      var amenity = tag("amenity", ""), dw = tag("drinking_water", "");
      var bottle = tag("bottle", tag("drinking_water:bottle", "")), dog = tag("dog", tag("pets", tag("drinking_water:dog", "")));
      var place = WATER_AMENITIES.indexOf(amenity) < 0 && tag("man_made", "") !== "water_tap" &&
        (amenity !== "" || PLACE_KEYS.some(function (key) { return key in t; }));
      var type = amenity === "toilets" && (dw === "yes" || bottle === "yes") ? "COMBO" : amenity === "toilets" ? "RESTROOM"
        : dog === "yes" ? "DOG_WATER" : bottle === "yes" || bottle === "only" || place ? "WATER_REFILL"
        : amenity === "drinking_water" || dw === "yes" ? "FOUNTAIN" : "WATER_REFILL";
      var notDrinkable = [tag("drinking_water:legal", ""), dw, tag("potable", "")].indexOf("no") >= 0;
      var seasonal = tag("seasonal", "").trim().toLowerCase(), wc = tag("wheelchair", "").trim().toLowerCase();
      out.push({ id: el.type[0] + el.id, lat: lat, lon: lon, type: type, water: type !== "RESTROOM" && !notDrinkable,
                 toilet: type === "RESTROOM" || type === "COMBO", seasonal: closedInWinter(seasonal),
                 wheelchair: wc === "yes" || wc === "designated", paid: tag("fee", "") === "yes", osm: true });
    }
    return out;
  }
  /** A "seasonal" value that closes the point in winter ("yes", "summer", "spring;summer;autumn"; not "no", "winter…"). */
  function closedInWinter(v) { v = String(v || "").trim().toLowerCase(); return v !== "" && v !== "no" && !/winter/.test(v); }

  /**
   * Overpass for the box [s, w, n, e]: the first two mirrors raced (the first complete answer wins, the other is
   * aborted), then the others one by one, each with a timeout. Null when every mirror failed. o.fetch: the browser's
   * fetch (a stub in the test); o.mirrors: MIRRORS by default; o.timeout: ms.
   */
  function osmFetch(b, o) {
    o = o || {};
    var mirrors = o.mirrors && o.mirrors.length ? o.mirrors : MIRRORS, f = o.fetch, ms = o.timeout || 20000;
    var body = "data=" + encodeURIComponent(osmQuery(b[0], b[1], b[2], b[3]));
    function one(url, ctl) {
      var timer = setTimeout(function () { ctl.abort(); }, ms);
      return Promise.resolve().then(function () {
        return f(url, { method: "POST", body: body, headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: ctl.signal,
                        credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store" });
      }).then(function (r) { return r && r.ok ? r.text() : null; })
        .then(function (t) { return t == null || osmIncomplete(t) ? null : parseOsm(JSON.parse(t)); })
        .catch(function () { return null; })
        .then(function (v) { clearTimeout(timer); return v; });
    }
    var first = mirrors.slice(0, 2), ctls = first.map(function () { return new AbortController(); });
    return new Promise(function (done) {
      var left = first.length, over = false;
      first.forEach(function (u, i) {
        one(u, ctls[i]).then(function (v) {
          if (over) return;
          if (v) { over = true; ctls.forEach(function (c) { c.abort(); }); done(v); } else if (--left === 0) { over = true; done(null); }
        });
      });
    }).then(function (v) {
      if (v) return v;
      return mirrors.slice(2).reduce(function (p, u) { return p.then(function (got) { return got || one(u, new AbortController()); }); }, Promise.resolve(null));
    });
  }

  /** The point types that give people drinking water (the impact report's "working water point"): not a dog bowl. */
  var HUMAN = ["FOUNTAIN", "WATER_REFILL", "COMBO"];
  /**
   * The console's own points (stats_overview's, cleaned by WNC.cleanOverview) as the same kind of points: broken when
   * flagged or last checked "not working", closed now when last checked "closed for the season". Accessibility and
   * fee aren't known on the server: not accessible, free (the app's reading of a point without a fee tag).
   */
  function fromServer(p) {
    return { id: "s" + p.id, sid: p.id, lat: p.lat, lon: p.lon, type: p.type, water: HUMAN.indexOf(p.type) >= 0,
             toilet: p.type === "RESTROOM" || p.type === "COMBO", seasonal: closedInWinter(p.seasonal),
             broken: p.flagged || p.status === "not_working", closedNow: p.status === "closed_season",
             wheelchair: false, paid: false, refills: p.refills, osm: false };
  }
  /**
   * The ranking holds at most 300 points: a cell with more working water points (or toilets) than it lists gets the
   * rest at its centre, so a big scope doesn't look emptier than it is.
   */
  function unlisted(cells, points) {
    var listed = new Map(), out = [];
    points.forEach(function (p) {
      var k = p.ix + ":" + p.iy, v = listed.get(k) || { w: 0, t: 0 };
      if (p.type !== "RESTROOM" && !(p.flagged || p.status === "not_working")) v.w++;
      if (p.type === "RESTROOM" || p.type === "COMBO") v.t++;
      listed.set(k, v);
    });
    cells.forEach(function (c) {
      var v = listed.get(c.ix + ":" + c.iy) || { w: 0, t: 0 }, ctr = C.cellCentre(c.ix, c.iy);
      var w = Math.max(0, (c.water || 0) - (c.broken || 0) - v.w), t = Math.max(0, (c.toilets || 0) - v.t);
      for (var i = 0; i < Math.max(w, t); i++) {
        out.push({ id: "u" + c.ix + ":" + c.iy + ":" + i, lat: ctr[1], lon: ctr[0], type: i < w && i < t ? "COMBO" : i < w ? "FOUNTAIN" : "RESTROOM",
                   water: i < w, toilet: i < t, seasonal: false, broken: false, closedNow: false, wheelchair: false, paid: false, osm: false });
      }
    });
    return out;
  }
  /** Server points first; an OpenStreetMap point within [m] metres of a server point of the same role is the same one. */
  function merge(server, osm, m) {
    m = m || 25;
    var out = server.slice(), P = server.length ? proj(server[0].lat, server[0].lon) : null;
    if (!P) return out.concat(osm);
    var xs = new Float64Array(server.length), ys = new Float64Array(server.length);
    server.forEach(function (p, i) { xs[i] = P.x(p.lon); ys[i] = P.y(p.lat); });
    var g = grid(xs, ys, server.length, 200);
    osm.forEach(function (o) {
      var dup = false;
      near(g, P.x(o.lon), P.y(o.lat), m, function (i) { if ((server[i].water && o.water) || (server[i].toilet && o.toilet)) dup = true; });
      if (!dup) out.push(o);
    });
    return out;
  }
  /** Which points count, by variant: water now / in summer / in winter / accessible; toilets now / free / accessible. */
  var VARIANTS = {
    water: function (p) { return p.water && !p.broken && !p.closedNow; },
    summer: function (p) { return p.water && !p.broken; },
    winter: function (p) { return p.water && !p.broken && !p.closedNow && !p.seasonal; },
    waterAccess: function (p) { return p.water && !p.broken && !p.closedNow && p.wheelchair; },
    toilets: function (p) { return p.toilet && !p.broken && !p.closedNow; },
    toiletsFree: function (p) { return p.toilet && !p.broken && !p.closedNow && !p.paid; },
    toiletsAccess: function (p) { return p.toilet && !p.broken && !p.closedNow && p.wheelchair; }
  };

  // ---- Reliability, freshness, growth ----
  function days(a, b) { return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY); }
  function addDays(d, n) { return new Date(Date.parse(d + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10); }
  /**
   * From the broken spells ([{id, from, to}]: "not working" from day [from] to the "working" check of day [to], null
   * still broken), over the period [from, to) for [nPoints] points:
   * - uptime: the share of point-days not inside a spell;
   * - recurring: the points with 3 spells or more starting in the period, most first;
   * - open: the points broken now, with the day it started and the days since (today).
   */
  function reliability(spells, nPoints, from, to, today) {
    var span = days(from, to), down = 0, starts = new Map(), open = [];
    spells.forEach(function (s) {
      var a = s.from > from ? s.from : from, b = s.to == null ? today : s.to;
      if (b > to) b = to;
      if (b > a) down += days(a, b);
      if (s.from >= from && s.from < to) starts.set(s.id, (starts.get(s.id) || 0) + 1);
      if (s.to == null) open.push({ id: s.id, since: s.from, days: days(s.from, today) });
    });
    var rec = [];
    starts.forEach(function (n, id) { if (n >= 3) rec.push({ id: id, n: n }); });
    rec.sort(function (a, b) { return b.n - a.n || a.id - b.id; });
    open.sort(function (a, b) { return b.days - a.days || a.id - b.id; });
    return { uptime: nPoints > 0 && span > 0 ? Math.max(0, 1 - down / (nPoints * span)) : null, downDays: down, recurring: rec, open: open };
  }
  /** Last checks ([{checkedOn}]): how many in the last 30 and 90 days, never, and the stale ones (never first, then oldest). */
  function freshness(points, today) {
    var in30 = 0, in90 = 0, never = 0, stale = [];
    points.forEach(function (p) {
      var d = p.checkedOn ? days(p.checkedOn, today) : null;
      if (d == null) { never++; stale.push(p); return; }
      if (d <= 30) in30++;
      if (d <= 90) in90++; else stale.push(p);
    });
    stale.sort(function (a, b) { return (a.checkedOn ? 1 : 0) - (b.checkedOn ? 1 : 0) || (a.checkedOn || "").localeCompare(b.checkedOn || ""); });
    return { n: points.length, in30: in30, in90: in90, never: never, stale: stale };
  }
  /** stats_health's answer (section 83), cleaned; null when it isn't one. */
  function cleanHealth(b) {
    var D = /^\d{4}-\d\d-\d\d$/, cnt = function (v) { return typeof v === "number" && isFinite(v) && v >= 0 ? Math.floor(v) : null; };
    var ids = function (a) { return (Array.isArray(a) ? a : []).filter(function (v) { return typeof v === "number" && v > 0 && Math.floor(v) === v; }).slice(0, 20000); };
    if (!b || typeof b !== "object" || !b.period || !D.test(b.period.from) || !D.test(b.period.to)) return null;
    return {
      k: cnt((b.k || {}).people) || 10, period: { from: b.period.from, to: b.period.to }, today: D.test(b.today) ? b.today : b.period.to,
      points: cnt(b.points) || 0, access: ids(b.access), paid: ids(b.paid), undrinkable: ids(b.undrinkable),
      spells: (Array.isArray(b.spells) ? b.spells : []).filter(function (s) {
        return Array.isArray(s) && s.length === 3 && typeof s[0] === "number" && s[0] > 0 && D.test(s[1]) && (s[2] === null || D.test(s[2]));
      }).slice(0, 5000).map(function (s) { return { id: s[0], from: s[1], to: s[2] }; }),
      months: (Array.isArray(b.months) ? b.months : []).filter(function (m) { return m && D.test(m.t); }).slice(0, 13).map(function (m) {
        return { t: m.t, added: cnt(m.added), imported: cnt(m.imported) || 0, checks: cnt(m.checks), photos: cnt(m.photos) };
      })
    };
  }

  /** A circle of [r] metres around (x, y) as a closed ring of [lon, lat], in projection [P]. */
  function circle(P, x, y, r, steps) {
    var out = [], n = steps || 72;
    for (var i = 0; i <= n; i++) { var a = 2 * Math.PI * (i % n) / n; out.push([P.lon(x + r * Math.cos(a)), P.lat(y + r * Math.sin(a))]); }
    return out;
  }

  var api = {
    WALK: WALK, WALK_PER_MIN: WALK_PER_MIN, DETOUR: DETOUR, R: R, CAP: CAP, BANDS: BANDS, FACTORS: FACTORS, MIRRORS: MIRRORS, VARIANTS: VARIANTS, HUMAN: HUMAN,
    proj: proj, grid: grid, near: near, sample: sample, sampleRing: sampleRing, pointGrid: pointGrid, closest: closest, distances: distances,
    within: within, newly: newly, suggest: suggest, share: share, equity: equity, quantile: quantile, band: band, calibrate: calibrate,
    estimate: estimate, countryOf: countryOf, impact: impact, cost: cost, osmQuery: osmQuery, osmIncomplete: osmIncomplete,
    parseOsm: parseOsm, closedInWinter: closedInWinter, osmFetch: osmFetch, fromServer: fromServer, unlisted: unlisted, merge: merge,
    days: days, addDays: addDays, reliability: reliability, freshness: freshness, cleanHealth: cleanHealth, circle: circle
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WNS = api;
})(this);
