/*
 * WaterNow Statistics, the private console (console/). Supabase sign-in (email and password) and its second factor
 * (TOTP, as the app's SupabaseMfa), then section 80's RPCs: stats_console_me, stats_overview, stats_point and, for
 * admins, stats_org_save / stats_org_member. Every figure arrives already floored by the server; this page only draws.
 * Population is public data: static blocks of the same EASE-Grid 2.0 cells (scripts/build-population-tiles.mjs) fetched
 * from <meta name="wn-pop"> and joined here, for the per-resident measures, the density and "Où l'eau manque".
 * Text goes in with textContent, SVG is built node by node; the session lives in sessionStorage (gone with the tab).
 */
(function () {
  "use strict";
  var C = window.WNC, WN = window.WN, STR = window.WNI.STRINGS;
  var $ = function (id) { return document.getElementById(id); };
  function meta(n) { var m = document.querySelector('meta[name="' + n + '"]'); return m ? m.getAttribute("content") : null; }
  var API = meta("wn-api") == null ? "https://pkqsvlbiznrqxfckaxll.supabase.co" : meta("wn-api");
  // Public by design, as on the other pages: the server's grants and checks protect the data.
  var KEY = "sb_publishable_Jw6cnMgupaVxupvltvUlPQ_mvwpiNVE";
  var DEMO = meta("wn-demo") === "1";
  var lang = WN.lang(WN.browserLangs(navigator)), T = STR[lang] || STR.en;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var dark = window.matchMedia("(prefers-color-scheme: dark)");
  var nf = new Intl.NumberFormat(lang), nf1 = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  var nfc = new Intl.NumberFormat(lang, { notation: "compact", maximumFractionDigits: 1 });
  // A count-up keeps one style from 0 to its last value: compact when that value is (no "999 999" then "1 M" midway).
  var bigFor = function (to) { return to >= 1e6 ? function (v) { return nfc.format(v); } : function (v) { return nf.format(Math.round(v)); }; };
  var fmtDay = new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", timeZone: "UTC" });
  var fmtMonth = new Intl.DateTimeFormat(lang, { month: "short", year: "2-digit", timeZone: "UTC" });
  var fmtFull = new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var day = function (d) { return new Date(d + "T00:00:00Z"); };

  // ---- DOM helpers (textContent only) ----
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function svg(tag, attrs) {
    var e = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function btn(parent, txt, cls) { var b = el("button", cls == null ? "primary" : cls, txt); b.type = "button"; parent.appendChild(b); return b; }
  function store(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { /* private window */ } }
  function read(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function enter(node) { node.classList.remove("enter"); void node.offsetWidth; node.classList.add("enter"); }

  document.documentElement.lang = lang;
  document.title = T.doc;
  [["brand", "brand"], ["privatePill", "private"], ["demoPill", "demo"], ["scopeLabel", "scope"], ["signOut", "signOut"],
   ["reportBtn", "report"], ["mapTitle", "mapTitle"], ["mapLead", "mapLead"], ["csvGrid", "csvGrid"], ["trendTitle", "trendTitle"],
   ["trendLead", "trendLead"], ["needTitle", "needTitle"], ["needLead", "needLead"], ["pointsNote", "pointsNote"],
   ["daysNote", "completeDays"], ["authTitle", "signInTitle"]].forEach(function (p) { $(p[0]).textContent = T[p[1]]; });
  $("map").setAttribute("aria-label", T.mapAria);
  if (DEMO) $("demoPill").classList.remove("hidden");

  // ---- Session and calls ----
  var SKEY = "wn-console-session", session = null;
  function keep(s) { session = s; store(SKEY, s ? JSON.stringify(s) : null); }
  function restore() {
    try {
      var s = JSON.parse(read(SKEY) || "null");
      return s && typeof s.access === "string" && typeof s.refresh === "string" && typeof s.exp === "number" ? s : null;
    } catch (e) { return null; }
  }
  function adopt(j) {
    if (!j || typeof j.access_token !== "string" || typeof j.refresh_token !== "string") return false;
    keep({ access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 });
    return true;
  }
  function call(path, method, body, auth) {
    var h = { apikey: KEY, "Content-Type": "application/json" };
    if (auth && session) h.Authorization = "Bearer " + session.access;
    return fetch(API + path, { method: method || "GET", headers: h, body: body == null ? undefined : JSON.stringify(body),
                               cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" })
      .then(function (r) {
        return r.text().then(function (t) { var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; } return { status: r.status, ok: r.ok, body: j }; });
      });
  }
  function fail(status, code) { var e = new Error(code || "failed"); e.status = status; e.code = code; return e; }
  // One refresh at a time: two calls refreshing with the same token would make Supabase revoke the session.
  var refreshing = null;
  function fresh() {
    if (!session || session.exp - Date.now() > 60000) return Promise.resolve();
    if (!refreshing) {
      refreshing = call("/auth/v1/token?grant_type=refresh_token", "POST", { refresh_token: session.refresh }).then(function (r) {
        if (!r.ok || !adopt(r.body)) { keep(null); throw fail(401, "signed_out"); }
      }).finally(function () { refreshing = null; });
    }
    return refreshing;
  }
  // Every signed-in call (the second factor's too): the token refreshed first, a 401 is the end of the session.
  async function authed(path, method, body) {
    await fresh();
    var r = await call(path, method, body, true);
    if (r.status === 401) { keep(null); throw fail(401, "signed_out"); }
    return r;
  }
  async function rpc(name, args) {
    var r = await authed("/rest/v1/rpc/" + name, "POST", args || {});
    if (!r.ok) throw fail(r.status, r.body && (r.body.code || r.body.error_code));
    return r.body;
  }
  // A picture into a public bucket ([path]: "<bucket>/<name>"; the bucket's policies decide who may, its limits what):
  // its public address, or throws {status, code} (Storage's error, e.g. "invalid_mime_type", "Payload too large").
  async function upload(path, file) {
    await fresh();
    var r = await fetch(API + "/storage/v1/object/" + path, {
      method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + (session ? session.access : ""), "Content-Type": file.type, "x-upsert": "false" },
      body: file, cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer"
    });
    if (r.status === 401) { keep(null); throw fail(401, "signed_out"); }
    if (!r.ok) { var j = await r.json().catch(function () { return null; }); throw fail(r.status, j && (j.error || j.message)); }
    return API + "/storage/v1/object/public/" + path;
  }
  // A file of a private bucket ([path]: "<bucket>/<name>", e.g. a bid's PDF in commons-bids) for [seconds]: Storage signs
  // it only if the bucket's policies let this account read it. The address, on the API's origin, or throws {status, code}.
  async function signed(path, seconds) {
    var r = await authed("/storage/v1/object/sign/" + path, "POST", { expiresIn: seconds });
    var u = r.ok && r.body && typeof r.body.signedURL === "string" ? r.body.signedURL : "";
    if (u.indexOf("/object/sign/" + path + "?token=") !== 0) throw fail(r.ok ? 502 : r.status, r.body && (r.body.error || r.body.message));
    return API + "/storage/v1" + u;
  }
  // Files of a bucket removed ([paths] inside it: a deleted demo project's bid PDFs in commons-bids, admins in aal2 by the
  // bucket's policies); Storage's answer, or throws {status, code}.
  async function remove(bucket, paths) {
    var r = await authed("/storage/v1/object/" + bucket, "DELETE", { prefixes: paths });
    if (!r.ok) throw fail(r.status, r.body && (r.body.error || r.body.message));
    return r.body;
  }
  // The session ended (expired, revoked, signed out elsewhere): start over from a clean page, nothing of the last
  // account's figures left on it, and say why on the sign-in screen.
  function lost() {
    keep(null);
    store("wn-console-ended", "1");
    location.reload();
  }

  // ---- The gate: sign-in, second factor, no access ----
  function gate(title, lead) {
    $("app").classList.add("hidden");
    $("topActions").classList.add("hidden");
    $("gate").classList.remove("hidden");
    $("authTitle").textContent = title;
    $("authLead").textContent = lead || "";
    say("");
    enter($("authCard"));
    return clear($("authBody"));
  }
  function say(t, cls) { var m = $("authMsg"); m.textContent = t || ""; m.className = "msg" + (cls ? " " + cls : ""); }
  function field(parent, id, label, type, attrs) {
    var l = el("label", "field", label); l.htmlFor = id;
    var i = el("input", "input"); i.id = id; i.type = type;
    Object.keys(attrs || {}).forEach(function (k) { i.setAttribute(k, attrs[k]); });
    parent.appendChild(l); parent.appendChild(i);
    return i;
  }
  // No <form> (the CSP allows no form action): Enter does what the button does.
  function onEnter(inputs, b) {
    inputs.forEach(function (i) { i.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.isComposing) b.click(); }); });
  }
  // Busy while its call is on its way: aria-disabled, not disabled, so the keyboard's focus stays on the button (a
  // disabled button drops it to <body>, and it never comes back with the answer); a second press does nothing.
  function waiting(b, on) { if (on) b.setAttribute("aria-disabled", "true"); else b.removeAttribute("aria-disabled"); }
  function isWaiting(b) { return b.getAttribute("aria-disabled") === "true"; }
  function outLink(parent) { var b = btn(parent, T.signOut, "ghost"); b.classList.add("wide-out"); b.addEventListener("click", signOut); }

  function showSignIn() {
    var b = gate(T.signInTitle, T.signInLead);
    var em = field(b, "em", T.email, "email", { autocomplete: "username", inputmode: "email", spellcheck: "false" });
    var pw = field(b, "pw", T.password, "password", { autocomplete: "current-password" });
    var go = btn(b, T.signIn);
    onEnter([em, pw], go);
    if (read("wn-console-ended")) { store("wn-console-ended", null); say(T.sessionEnded, "err"); }
    go.addEventListener("click", async function () {
      if (isWaiting(go)) return;
      if (!em.value.trim() || !pw.value) { say(T.badLogin, "err"); return; }
      waiting(go, true); go.textContent = T.signingIn; say("");
      try {
        var r = await call("/auth/v1/token?grant_type=password", "POST", { email: em.value.trim(), password: pw.value });
        if (r.ok && adopt(r.body)) { pw.value = ""; boot(); return; }
        say(r.status === 429 ? T.rateLimited : T.badLogin, "err");
      } catch (e) { say(T.offline, "err"); }
      waiting(go, false); go.textContent = T.signIn;
    });
    em.focus();
  }

  async function factors() {
    var r = await authed("/auth/v1/user", "GET", null);
    if (!r.ok) throw fail(r.status);
    return ((r.body && r.body.factors) || []).filter(function (f) { return f && f.factor_type === "totp" && UUID.test(f.id || ""); });
  }
  function refusal(r) {
    var code = (r.body && (r.body.error_code || r.body.code)) || "";
    if (r.status === 429 || /^over_/.test(code)) return "rate";
    if (code === "mfa_challenge_expired") return "expired";
    return code === "mfa_verification_failed" || r.status === 422 || r.status === 400 ? "wrong" : "failed";
  }
  async function verify(fid, code) {
    var c = await authed("/auth/v1/factors/" + fid + "/challenge", "POST", {});
    if (!c.ok) return refusal(c);
    var cid = c.body && c.body.id;
    if (!UUID.test(cid || "")) return "failed";
    var v = await authed("/auth/v1/factors/" + fid + "/verify", "POST", { challenge_id: cid, code: code });
    if (!v.ok) return refusal(v);
    return adopt(v.body) ? "ok" : "failed";
  }
  function codeForm(b, fid) {
    var i = field(b, "otp", T.code, "text", { inputmode: "numeric", autocomplete: "one-time-code", maxlength: "7" });
    i.classList.add("otp");
    var go = btn(b, T.verify);
    onEnter([i], go);
    i.addEventListener("input", function () { var d = C.totpDigits(i.value); if (i.value !== d) i.value = d; if (d.length === 6) go.click(); });
    go.addEventListener("click", async function () {
      var d = C.totpDigits(i.value);
      if (isWaiting(go)) return;
      if (d.length !== 6) { say(T.wrongCode, "err"); return; }
      waiting(go, true); say("");
      try {
        var res = await verify(fid, d);
        if (res === "ok") { boot(); return; }
        say(res === "rate" ? T.rateLimited : res === "expired" ? T.expired : res === "wrong" ? T.wrongCode : T.errorGeneric, "err");
        i.value = ""; i.focus();
      } catch (e) { if (e.status === 401) { lost(); return; } say(T.offline, "err"); }
      waiting(go, false);
    });
    outLink(b);
    i.focus();
  }
  async function showMfa() {
    var b = gate(T.mfaTitle, T.mfaLead);
    try {
      var f = (await factors()).filter(function (x) { return x.status === "verified"; })[0];
      if (!f) { showEnroll(); return; }
      codeForm(b, f.id);
    } catch (e) { if (e.status === 401) { lost(); return; } say(T.offline, "err"); outLink(b); }
  }
  function qrSvg(text) {
    var qr = window.qrcodegen.QrCode.encodeText(text, window.qrcodegen.QrCode.Ecc.MEDIUM), n = qr.size + 8, d = "";
    for (var y = 0; y < qr.size; y++) for (var x = 0; x < qr.size; x++) if (qr.getModule(x, y)) d += "M" + (x + 4) + " " + (y + 4) + "h1v1h-1z";
    var s = svg("svg", { "class": "qr", viewBox: "0 0 " + n + " " + n, role: "img", "aria-label": T.enrollTitle });
    s.appendChild(svg("path", { d: d }));
    return s;
  }
  async function showEnroll() {
    var b = gate(T.enrollTitle, T.enrollLead);
    try {
      var old = (await factors()).filter(function (f) { return f.status !== "verified"; });
      for (var i = 0; i < old.length; i++) await authed("/auth/v1/factors/" + old[i].id, "DELETE", null);
      var r = await authed("/auth/v1/factors", "POST", { factor_type: "totp", issuer: "WaterNow", friendly_name: "WaterNow Statistics" });
      var id = r.body && r.body.id, totp = (r.body && r.body.totp) || {};
      var uri = C.totpUri(totp.secret, totp.uri);
      if (!r.ok || !UUID.test(id || "") || !uri) { say(T.errorGeneric, "err"); outLink(b); return; }
      var wrap = el("div", "qrwrap"), side = el("div");
      wrap.appendChild(qrSvg(uri));
      side.appendChild(el("p", "muted small", T.secret));
      side.appendChild(el("p", "secret", C.groupSecret(totp.secret)));
      wrap.appendChild(side);
      b.appendChild(wrap);
      codeForm(b, id);
    } catch (e) { if (e.status === 401) { lost(); return; } say(T.offline, "err"); outLink(b); }
  }
  function invitesInto(parent, list) {
    (Array.isArray(list) ? list : []).forEach(function (inv) {
      if (!inv || typeof inv.org !== "number") return;
      var row = el("div", "invite"), acts = el("div", "row");
      row.appendChild(el("span", null, T.inviteText(C.text(inv.name, 80))));
      btn(acts, T.accept, "ghost").addEventListener("click", function () { answer(inv.org, true, row); });
      btn(acts, T.decline, "ghost").addEventListener("click", function () { answer(inv.org, false, row); });
      row.appendChild(acts);
      parent.appendChild(row);
    });
  }
  async function answer(org, yes, row) {
    Array.prototype.forEach.call(row.querySelectorAll("button"), function (b) { b.disabled = true; }); // one answer
    try { await rpc("stats_org_answer", { p_org: org, p_accept: yes }); } catch (e) { if (e.status === 401) { lost(); return; } }
    boot(); // shows what is left: the city opened, or the invite still there after an error
  }
  function showNoAccess(me) {
    var b = gate(T.noAccessTitle, T.noAccessText);
    invitesInto(b, me.invites);
    outLink(b);
  }
  async function signOut() {
    try { await call("/auth/v1/logout", "POST", {}, true); } catch (e) { /* the token expires anyway */ }
    keep(null);
    store("wn-console-scope", null);
    location.reload();
  }
  $("signOut").addEventListener("click", signOut);

  var me = null;
  async function boot() {
    if (!session) { showSignIn(); return; }
    try { me = await rpc("stats_console_me"); } catch (e) {
      if (e.status === 401) { lost(); return; }
      var b = gate(T.errorLoad, T.offline);
      btn(b, T.retry).addEventListener("click", boot);
      outLink(b);
      return;
    }
    var scopes = (Array.isArray(me.scopes) ? me.scopes : []).filter(function (s) { return s && typeof s.key === "string"; });
    if (!scopes.length) { showNoAccess(me); return; }
    if (me.mfa === "required") { showMfa(); return; }
    if (me.mfa === "enroll") { showEnroll(); return; }
    showConsole(scopes);
  }

  // ---- The console ----
  var PERIODS = ["7d", "30d", "90d", "season", "12m", "all"];
  var RAMPS = {
    blue: ["#cfe3ff", "#9cc6ff", "#5fa2f7", "#2f7fe6", "#1560c7", "#0b3f8f"],
    teal: ["#cdf3ef", "#93e2d9", "#52c9bd", "#22a89d", "#12857c", "#0b5c56"],
    warm: ["#fde3cf", "#fbbf94", "#f6955d", "#e8693a", "#c94a25", "#8f2d14"],
    violet: ["#e9e3fb", "#cbbdf3", "#a68fe6", "#8064d4", "#6041b3", "#3f267d"],
    amber: ["#fdf1c4", "#fbdc84", "#f5c04b", "#e89e22", "#c77a10", "#8c5208"]
  };
  var LAYERS = [
    { id: "refills", label: "lRefills", ramp: "blue" }, { id: "per1000", label: "lPer1000", ramp: "teal" },
    { id: "perPoint", label: "lPerPoint", ramp: "warm" }, { id: "density", label: "lDensity", ramp: "violet" },
    { id: "demand", label: "lDemand", ramp: "amber", demand: true }, { id: "need", label: "lUnderserved", ramp: "warm" }
  ];
  // On a dark map the ramps run from dim to bright: the many low cells stay near the background, the high ones glow.
  var rampOf = function (l) { return dark.matches ? RAMPS[l.ramp].slice().reverse() : RAMPS[l.ramp]; };
  var NEED_BREAKS = [0.15, 0.25, 0.35, 0.5, 0.7];
  var STATUS_COLORS = { working: "#12a06e", not_working: "#e0483b", low_pressure: "#e6a23c", dirty: "#e6a23c", closed_season: "#6d8fc4" };
  var state = { scope: null, period: "30d", layer: "refills", data: null, sel: null, req: 0, preq: 0, fit: true, series: "month" };
  var prev = {};
  // The fountain simulator and the coverage panels (simulator.js, coverage.js) read the page through this, and hear
  // "wnc:render" each time the figures are drawn. claim(e): a map click they take (the cell panel then stays shut).
  window.WNC_PAGE = { map: function () { return gl; }, data: function () { return state.data; }, scope: function () { return state.scope; },
                      rpc: rpc, lost: lost, mfa: showMfa, popInit: popInit, popBlock: popBlock, popLoad: popLoad, popAt: popAt, pointName: pointName,
                      openPoint: function (id) { openPoint(id, true); }, fmtFull: fmtFull, lang: lang, demo: DEMO, reduced: reduced,
                      dark: dark, claim: null };

  function scopeLabel(s) {
    return s.kind === "world" ? T.world : s.kind === "partner" ? T.partnerScope(C.text(s.name, 80)) : T.cityScope(C.text(s.name, 80));
  }
  function showConsole(scopes) {
    $("gate").classList.add("hidden");
    $("app").classList.remove("hidden");
    $("topActions").classList.remove("hidden");
    var sel = clear($("scope"));
    scopes.forEach(function (s) { var o = el("option", null, scopeLabel(s)); o.value = s.key; sel.appendChild(o); });
    var saved = read("wn-console-scope");
    state.scope = scopes.some(function (s) { return s.key === saved; }) ? saved : scopes[0].key;
    sel.value = state.scope;
    sel.onchange = function () { state.scope = sel.value; store("wn-console-scope", state.scope); state.sel = null; state.fit = true; load(); };
    invitesInto(clear($("invites")), me.invites);
    buildPeriods();
    renderCities();
    $("popNote").textContent = "";
    popInit().then(function (idx) { // CC BY 4.0: the attribution shows wherever the population does
      $("popNote").textContent = idx ? T.popSource(idx.source, idx.epoch) + " " + idx.attribution : T.noPop;
    });
    initMap();
    load();
  }

  // ---- Population: static blocks of 256 × 256 EASE cells (1, 8 and 64 km), fetched on demand, inflated natively ----
  var POP = meta("wn-pop") ? meta("wn-pop").replace(/\/?$/, "/") : "", popIndex = null, popReady = null;
  var popData = new Map(), popPending = new Map(), popFailed = new Set(), POP_KEEP = 160; // about 40 MB of blocks at most
  var bk = function (i) { return Math.floor(i / 256); };
  function popInit() {
    if (!popReady) {
      popReady = !POP ? Promise.resolve(null) : fetch(POP + "index.json", { credentials: "omit", referrerPolicy: "no-referrer" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (!j || j.grid !== "EPSG:6933" || j.block !== 256 || !Array.isArray(j.levels) || typeof DecompressionStream !== "function") return null;
          var lv = {};
          j.levels.forEach(function (l) {
            if (l && /^[0-9a-z]{1,8}$/.test(l.dir) && [1000, 8000, 64000].indexOf(l.cell) >= 0 && Array.isArray(l.blocks)) {
              lv[l.cell] = { dir: l.dir, has: new Set(l.blocks.filter(Array.isArray).map(function (b) { return b[0] + ":" + b[1]; })) };
            }
          });
          if (!lv[1000]) return null;
          popIndex = { lv: lv, total: typeof j.total === "number" && j.total > 0 ? j.total : 0, source: C.text(j.source, 120),
                       epoch: Math.floor(Number(j.epoch)) || "", attribution: C.text(j.attribution, 600) };
          return popIndex;
        }).catch(function () { return null; });
    }
    return popReady;
  }
  /**
   * Block (bx, by) of the [size] m level: Uint32Array of people, null (no one lives there) or false (it didn't load:
   * its cells read null, "not known", never 0 residents; the next call tries again).
   */
  function popBlock(size, bx, by) {
    var L = popIndex && popIndex.lv[size], key = size + ":" + bx + ":" + by;
    if (!L || !L.has.has(bx + ":" + by)) return Promise.resolve(null);
    if (popData.has(key)) { var v = popData.get(key); popData.delete(key); popData.set(key, v); return Promise.resolve(v); }
    if (popPending.has(key)) return popPending.get(key);
    var p = fetch(POP + L.dir + "/" + bx + "_" + by + ".gz", { credentials: "omit", referrerPolicy: "no-referrer" })
      .then(function (r) { if (!r.ok) throw fail(r.status); return r.arrayBuffer(); })
      .then(function (buf) { // gzip as stored; a server that already inflated it (Content-Encoding) is fine too
        var u = new Uint8Array(buf);
        return u[0] === 0x1f && u[1] === 0x8b ? new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer() : buf;
      })
      .then(function (buf) {
        var cells = C.unshuffle(new Uint8Array(buf));
        if (cells.length !== 65536) throw fail(0);
        popData.set(key, cells); popFailed.delete(key);
        if (popData.size > POP_KEEP) popData.delete(popData.keys().next().value);
        return cells;
      })
      .catch(function () { popFailed.add(key); return false; })
      .finally(function () { popPending.delete(key); });
    popPending.set(key, p);
    return p;
  }
  /** The people of cell (ix, iy) of the [size] m level, from a block already here; 0 when no one lives there, null when its block didn't load. */
  function popAt(size, ix, iy) {
    var bx = bk(ix), by = bk(iy), key = size + ":" + bx + ":" + by, v = popData.get(key);
    return v ? v[(by * 256 + 255 - iy) * 256 + ix - bx * 256] : popFailed.has(key) ? null : 0;
  }
  /** Loads the blocks [keys] ("bx:by"): true when every one is here (or empty), false when one didn't load. */
  function popLoad(size, keys) {
    return Promise.all(Array.from(keys).map(function (k) { var p = k.split(":"); return popBlock(size, +p[0], +p[1]); }))
      .then(function (r) { return r.indexOf(false) < 0; });
  }
  function virtualCell(ix, iy, p) {
    return { ix: ix, iy: iy, refills: null, people: null, water: 0, toilets: 0, broken: 0, demand: null, population: p };
  }
  /**
   * The population joined to an answer: each cell's residents, the scope's (the world's total, a city's territory, the
   * cells of a partner's points), a city's populated cells, and the blocks around the scope's cells.
   */
  async function popJoin(d) {
    var idx = await popInit();
    if (!idx) return;
    var near = new Set();
    d.cells.forEach(function (c) { near.add(bk(c.ix) + ":" + bk(c.iy)); });
    var terr = new Set();
    (d.territory || []).forEach(function (r) { for (var bx = bk(r[1]); bx <= bk(r[2]); bx++) terr.add(bx + ":" + bk(r[0])); });
    var ok = await popLoad(1000, new Set(Array.from(near).concat(Array.from(terr))));
    d.cells.forEach(function (c) { c.population = popAt(1000, c.ix, c.iy); });
    d.near = near;
    // A block that didn't load leaves the scope's residents unknown ("not loaded"), not short (the world's total is the index's).
    d.popLost = !ok && d.scope.kind !== "world";
    if (d.territory) {
      var seen = new Set(d.cells.map(function (c) { return c.ix + ":" + c.iy; })), sum = 0;
      d.terrCells = [];
      d.territory.forEach(function (r) {
        for (var ix = r[1]; ix <= r[2]; ix++) {
          var p = popAt(1000, ix, r[0]);
          sum += p;
          if (p > 0 && !seen.has(ix + ":" + r[0])) d.terrCells.push(virtualCell(ix, r[0], p));
        }
      });
      d.totals.population = d.popLost ? null : sum;
    } else {
      d.totals.population = d.scope.kind === "world" ? idx.total : d.popLost ? null
        : d.cells.reduce(function (s, c) { return s + (c.population || 0); }, 0);
    }
  }
  function buildPeriods() {
    var box = clear($("periods"));
    box.setAttribute("aria-label", T.period);
    PERIODS.forEach(function (p) {
      var b = btn(box, T["p" + p], "");
      b.setAttribute("aria-pressed", String(p === state.period));
      b.addEventListener("click", function () {
        if (state.period === p) return;
        state.period = p;
        Array.prototype.forEach.call(box.children, function (c, i) { c.setAttribute("aria-pressed", String(PERIODS[i] === p)); });
        load();
      });
    });
  }
  function buildLayers() {
    var box = clear($("layers")), d = state.data;
    // A partner has no searches: back to refills before the buttons are drawn, so one of them shows pressed.
    if (!d.hasDemand && LAYERS.filter(function (l) { return l.id === state.layer; })[0].demand) state.layer = "refills";
    LAYERS.forEach(function (l) {
      if (l.demand && !d.hasDemand) return;
      var b = btn(box, "", "");
      b.style.setProperty("--chip", RAMPS[l.ramp][3]);
      b.appendChild(el("i"));
      b.appendChild(document.createTextNode(T[l.label]));
      b.setAttribute("aria-pressed", String(l.id === state.layer));
      b.addEventListener("click", function () {
        state.layer = l.id;
        Array.prototype.forEach.call(box.children, function (c) { c.setAttribute("aria-pressed", String(c === b)); });
        drawMap(false);
      });
    });
  }

  async function load() {
    var id = ++state.req;
    busy(true);
    try {
      var d = C.cleanOverview(await rpc("stats_overview", { p_scope: state.scope, p_period: state.period }));
      if (id !== state.req) return;
      if (!d) throw fail(0, "bad_answer");
      await popJoin(d); // the residents: without them (no file, offline) the per-resident measures stay empty
      if (id !== state.req) return;
      state.data = d;
      busy(false);
      render();
    } catch (e) {
      if (id !== state.req) return;
      busy(false);
      if (e.status === 401) { lost(); return; }
      if (e.code === "WNMFA") { showMfa(); return; }
      if (!state.data) { clear($("kpis")); clear($("trend")); } // no endless shimmer on a first load that failed
      var p = clear($("panelBody"));
      p.appendChild(el("p", "empty", T.errorLoad));
      btn(p, T.retry, "ghost").addEventListener("click", load);
    }
  }
  function busy(on) {
    $("app").classList.toggle("busy", on && !!state.data);
    if (on && !state.data) skeleton();
  }
  function skeleton() {
    var k = clear($("kpis"));
    for (var i = 0; i < 6; i++) {
      var c = el("div", "card kpi");
      c.appendChild(el("div", "skel skel-line"));
      c.appendChild(el("div", "skel skel-line"));
      k.appendChild(c);
    }
    var p = clear($("panelBody"));
    for (var j = 0; j < 8; j++) p.appendChild(el("div", "skel skel-line"));
    var t = clear($("trend"));
    t.appendChild(el("div", "skel skel-line"));
  }

  function render() {
    var d = state.data;
    $("range").textContent = fmtFull.format(day(d.period.from)) + " – " + fmtFull.format(day(d.period.to));
    $("privacy").textContent = T.privacy(d.k.people);
    buildLayers();
    kpis(d);
    drawMap(state.fit);
    state.fit = false;
    if (state.sel && state.sel.kind === "point") openPoint(state.sel.id, false);
    else if (state.sel && state.sel.kind === "cell") openCell(state.sel.ix, state.sel.iy, false);
    else showRanking();
    lineChart(clear($("trend")), d.trend, d.period.step, "tf1");
    needList(d);
    document.dispatchEvent(new Event("wnc:render"));
  }

  // A number, or "< k" (with the reason as its title) when the server held it back.
  function shown(node, v, k, fmt) {
    if (v == null) { node.textContent = T.fewerShort(k); node.title = T.fewer(k); node.classList.add("hid"); return; }
    node.textContent = (fmt || nf.format)(v);
  }
  function countUp(node, key, to, fmt) {
    fmt = fmt || bigFor(to);
    var from = typeof prev[key] === "number" ? prev[key] : 0;
    prev[key] = to;
    if (reduced || from === to) { node.textContent = fmt(to); return; }
    var t0 = performance.now(), dur = 950;
    (function step(now) {
      var p = C.ease((now - t0) / dur);
      node.textContent = fmt(from + (to - from) * p);
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }
  function kpis(d) {
    var t = d.totals, k = d.k.people, box = clear($("kpis"));
    // Per 1,000 residents of the whole world would read 0: only for a city or a partner's surroundings.
    var per1000 = t.refills != null && t.population > 0 && d.scope.kind !== "world" ? t.refills * 1000 / t.population : null;
    [
      { key: "refills", l: "kRefills", v: t.refills, c: "#1268e8", member: true },
      { key: "people", l: "kPeople", v: t.people, c: "#0aa5a3", member: true },
      { key: "bottles", l: "kBottles", v: t.bottles, c: "#12805c", member: true },
      { key: "water", l: "kWater", v: t.water, c: "#3b82f6", sub: T.kToilets + " · " + nf.format(t.toilets) },
      { key: "broken", l: "kBroken", v: t.broken, c: "#d9483b" },
      { key: "repair", l: "kRepair", v: t.repairDays, c: "#d97706", days: true },
      d.hasDemand && { key: "demand", l: "kDemand", v: t.demand, c: "#e9a227", anon: true },
      (t.population > 0 || d.popLost) && { key: "pop", l: "kPopulation", v: t.population, c: "#6342b5", lost: d.popLost,
                                           sub: per1000 != null ? T.kPer1000 + " · " + nf1.format(per1000) : null }
    ].filter(Boolean).forEach(function (x) {
      var c = el("div", "card kpi"), v = el("div", "v");
      c.style.setProperty("--k", x.c);
      c.appendChild(el("div", "l", T[x.l]));
      c.appendChild(v);
      if (x.lost) { // a population block didn't load: unknown, not 0
        v.classList.add("hid"); v.textContent = "—";
        c.appendChild(el("div", "s", T.noPop));
        prev[x.key] = 0;
      } else if (x.v == null) {
        v.classList.add("hid");
        v.textContent = x.days ? "—" : T.fewerShort(x.anon ? d.k.anonymous : k);
        if (!x.days) c.appendChild(el("div", "s", x.anon ? T.fewerShort(d.k.anonymous) : T.fewer(k)));
        prev[x.key] = 0;
      } else if (x.days) {
        countUp(v, x.key, x.v, function (n) { return T.repairDays(nf1.format(n)); });
        c.appendChild(el("div", "s", T.repairs + " · " + nf.format(t.repairs)));
      } else {
        countUp(v, x.key, x.v);
        if (x.sub) c.appendChild(el("div", "s", x.sub));
      }
      box.appendChild(c);
    });
  }

  // ---- Map ----
  var EMPTY = { type: "FeatureCollection", features: [] };
  var wnMap = null, gl = null, cellsGeo = EMPTY, ptsGeo = EMPTY, heatGeo = EMPTY, popGeo = EMPTY, selGeo = EMPTY;
  var legendBreaks = [], viewCells = null;
  // Residents per km², fixed so a colour means the same everywhere and at every zoom: countryside, villages, towns,
  // suburbs, cities, the densest cores (Tokyo, Lagos, Dhaka pass 12,000).
  var DENSITY_BREAKS = [10, 100, 1000, 4000, 12000];
  function initMap() {
    if (wnMap || !window.maplibregl) return;
    wnMap = WN.map($("map"), lang, [-73.6, 45.5], 2.2, "wn-marker");
    if (!wnMap) return;
    gl = wnMap.gl;
    if (DEMO) window.WNC_MAP = gl; // the demo preview only: its captures move the map (scripts/console-preview.mjs)
    gl.on("styledata", ensureLayers);
    gl.on("moveend", popView);
    gl.on("click", function (e) {
      if (!gl.getLayer("pts") || !state.data) return;
      if (window.WNC_PAGE.claim && window.WNC_PAGE.claim(e)) return;
      var f = gl.queryRenderedFeatures(e.point, { layers: ["pts"] });
      if (f.length) { openPoint(f[0].properties.id, true); return; }
      // Any cell: one with activity, or with residents (its block loaded first when zoomed out). A click on a world
      // copy (the map panned past ±180°) reads its longitude back into [-180, 180]: the grid knows no other.
      var ll = e.lngLat.wrap(), c = C.cellOf(ll.lat, ll.lng);
      popBlock(1000, bk(c.ix), bk(c.iy)).then(function () {
        if (cellAt(c.ix, c.iy) || popAt(1000, c.ix, c.iy) > 0) openCell(c.ix, c.iy, true);
      });
    });
    gl.on("mousemove", function (e) {
      if (!gl.getLayer("pts")) return;
      gl.getCanvas().style.cursor = gl.queryRenderedFeatures(e.point, { layers: ["pts", "cells-fill", "pop-fill"] }).length ? "pointer" : "";
    });
  }
  function heatColor() {
    var r = rampOf(LAYERS.filter(function (x) { return x.id === state.layer; })[0]);
    return ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(0,0,0,0)", 0.12, r[1], 0.3, r[2], 0.55, r[3], 0.8, r[4], 1, r[5]];
  }
  // Classes 0..5 on the layer's ramp; -2 a cell with points but no figure shown; -10..-15 people and no working point
  // (darker with more residents per km²).
  function colorExpr() {
    var l = LAYERS.filter(function (x) { return x.id === state.layer; })[0], r = rampOf(l);
    return ["match", ["get", "b"], 0, r[0], 1, r[1], 2, r[2], 3, r[3], 4, r[4], 5, r[5],
            -2, dark.matches ? "rgba(148,163,184,0.22)" : "rgba(100,116,139,0.16)",
            -10, "rgba(143,45,20,0.22)", -11, "rgba(143,45,20,0.36)", -12, "rgba(143,45,20,0.5)", -13, "rgba(143,45,20,0.66)",
            -14, "rgba(143,45,20,0.82)", -15, "#8f2d14", "rgba(0,0,0,0)"];
  }
  function ensureLayers() {
    if (!gl) return;
    try {
      if (!gl.getSource("cells")) gl.addSource("cells", { type: "geojson", data: cellsGeo });
      if (!gl.getSource("pts")) gl.addSource("pts", { type: "geojson", data: ptsGeo });
      if (!gl.getSource("heat")) gl.addSource("heat", { type: "geojson", data: heatGeo });
      if (!gl.getSource("pop")) gl.addSource("pop", { type: "geojson", data: popGeo });
      if (!gl.getSource("sel")) gl.addSource("sel", { type: "geojson", data: selGeo });
      var under = (gl.getStyle().layers.filter(function (l) { return l.type === "symbol"; })[0] || {}).id; // data under the labels
      // Seen from afar a 1 km cell is a pixel: a soft heat of the same values, fading out as the grid comes in.
      if (!gl.getLayer("cells-heat")) {
        gl.addLayer({ id: "cells-heat", type: "heatmap", source: "heat", maxzoom: 11.5, paint: {
          "heatmap-weight": ["get", "w"], "heatmap-color": heatColor(),
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 3, 0.6, 9, 1.6, 11, 2.4],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 3, 4, 7, 9, 9, 16, 11, 24],
          "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 8.5, 0.85, 11, 0] } }, under);
      }
      if (!gl.getLayer("pop-fill")) { // residents: every populated cell in view, under the cells with activity
        gl.addLayer({ id: "pop-fill", type: "fill", source: "pop", paint: { "fill-color": colorExpr(), "fill-opacity": opacity(1),
                                                                             "fill-antialias": false } }, under);
      }
      if (!gl.getLayer("cells-fill")) {
        gl.addLayer({ id: "cells-fill", type: "fill", source: "cells", paint: { "fill-color": colorExpr(), "fill-opacity": opacity(0) } }, under);
        fadeIn();
      }
      if (!gl.getLayer("cells-line")) {
        gl.addLayer({ id: "cells-line", type: "line", source: "cells", filter: [">=", ["get", "b"], -2], paint: {
          "line-color": dark.matches ? "rgba(255,255,255,0.18)" : "rgba(15,23,42,0.14)",
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0, 10, 0.4, 14, 1] } }, under);
      }
      if (!gl.getLayer("cells-sel")) {
        gl.addLayer({ id: "cells-sel", type: "line", source: "sel", paint: { "line-color": dark.matches ? "#ffffff" : "#0f172a", "line-width": 2.5 } });
      }
      if (!gl.getLayer("pts")) {
        gl.addLayer({ id: "pts", type: "circle", source: "pts", minzoom: 9.5, paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 9.5, 2.5, 12, 4.5, 15, 8],
          "circle-opacity": ["interpolate", ["linear"], ["zoom"], 9.5, 0, 10.5, 1],
          "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 9.5, 0, 10.5, 1],
          "circle-color": ["match", ["get", "s"], "working", STATUS_COLORS.working, "not_working", STATUS_COLORS.not_working,
                           "low_pressure", STATUS_COLORS.low_pressure, "dirty", STATUS_COLORS.dirty, "closed_season", STATUS_COLORS.closed_season,
                           "flag", STATUS_COLORS.not_working, dark.matches ? "#cbd5e1" : "#ffffff"],
          "circle-stroke-color": dark.matches ? "#0a0f1a" : "#1268e8", "circle-stroke-width": 1.4 } });
      }
    } catch (e) { /* the style is still loading: the next styledata adds them */ }
  }
  // Lighter as the streets come in. MapLibre doesn't transition zoom expressions, so the fade-in scales it frame by
  // frame over 0.8 s (at once with prefers-reduced-motion).
  var fadeRaf = 0;
  function opacity(f) { return ["interpolate", ["linear"], ["zoom"], 9, 0.82 * f, 12, 0.6 * f, 15, 0.3 * f]; }
  function fadeIn() {
    if (!gl || !gl.getLayer("cells-fill")) return;
    cancelAnimationFrame(fadeRaf);
    if (reduced) { gl.setPaintProperty("cells-fill", "fill-opacity", opacity(1)); return; }
    var t0 = performance.now();
    (function step(now) {
      if (!gl.getLayer("cells-fill")) return;
      var p = C.ease((now - t0) / 800);
      gl.setPaintProperty("cells-fill", "fill-opacity", opacity(p));
      if (p < 1) fadeRaf = requestAnimationFrame(step);
    })(t0);
  }
  function cellAt(ix, iy) { return state.data.cells.filter(function (c) { return c.ix === ix && c.iy === iy; })[0]; }
  var noPointClass = function (pop) { return -10 - Math.max(0, C.classOf(pop, DENSITY_BREAKS)); };
  // A cell's value on the current layer (a number to class), or a code: -1 nothing, -2 points without a figure shown,
  // -10..-15 people and no working point. Density is the population layer's alone (every populated cell, pop-fill).
  function value(c, x) {
    switch (state.layer) {
      case "refills": return c.refills != null ? c.refills : c.water + c.toilets > 0 ? -2 : -1;
      case "per1000": return x.per1000 != null ? x.per1000 : c.water + c.toilets > 0 && c.population ? -2 : -1;
      case "perPoint": return x.noPoint ? noPointClass(c.population) : x.perPoint != null ? x.perPoint : -1;
      case "density": return -1;
      case "demand": return c.demand != null ? c.demand : -1;
      default: return x.score > 0 ? x.score : -1;
    }
  }
  function layerBreaks(vals) {
    return state.layer === "need" ? NEED_BREAKS : state.layer === "density" ? DENSITY_BREAKS : C.breaks(vals, 6);
  }
  function drawMap(fit) {
    var d = state.data;
    var vals = d.cells.map(function (c) { return value(c, C.derive(c)); });
    legendBreaks = layerBreaks(vals);
    cellsGeo = { type: "FeatureCollection", features: d.cells.map(function (c, i) {
      var v = vals[i], b = v < 0 ? v : C.classOf(v, legendBreaks);
      return { type: "Feature", properties: { k: c.ix + ":" + c.iy, ix: c.ix, iy: c.iy, b: b },
               geometry: { type: "Polygon", coordinates: [C.cellRing(c.ix, c.iy)] } };
    }) };
    heatGeo = { type: "FeatureCollection", features: cellsGeo.features.filter(function (f) { return f.properties.b >= 0 || f.properties.b <= -10; })
      .map(function (f) { var b = f.properties.b; return { type: "Feature", properties: { w: b <= -10 ? (-9 - b) / 6 : (b + 1) / 6 },
        geometry: { type: "Point", coordinates: C.cellCentre(f.properties.ix, f.properties.iy) } }; }) };
    ptsGeo = { type: "FeatureCollection", features: d.points.map(function (p) {
      return { type: "Feature", properties: { id: p.id, s: p.flagged ? "flag" : p.status || "none" }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } };
    }) };
    if (gl) {
      if (gl.getSource("cells")) gl.getSource("cells").setData(cellsGeo);
      if (gl.getSource("pts")) gl.getSource("pts").setData(ptsGeo);
      if (gl.getSource("heat")) gl.getSource("heat").setData(heatGeo);
      if (gl.getLayer("cells-heat")) gl.setPaintProperty("cells-heat", "heatmap-color", heatColor());
      if (gl.getLayer("cells-fill")) { gl.setPaintProperty("cells-fill", "fill-color", colorExpr()); fadeIn(); }
      if (gl.getLayer("pop-fill")) gl.setPaintProperty("pop-fill", "fill-color", colorExpr());
      if (fit) fitAll();
    }
    popView();
    legend();
  }
  // The population in view, redrawn after each move (debounced): every populated cell of the level the zoom asks for
  // (64 km far out, 8 km, then 1 km from zoom 8.5), merged by rows. Density shows at every level; residents without
  // a working point and the need score only on the 1 km grid (where they mean something), the cells with activity
  // drawn on top by cells-fill.
  var popTimer = 0, popReq = 0;
  function popView() { clearTimeout(popTimer); popTimer = setTimeout(popDraw, 150); }
  async function popDraw() {
    if (!gl || !gl.getSource("pop") || !state.data) return;
    var id = ++popReq, l = state.layer, z = gl.getZoom(), size = z < 5 ? 64000 : z < 8.5 ? 8000 : 1000;
    var on = popIndex && (l === "density" || (size === 1000 && (l === "perPoint" || l === "need")));
    // A view on a world copy is drawn from the copy at [-180, 180] (MapLibre repeats it on every copy).
    var b = gl.getBounds(), mid = (b.getWest() + b.getEast()) / 2, sh = ((mid + 180) % 360 + 360) % 360 - 180 - mid;
    var w = Math.max(-180, b.getWest() + sh), e = Math.min(179.999, b.getEast() + sh);
    var s = Math.max(-85, b.getSouth()), n = Math.min(85, b.getNorth());
    var ix0 = Math.floor(C.easeForward(0, w)[0] / size), ix1 = Math.floor(C.easeForward(0, e)[0] / size);
    var iy0 = Math.floor(C.easeForward(s, 0)[1] / size), iy1 = Math.floor(C.easeForward(n, 0)[1] / size);
    if (!on || (ix1 - ix0 + 1) * (iy1 - iy0 + 1) > 600000) { viewCells = null; gl.getSource("pop").setData(popGeo = EMPTY); refreshNeed(); return; }
    var keys = new Set();
    for (var by = bk(iy0); by <= bk(iy1); by++) for (var bx = bk(ix0); bx <= bk(ix1); bx++) keys.add(bx + ":" + by);
    await popLoad(size, keys);
    if (id !== popReq || !gl.getSource("pop")) return;
    var area = size * size / 1e6, act = new Set(state.data.cells.map(function (c) { return c.ix + ":" + c.iy; }));
    popGeo = { type: "FeatureCollection", features: C.rowRuns(ix0, ix1, iy0, iy1, size, function (ix, iy) {
      var p = popAt(size, ix, iy);
      if (!(p >= 1)) return null;
      if (l === "density") return C.classOf(p / area, DENSITY_BREAKS);
      if (act.has(ix + ":" + iy)) return null;
      if (l === "perPoint") return noPointClass(p);
      var sc = C.derive(virtualCell(ix, iy, p)).score;
      return sc > 0 ? C.classOf(sc, NEED_BREAKS) : null;
    }) };
    gl.getSource("pop").setData(popGeo);
    viewCells = size === 1000 ? { ix0: ix0, ix1: ix1, iy0: iy0, iy1: iy1 } : null;
    refreshNeed();
  }
  function fitAll() {
    var d = state.data, w = 180, s = 90, e = -180, n = -90;
    function add(lon, lat) { w = Math.min(w, lon); e = Math.max(e, lon); s = Math.min(s, lat); n = Math.max(n, lat); }
    d.points.forEach(function (p) { add(p.lon, p.lat); });
    d.cells.forEach(function (c) { if (c.water || c.refills != null || c.demand != null) { var ll = C.cellCentre(c.ix, c.iy); add(ll[0], ll[1]); } });
    (d.territory || []).forEach(function (r) { [r[1], r[2]].forEach(function (ix) { var ll = C.cellCentre(ix, r[0]); add(ll[0], ll[1]); }); });
    if (w > e) return;
    var small = $("map").clientWidth < 600;
    gl.fitBounds([[w, s], [e, n]], { padding: small ? { top: 30, right: 30, bottom: 120, left: 30 } : { top: 50, right: 70, bottom: 140, left: 60 },
                                     maxZoom: 12.5, duration: reduced ? 0 : 1400 });
  }
  function legend() {
    var box = clear($("legend")), l = LAYERS.filter(function (x) { return x.id === state.layer; })[0], r = rampOf(l), k = state.data.k.people;
    box.appendChild(el("b", null, T[l.label]));
    var ramp = el("div", "ramp");
    r.forEach(function (c) { var s = el("span"); s.style.background = c; ramp.appendChild(s); });
    box.appendChild(ramp);
    var ends = el("div", "ends");
    // The need score as the panel and the list say it (out of 100); fractions for per 1,000; residents per km².
    var fmt = state.layer === "need" ? scoreText : state.layer === "per1000" ? function (v) { return nf1.format(v); }
      : state.layer === "density" ? function (v) { return nf.format(v) + " /km²"; } : function (v) { return nf.format(Math.round(v)); };
    ends.appendChild(el("span", null, legendBreaks.length ? "< " + fmt(legendBreaks[0]) : T.legendLow));
    ends.appendChild(el("span", null, legendBreaks.length ? "≥ " + fmt(legendBreaks[legendBreaks.length - 1]) : T.legendHigh));
    box.appendChild(ends);
    if (state.layer === "refills" || state.layer === "per1000") {
      var h = el("div", "hid"); h.appendChild(el("i")); h.appendChild(el("span", null, T.legendHidden(k))); box.appendChild(h);
    }
    if (state.layer === "perPoint") {
      var np = el("div", "hid nop"); np.appendChild(el("i")); np.appendChild(el("span", null, T.legendNoPoint)); box.appendChild(np);
    }
    if (!popIndex && ["per1000", "perPoint", "density", "need"].indexOf(state.layer) >= 0) box.appendChild(el("div", "hid", T.noPop));
  }
  // The selected cell's outline (any cell: one with activity or only residents).
  function select(ix, iy) {
    selGeo = ix == null ? EMPTY : { type: "FeatureCollection", features: [{ type: "Feature", properties: {},
      geometry: { type: "Polygon", coordinates: [C.cellRing(ix, iy)] } }] };
    if (gl && gl.getSource("sel")) gl.getSource("sel").setData(selGeo);
  }
  function flyTo(ll, zoom) {
    if (!gl) return;
    gl.flyTo({ center: ll, zoom: zoom, speed: 0.9, curve: 1.42, essential: false });
  }

  // ---- Side panel: ranking, a cell, a point ----
  // The side panel, rebuilt. When the keyboard was in it (a row opened with Enter, "Back"), the focus moves to the new
  // panel's first control instead of falling back to the page's top (the point's loading skeleton has none: wait for it).
  var panelFocus = false;
  function panel(build) {
    var p = $("panelBody"), had = panelFocus || p.contains(document.activeElement);
    clear(p); enter(p); build(p);
    var f = had ? p.querySelector("button, [tabindex='0']") : null;
    panelFocus = had && !f;
    if (f) f.focus({ preventScroll: true });
  }
  function pointName(p) { return p.name && !WN.isDefaultName(p.name) ? p.name : T.types[p.type]; }
  function head(p, title, action) {
    var h = el("div", "card-head");
    h.appendChild(el("h2", null, title));
    if (action) h.appendChild(action);
    p.appendChild(h);
  }
  function csvBtn(label, fn) { var b = el("button", "ghost small-btn", label); b.type = "button"; b.addEventListener("click", fn); return b; }
  function statusOf(p) { return p.flagged ? "flag" : p.status || "none"; }
  function statusText(s) { return s === "flag" ? T.flagged : T.status[s] || T.status.none; }
  function showRanking() {
    state.sel = null;
    select(null);
    var d = state.data, k = d.k.people;
    panel(function (p) {
      head(p, T.rankingTitle, csvBtn(T.csvPoints, exportPoints));
      if (!d.points.length) { p.appendChild(el("p", "empty", T.noPoints)); return; }
      var t = el("table", "rank"), th = el("thead"), hr = el("tr");
      [["#", ""], [T.colPoint, ""], [T.colRefills, "n"], [T.colPeople, "n"], ["", ""]].forEach(function (c) {
        var x = el("th", c[1], c[0]); x.scope = "col"; hr.appendChild(x);
      });
      th.appendChild(hr); t.appendChild(th);
      var tb = el("tbody"), shownRows = 0;
      function rows(n) { d.points.slice(shownRows, shownRows + n).forEach(row); shownRows = Math.min(d.points.length, shownRows + n); more.classList.toggle("hidden", shownRows >= d.points.length); }
      var more = el("button", "ghost wide-out", T.more); more.type = "button";
      more.addEventListener("click", function () { rows(25); });
      function row(pt, j) {
        var i = shownRows + j, tr = el("tr", "row");
        tr.tabIndex = 0;
        tr.appendChild(el("td", "n muted", String(i + 1)));
        var nm = el("td"); nm.appendChild(el("div", "name", pointName(pt))); nm.appendChild(el("div", "sub", T.types[pt.type])); tr.appendChild(nm);
        [pt.refills, pt.people].forEach(function (v) { var td = el("td", "n" + (v == null ? " hid" : "")); shown(td, v, k); tr.appendChild(td); });
        var st = el("td"), dot = el("span", "dot " + statusOf(pt)); dot.title = statusText(statusOf(pt)); st.appendChild(dot); tr.appendChild(st);
        tr.addEventListener("click", function () { openPoint(pt.id, true); });
        tr.addEventListener("keydown", function (e) { if (e.key === "Enter") openPoint(pt.id, true); });
        tb.appendChild(tr);
      }
      t.appendChild(tb);
      p.appendChild(t);
      p.appendChild(more);
      rows(25);
    });
  }
  function fact(box, label, v, k, fmt) {
    var f = el("div", "fact"), b = el("b");
    if (v === undefined) return;
    if (v == null && k == null) b.textContent = "—"; else shown(b, v, k, fmt);
    f.appendChild(b); f.appendChild(el("span", null, label)); box.appendChild(f);
  }
  function backBtn(p) { var b = el("button", "back", "← " + T.back); b.type = "button"; b.addEventListener("click", showRanking); p.appendChild(b); }
  var nf3 = new Intl.NumberFormat(lang, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  function ll(lon, lat) { return nf3.format(Math.abs(lat)) + "° " + (lat >= 0 ? "N" : "S") + " · " + nf3.format(Math.abs(lon)) + "° " + (lon >= 0 ? "E" : "W"); }
  function scoreText(s) { return nf.format(Math.round(s * 100)); }
  function openCell(ix, iy, fly) {
    var d = state.data, c = cellAt(ix, iy) || (popAt(1000, ix, iy) > 0 ? virtualCell(ix, iy, popAt(1000, ix, iy)) : null);
    if (!c) { showRanking(); return; }
    state.sel = { kind: "cell", ix: ix, iy: iy };
    select(ix, iy);
    var ctr = C.cellCentre(ix, iy), x = C.derive(c), k = d.k.people;
    if (fly) flyTo(ctr, 13);
    panel(function (p) {
      backBtn(p);
      p.appendChild(el("div", "eyebrow", T.cellTitle));
      p.appendChild(el("div", "ptitle", ll(ctr[0], ctr[1])));
      var f = el("div", "facts");
      fact(f, T.residents, c.population != null ? Math.round(c.population) : null);
      fact(f, T.waterPoints, c.water);
      fact(f, T.toilets, c.toilets);
      fact(f, T.broken, c.broken);
      fact(f, T.kRefills, c.refills, k);
      fact(f, T.per1000, x.per1000 != null ? x.per1000 : null, null, function (v) { return nf1.format(v); });
      fact(f, T.perPoint, x.perPoint != null ? Math.round(x.perPoint) : null);
      if (d.hasDemand) fact(f, T.searches, c.demand, d.k.anonymous);
      p.appendChild(f);
      p.appendChild(el("div", "section-t", T.score + " · " + scoreText(x.score) + " / 100"));
      var bar = el("div", "score"), fill = el("span");
      bar.appendChild(fill); p.appendChild(bar);
      requestAnimationFrame(function () { fill.style.width = Math.round(x.score * 100) + "%"; });
      p.appendChild(el("p", "small", x.underserved ? T.underservedYes : T.underservedNo));
      p.appendChild(el("p", "note", T.explainScore));
      p.appendChild(el("div", "section-t", T.cellPoints));
      var pts = d.points.filter(function (q) { return q.ix === ix && q.iy === iy; });
      if (!pts.length) p.appendChild(el("p", "note", T.noPointHere));
      pts.forEach(function (q) {
        var row = el("div", "invite"); row.tabIndex = 0;
        row.appendChild(el("span", null, pointName(q)));
        var s = el("span", "chip " + statusOf(q), statusText(statusOf(q))); row.appendChild(s);
        row.addEventListener("click", function () { openPoint(q.id, true); });
        row.addEventListener("keydown", function (e) { if (e.key === "Enter") openPoint(q.id, true); });
        p.appendChild(row);
      });
    });
  }
  async function openPoint(id, fly) {
    var d = state.data, p0 = d.points.filter(function (p) { return p.id === id; })[0];
    state.sel = { kind: "point", id: id };
    if (p0) { select(p0.ix, p0.iy); if (fly) flyTo([p0.lon, p0.lat], 14); }
    var req = ++state.preq;
    panel(function (p) { for (var i = 0; i < 9; i++) p.appendChild(el("div", "skel skel-line")); });
    try {
      var r = C.cleanPoint(await rpc("stats_point", { p_scope: state.scope, p_spot: id }));
      if (req !== state.preq) return;
      if (!r) { panel(function (p) { backBtn(p); p.appendChild(el("p", "empty", T.errorLoad)); }); return; }
      state.point = r;
      renderPoint(r, p0);
    } catch (e) {
      if (req !== state.preq) return;
      if (e.status === 401) { lost(); return; }
      if (e.code === "WNMFA") { showMfa(); return; }
      panel(function (p) { backBtn(p); p.appendChild(el("p", "empty", T.errorLoad)); });
    }
  }
  function renderPoint(r, p0) {
    var d = state.data, pt = r.point, k = r.k;
    panel(function (p) {
      backBtn(p);
      p.appendChild(el("div", "eyebrow", T.types[pt.type]));
      p.appendChild(el("div", "ptitle", pointName(pt)));
      var chips = el("div", "chips-row"), s = statusOf(pt);
      chips.appendChild(el("span", "chip " + s, statusText(s)));
      if (pt.checkedOn && s !== "flag") chips.appendChild(el("span", "chip", T.checkedOn(fmtFull.format(day(pt.checkedOn)))));
      p.appendChild(chips);
      var f = el("div", "facts");
      if (p0) { fact(f, T.kRefills + " · " + T.inPeriod, p0.refills, k); fact(f, T.kPeople + " · " + T.inPeriod, p0.people, k); }
      fact(f, T.kRefills + " · " + T.allTime, r.allTime.refills, k);
      if (p0) fact(f, T.arrivals, p0.arrivals, d.k.anonymous);
      p.appendChild(f);
      var h = el("div", "card-head"), tabs = el("div", "tabs");
      h.appendChild(el("div", "section-t", T.series));
      [["day", "sDay"], ["week", "sWeek"], ["month", "sMonth"], ["season", "sSeason"]].forEach(function (t) {
        var b = btn(tabs, T[t[1]], "");
        b.setAttribute("aria-pressed", String(state.series === t[0]));
        b.addEventListener("click", function () {
          state.series = t[0];
          Array.prototype.forEach.call(tabs.children, function (c) { c.setAttribute("aria-pressed", String(c === b)); });
          barChart(clear(chart), r.series[t[0]], t[0], k);
        });
      });
      h.appendChild(tabs);
      p.appendChild(h);
      var chart = el("div", "chart");
      p.appendChild(chart);
      barChart(chart, r.series[state.series], state.series, k);
      p.appendChild(el("div", "section-t", T.checks + " · " + T.arrivals));
      var t = el("table", "rank"), tb = el("tbody");
      var hr = el("tr");
      ["", T.works, T.brokenChecks, T.colArrivals].forEach(function (x, i) { hr.appendChild(el("th", i ? "n" : "", x)); });
      var th = el("thead"); th.appendChild(hr); t.appendChild(th);
      r.months.slice(-6).reverse().forEach(function (m) {
        var tr = el("tr");
        tr.appendChild(el("td", null, fmtMonth.format(day(m.t))));
        [[m.works, k], [m.broken, k], [m.arrivals, d.k.anonymous]].forEach(function (v) {
          var td = el("td", "n" + (v[0] == null ? " hid" : "")); shown(td, v[0], v[1]); tr.appendChild(td);
        });
        tb.appendChild(tr);
      });
      t.appendChild(tb); p.appendChild(t);
      p.appendChild(el("div", "section-t", T.repairs));
      if (r.repairs.median != null) p.appendChild(el("p", "small", T.repairMedian(nf1.format(r.repairs.median), r.repairs.median)));
      if (!r.repairs.list.length) p.appendChild(el("p", "note", T.noRepairs));
      var ul = el("ul", "repairs");
      r.repairs.list.forEach(function (x) {
        var li = el("li", x.to ? "" : "open"), n = x.days || 0;
        li.appendChild(el("span", null, fmtFull.format(day(x.from)) + (x.to ? " → " + fmtFull.format(day(x.to)) : "")));
        li.appendChild(el("span", "muted", x.to ? T.repairDone(nf.format(n), n) : T.repairOpen(nf.format(n), n)));
        ul.appendChild(li);
      });
      p.appendChild(ul);
      p.appendChild(el("p", "note", T.opens));
      var x = el("div", "inline"); x.appendChild(csvBtn(T.csvPoint, function () { exportPoint(r); })); p.appendChild(x);
    });
  }

  // ---- Charts (SVG, node by node) ----
  function nice(v) { if (v <= 5) return 5; var p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }
  function label(t, step) {
    if (step === "month") return fmtMonth.format(day(t));
    if (step === "season") return T.seasons[C.seasonOf(t)] + " " + t.slice(2, 4);
    return fmtDay.format(day(t));
  }
  function lineChart(box, pts, step, gid) {
    var W = 640, H = 200, L = 40, Rr = 10, Tt = 12, B = 26, n = pts.length;
    if (!n) return;
    var vals = pts.map(function (p) { return p.refills; }), max = nice(Math.max.apply(null, vals.map(function (v) { return v || 0; }).concat([1])));
    var x = function (i) { return L + (n === 1 ? (W - L - Rr) / 2 : i * (W - L - Rr) / (n - 1)); };
    var y = function (v) { return Tt + (H - Tt - B) * (1 - v / max); };
    var s = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": T.trendTitle });
    var defs = svg("defs"), lg = svg("linearGradient", { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
    lg.appendChild(svg("stop", { offset: "0%", "stop-color": "#1268e8", "stop-opacity": dark.matches ? 0.45 : 0.28 }));
    lg.appendChild(svg("stop", { offset: "100%", "stop-color": "#1268e8", "stop-opacity": 0 }));
    defs.appendChild(lg); s.appendChild(defs);
    [0, 0.5, 1].forEach(function (f) {
      s.appendChild(svg("line", { "class": "grid", x1: L, x2: W - Rr, y1: y(max * f), y2: y(max * f) }));
      var tx = svg("text", { "class": "axis", x: L - 8, y: y(max * f) + 4, "text-anchor": "end" }); tx.textContent = nf.format(max * f); s.appendChild(tx);
    });
    var colW = n > 1 ? (W - L - Rr) / (n - 1) : 20;
    vals.forEach(function (v, i) {
      if (v == null) s.appendChild(svg("rect", { "class": "gap", x: x(i) - colW / 2, y: Tt, width: Math.max(1, colW), height: H - Tt - B }));
    });
    var runs = [], cur = [];
    vals.forEach(function (v, i) { if (v == null) { if (cur.length) runs.push(cur); cur = []; } else cur.push([x(i), y(v)]); });
    if (cur.length) runs.push(cur);
    var lines = [];
    runs.forEach(function (r) {
      if (r.length === 1) { s.appendChild(svg("circle", { "class": "dotp", cx: r[0][0], cy: r[0][1], r: 3.5 })); return; }
      var dl = r.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join("");
      var area = svg("path", { "class": "area", d: dl + "L" + r[r.length - 1][0].toFixed(1) + " " + (H - B) + "L" + r[0][0].toFixed(1) + " " + (H - B) + "Z" });
      area.setAttribute("fill", "url(#" + gid + ")");
      s.appendChild(area);
      var line = svg("path", { "class": "line", d: dl });
      s.appendChild(line);
      lines.push(line);
    });
    [0, Math.floor((n - 1) / 2), n - 1].filter(function (v, i, a) { return a.indexOf(v) === i; }).forEach(function (i) {
      var tx = svg("text", { "class": "axis", x: x(i), y: H - 6, "text-anchor": i === 0 ? "start" : i === n - 1 ? "end" : "middle" });
      tx.textContent = label(pts[i].t, step); s.appendChild(tx);
    });
    box.appendChild(s);
    if (!reduced) lines.forEach(function (line) {
      var len = line.getTotalLength();
      line.style.strokeDasharray = len; line.style.strokeDashoffset = len;
      line.getBoundingClientRect();
      line.classList.add("draw");
      line.style.strokeDashoffset = 0;
    });
  }
  function barChart(box, pts, step, k) {
    var W = 340, H = 150, L = 30, Rr = 4, Tt = 8, B = 22, n = pts.length;
    if (!n) return;
    var max = nice(Math.max.apply(null, pts.map(function (p) { return p.refills || 0; }).concat([1])));
    var s = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": T.series });
    [0, 1].forEach(function (f) {
      var yy = Tt + (H - Tt - B) * (1 - f);
      s.appendChild(svg("line", { "class": "grid", x1: L, x2: W - Rr, y1: yy, y2: yy }));
      var tx = svg("text", { "class": "axis", x: L - 6, y: yy + 4, "text-anchor": "end" }); tx.textContent = nf.format(max * f); s.appendChild(tx);
    });
    var bw = (W - L - Rr) / n;
    pts.forEach(function (p, i) {
      var hh = p.refills == null ? (H - Tt - B) * 0.18 : (H - Tt - B) * p.refills / max;
      var r = svg("rect", { "class": "bar" + (p.refills == null ? " hid" : ""), x: (L + i * bw + bw * 0.16).toFixed(1), width: Math.max(1, bw * 0.68).toFixed(1),
                            y: (H - B - hh).toFixed(1), height: Math.max(0.5, hh).toFixed(1), rx: Math.min(3, bw * 0.2).toFixed(1) });
      var tt = svg("title"); tt.textContent = label(p.t, step) + " · " + (p.refills == null ? T.fewer(k) : nf.format(p.refills));
      r.appendChild(tt);
      if (!reduced) { r.style.transformBox = "fill-box"; r.style.transformOrigin = "bottom"; r.style.animation = "grow .6s cubic-bezier(.2,.8,.2,1) both " + (i * 12) + "ms"; }
      s.appendChild(r);
    });
    [0, n - 1].filter(function (v, i, a) { return a.indexOf(v) === i; }).forEach(function (i) {
      var tx = svg("text", { "class": "axis", x: L + i * bw + bw / 2, y: H - 6, "text-anchor": i === 0 ? "start" : "end" });
      tx.textContent = label(pts[i].t, step); s.appendChild(tx);
    });
    box.appendChild(s);
  }
  /**
   * Where to look for "Où l'eau manque": the cells with activity, plus the populated cells of the city's territory, or
   * (world, partner) of the 1 km grid in view when zoomed in, else of the blocks around the scope's cells. A cell with
   * no point and no search needs 2,917 residents to reach 0.35 (60 % × 2,917 / 5,000): fewer are skipped unread.
   */
  function needCands(d) {
    var list = d.cells.slice();
    if (!popIndex) return list;
    var seen = new Set(d.cells.map(function (c) { return c.ix + ":" + c.iy; }));
    function add(ix, iy) {
      var p = popAt(1000, ix, iy), k = ix + ":" + iy;
      if (p >= 2900 && !seen.has(k)) { seen.add(k); list.push(virtualCell(ix, iy, p)); }
    }
    if (d.terrCells) d.terrCells.forEach(function (c) { add(c.ix, c.iy); });
    else if (viewCells) { for (var iy = viewCells.iy0; iy <= viewCells.iy1; iy++) for (var ix = viewCells.ix0; ix <= viewCells.ix1; ix++) add(ix, iy); }
    else (d.near || new Set()).forEach(function (k) {
      var b = k.split(":").map(Number);
      for (var y = b[1] * 256; y < b[1] * 256 + 256; y++) for (var x = b[0] * 256; x < b[0] * 256 + 256; x++) add(x, y);
    });
    return list;
  }
  var needKey = "";
  function refreshNeed() { // after a move: only when the cells looked at changed
    var d = state.data, k = viewCells ? [viewCells.ix0, viewCells.ix1, viewCells.iy0, viewCells.iy1].join() : "near";
    if (d && !d.terrCells && k !== needKey) { needKey = k; needList(d); }
  }
  function needList(d) {
    var box = clear($("need"));
    var list = needCands(d).map(function (c) { return { c: c, x: C.derive(c) }; }).filter(function (o) { return o.x.underserved; })
      .sort(function (a, b) { return b.x.score - a.x.score || (b.c.population || 0) - (a.c.population || 0); }).slice(0, 6);
    if (!list.length) { box.appendChild(el("li", "empty", T.noNeed)); return; }
    list.forEach(function (o, i) {
      var li = el("li"), ctr = C.cellCentre(o.c.ix, o.c.iy), what = el("div", "what");
      li.tabIndex = 0;
      li.appendChild(el("span", "rk", String(i + 1)));
      what.appendChild(el("b", null, ll(ctr[0], ctr[1])));
      what.appendChild(el("span", "muted", T.residents + " " + nf.format(Math.round(o.c.population || 0)) + " · " +
                          T.waterPoints + " " + nf.format(Math.max(0, o.c.water - o.c.broken)) +
                          (o.c.demand != null ? " · " + T.searches + " " + nf.format(o.c.demand) : "")));
      li.appendChild(what);
      li.appendChild(el("span", "sc", scoreText(o.x.score)));
      li.addEventListener("click", function () { openCell(o.c.ix, o.c.iy, true); });
      li.addEventListener("keydown", function (e) { if (e.key === "Enter") openCell(o.c.ix, o.c.iy, true); });
      box.appendChild(li);
    });
  }

  // ---- CSV: what is on screen ----
  function download(name, rows) {
    var a = el("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + C.csv(rows)], { type: "text/csv;charset=utf-8" }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function fileName(what) { return "waternow-stats-" + state.scope.replace(/[^a-z0-9]+/gi, "-") + "-" + state.data.period.key + "-" + what + ".csv"; }
  function hiddenCell(v, k) { return v == null ? "<" + k : v; }
  function exportGrid() {
    var d = state.data, k = d.k.people;
    var rows = [["ix", "iy", "lat", "lon", "population", "water_points", "toilets", "broken", "refills", "people", "searches_no_result",
                 "refills_per_1000", "residents_per_working_point", "need_score", "from", "to"]];
    d.cells.concat(d.terrCells || []).forEach(function (c) { // a city: every populated cell of its territory too
      var x = C.derive(c), ctr = C.cellCentre(c.ix, c.iy);
      rows.push([c.ix, c.iy, +ctr[1].toFixed(5), +ctr[0].toFixed(5), c.population != null ? Math.round(c.population) : "", c.water, c.toilets, c.broken,
                 hiddenCell(c.refills, k), hiddenCell(c.people, k), d.hasDemand ? hiddenCell(c.demand, d.k.anonymous) : "",
                 x.per1000 != null ? +x.per1000.toFixed(2) : "", x.perPoint != null ? Math.round(x.perPoint) : "", x.score, d.period.from, d.period.to]);
    });
    download(fileName("grid"), rows);
  }
  function exportPoints() {
    var d = state.data, k = d.k.people;
    var rows = [["id", "name", "type", "lat", "lon", "refills", "people", "arrivals", "works_checks", "broken_checks", "last_status", "last_checked", "from", "to"]];
    d.points.forEach(function (p) {
      rows.push([String(p.id), pointName(p), p.type, p.lat, p.lon, hiddenCell(p.refills, k), hiddenCell(p.people, k), hiddenCell(p.arrivals, d.k.anonymous),
                 hiddenCell(p.works, k), hiddenCell(p.broken, k), p.flagged ? "flagged" : p.status || "", p.checkedOn || "", d.period.from, d.period.to]);
    });
    download(fileName("points"), rows);
  }
  function exportPoint(r) {
    var rows = [["point_id", "name", "step", "from", "refills"]];
    ["day", "week", "month", "season"].forEach(function (s) {
      r.series[s].forEach(function (x) { rows.push([String(r.point.id), pointName(r.point), s, x.t, hiddenCell(x.refills, r.k)]); });
    });
    download(fileName("point-" + r.point.id), rows);
  }
  $("csvGrid").addEventListener("click", function () { if (state.data) exportGrid(); });

  // ---- The impact report (report.js) reads the session, the scope and the population through this ----
  window.WNCAPP = {
    T: T, lang: lang, demo: DEMO, reduced: reduced, api: API, key: KEY,
    rpc: rpc, upload: upload, signed: signed, remove: remove, lost: lost, showMfa: showMfa, scopeLabel: scopeLabel, pointName: pointName,
    scope: function () { return state.scope; }, ready: function () { return !!state.data; },
    admin: function () { return !!(me && me.admin); }, // fontaine.js: « Fontaine commune » shows for admins (the server checks again)
    scopeInfo: function () { return (me && me.scopes || []).filter(function (s) { return s.key === state.scope; })[0] || null; },
    popNote: function () { return $("popNote").textContent; },
    pop: { init: popInit, load: popLoad, at: popAt, join: popJoin }
  };

  // ---- Cities (admins with manage_partners; the server checks) ----
  function renderCities() {
    var box = $("cities");
    if (!me.admin || !Array.isArray(me.orgs)) { box.classList.add("hidden"); return; }
    box.classList.remove("hidden");
    clear(box);
    box.appendChild(el("h2", null, T.citiesTitle));
    box.appendChild(el("p", "muted small", T.citiesLead));
    var grid = el("div", "cities-grid"), list = el("div"), form = el("div");
    if (!me.orgs.length) list.appendChild(el("p", "note", T.noCities));
    me.orgs.forEach(function (o) {
      if (!o || typeof o.id !== "number") return;
      var c = el("div", "city"), h = el("div", "city-h");
      h.appendChild(el("span", null, C.text(o.name, 80)));
      h.appendChild(el("span", "chip", T.area(nf1.format(Number(o.area_km2) || 0))));
      c.appendChild(h);
      var ul = el("ul", "members");
      (Array.isArray(o.members) ? o.members : []).forEach(function (m) {
        if (!m || !UUID.test(m.user_id || "")) return;
        var li = el("li"), who = el("span");
        who.appendChild(el("span", null, (C.text(m.name, 60) || "—") + " · " + (m.status === "member" ? T.member : T.invited) + " "));
        who.appendChild(el("code", null, m.user_id));
        li.appendChild(who);
        var rm = el("button", "ghost small-btn", T.remove); rm.type = "button";
        rm.addEventListener("click", function () { orgAction("stats_org_member", { p_org: o.id, p_user: m.user_id, p_add: false }, msg); });
        li.appendChild(rm);
        ul.appendChild(li);
      });
      c.appendChild(ul);
      var inl = el("div", "inline"), inp = el("input", "input");
      inp.placeholder = T.inviteLabel; inp.setAttribute("aria-label", T.inviteLabel); inp.spellcheck = false;
      var go = el("button", "ghost", T.invite); go.type = "button";
      go.addEventListener("click", function () {
        var v = inp.value.trim();
        if (!UUID.test(v)) { msg.textContent = T.noAccount; msg.className = "msg err"; return; }
        orgAction("stats_org_member", { p_org: o.id, p_user: v, p_add: true }, msg);
      });
      inl.appendChild(inp); inl.appendChild(go); c.appendChild(inl);
      list.appendChild(c);
    });
    var nameId = "cityName", terrId = "cityTerr";
    var l1 = el("label", "field", T.cityName); l1.htmlFor = nameId;
    var name = el("input", "input"); name.id = nameId; name.maxLength = 80;
    var l2 = el("label", "field", T.territory); l2.htmlFor = terrId;
    var terr = el("textarea", "input"); terr.id = terrId; terr.spellcheck = false;
    terr.placeholder = '{"type":"Polygon","coordinates":[[[-71.4,46.7],[-71.1,46.7],[-71.1,46.95],[-71.4,46.95],[-71.4,46.7]]]}';
    var create = el("button", "primary", T.create); create.type = "button";
    var msg = el("p", "msg"); msg.setAttribute("role", "status");
    create.addEventListener("click", function () {
      var g = null;
      try { g = JSON.parse(terr.value); } catch (e) { g = null; }
      if (!g || typeof g !== "object") { msg.textContent = T.badTerritory; msg.className = "msg err"; return; }
      orgAction("stats_org_save", { p_id: null, p_name: name.value, p_territory: g }, msg);
    });
    [l1, name, l2, terr, create].forEach(function (n) { form.appendChild(n); });
    grid.appendChild(list); grid.appendChild(form);
    box.appendChild(grid);
    box.appendChild(msg);
  }
  async function orgAction(fn, args, msg) {
    var words = { ok: T.saved, bad_name: T.badName, bad_territory: T.badTerritory, too_big: T.tooBig, no_account: T.noAccount };
    try {
      var r = await rpc(fn, args), res = r && r.result;
      if (res === "ok") {
        me = await rpc("stats_console_me");
        var keepScope = state.scope;
        showConsoleKeep(keepScope);
        var m2 = $("cities").querySelector(".msg");
        if (m2) { m2.textContent = T.saved; m2.className = "msg ok"; }
        return;
      }
      msg.textContent = words[res] || T.errorGeneric; msg.className = "msg err";
    } catch (e) {
      if (e.status === 401) { lost(); return; }
      if (e.code === "WNMFA") { showMfa(); return; }
      msg.textContent = T.errorGeneric; msg.className = "msg err";
    }
  }
  // After a city change: the scope list and the cities panel again, the view kept.
  function showConsoleKeep(scope) {
    var sel = clear($("scope"));
    (me.scopes || []).forEach(function (s) { var o = el("option", null, scopeLabel(s)); o.value = s.key; sel.appendChild(o); });
    sel.value = scope;
    renderCities();
  }

  keep(restore());
  boot();
})();
