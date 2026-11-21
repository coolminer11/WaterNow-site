/*
 * WaterNow Statistics, private console: coverage and quality panels under the map.
 * - Coverage (admins and cities, for the view or the territory): residents within about 5 and 10 minutes of a working
 *   water point, now, in summer, in winter (seasonal points closed), accessible points only; the same for toilets
 *   (free ones, accessible ones). Population blocks plus every point (the console's and OpenStreetMap's).
 * - Equity: how evenly that access is spread over the cells (Lorenz curve, Gini, the worst-served fifth).
 * - Reliability, data freshness and growth: for partners too, on their own points only (stats_health, section 83).
 * Population and OpenStreetMap aren't member data; member figures keep the server's floors. Text through textContent.
 */
(function () {
  "use strict";
  var P = window.WNC_PAGE, S = window.WNS, AREA = window.WNC_AREA;
  if (!P || !S || !AREA || !window.WNSI) return;
  var T = window.WNSI.STRINGS[P.lang] || window.WNSI.STRINGS.en, TC = window.WNI.STRINGS[P.lang] || window.WNI.STRINGS.en;
  var $ = function (id) { return document.getElementById(id); };
  var nf = new Intl.NumberFormat(P.lang), nf1 = new Intl.NumberFormat(P.lang, { maximumFractionDigits: 1 });
  var pct = new Intl.NumberFormat(P.lang, { style: "percent", maximumFractionDigits: 0 });
  var nf2 = new Intl.NumberFormat(P.lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var fmtMonth = new Intl.DateTimeFormat(P.lang, { month: "short", timeZone: "UTC" });
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function svg(tag, attrs) {
    var e = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
  var reduced = P.reduced, seq = 0, R5 = S.R[0], R10 = S.R[1];
  var day = function (d) { return new Date(d + "T00:00:00Z"); };

  function tween(node, to, fmt) {
    var from = typeof node._v === "number" ? node._v : 0;
    node._v = to;
    if (reduced || from === to) { node.textContent = fmt(to); return; }
    var t0 = performance.now();
    (function step(now) {
      var p = window.WNC.ease((now - t0) / 800);
      node.textContent = fmt(from + (to - from) * p);
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }
  function card(parent, title, cls) {
    var c = el("div", "card mcard" + (cls ? " " + cls : ""));
    c.appendChild(el("h3", null, title));
    var body = el("div", "mbody");
    c.appendChild(body);
    parent.appendChild(c);
    return { card: c, body: body };
  }
  function method(c, text) { c.card.appendChild(el("p", "note mmethod", text)); }
  function loading(body) { clear(body); for (var i = 0; i < 4; i++) body.appendChild(el("div", "skel skel-line")); }
  function pointName(id) {
    var p = P.data().points.filter(function (q) { return q.id === id; })[0];
    return p ? P.pointName(p) : "#" + id;
  }
  function pointRow(list, id, right, sub) {
    var li = el("li"), nm = el("div", "what");
    li.tabIndex = 0;
    nm.appendChild(el("b", null, pointName(id)));
    if (sub) nm.appendChild(el("span", "muted", sub));
    li.appendChild(nm);
    li.appendChild(el("span", "sc", right));
    var go = function () { P.openPoint(id); };
    li.addEventListener("click", go);
    li.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
    list.appendChild(li);
  }
  function moreList(body, items, n, fn) {
    var ul = el("ol", "need mlist"), shownN = 0;
    var more = el("button", "ghost wide-out", TC.more); more.type = "button";
    function add(k) { items.slice(shownN, shownN + k).forEach(function (x) { fn(ul, x); }); shownN = Math.min(items.length, shownN + k); more.classList.toggle("hidden", shownN >= items.length); }
    more.addEventListener("click", function () { add(10); });
    body.appendChild(ul); body.appendChild(more);
    add(n);
  }

  // ---- Coverage ----
  // One row: label, then a bar holding the 10 minute share (light) under the 5 minute one (solid), and both figures.
  function covRow(body, label, a5, a10) {
    var r = el("div", "covrow"), top = el("div", "covtop"), bar = el("div", "covbar"), f10 = el("span", "f10"), f5 = el("span", "f5");
    top.appendChild(el("span", null, label));
    var v = el("span", "covv");
    v.appendChild(el("b", null, a5 == null ? "—" : pct.format(a5)));
    v.appendChild(el("span", "muted", " · " + (a10 == null ? "—" : pct.format(a10))));
    top.appendChild(v);
    bar.appendChild(f10); bar.appendChild(f5);
    r.appendChild(top); r.appendChild(bar);
    body.appendChild(r);
    requestAnimationFrame(function () { f10.style.width = ((a10 || 0) * 100).toFixed(1) + "%"; f5.style.width = ((a5 || 0) * 100).toFixed(1) + "%"; });
  }
  function heroPair(body, a5, a10) {
    var h = el("div", "mhero");
    [[T.m5, a5], [T.m10, a10]].forEach(function (x) {
      var b = el("div"), v = el("b", null, "—");
      b.appendChild(v); b.appendChild(el("span", null, x[0]));
      h.appendChild(b);
      if (x[1] != null) tween(v, x[1], function (t) { return pct.format(t); });
    });
    body.appendChild(h);
  }
  function waterCard(c, A) {
    var sh = function (v, r) { return S.share(A.S, A.dist(v), r); };
    clear(c.body);
    heroPair(c.body, sh("water", R5), sh("water", R10));
    c.body.appendChild(el("p", "tiny muted mlegend", T.mBars));
    [[T.mNow, "water"], [T.mSummer, "summer"], [T.mWinter, "winter"], [T.mAccess, "waterAccess"]].forEach(function (x) {
      covRow(c.body, x[0], sh(x[1], R5), sh(x[1], R10));
    });
    c.body.appendChild(el("p", "tiny muted", T.mTrend));
  }
  function toiletCard(c, A) {
    var sh = function (v, r) { return S.share(A.S, A.dist(v), r); }, paid = A.pts.filter(function (p) { return p.toilet && p.paid; }).length;
    clear(c.body);
    heroPair(c.body, sh("toilets", R5), sh("toilets", R10));
    c.body.appendChild(el("p", "tiny muted mlegend", T.mBars));
    [[T.mNow, "toilets"], [T.mFree, "toiletsFree"], [T.mAccess, "toiletsAccess"]].forEach(function (x) {
      covRow(c.body, x[0], sh(x[1], R5), sh(x[1], R10));
    });
    c.body.appendChild(el("p", "tiny muted", T.mPaid(nf.format(paid), paid)));
  }
  // The Lorenz curve: cells from the worst served (left) to the best; the diagonal is "every cell served alike".
  function equityCard(c, A) {
    var e = S.equity(A.S, A.dist("water"), R5);
    clear(c.body);
    if (!e) { c.body.appendChild(el("p", "empty", T.mEquityNone)); return; }
    var W = 260, H = 190, L = 28, B = 26, Tp = 8, Rr = 8, x = function (v) { return L + v * (W - L - Rr); }, y = function (v) { return Tp + (1 - v) * (H - Tp - B); };
    var s = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": T.mEquity, "class": "lorenz" });
    s.appendChild(svg("rect", { x: x(0), y: y(1), width: x(1) - x(0), height: y(0) - y(1), "class": "frame" }));
    var curve = e.lorenz.map(function (p, i) { return (i ? "L" : "M") + x(p[0]).toFixed(1) + " " + y(p[1]).toFixed(1); }).join("");
    s.appendChild(svg("path", { d: curve + "L" + x(1) + " " + y(1) + "L" + x(0) + " " + y(0) + "Z", "class": "gap" }));
    s.appendChild(svg("line", { x1: x(0), y1: y(0), x2: x(1), y2: y(1), "class": "diag" }));
    var line = svg("path", { d: curve, "class": "curve" });
    s.appendChild(line);
    [[0, "0"], [0.5, "50 %"], [1, "100 %"]].forEach(function (t) {
      var a = svg("text", { x: x(t[0]), y: H - 8, "text-anchor": t[0] === 0 ? "start" : t[0] === 1 ? "end" : "middle", "class": "axis" }); a.textContent = t[1]; s.appendChild(a);
    });
    var yl = svg("text", { x: 4, y: y(1) + 4, "class": "axis" }); yl.textContent = "100 %"; s.appendChild(yl);
    var cap = el("div", "lorenz-cap tiny muted");
    cap.appendChild(el("span", null, "→ " + T.mLorenzX)); cap.appendChild(el("span", null, "↑ " + T.mLorenzY));
    c.body.appendChild(s); c.body.appendChild(cap);
    if (!reduced) {
      var len = line.getTotalLength();
      line.style.strokeDasharray = len; line.style.strokeDashoffset = len;
      line.getBoundingClientRect(); line.classList.add("draw"); line.style.strokeDashoffset = 0;
    }
    c.body.appendChild(el("p", "small", T.mEquityText(pct.format(e.worst.popShare), nf.format(Math.round(e.worst.walk / 10) * 10) + " m")));
    c.body.appendChild(el("p", "tiny muted", T.mGini(nf2.format(e.gini))));
    c.body.appendChild(el("p", "tiny muted", T.mLorenzExplain));
  }

  // ---- Reliability, freshness, growth (stats_health and the overview's points) ----
  function today(h) { return h ? h.today : S.addDays(P.data().period.to, 1); }
  function reliabilityCard(c, h) {
    var d = P.data(), t = d.totals;
    clear(c.body);
    var r = h ? S.reliability(h.spells, h.points, h.period.from, h.period.to, h.today) : null;
    var tiles = el("div", "facts");
    [[T.mUptime, r && r.uptime != null ? pct.format(r.uptime) : "—"],
     [T.mMedianRepair, t.repairDays != null ? TC.repairDays(nf1.format(t.repairDays)) + " · " + nf.format(t.repairs) : "—"]].forEach(function (x) {
      var f = el("div", "fact"); f.appendChild(el("b", null, x[1])); f.appendChild(el("span", null, x[0])); tiles.appendChild(f);
    });
    c.body.appendChild(tiles);
    if (!h) c.body.appendChild(el("p", "note", T.mLater));
    // Broken now: the open spells (with their start), then points flagged or last checked broken without one.
    c.body.appendChild(el("div", "section-t", T.mBrokenNow));
    var open = r ? r.open.slice() : [], seen = new Set(open.map(function (o) { return o.id; }));
    d.points.forEach(function (p) {
      if ((p.flagged || p.status === "not_working") && !seen.has(p.id)) open.push({ id: p.id, since: null, checked: p.checkedOn, flagged: p.flagged });
    });
    if (!open.length) c.body.appendChild(el("p", "note", T.mNoneBroken));
    else moreList(c.body, open, 5, function (ul, o) {
      if (o.since) pointRow(ul, o.id, T.mDays(nf.format(o.days), o.days), T.mSince(P.fmtFull.format(day(o.since))));
      else pointRow(ul, o.id, o.checked ? T.mAtLeast(nf.format(S.days(o.checked, today(h))), S.days(o.checked, today(h))) : "—",
                    o.flagged ? T.mFlagged : T.mSince(o.checked ? P.fmtFull.format(day(o.checked)) : "—"));
    });
    c.body.appendChild(el("div", "section-t", T.mRecurring));
    if (!r) c.body.appendChild(el("p", "note", "—"));
    else if (!r.recurring.length) c.body.appendChild(el("p", "note", T.mNoRecurring));
    else moreList(c.body, r.recurring, 5, function (ul, o) { pointRow(ul, o.id, "×" + nf.format(o.n)); });
  }
  function freshCard(c, h) {
    var d = P.data(), f = S.freshness(d.points, today(h));
    clear(c.body);
    var tiles = el("div", "facts facts3");
    [[T.mIn30, f.n ? f.in30 / f.n : null, true], [T.mIn90, f.n ? f.in90 / f.n : null, true], [T.mNever, f.never, false]].forEach(function (x) {
      var b = el("div", "fact"), v = el("b", null, "—");
      b.appendChild(v); b.appendChild(el("span", null, x[0])); tiles.appendChild(b);
      if (x[1] != null) tween(v, x[1], x[2] ? function (t) { return pct.format(t); } : function (t) { return nf.format(Math.round(t)); });
    });
    c.body.appendChild(tiles);
    if (d.totals.points > d.points.length) c.body.appendChild(el("p", "tiny muted", T.mListed(nf.format(d.points.length), nf.format(d.totals.points), d.points.length)));
    c.body.appendChild(el("div", "section-t", T.mStale));
    if (!f.stale.length) { c.body.appendChild(el("p", "note", T.mStaleNone)); return; }
    moreList(c.body, f.stale, 6, function (ul, p) {
      pointRow(ul, p.id, p.checkedOn ? T.mDays(nf.format(S.days(p.checkedOn, today(h))), S.days(p.checkedOn, today(h))) : T.mNeverShort,
               TC.types[p.type]);
    });
  }
  // Twelve small bars a series; a month under the floor is a dashed outline ("< k"), never a zero.
  function bars(parent, title, vals, k) {
    var W = 240, H = 64, n = vals.length, bw = W / Math.max(1, n), max = Math.max(1, Math.max.apply(null, vals.map(function (v) { return v.v || 0; })));
    var wrap = el("div", "mbars"), head = el("div", "mbars-h");
    head.appendChild(el("span", null, title));
    // The months shown add up; a month under the floor isn't a zero (nor is 12 of them "< k"): none shown reads "—",
    // some hidden "≥ sum".
    var tot = vals.reduce(function (s, v) { return s + (v.v || 0); }, 0), hid = vals.filter(function (v) { return v.v == null; }).length;
    head.appendChild(el("b", null, hid && hid === n ? "—" : (hid ? "≥ " : "") + nf.format(tot)));
    wrap.appendChild(head);
    // A fixed height whatever the card's width (the bars stretch, the month names stay text).
    var s = svg("svg", { viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "none", role: "img", "aria-label": title });
    vals.forEach(function (v, i) {
      var hh = v.v == null ? H * 0.22 : Math.max(1, H * v.v / max);
      var r = svg("rect", { x: (i * bw + bw * 0.18).toFixed(1), width: (bw * 0.64).toFixed(1), y: (H - hh).toFixed(1), height: hh.toFixed(1),
                            "class": "bar" + (v.v == null ? " hid" : ""), "vector-effect": "non-scaling-stroke" });
      var tt = svg("title"); tt.textContent = fmtMonth.format(day(v.t)) + " · " + (v.v == null ? TC.fewer(k) : nf.format(v.v)); r.appendChild(tt);
      if (!reduced) { r.style.transformBox = "fill-box"; r.style.transformOrigin = "bottom"; r.style.animation = "grow .6s cubic-bezier(.2,.8,.2,1) both " + (i * 25) + "ms"; }
      s.appendChild(r);
    });
    wrap.appendChild(s);
    if (n) {
      var ax = el("div", "mbars-x");
      ax.appendChild(el("span", null, fmtMonth.format(day(vals[0].t)))); ax.appendChild(el("span", null, fmtMonth.format(day(vals[n - 1].t))));
      wrap.appendChild(ax);
    }
    parent.appendChild(wrap);
  }
  function growthCard(c, h) {
    clear(c.body);
    if (!h) { c.body.appendChild(el("p", "note", T.mLater)); return; }
    var m = h.months;
    bars(c.body, T.mAdded, m.map(function (x) { return { t: x.t, v: x.added }; }), h.k);
    bars(c.body, T.mChecks, m.map(function (x) { return { t: x.t, v: x.checks }; }), h.k);
    bars(c.body, T.mPhotos, m.map(function (x) { return { t: x.t, v: x.photos }; }), h.k);
    var imp = m.reduce(function (s, x) { return s + x.imported; }, 0);
    c.body.appendChild(el("p", "tiny muted", T.mImported(nf.format(imp), imp)));
  }

  // ---- The section ----
  function render() {
    var d = P.data(), box = $("metrics");
    if (!d || !box) return;
    var id = ++seq, partner = d.scope.kind === "partner", sp = AREA.spec();
    box.classList.remove("hidden");
    clear(box);
    var head = el("div", "mhead"), hd = el("div");
    hd.appendChild(el("h2", null, T.mTitle));
    hd.appendChild(el("p", "muted small", partner ? T.mLeadPartner : sp.kind === "city" ? T.mLeadCity : T.mLeadView));
    head.appendChild(hd);
    if (P.demo) head.appendChild(el("span", "pill demo", TC.demo));
    box.appendChild(head);
    var grid = el("div", "mgrid");
    box.appendChild(grid);
    if (!partner) {
      var cw = card(grid, T.mWater, "mwide"), ct = card(grid, T.mToilets), ce = card(grid, T.mEquity);
      method(cw, T.mMethodCov); method(ct, T.mMethodToilets); method(ce, T.mMethodEq);
      if (sp.kind === "zoom" || sp.kind === "big") {
        [cw, ct, ce].forEach(function (c) { c.body.appendChild(el("p", "empty", sp.kind === "zoom" ? T.mZoom : T.mBig)); });
      } else {
        [cw, ct, ce].forEach(function (c) { loading(c.body); });
        AREA.get().then(function (A) {
          if (id !== seq) return;
          if (!A.S) { [cw, ct, ce].forEach(function (c) { clear(c.body).appendChild(el("p", "empty", A.spec.kind === "nopop" ? TC.noPop : T.mFailed)); }); return; }
          waterCard(cw, A); toiletCard(ct, A); equityCard(ce, A);
          if (A.osm == null) cw.body.appendChild(el("p", "note warn", T.mOsmFail));
        });
      }
    }
    var cr = card(grid, T.mReliability), cf = card(grid, T.mFresh), cg = card(grid, T.mGrowth);
    method(cr, T.mMethodRel); method(cf, T.mMethodFresh); method(cg, T.mMethodGrowth(d.k.people));
    loading(cr.body); loading(cg.body);
    freshCard(cf, null);
    AREA.health().then(function (h) {
      if (id !== seq) return;
      reliabilityCard(cr, h); growthCard(cg, h);
      if (h) freshCard(cf, h);
    });
  }
  // Moves of the map change the view's coverage (not a city's, nor a partner's): redone once it settles.
  var lastKey = "", wired = false;
  document.addEventListener("wnc:render", function () {
    lastKey = AREA.spec().key || AREA.spec().kind;
    render();
    var gl = P.map();
    if (gl && !wired) {
      wired = true;
      var t = 0;
      gl.on("moveend", function () {
        clearTimeout(t);
        t = setTimeout(function () {
          var k = AREA.spec().key || AREA.spec().kind;
          if (k !== lastKey && P.data() && P.data().scope.kind === "world") { lastKey = k; render(); }
        }, 400);
      });
    }
  });
})();
