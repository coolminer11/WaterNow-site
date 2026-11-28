/*
 * WaterNow Statistics, the private impact report (console/, "Rapport d'impact"): one call to section 80's
 * stats_report(scope, period) for a period of whole months, the population blocks for the reach, then the report as a
 * document over the console. "Print or save as PDF" uses the browser's print (report.css: Letter and A4, a running
 * header, page numbers, light even in dark mode). Private like the rest of the console: no link to share, ever.
 * Text goes in with textContent, SVG node by node. Its pure parts (factors, country, periods, reach, recommendations)
 * are in impact.js, its words in report-i18n.js.
 * Hook for other panels: once drawn, the report dispatches "wn-report" on document with {slot, report, lang}; a listener
 * may fill the empty, hidden section [slot] (the fountain scenarios) and unhide it. It prints with the rest.
 */
(function () {
  "use strict";
  var A = window.WNCAPP, C = window.WNC, R = window.WNR;
  if (!A || !R || !document.getElementById("reportBtn")) return;
  var T = A.T, lang = A.lang, S = window.WNRI.STRINGS[lang] || window.WNRI.STRINGS.en;
  var $ = function (id) { return document.getElementById(id); };
  var nf = new Intl.NumberFormat(lang), nf1 = new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var pct = new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 1 });
  var fmtFull = new Intl.DateTimeFormat(lang, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  var fmtMonthLong = new Intl.DateTimeFormat(lang, { month: "long", year: "numeric", timeZone: "UTC" });
  var fmtMonth = new Intl.DateTimeFormat(lang, { month: "short", timeZone: "UTC" });
  var fmtMY = new Intl.DateTimeFormat(lang, { month: "short", year: "2-digit", timeZone: "UTC" });
  var fmtDay = new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", timeZone: "UTC" });
  var fmtWd = new Intl.DateTimeFormat(lang, { weekday: "short", timeZone: "UTC" });
  var day = function (d) { return new Date(d + "T00:00:00Z"); };
  var HUMAN = ["FOUNTAIN", "WATER_REFILL", "COMBO"];
  var brokenNow = function (p) { return p.flagged || p.status === "not_working" || p.status === "closed_season"; };

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function add(parent, tag, cls, txt) { var e = el(tag, cls, txt); parent.appendChild(e); return e; }
  function svg(tag, attrs) {
    var e = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function button(parent, txt, cls) { var b = add(parent, "button", cls || "ghost", txt); b.type = "button"; return b; }
  /** A member figure, or "< k" when the server held it back. */
  function fig(v, k) { return v == null ? T.fewerShort(k) : nf.format(v); }
  function kg(v) { return v < 10 ? nf1.format(v) : nf.format(Math.round(v)); }
  function money(v, cur) { return new Intl.NumberFormat(lang, { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(v); }
  function ll(ix, iy) {
    var c = C.cellCentre(ix, iy), f = new Intl.NumberFormat(lang, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    return f.format(Math.abs(c[1])) + "° " + (c[1] >= 0 ? "N" : "S") + " · " + f.format(Math.abs(c[0])) + "° " + (c[0] >= 0 ? "E" : "W");
  }

  // ---- The view: a modal document over the console ----
  var view = $("report"), bar = null, doc = null, live = null, lastFocus = null, req = 0, ctl = null, headRule = null, finals = [];
  $("reportBtn").addEventListener("click", function () { if (A.ready()) open(); });

  function open() {
    lastFocus = document.activeElement;
    clear(view).classList.remove("hidden");
    view.setAttribute("aria-label", S.report);
    document.body.classList.add("modal");
    var list = R.months(Date.now(), 36);
    ctl = ctl || { kind: "month", month: list[0], quarter: R.quarters(list)[0], year: R.years(list)[0], from: list[Math.min(5, list.length - 1)], to: list[0] };
    bar = add(view, "div", "rpt-bar");
    var title = add(bar, "div", "rpt-bar-t");
    add(title, "span", "mark"); add(title, "b", null, S.report);
    var pick = add(bar, "div", "rpt-pick"); pick.setAttribute("role", "group"); pick.setAttribute("aria-label", S.periodPick);
    var seg = add(pick, "div", "seg");
    var fields = add(pick, "div", "rpt-fields");
    [["month", S.pMonth], ["quarter", S.pQuarter], ["year", S.pYear], ["range", S.pRange]].forEach(function (p) {
      var b = button(seg, p[1], "");
      b.setAttribute("aria-pressed", String(ctl.kind === p[0]));
      b.addEventListener("click", function () {
        ctl.kind = p[0];
        Array.prototype.forEach.call(seg.children, function (c) { c.setAttribute("aria-pressed", String(c === b)); });
        drawFields(fields, list);
        load();
      });
    });
    drawFields(fields, list);
    var acts = add(bar, "div", "rpt-acts");
    button(acts, T.print, "primary rpt-print").addEventListener("click", printNow);
    button(acts, T.close, "ghost").addEventListener("click", close);
    // A short status for screen readers, not the whole report as a live region (that read every page out at each change).
    live = add(bar, "span", "sr");
    live.setAttribute("role", "status");
    doc = add(view, "article", "rpt");
    view.scrollTop = 0;
    seg.querySelector("[aria-pressed='true']").focus();
    load();
  }
  function close() {
    req++;
    view.classList.add("hidden"); clear(view); document.body.classList.remove("modal");
    if (lastFocus) lastFocus.focus();
  }
  /** The period's own fields: a list of months, quarters or years, or two native month inputs for a range. */
  function drawFields(box, list) {
    clear(box);
    function select(label, opts, val, set) {
      var l = add(box, "label", "select rpt-select"), s = add(l, "select");
      s.setAttribute("aria-label", label);
      opts.forEach(function (o) { var x = add(s, "option", null, o[1]); x.value = o[0]; });
      s.value = val;
      s.addEventListener("change", function () { set(s.value); load(); });
    }
    if (ctl.kind === "month") select(S.pMonth, list.map(function (m) { return [m, fmtMonthLong.format(day(m + "-01"))]; }), ctl.month, function (v) { ctl.month = v; });
    if (ctl.kind === "quarter") select(S.pQuarter, R.quarters(list).map(function (q) { return [q, S.quarter(q.slice(6), q.slice(0, 4))]; }), ctl.quarter, function (v) { ctl.quarter = v; });
    if (ctl.kind === "year") select(S.pYear, R.years(list).map(function (y) { return [y, y]; }), ctl.year, function (v) { ctl.year = v; });
    if (ctl.kind === "range") {
      [["from", S.from], ["to", S.to]].forEach(function (f) {
        var l = add(box, "label", "rpt-month"), i = el("input", "input");
        add(l, "span", null, f[1]);
        i.type = "month"; i.min = list[list.length - 1]; i.max = list[0]; i.value = ctl[f[0]];
        i.addEventListener("change", function () { if (/^\d{4}-\d\d$/.test(i.value)) { ctl[f[0]] = i.value; load(); } });
        l.appendChild(i);
      });
    }
  }
  function key() {
    return ctl.kind === "range" ? R.periodKey("range", ctl.from <= ctl.to ? ctl.from : ctl.to, ctl.from <= ctl.to ? ctl.to : ctl.from)
      : R.periodKey(ctl.kind, ctl[ctl.kind]);
  }
  // The dialog keeps the keyboard: Escape closes, Tab cycles through its own controls.
  document.addEventListener("keydown", function (e) {
    if (view.classList.contains("hidden")) return;
    if (e.key === "Escape") { close(); return; }
    if (e.key !== "Tab") return;
    var f = Array.prototype.filter.call(view.querySelectorAll("button, select, input"), function (x) { return !x.disabled && x.offsetParent; });
    if (!f.length) return;
    var a = f[0], z = f[f.length - 1];
    if (!view.contains(document.activeElement) || (e.shiftKey && document.activeElement === a) || (!e.shiftKey && document.activeElement === z)) {
      e.preventDefault(); (e.shiftKey ? z : a).focus();
    }
  });

  async function load() {
    var k = key(), id = ++req;
    clear(doc);
    if (!k) { add(doc, "p", "empty", T.errorLoad); live.textContent = T.errorLoad; return; }
    for (var i = 0; i < 10; i++) add(doc, "div", "skel skel-line");
    doc.setAttribute("aria-busy", "true");
    try {
      var d = R.cleanReport(await A.rpc("stats_report", { p_scope: A.scope(), p_period: k }), C);
      if (id !== req) return;
      if (!d) throw new Error("bad_answer");
      var x = await population(d);
      if (id !== req) return;
      render(d, x);
      doc.setAttribute("aria-busy", "false");
      live.textContent = S.report + " · " + scopeName(d) + " · " + periodLabel(d);
    } catch (e) {
      if (id !== req) return;
      if (e.status === 401) { A.lost(); return; }
      if (e.code === "WNMFA") { close(); A.showMfa(); return; }
      clear(doc);
      doc.setAttribute("aria-busy", "false");
      live.textContent = T.errorLoad;
      add(doc, "p", "empty", T.errorLoad);
      button(doc, T.retry, "ghost").addEventListener("click", load);
    }
  }

  // ---- The population: residents near the points; for a city, where water is missing ----
  function centreOf(terr) {
    if (!terr || !terr.length) return null;
    var r = terr[Math.floor(terr.length / 2)], c = C.cellCentre(Math.round((r[1] + r[2]) / 2), r[0]);
    return { lat: c[1], lon: c[0] };
  }
  async function population(d) {
    var x = { country: R.scopeCountry(d.scope.kind, d.points, centreOf(d.territory)), pop: false };
    var idx = await A.pop.init();
    if (!idx) return x;
    var blocks = new Set();
    R.reachCells(C, d.points, 1000).forEach(function (k) { var c = k.split(":"); blocks.add(Math.floor(c[0] / 256) + ":" + Math.floor(c[1] / 256)); });
    // A block that didn't load: the report says the population isn't available, never a reach short of its residents.
    if (!(await A.pop.load(1000, blocks))) return x;
    x.pop = true;
    var at = function (ix, iy) { return A.pop.at(1000, ix, iy); };
    x.r500 = d.points.length ? R.reach(C, d.points, 500, at) : 0;
    x.r1k = d.points.length ? R.reach(C, d.points, 1000, at) : 0;
    if (d.scope.kind === "org") {
      var cells = new Map();
      var cell = function (ix, iy) {
        var k = ix + ":" + iy;
        if (!cells.has(k)) cells.set(k, { ix: ix, iy: iy, refills: null, people: null, water: 0, toilets: 0, broken: 0, demand: null, population: null });
        return cells.get(k);
      };
      d.points.forEach(function (p) {
        var c = C.cellOf(p.lat, p.lon), o = cell(c.ix, c.iy);
        if (HUMAN.indexOf(p.type) >= 0) { o.water++; if (brokenNow(p)) o.broken++; }
      });
      d.demandCells.forEach(function (c) { cell(c.ix, c.iy).demand = c.demand; });
      var j = { cells: Array.from(cells.values()), territory: d.territory, totals: {}, scope: { kind: "org" } };
      await A.pop.join(j);
      if (j.popLost) { x.pop = false; return x; }
      var all = j.cells.concat(j.terrCells || []);
      x.residents = j.totals.population;
      x.under = all.map(function (c) { return { c: c, x: C.derive(c) }; }).filter(function (o) { return o.x.underserved; })
        .sort(function (a, b) { return b.x.score - a.x.score || (b.c.population || 0) - (a.c.population || 0); }).slice(0, 8);
      x.beyond = R.beyond(C, all, d.points.filter(function (p) { return HUMAN.indexOf(p.type) >= 0 && !brokenNow(p); }), 1000);
    }
    return x;
  }

  // ---- The document ----
  function periodLabel(d) {
    var k = d.period.key, q = /^(\d{4})-Q([1-4])$/.exec(k), part = function (l, full) {
      return d.period.months < full ? S.soFar(l, fmtMonth.format(day(d.period.from)), fmtMonth.format(day(d.period.to))) : l;
    };
    if (/^\d{4}-\d\d$/.test(k)) return fmtMonthLong.format(day(k + "-01"));
    if (q) return part(S.quarter(q[2], q[1]), 3);
    if (/^\d{4}$/.test(k)) return part(k, 12);
    return fmtMY.format(day(d.period.from)) + " – " + fmtMY.format(day(d.period.to));
  }
  function scopeName(d) { return d.scope.kind === "world" ? S.kindWorld : d.scope.name; }
  function section(cls, title, lead) {
    var s = add(doc, "section", "rpt-sec rv " + (cls || ""));
    if (title) add(s, "h2", null, title);
    if (lead) add(s, "p", "rpt-lead", lead);
    s._cu = [];
    return s;
  }
  /** A figure that counts up when its section comes into view (at once with reduced motion, and before printing). */
  function countUp(sec, node, to, fmt) {
    var end = fmt(to);
    finals.push([node, end]);
    node.textContent = A.reduced ? end : fmt(0);
    sec._cu.push(function () {
      if (A.reduced) return;
      var t0 = performance.now();
      (function step(now) {
        var p = C.ease((now - t0) / 1100);
        node.textContent = p < 1 ? fmt(to * p) : end;
        if (p < 1) requestAnimationFrame(step);
      })(t0);
    });
  }
  function render(d, x) {
    clear(doc); finals = [];
    var imp = d.totals.litres != null ? R.impact(d.totals.litres, x.country) : null;
    cover(d, x, imp);
    impactSection(d, x, imp);
    trends(d);
    pointsTable(d);
    reachSection(d, x, imp);
    var slot = add(doc, "section", "rpt-sec rpt-slot"); // the fountain scenarios (another panel fills it)
    slot.hidden = true; slot.setAttribute("data-slot", "scenarios");
    method(d, x);
    printHeader(scopeName(d) + " · " + periodLabel(d));
    reveal();
    document.dispatchEvent(new CustomEvent("wn-report", { detail: { slot: slot, report: d, lang: lang } }));
  }

  function cover(d, x, imp) {
    var s = section("rpt-cover"), k = d.k.people, top = add(s, "div", "rpt-top");
    var brand = add(top, "div", "rpt-brandline");
    add(brand, "span", "mark"); add(brand, "b", null, "WaterNow"); add(brand, "span", "rpt-dim", "Statistics");
    add(top, "span", "pill", S.confidential);
    var head = add(s, "div", "rpt-head"), logo = add(head, "div", "rpt-logo"), hl = add(head, "div");
    add(logo, "span", "rpt-initial", (scopeName(d) || "W").charAt(0).toUpperCase());
    if (d.scope.logo) partnerLogo(d.scope.logo, logo);
    add(hl, "div", "eyebrow", S.brandTitle);
    add(hl, "h1", null, scopeName(d));
    add(hl, "p", "rpt-kind", d.scope.kind === "partner" ? S.kindPartner : d.scope.kind === "org" ? S.kindCity : S.kindWorld);
    var meta = add(s, "dl", "rpt-meta");
    [[S.periodL, periodLabel(d) + " (" + fmtDay.format(day(d.period.from)) + " – " + fmtDay.format(day(d.period.to)) + ")"],
     [S.generatedL, d.generated ? fmtFull.format(day(d.generated)) : ""],
     [S.scopeL, (d.scope.kind === "partner" ? S.kindPartner : d.scope.kind === "org" ? S.kindCity : S.kindWorld) + " · " +
                nf.format(d.totals.points) + " " + T.kWater.toLowerCase()]].forEach(function (m) {
      var g = add(meta, "div"); add(g, "dt", null, m[0]); add(g, "dd", null, m[1]);
    });
    var big = add(s, "div", "rpt-big"), t = d.totals;
    [[S.kRefills, t.refills, nf.format, "#1268e8"], [S.kBottles, imp && imp.bottles, nf.format, "#0aa5a3"],
     [S.kCo2, imp && imp.co2Kg, kg, "#12805c"], [S.kPet, imp && imp.petKg, kg, "#6342b5"], [S.kPeople, t.people, nf.format, "#d97706"],
     t.uptime != null ? [S.kUptime, t.uptime / 100, function (v) { return pct.format(v); }, "#0284c7"] : [S.kPoints, t.points, nf.format, "#0284c7"]]
      .forEach(function (f) {
        var c = add(big, "div", "rpt-fig"), v = add(c, "div", "v");
        c.style.setProperty("--k", f[3]);
        if (f[1] == null) { v.textContent = T.fewerShort(k); v.classList.add("hid"); } else countUp(s, v, f[1], f[2]);
        add(c, "div", "l", f[0]);
      });
    // At a glance: the change, the busiest point, the residents around.
    var ch = R.change(t.refills, d.previous.refills), top = d.points[0], hl = [];
    if (ch != null && Math.abs(ch) >= 1) hl.push((ch > 0 ? S.hlUp : S.hlDown)(pct.format(Math.abs(ch) / 100)));
    if (top && top.refills != null) hl.push(S.hlTop(A.pointName(top), nf.format(top.refills), top.refills));
    if (x.pop && x.r1k > 0) hl.push(S.hlReach(nf.format(x.r1k), x.r1k));
    if (hl.length) {
      var box = add(s, "div", "rpt-glance");
      add(box, "h3", null, S.hlTitle);
      var ul = add(box, "ul", "rpt-recs");
      hl.forEach(function (h) { add(ul, "li", null, h); });
    }
    add(s, "p", "rpt-note", d.rounded ? S.roundedNote : S.exactNote);
    if (A.demo) add(s, "p", "rpt-demo", T.demo);
  }
  // The partner's logo, read as the partner page reads it: the key alone, a visible page's current image.
  function partnerLogo(name, box) {
    fetch(A.api + "/storage/v1/object/authenticated/partner-media/" + name,
          { headers: { apikey: A.key }, credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" })
      .then(function (r) { return r.ok ? r.blob() : null; })
      .then(function (b) {
        if (!b || !/^image\/(jpeg|png|webp)$/.test(b.type)) return;
        var img = el("img"); img.alt = "";
        img.onload = function () { clear(box).appendChild(img); };
        img.src = URL.createObjectURL(b);
      }).catch(function () { /* the initial stays */ });
  }

  function impactSection(d, x, imp) {
    var s = section("rpt-impact", S.hImpact, S.factorsFor(S.countries[x.country])), k = d.k.people, t = d.totals;
    var g = add(s, "div", "rpt-cards");
    function card(title, value, fmt, line, color) {
      var c = add(g, "div", "rpt-card"), v = add(c, "div", "v");
      c.style.setProperty("--k", color);
      add(c, "div", "l", title);
      c.insertBefore(c.lastChild, v);
      if (value == null) { v.textContent = "—"; v.classList.add("hid"); } else countUp(s, v, value, fmt);
      if (line) add(c, "p", null, line);
      return c;
    }
    card(S.kRefills, t.refills, nf.format, t.litres != null ? nf.format(t.litres) + " L · " + S.kLitres.toLowerCase() : S.hidden(k), "#1268e8");
    if (!imp) { add(s, "p", "rpt-note", S.hidden(k)); return; }
    card(S.cBottles, imp.bottles, nf.format, S.bottlesLine(nf.format(Math.round(imp.bottles)), Math.round(imp.bottles)), "#0aa5a3");
    card(S.cPet, imp.petKg, kg, S.petLine(kg(imp.petKg)), "#6342b5");
    card(S.cCo2, imp.co2Kg, kg, S.co2Line(kg(imp.co2Kg)), "#12805c");
    card(S.cCar, imp.carKm, function (v) { return nf.format(Math.round(v)) + " km"; }, S.carLine(nf.format(Math.round(imp.carKm))), "#64748b");
    if (imp.money) card(S.cMoney, imp.money.high, function (v) { return money(v, imp.money.currency); },
                        S.moneyLine(money(imp.money.high, imp.money.currency), money(imp.money.low, imp.money.currency)), "#d97706");
    if (imp.notCollected) card(S.cCollect, imp.notCollected.bottles, function (v) { return nf.format(Math.round(v)); },
                               S.collectLine(nf.format(Math.round(imp.notCollected.bottles)), pct.format(imp.notCollected.rate), Math.round(imp.notCollected.bottles)), "#b45309");
    if (!imp.money) add(s, "p", "rpt-note", S.noCountry);
    add(s, "p", "rpt-note", S.impactCaveat);
  }

  // ---- Charts (inline SVG) ----
  function nice(v) { if (v <= 5) return 5; var p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }
  /** Bars of [vals] (null: under the floor, a dashed stub), [labels] under every [every]-th one, [hi] darker. */
  function bars(box, vals, labels, opt) {
    var W = opt.W || 640, H = opt.H || 170, L = 40, Rr = 6, Tt = 10, B = 24, n = vals.length;
    if (!n) return;
    var max = nice(Math.max.apply(null, vals.map(function (v) { return v || 0; }).concat([1])));
    var s = add(box, "figure", "rpt-chart"), g = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": opt.title });
    s.appendChild(g);
    [0, 0.5, 1].forEach(function (f) {
      var y = Tt + (H - Tt - B) * (1 - f);
      g.appendChild(svg("line", { "class": "grid", x1: L, x2: W - Rr, y1: y, y2: y }));
      var tx = svg("text", { "class": "axis", x: L - 6, y: y + 4, "text-anchor": "end" }); tx.textContent = nf.format(max * f); g.appendChild(tx);
    });
    var bw = (W - L - Rr) / n, ph = H - Tt - B;
    vals.forEach(function (v, i) {
      var h = v == null ? ph * 0.12 : ph * v / max, r = svg("rect", {
        "class": "bar" + (v == null ? " hid" : "") + (opt.hi && opt.hi[i] ? " hi" : ""),
        x: (L + i * bw + bw * 0.14).toFixed(1), width: Math.max(1, bw * 0.72).toFixed(1), y: (H - B - h).toFixed(1),
        height: Math.max(0.5, h).toFixed(1), rx: Math.min(3, bw * 0.2).toFixed(1) });
      var tt = svg("title"); tt.textContent = labels[i] + " · " + (v == null ? T.fewer(opt.k) : nf.format(v)); r.appendChild(tt);
      g.appendChild(r);
      if (i % (opt.every || 1) === 0 || i === n - 1 && opt.last) {
        var tx = svg("text", { "class": "axis", x: (L + i * bw + bw / 2).toFixed(1), y: H - 7, "text-anchor": "middle" });
        tx.textContent = labels[i]; g.appendChild(tx);
      }
    });
  }
  function line(box, pts, labels, title) {
    var W = 640, H = 170, L = 40, Rr = 10, Tt = 10, B = 24, n = pts.length;
    if (!n) return;
    var max = nice(Math.max.apply(null, pts.map(function (v) { return v || 0; }).concat([1])));
    var x = function (i) { return L + (n === 1 ? (W - L - Rr) / 2 : i * (W - L - Rr) / (n - 1)); };
    var y = function (v) { return Tt + (H - Tt - B) * (1 - v / max); };
    var f = add(box, "figure", "rpt-chart"), g = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": title });
    f.appendChild(g);
    [0, 0.5, 1].forEach(function (k) {
      g.appendChild(svg("line", { "class": "grid", x1: L, x2: W - Rr, y1: y(max * k), y2: y(max * k) }));
      var tx = svg("text", { "class": "axis", x: L - 6, y: y(max * k) + 4, "text-anchor": "end" }); tx.textContent = nf.format(max * k); g.appendChild(tx);
    });
    var runs = [], cur = [];
    pts.forEach(function (v, i) { if (v == null) { if (cur.length) runs.push(cur); cur = []; } else cur.push([x(i), y(v)]); });
    if (cur.length) runs.push(cur);
    runs.forEach(function (r) {
      if (r.length === 1) { g.appendChild(svg("circle", { "class": "dotp", cx: r[0][0], cy: r[0][1], r: 3 })); return; }
      var dl = r.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join("");
      g.appendChild(svg("path", { "class": "area", d: dl + "L" + r[r.length - 1][0].toFixed(1) + " " + (H - B) + "L" + r[0][0].toFixed(1) + " " + (H - B) + "Z" }));
      g.appendChild(svg("path", { "class": "line", d: dl }));
    });
    [0, Math.floor((n - 1) / 2), n - 1].filter(function (v, i, a) { return a.indexOf(v) === i; }).forEach(function (i) {
      var tx = svg("text", { "class": "axis", x: x(i), y: H - 7, "text-anchor": i === 0 ? "start" : i === n - 1 ? "end" : "middle" });
      tx.textContent = labels[i]; g.appendChild(tx);
    });
  }

  function trends(d) {
    var s = section("rpt-trends", S.hTrends), k = d.k.people, t = d.totals, p = d.previous;
    add(s, "h3", null, S.vsPrev);
    if (d.period.prevFrom) add(s, "p", "rpt-lead", S.prevRange(fmtFull.format(day(d.period.prevFrom)), fmtFull.format(day(d.period.prevTo))));
    var g = add(s, "div", "rpt-deltas");
    [[S.kRefills, t.refills, p.refills, k], [S.kLitres, t.litres, p.litres, k], [S.kPeople, t.people, p.people, k],
     [S.kArrivals, t.arrivals, p.arrivals, d.k.anonymous]].forEach(function (r) {
      var c = add(g, "div", "rpt-delta"), ch = R.change(r[1], r[2]);
      add(c, "div", "l", r[0]);
      add(c, "div", "v", fig(r[1], r[3]));
      var dl = add(c, "div", "d" + (ch == null ? "" : ch >= 0 ? " up" : " down"), ch == null ? "—" : (ch >= 0 ? "▲ " : "▼ ") + pct.format(Math.abs(ch) / 100));
      dl.title = fig(r[2], r[3]);
      add(c, "div", "p", "← " + fig(r[2], r[3]));
    });
    var inP = function (m) { return m.t >= d.period.from.slice(0, 7) + "-01" && m.t <= d.period.to; };
    var fig1 = add(s, "div", "rpt-block");
    add(fig1, "h3", null, S.hMonths); add(fig1, "p", "rpt-lead", S.leadMonths);
    bars(fig1, d.months.map(function (m) { return m.refills; }), d.months.map(function (m) { return fmtMY.format(day(m.t)); }),
         { hi: d.months.map(inP), every: 3, last: true, k: k, title: S.hMonths });
    var f2 = add(s, "div", "rpt-block");
    add(f2, "h3", null, S.hSeasons); add(f2, "p", "rpt-lead", S.leadSeasons);
    bars(f2, d.seasons.map(function (m) { return m.refills; }), d.seasons.map(function (m) { return T.seasons[C.seasonOf(m.t)] + " " + m.t.slice(2, 4); }),
         { H: 150, every: 1, k: k, title: S.hSeasons });
    if (d.period.step === "day") {
      var f3 = add(s, "div", "rpt-block");
      add(f3, "h3", null, S.hSeries); add(f3, "p", "rpt-lead", T.trendLead);
      line(f3, d.series.map(function (m) { return m.refills; }), d.series.map(function (m) { return fmtDay.format(day(m.t)); }), S.hSeries);
    }
    var tm = add(s, "div", "rpt-two");
    if (d.weekdays && d.hours) {
      var w = add(tm, "div", "rpt-block"), h = add(tm, "div", "rpt-block");
      add(w, "h3", null, S.hWeek); add(w, "p", "rpt-lead", S.leadTime);
      bars(w, d.weekdays, [0, 1, 2, 3, 4, 5, 6].map(function (i) { return fmtWd.format(new Date(Date.UTC(2024, 0, 1 + i))); }), { W: 420, k: k, title: S.hWeek });
      add(h, "h3", null, S.hHours); add(h, "p", "rpt-lead", S.leadTime);
      bars(h, d.hours, S.bands, { W: 420, k: k, title: S.hHours });
    } else add(tm, "p", "rpt-note", S.timeOmitted(k));
  }

  function pointsTable(d) {
    var s = section("rpt-points", S.hPoints, S.leadPoints), k = d.k.people, a = d.k.anonymous;
    if (!d.points.length) { add(s, "p", "empty", T.noPoints); return; }
    var rows = d.points.slice(0, 60);
    // Two tables that fit a page's width: what the points served, then how reliably.
    function table(title, cols, cells) {
      add(s, "h3", null, title);
      var t = add(add(s, "div", "rpt-tablewrap"), "table", "rpt-table"), hr = add(add(t, "thead"), "tr"), tb = add(t, "tbody");
      [[S.cPoint, "pt"]].concat(cols.map(function (c) { return [c, "n"]; })).forEach(function (c) { add(hr, "th", c[1], c[0]).scope = "col"; });
      rows.forEach(function (p) {
        var tr = add(tb, "tr"), nm = add(tr, "td", "pt");
        add(nm, "div", "name", A.pointName(p));
        add(nm, "div", "sub", T.types[p.type]);
        cells(p).forEach(function (c) { add(tr, "td", "n" + (c[1] ? " " + c[1] : ""), c[0]); });
      });
    }
    var hid = function (v, kk) { return [fig(v, kk), v == null ? "hid" : ""]; };
    table(S.kRefills + " · " + S.cReviews, [S.cRefills, S.cPeople, S.cArrivals, S.cReviews, S.cRatings, S.cPhotos, S.cChecks], function (p) {
      return [hid(p.refills, k), hid(p.people, k), hid(p.arrivals, a), hid(p.reviews, k),
              [p.rating == null ? "—" : [p.rating, p.cleanliness, p.pressure].map(function (v) { return v == null ? "—" : nf1.format(v); }).join(" · ")],
              hid(p.photos, k), hid(p.checks, k)];
    });
    table(S.kUptime + " · " + S.cBreaks, [S.cUptime, S.cBreaks, S.cRepair, S.cLongest, S.cNow], function (p) {
      return [[p.uptime == null ? "—" : pct.format(p.uptime / 100), p.uptime != null && p.uptime < 90 ? "warn" : ""], [nf.format(p.incidents)],
              [p.repairDays == null ? "—" : S.days(nf1.format(p.repairDays))], [p.longest == null ? "—" : S.days(nf.format(p.longest))],
              [p.open ? S.open : T.status[p.flagged ? "not_working" : p.status || "none"], p.open || p.flagged ? "warn" : ""]];
    });
    if (d.points.length > 60) add(s, "p", "rpt-note", S.more(nf.format(d.points.length - 60), d.points.length - 60));
  }

  function reachSection(d, x, imp) {
    var s = section("rpt-reach", S.hReach), k = d.k.people, t = d.totals;
    if (!x.pop) add(s, "p", "rpt-note", S.noPopReach);
    else {
      var g = add(s, "div", "rpt-cards");
      [[S.r500, x.r500, "#6342b5"], [S.r1k, x.r1k, "#0aa5a3"]].forEach(function (r) {
        var c = add(g, "div", "rpt-card"); c.style.setProperty("--k", r[2]);
        add(c, "div", "l", r[0]); countUp(s, add(c, "div", "v"), r[1], nf.format);
      });
      if (t.refills != null && x.r1k > 0) {
        var c3 = add(g, "div", "rpt-card"); c3.style.setProperty("--k", "#1268e8");
        add(c3, "div", "l", S.rPer1000); add(c3, "div", "v", nf1.format(t.refills * 1000 / x.r1k));
      }
      add(s, "p", "rpt-note", S.reachNote);
    }
    if (d.scope.kind === "org") missing(s, d, x);
    if (d.scope.kind === "partner") summary(s, d, imp);
    else recommendations(s, d, x);
  }
  function missing(s, d, x) {
    add(s, "h3", null, S.hMissing);
    add(s, "p", "rpt-lead", S.leadMissing);
    if (d.totals.demand != null) add(s, "p", null, S.searchesTotal(nf.format(d.totals.demand), d.totals.demand));
    if (!x.under || !x.under.length) { add(s, "p", "rpt-note", x.pop ? S.noUnderserved : S.noPopReach); return; }
    var t = add(add(s, "div", "rpt-tablewrap"), "table", "rpt-table"), hr = add(add(t, "thead"), "tr");
    [[S.colCell, ""], [S.colResidents, "n"], [S.colWorking, "n"], [S.colSearches, "n"], [S.colScore, "n"]].forEach(function (c) { add(hr, "th", c[1], c[0]).scope = "col"; });
    var tb = add(t, "tbody");
    x.under.forEach(function (o) {
      var tr = add(tb, "tr");
      add(tr, "td", null, ll(o.c.ix, o.c.iy));
      add(tr, "td", "n", nf.format(Math.round(o.c.population || 0)));
      add(tr, "td", "n", nf.format(Math.max(0, o.c.water - o.c.broken)));
      add(tr, "td", "n" + (o.c.demand == null ? " hid" : ""), o.c.demand == null ? "—" : nf.format(o.c.demand));
      add(tr, "td", "n", nf.format(Math.round(o.x.score * 100)));
    });
  }
  function recommendations(s, d, x) {
    add(s, "h3", null, S.hRecs);
    var list = R.recommendations({
      kind: d.scope.kind, repairDays: d.totals.repairDays, change: R.change(d.totals.refills, d.previous.refills),
      points: d.points.map(function (p) { return { name: A.pointName(p), longest: p.longest, open: p.open, uptime: p.uptime, incidents: p.incidents }; }),
      beyond: x.beyond || null, demandTop: d.demandCells[0] || null
    });
    if (!list.length) { add(s, "p", "rpt-note", S.noRecs); return; }
    var ul = add(s, "ul", "rpt-recs");
    list.forEach(function (r) {
      var txt = r.key === "longBreak" ? S.recLongBreak(r.name, nf.format(r.days), r.median != null ? nf1.format(r.median) : null, r.days)
        : r.key === "stillBroken" ? S.recStillBroken(r.name, nf.format(r.days), r.days)
        : r.key === "beyond" ? S.recBeyond(nf.format(r.people), r.top ? nf.format(r.top.people) : null, r.top ? ll(r.top.ix, r.top.iy) : null, r.people)
        : r.key === "demand" ? S.recDemand(nf.format(r.demand), ll(r.ix, r.iy), r.demand)
        : r.key === "lowUptime" ? S.recLowUptime(nf.format(r.n), r.names.join(", "))
        : r.key === "neverChecked" ? S.recNeverChecked(nf.format(r.n))
        : r.key === "up" ? S.recUp(nf.format(r.pct)) : S.recDown(nf.format(r.pct));
      add(ul, "li", r.key, txt);
    });
  }
  function summary(s, d, imp) {
    var t = d.totals, k = d.k.people, ul;
    add(s, "h3", null, S.hSummary);
    ul = add(s, "ul", "rpt-recs");
    if (t.refills != null && t.people != null) add(ul, "li", null, S.sumRefills(nf.format(t.refills), nf.format(t.people), t.refills, t.people));
    if (imp) add(ul, "li", null, S.sumBottles(nf.format(Math.round(imp.bottles)), Math.round(imp.bottles)));
    if (t.arrivals != null) add(ul, "li", null, S.sumArrivals(nf.format(t.arrivals), t.arrivals));
    if (t.uptime != null) add(ul, "li", null, S.sumUptime(nf1.format(t.uptime)));
    if (t.rating != null) add(ul, "li", null, S.sumRating(nf1.format(t.rating)));
    if (t.refills == null || t.people == null || t.litres == null) add(ul, "li", "dim", S.sumHidden + " (" + S.hidden(k) + ")");
  }

  function method(d, x) {
    var s = section("rpt-method", S.hMethod), f = R.FACTORS[x.country], src = function (k) { return R.SOURCES[f.src[k]]; };
    add(s, "h3", null, S.mFactors);
    add(s, "p", "rpt-lead", S.factorsFor(S.countries[x.country]));
    var t = add(add(s, "div", "rpt-tablewrap"), "table", "rpt-table rpt-factors"), hr = add(add(t, "thead"), "tr");
    [S.colFactor, S.colValue, S.colSource, S.colGrade].forEach(function (h) { add(hr, "th", null, h).scope = "col"; });
    var tb = add(t, "tbody"), n3 = new Intl.NumberFormat(lang, { maximumFractionDigits: 5 });
    [[S.fPet, n3.format(f.pet) + " g", "pet"], [S.fBottled, n3.format(f.bottled) + " kg CO₂e/L", "bottled"], [S.fTap, n3.format(f.tap) + " kg CO₂e/L", "tap"],
     [S.fNet, n3.format(f.bottled - f.tap) + " kg CO₂e/L", null], [S.fCar, n3.format(f.car) + " kg CO₂e/km", "car"],
     f.collect != null ? [S.fCollect, pct.format(f.collect), "collect"] : null,
     f.price ? [S.fPrice, money2(f.price[0], f.currency) + " – " + money2(f.price[1], f.currency), "price"] : null]
      .filter(Boolean).forEach(function (r) {
        var tr = add(tb, "tr"), so = r[2] ? src(r[2]) : null;
        add(tr, "td", null, r[0]); add(tr, "td", "n", r[1]);
        add(tr, "td", "src", so ? so.cite : "= " + S.fBottled + " − " + S.fTap);
        add(tr, "td", "grade", so ? so.grade : "");
      });
    add(s, "p", "rpt-note", S.gradeNote);
    if (!f.price) add(s, "p", "rpt-note", S.noCountry);
    add(s, "p", "rpt-note", S.impactCaveat);
    add(s, "h3", null, S.mPrivacy);
    var ul = add(s, "ul", "rpt-list");
    S.privacyLines(d.k.people, d.rounded).forEach(function (l) { add(ul, "li", null, l); });
    add(s, "h3", null, S.mLimits);
    var ul2 = add(s, "ul", "rpt-list");
    S.limitLines.forEach(function (l) { add(ul2, "li", null, l); });
    if (A.popNote()) add(s, "p", "rpt-note", A.popNote());
    add(s, "p", "rpt-foot", S.foot(scopeName(d)) + (A.demo ? " · " + T.demo : ""));
  }
  function money2(v, cur) { return new Intl.NumberFormat(lang, { style: "currency", currency: cur, minimumFractionDigits: 2 }).format(v); }

  // ---- Motion and print ----
  function reveal() {
    var secs = doc.querySelectorAll(".rv");
    var go = function (sec) { if (sec.classList.contains("in")) return; sec.classList.add("in"); (sec._cu || []).forEach(function (f) { f(); }); };
    if (A.reduced || !("IntersectionObserver" in window)) { Array.prototype.forEach.call(secs, go); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); go(e.target); } });
    }, { threshold: 0.08 });
    Array.prototype.forEach.call(secs, function (sec) { io.observe(sec); });
  }
  function finish() { // every section shown, every figure at its last value
    Array.prototype.forEach.call(doc ? doc.querySelectorAll(".rv") : [], function (sec) { sec.classList.add("in"); sec._cu = []; });
    finals.forEach(function (f) { f[0].textContent = f[1]; });
  }
  window.addEventListener("beforeprint", finish);
  function printNow() { finish(); window.print(); }
  /** The running header and page numbers of the printed pages (@page margin boxes, through the CSSOM: the CSP allows it). */
  function printHeader(text) {
    var sheet = Array.prototype.filter.call(document.styleSheets, function (s) { return s.href && /\/report\.css(\?|$)/.test(s.href); })[0];
    if (!sheet) return;
    try {
      if (headRule != null && sheet.cssRules[headRule]) sheet.deleteRule(headRule);
      headRule = sheet.insertRule("@page { @top-left { content: " + R.cssString("WaterNow · " + text) + "; } " +
        "@bottom-left { content: " + R.cssString(S.confidential) + "; } " +
        "@bottom-right { content: " + R.cssString(S.pagePrefix) + " counter(page) \" / \" counter(pages); } }", sheet.cssRules.length);
    } catch (e) { headRule = null; /* a browser without margin boxes prints without them */ }
  }
  if (A.demo) window.WNC_REPORT = { finish: finish }; // the demo preview's captures settle the animations
})();
