/*
 * WaterNow Racines et Plus public pages (docs/19_RACINES_ET_PLUS.md), by <body data-page>:
 *   report     racines/ (?m=YYYY-MM): what Racines and Plus are, their prices, « S'abonner dans l'app », and the monthly
 *              public report (racines_public_report): the community's trees, the projects, the certificates.
 *   thanks     racines/merci/: « Merci à… » (racines_thanks), alphabetical, no rank, no count per person.
 *   companies  racines/entreprises/: corporate planting, the companies shown (racines_companies), how to write to us.
 *   ok         racines/succes/?k=subscription|trees|pack: Stripe Checkout's way back (its cancel goes to racines/), and
 *              Ta forêt in the app (waternow://forest) beside the APK. No read.
 * A server without section 90 yet (404) says « bientôt » (or hides the list); what the server sends is cleaned by
 * racines-data.js (WNR) and written with textContent only. No account on the website: subscribing is in the app.
 */
(function () {
  "use strict";
  var WN = window.WN, R = window.WNR;
  function meta(n) { var m = document.querySelector('meta[name="' + n + '"]'); return m ? m.getAttribute("content") : null; }
  // The server (the page's CSP connect-src pins it); the key is public by design, as on the other pages.
  var API = meta("wn-api") == null ? "https://pkqsvlbiznrqxfckaxll.supabase.co" : meta("wn-api");
  var KEY = "sb_publishable_Jw6cnMgupaVxupvltvUlPQ_mvwpiNVE";
  var PAGE = document.body.getAttribute("data-page");
  var ROOT = new URL(document.body.getAttribute("data-root") || "../", location.href).href;
  var DEMO = meta("wn-demo") === "1";
  var lang = WN.lang(WN.browserLangs(navigator)), T = R.STRINGS[lang];
  var nf = new Intl.NumberFormat(lang);

  var $ = function (id) { return document.getElementById(id); };
  var text = function (id, v) { $(id).textContent = v; };
  var show = function (id, on) { $(id).classList.toggle("hidden", !on); };
  var money = function (c) { return R.money(c, lang); };
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  document.documentElement.lang = lang;
  document.documentElement.classList.add("wn-ready"); // main.hold shows now, in this language (site.css)
  if (DEMO) { text("demo", T.demo); show("demo", true); } // the local preview only
  // The page's fixed words: those of T.ids it has.
  Object.keys(T.ids).forEach(function (id) { var e = $(id); if (e) e.textContent = T.ids[id]; });
  if ($("get")) WN.apkLink(ROOT).then(function (apk) { if (apk) $("get").href = apk; });

  // The cards under the page's own wait unseen until the read has answered (site.css .waiting, at most 3 s).
  function reveal() {
    Array.prototype.slice.call(document.querySelectorAll(".page > .waiting")).forEach(function (e) {
      e.classList.remove("waiting");
      e.classList.add("fade-in");
    });
  }

  /** A public read: {body}, {maint: true} while WaterNow is being updated (503); throws otherwise (with .status). */
  function rpc(name, args) {
    return WN.fetchIn(API + "/rest/v1/rpc/" + name, {
      method: "POST", headers: { apikey: KEY, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(args || {}), credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer"
    }).then(function (r) {
      if (WN.isMaintenance(r.status)) return { maint: true };
      if (!r.ok) { var e = new Error("HTTP " + r.status); e.status = r.status; throw e; }
      return r.json().then(function (j) { return { body: j }; });
    });
  }

  /**
   * One read. 404 (section 90 not on the server yet): [soon]. 503: one line, again each minute for a while. Anything
   * else (offline, no answer within 15 s): a line and a button to read again. [heading] takes the focus back.
   */
  function load(read, draw, soon, offline, heading, tries) {
    read()
      .then(function (r) {
        WN.leaveNote(document, $("note"), heading);
        show("note", !!r.maint);
        if (r.maint) {
          text("note", T.maintenance);
          if (tries < 10) setTimeout(function () { load(read, draw, soon, offline, heading, tries + 1); }, 60000);
          return;
        }
        draw(r.body);
      })
      .catch(function (e) {
        if (e && e.status === 404) { WN.leaveNote(document, $("note"), heading); show("note", false); soon(); return; }
        WN.offlineNote(document, $("note"), offline, T.retry, function () { load(read, draw, soon, offline, heading, 0); });
      })
      .then(reveal);
  }

  // ---- racines/: plans and the monthly report ----
  function reportPage() {
    document.title = T.docReport;
    var P = R.PRICES;
    ["racines", "plus"].forEach(function (k) {
      text(k + "Month", money(P[k].month)); text(k + "Per", T.perMonth); text(k + "Year", T.perYear(money(P[k].year)));
    });
    $("subscribe").href = R.APP_LINK;
    $("commonsLink").href = ROOT + "fontaine/";

    // The month picker: the months since the first report (the demo preview shows a few more), newest first. A single
    // month has nothing to pick: no picker.
    var now = new Date(), sel = $("month"), since = DEMO ? "2026-06" : R.LAUNCH;
    var list = R.months(since, now);
    list.forEach(function (m) { var o = el("option", null, R.monthName(m, lang)); o.value = m; sel.append(o); });
    show("monthBox", list.length > 1);
    var want = R.monthParam(location.search, now, since); // null: the server's default, the previous month (the last lot's)
    if (want) sel.value = want;

    var figs = ["planted", "pending", "commons"];
    // The figures' words are there while their numbers shimmer (in this language, not the HTML's English).
    text("plantedLabel", T.planted("", 2)); text("pendingLabel", T.pending); text("commonsLabel", T.commonsFig);
    function busy() {
      figs.forEach(function (id) { $(id).classList.add("sk"); });
      $("line").replaceChildren(el("span", "sk-line"));
    }
    function draw(body) {
      var o = R.report(body, lang);
      if (!o) { soon(T.soon); return; }
      var month = o.month || want || list[0];
      if (list.indexOf(month) >= 0) sel.value = month;
      // The live report counts real payments only: at the start, the last lot's month has nothing at all (and nothing was
      // ever planted). Then one calm line (the picker stays, for this month's trees waiting).
      if (!want && !o.planted && !o.pending && !o.projects.length && !o.total) { soon(T.firstTrees); show("monthBox", list.length > 1); return; }
      show("figs", true); show("line", true); show("soon", false);
      var name = R.monthName(month, lang);
      figs.forEach(function (id) { $(id).classList.remove("sk"); });
      text("planted", nf.format(o.planted)); text("plantedLabel", T.planted(nf.format(o.planted), o.planted));
      text("pending", nf.format(o.pending));
      text("commons", money(o.commons));
      text("line", o.planted ? T.line(name, nf.format(o.planted), o.planted) : o.pending ? T.pendingLine(name, nf.format(o.pending), o.pending) : T.none(name));
      text("total", o.total ? T.total(nf.format(o.total), o.total) : "");
      show("total", o.total > 0);
      text("members", o.members !== null ? T.members(nf.format(o.members), o.members) : "");
      show("members", o.members !== null);
      var ul = $("projects");
      ul.replaceChildren();
      o.projects.forEach(function (p) {
        var li = el("li"), box = p.url ? el("a") : el("span", "plain");
        if (p.url) { box.href = p.url; box.rel = "noopener noreferrer"; }
        box.append(el("span", null, p.name), el("span", "muted", [p.country, p.trees !== null ? T.trees(nf.format(p.trees), p.trees) : ""].filter(Boolean).join(" · ")));
        li.append(box);
        ul.append(li);
      });
      show("projectsTitle", o.projects.length > 0);
      show("projects", o.projects.length > 0);
      if (o.certificates) $("certs").href = o.certificates;
      show("certs", !!o.certificates);
      var box = $("figs");
      if (window.WNM) window.WNM.inView(box, function () { box.classList.add("in"); }); else box.classList.add("in");
    }
    function soon(title) {
      ["figs", "monthBox", "line", "total", "members", "projectsTitle", "projects", "certs"].forEach(function (id) { show(id, false); });
      text("soonTitle", title); text("soonText", T.soonText);
      show("soon", true);
    }
    function read() { return rpc("racines_public_report", { p_month: want ? want + "-01" : null }); }
    sel.addEventListener("change", function () {
      want = sel.value;
      try { history.replaceState(null, "", "?m=" + sel.value); } catch (e) { /* a sandboxed frame: the link stays as it was */ }
      busy();
      load(read, draw, missing, T.offline, $("reportTitle"), 0);
    });
    function missing() { soon(T.soon); }
    load(read, draw, missing, T.offline, $("reportTitle"), 0);
  }

  // ---- racines/succes/: Stripe Checkout's way back (?k=subscription|trees|pack) ----
  function okPage() {
    var k = R.checkoutKind(location.search);
    document.title = T.docOk;
    text("okTitle", T.okTitle);
    text("okText", T.okText[k || "other"]);
    text("okOpen", T.okOpen);
    text("forestBtn", T.forestBtn);
    $("forestBtn").href = R.FOREST_LINK;
    text("okReceipt", T.okReceipt);
    text("okManage", T.okManage);
    show("okManage", k === "subscription");
    $("back").href = ROOT + "racines/";
    reveal();
  }

  // ---- racines/merci/: « Merci à… » ----
  function thanksPage() {
    document.title = T.docThanks;
    $("back").href = ROOT + "racines/";
    load(function () { return rpc("racines_thanks"); }, function (body) {
      var names = R.thanks(body, lang), ul = $("names");
      ul.replaceChildren();
      names.forEach(function (n) { ul.append(el("li", null, n)); });
      show("names", names.length > 0);
      text("empty", T.thanksEmpty);
      show("empty", !names.length);
    }, function () {
      show("names", false);
      text("soonTitle", T.thanksSoon);
      show("soon", true);
    }, T.thanksOffline, $("thanksTitle"), 0);
  }

  // ---- racines/entreprises/: corporate planting ----
  function companiesPage() {
    document.title = T.docCompanies;
    $("back").href = ROOT + "racines/";
    // The contact line: the legal pages' address once it is filled in (mailto), else that it is coming.
    var mail = R.email(meta("wn-contact")), p = $("contact");
    if (mail) {
      var parts = T.contact.split("{email}"), a = el("a", null, mail);
      a.href = "mailto:" + mail;
      p.replaceChildren(parts[0], a, parts[1] || "");
    } else p.textContent = T.contactSoon;
    load(function () { return rpc("racines_companies"); }, function (body) {
      var list = R.companies(body, API, location.href), ul = $("companies"), since = new Intl.DateTimeFormat(lang, { month: "long", year: "numeric", timeZone: "UTC" });
      ul.replaceChildren();
      list.forEach(function (c) {
        var li = el("li"), box = c.url ? el("a") : el("span", "plain"), mark = el("span", "plogo");
        if (c.url) { box.href = c.url; box.rel = "noopener noreferrer"; }
        mark.append(el("span", null, (Array.from(c.name)[0] || "").toLocaleUpperCase(lang)));
        if (c.logo) {
          var img = el("img");
          img.alt = "";
          img.onload = function () { mark.classList.add("has-logo"); };
          img.src = c.logo;
          mark.append(img);
        }
        var facts = [c.trees !== null ? T.trees(nf.format(c.trees), c.trees) : "", c.since ? T.since(since.format(Date.parse(c.since + "-01T00:00:00Z"))) : ""];
        box.append(mark, el("span", "co-name", c.name), el("span", "muted small", facts.filter(Boolean).join(" · ")));
        li.append(box);
        ul.append(li);
      });
      text("coEmpty", T.coEmpty);
      show("coEmpty", !list.length);
      show("companies", list.length > 0);
    }, function () { show("list", false); }, T.coOffline, $("listTitle"), 0);
  }

  if (PAGE === "report") reportPage();
  else if (PAGE === "thanks") thanksPage();
  else if (PAGE === "companies") companiesPage();
  else if (PAGE === "ok") okPage();
})();
