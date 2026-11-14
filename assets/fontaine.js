/*
 * « Fontaine commune » public pages (docs/18_FONTAINE_COMMUNE.md), by <body data-page>:
 *   project  fontaine/?p=<id> (or the current project): where, who builds it, how much, the donor wall, sponsors, and
 *            the « Donner » form that opens Stripe Checkout (commons-checkout); voting stays in the app.
 *   thanks   fontaine/merci/?p=<id>: Stripe Checkout's way back, with sharing.
 *   fountain f/?s=<spotId>: a built fountain's page, opened by its plaque's QR code (commons_fountain).
 * What the server sends is cleaned by fontaine-data.js (WNF) and written with textContent only; links are built only
 * from ids that passed its checks. No account on the website: anyone can give, members vote in the app.
 */
(function () {
  "use strict";
  var WN = window.WN, F = window.WNF;
  function meta(n) { var m = document.querySelector('meta[name="' + n + '"]'); return m ? m.getAttribute("content") : null; }
  // The server (the page's CSP connect-src pins it); the key is public by design, as on the other pages: the server's
  // grants and row-level security protect the data.
  var API = meta("wn-api") == null ? "https://pkqsvlbiznrqxfckaxll.supabase.co" : meta("wn-api");
  var KEY = "sb_publishable_Jw6cnMgupaVxupvltvUlPQ_mvwpiNVE";
  var PAGE = document.body.getAttribute("data-page");
  var ROOT = new URL(document.body.getAttribute("data-root") || "../", location.href).href;
  var lang = WN.lang(WN.browserLangs(navigator)), T = F.STRINGS[lang];
  var nf = new Intl.NumberFormat(lang);
  var dateFmt = new Intl.DateTimeFormat(lang, { day: "numeric", month: "long", year: "numeric" });
  var shortDate = new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" });

  var $ = function (id) { return document.getElementById(id); };
  var text = function (id, v) { $(id).textContent = v; };
  var show = function (id, on) { $(id).classList.toggle("hidden", !on); };
  var money = function (c) { return F.money(c, lang); };
  var day = function (iso) { return iso ? dateFmt.format(new Date(iso)) : ""; };
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  document.documentElement.lang = lang;
  document.documentElement.classList.add("wn-ready"); // main.hold shows now, in this language (site.css)
  if (meta("wn-demo") === "1") { text("demo", T.demo); show("demo", true); } // the local preview only

  // The words every page shares.
  [["getTitle", T.getTitle], ["getText", T.getText], ["get", T.get], ["foot", T.foot]].forEach(function (p) { text(p[0], p[1]); });
  WN.apkLink(ROOT).then(function (apk) { if (apk) { $("get").href = apk; if ($("voteGet")) $("voteGet").href = apk; } });

  // The cards under the page's own wait unseen until the read has answered (site.css .waiting, at most 3 s): what comes
  // in above them never pushes a card that was seen.
  function reveal() {
    Array.prototype.slice.call(document.querySelectorAll(".page > .waiting")).forEach(function (e) {
      e.classList.remove("waiting");
      e.classList.add("fade-in");
    });
  }

  /** A public read: {body}, {maint: true} while WaterNow is being updated (503); throws otherwise (offline, deadline). */
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

  // ---- What the pages draw ----
  var coverBox = $("coverBox");
  function cover(o) {
    if (!coverBox) return;
    coverBox.classList.remove("sk");
    text("coverCity", o ? o.city : "");
    if (!o || !o.cover) return;
    var img = $("cover") || coverBox.appendChild(el("img", "hidden")); // made only for a real picture (no empty <img>)
    img.id = "cover"; img.alt = "";
    img.onload = function () { img.classList.remove("hidden"); };
    img.src = o.cover;
  }

  /** The thermometer: raised toward the goal (section 85: gifts + their matched part + money moved in), the matched part
   *  striped, the people who gave. */
  function thermo(o) {
    var total = o.raised;
    text("raised", money(total));
    text("goal", T.raisedOf("", money(o.goal)).trim());
    var raw = T.raisedOf(money(total), money(o.goal));
    $("thermo").setAttribute("aria-label", raw);
    var parts = [];
    if (o.matched) parts.push(T.matchedPart(money(o.matched)));
    parts.push(T.donorsCount(nf.format(o.donorsCount), o.donorsCount));
    text("thermoLine", parts.join(" · "));
    var a = F.share(Math.max(0, total - o.matched), o.goal), b = F.share(total, o.goal) - a;
    $("fill").style.setProperty("--w", (a * 100).toFixed(1) + "%");
    $("fillMatched").style.setProperty("--w", (b * 100).toFixed(1) + "%");
    $("fillMatched").style.setProperty("--x", (a * 100).toFixed(1) + "%");
    show("thermo", true);
    var box = $("thermo");
    if (window.WNM) window.WNM.inView(box, function () { box.classList.add("in"); });
    else box.classList.add("in");
  }

  function wall(o) {
    var ul = $("wall");
    ul.replaceChildren();
    o.donors.forEach(function (d) {
      var li = el("li"), head = el("p", "who-gave");
      head.append(el("b", null, d.name || T.anonymous));
      if (d.amount !== null) head.append(el("span", "amount", money(d.amount)));
      li.append(head);
      if (d.message) li.append(el("p", "said", d.message));
      if (d.at) li.append(el("p", "when", shortDate.format(new Date(d.at))));
      ul.append(li);
    });
    if (!o.donors.length && o.status === "funding") ul.append(el("li", "empty", T.firstDonor));
    text("donorsTitle", T.donors);
    show("donors", o.donors.length > 0 || o.status === "funding");
  }

  function sponsors(o) {
    var box = $("tiers");
    box.replaceChildren();
    F.tiers(o.sponsors).forEach(function (g) {
      var sec = el("div", "tier " + g.tier), ul = el("ul", "logos");
      sec.append(el("h3", "tier-name", T.tiers[g.tier]));
      g.list.forEach(function (s) {
        var li = el("li"), wrap = s.url ? el("a") : el("span"), mark = el("span", "plogo");
        if (s.url) { wrap.href = s.url; wrap.rel = "noopener noreferrer"; }
        mark.append(el("span", null, (Array.from(s.name)[0] || "").toLocaleUpperCase(lang)));
        if (s.logo) {
          var img = el("img");
          img.alt = "";
          img.onload = function () { mark.classList.add("has-logo"); };
          img.src = s.logo;
          mark.append(img);
        }
        wrap.append(mark, el("span", "sponsor-name", s.name));
        li.append(wrap);
        ul.append(li);
      });
      sec.append(ul);
      box.append(sec);
    });
    text("sponsorsTitle", T.sponsors);
    show("sponsors", o.sponsors.length > 0);
  }

  function impact(o) {
    if (o.status !== "built" || !o.impact) return;
    text("impactTitle", T.impact);
    text("refills", T.refills(nf.format(o.impact.refills), o.impact.refills));
    text("bottles", T.bottles(nf.format(o.impact.bottles), o.impact.bottles));
    text("bottleNote", T.bottleNote);
    if ($("fountainLink") && o.spotId) {
      text("fountainLink", T.fountainPage);
      $("fountainLink").href = ROOT + "f/?s=" + o.spotId;
    } else if ($("fountainLink")) show("fountainLink", false);
    show("impact", true);
  }

  // The map: one marker for a chosen site or a built fountain, a lettered pin for each candidate during the vote.
  function map(points, single) {
    var go = function () {
      if (!window.maplibregl || !WN.map || !points.length) { show("map", false); return; }
      var c = points[0], m = WN.map($("map"), lang, [c.lon, c.lat], 13, "wn-marker", T.map);
      if (!m) return;
      if (single) { m.show(c.lat, c.lon, 15); return; }
      var gl = window.maplibregl, b = new gl.LngLatBounds();
      points.forEach(function (s, i) {
        var pin = el("div", "site-pin", F.letter(i));
        pin.setAttribute("aria-hidden", "true");
        new gl.Marker({ element: pin, anchor: "bottom" }).setLngLat([s.lon, s.lat]).addTo(m.gl);
        b.extend([s.lon, s.lat]);
      });
      m.gl.fitBounds(b, { padding: 56, maxZoom: 15, duration: 0 });
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
  }

  function place(s) {
    text("placeName", s.name);
    text("placeAddress", s.address);
    show("place", !!(s.name || s.address));
  }

  // ---- fontaine/: the project ----
  function sites(o) {
    var ol = $("sites"), voting = o.status === "vote";
    ol.replaceChildren();
    var winner = o.site ? o.sites.filter(function (s) { return Math.abs(s.lat - o.site.lat) < 1e-6 && Math.abs(s.lon - o.site.lon) < 1e-6; })[0] : null;
    o.sites.forEach(function (s, i) {
      var li = el("li", s === winner ? "won" : null), badge = el("span", "letter", F.letter(i)), body = el("div");
      body.append(el("b", null, s.name || T.site(F.letter(i))));
      if (s.address) body.append(el("span", "muted small", s.address));
      var facts = el("ul", "facts");
      if (s.newly !== null) facts.append(el("li", null, T.newly(nf.format(Math.round(s.newly)), Math.round(s.newly))));
      if (s.res10 !== null) facts.append(el("li", null, T.res10(nf.format(Math.round(s.res10)), Math.round(s.res10))));
      if (s.demand !== null) facts.append(el("li", null, T.demand(nf.format(Math.round(s.demand)), Math.round(s.demand))));
      if (s.votes !== null) facts.append(el("li", "votes", T.votes(nf.format(s.votes), s.votes)));
      body.append(facts);
      if (s === winner) body.append(el("span", "won-chip", T.chosen));
      li.append(badge, body);
      ol.append(li);
    });
    text("sitesTitle", voting ? T.candidates : T.chosen);
    show("sitesTitle", o.sites.length > 0 && voting);
    var hidden = voting && o.sites.some(function (s) { return s.votes === null; });
    text("votesHidden", T.votesHidden);
    show("votesHidden", hidden);
    if (voting) {
      text("voteTitle", T.voteTitle);
      text("voteText", T.voteText);
      text("voteDates", o.vote && o.vote.opensAt && o.vote.closesAt ? T.voteDates(day(o.vote.opensAt), day(o.vote.closesAt)) : "");
      // The project in the app (waternow://commons/<id>), and the app itself beside it for a phone without it.
      text("voteOpen", T.open);
      $("voteOpen").href = F.appLink(o.id);
      text("voteGet", T.get);
    }
    show("voteBox", voting);
  }

  function who(o) {
    var dl = $("whoList");
    dl.replaceChildren();
    function row(term, name, url, extra) {
      dl.append(el("dt", null, term));
      var dd = el("dd");
      if (url) { var a = el("a", null, name); a.href = url; a.rel = "noopener noreferrer"; dd.append(a); } else dd.append(el("b", null, name));
      (extra || []).forEach(function (n) { dd.append(n); });
      dl.append(dd);
    }
    if (o.builder) {
      var ex = [];
      if (o.builder.kind) ex.push(el("span", "muted small", T.kinds[o.builder.kind]));
      if (o.builder.quote !== null) {
        var q = el("span", "small", T.quote(money(o.builder.quote)));
        if (o.builder.quoteDoc) { var a = el("a", null, T.quoteDoc); a.href = o.builder.quoteDoc; a.rel = "noopener noreferrer"; q.append(" · ", a); }
        ex.push(q);
      }
      row(T.builder, o.builder.name, o.builder.url, ex);
    }
    if (o.host) row(T.host, o.host.name, o.host.url, [el("span", "muted small", T.hostText)]);
    text("whoTitle", T.who);
    show("who", !!(o.builder || o.host));
  }

  function budget(o) {
    var ul = $("bars"), sum = o.budget.reduce(function (s, l) { return s + l.amount; }, 0);
    ul.replaceChildren();
    o.budget.forEach(function (l) {
      var li = el("li"), top = el("p", "bar-top"), bar = el("span", "bud-bar"), fill = el("span");
      top.append(el("span", null, T.budgetKinds[l.kind] + (l.label ? " · " + l.label : "")), el("b", null, money(l.amount)));
      fill.style.setProperty("--w", (F.share(l.amount, sum) * 100).toFixed(1) + "%");
      bar.setAttribute("aria-hidden", "true");
      bar.append(fill);
      li.append(top, bar);
      ul.append(li);
    });
    text("budgetTitle", T.budget);
    text("totalLabel", T.total);
    text("total", money(sum || o.goal));
    show("budget", o.budget.length > 0);
    if (window.WNM) window.WNM.inView(ul, function () { ul.classList.add("in"); }); else ul.classList.add("in");
  }

  function matching(o) {
    var m = o.matching;
    var on = o.status === "funding" && !!m && (!m.endsAt || Date.parse(m.endsAt) > Date.now()) && (m.cap === 0 || m.used < m.cap);
    if (on) {
      text("matchText", T.matching(m.org, Math.round((1 + m.ratio) * 10) / 10, money(m.cap), m.endsAt ? day(m.endsAt) : ""));
      text("matchLeft", m.cap ? T.matchingLeft(money(Math.max(0, m.cap - m.used))) : "");
    }
    show("match", on);
  }

  function closed(o) {
    var on = own(T.closed, o.status);
    if (on) text("closedText", T.closed[o.status]);
    if (o.status === "archived" && o.rolledTo) {
      $("nextLink").href = "./?p=" + o.rolledTo;
      text("nextLink", T.nextProject);
      show("nextLink", true);
    }
    show("closed", on);
  }

  function projectPage(o) {
    document.title = T.doc(o.title || T.name);
    text("title", o.title || T.name);
    text("sub", [T.name, o.city].filter(Boolean).join(" · "));
    text("status", T.status[o.status]);
    $("status").className = "status " + o.status;
    text("ends", o.status === "funding" && o.endsAt ? T.until(day(o.endsAt)) : "");
    text("text", o.description || T.lead);
    $("text").classList.toggle("prose", !!o.description);
    cover(o);
    if (o.status !== "vote") thermo(o);
    var funding = o.status === "funding";
    text("rollover", T.rollover);
    show("rollover", funding);
    text("giveLink", T.give);
    show("giveLink", funding);
    matching(o);
    // Where: the 3 candidates during the vote, else the chosen site (with the vote's result when there was one).
    text("whereTitle", T.where);
    if (o.status === "vote" && o.sites.length) map(o.sites, false);
    else if (o.site) { place(o.site); map([o.site], true); }
    sites(o);
    show("where", (o.status === "vote" && o.sites.length > 0) || !!o.site);
    who(o);
    budget(o);
    impact(o);
    if (funding) giveForm(o); else closed(o);
    wall(o);
    sponsors(o);
    shareButton(o.title || T.name, ROOT + "fontaine/?p=" + o.id);
  }

  // ---- The « Donner » form ----
  var form = null;
  function giveForm(o) {
    form = o;
    text("giveTitle", T.give);
    text("freqLegend", T.give);
    text("onceText", T.once); text("monthlyText", T.monthly);
    text("monthlyNote", T.monthlyNote);
    text("amountLegend", T.amount);
    F.PRESETS.forEach(function (c) { text("amt" + c + "Text", money(c)); });
    text("otherLabel", T.other);
    $("otherAmount").placeholder = T.other;
    text("otherHint", T.otherHint(money(F.MIN_CENTS), money(F.MAX_CENTS)));
    text("nameLabel", T.yourName); text("anonText", T.anonymousLabel); text("showAmountText", T.showAmount);
    text("msgLabel", T.message);
    text("rollover2", T.rollover);
    text("secure", T.secure);
    text("noTax", T.noTax); // said before anyone gives (contract, "Tax receipts")
    show("give", true);
    sync();
  }

  function chosen() {
    var other = $("otherAmount").value.trim();
    if (other) return F.amountCents(other);
    for (var i = 0; i < F.PRESETS.length; i++) if ($("amt" + F.PRESETS[i]).checked) return F.PRESETS[i];
    return null;
  }
  // The button says what it will do ("Donner 25 $", "Donner 10 $ par mois"); the name field rests while anonymous.
  function sync() {
    if (!form || soonShown) return;
    var a = chosen(), monthly = $("monthly").checked;
    var label = a !== null && a >= F.MIN_CENTS && a <= F.MAX_CENTS ? (monthly ? T.giveMonthlyBtn(money(a)) : T.giveBtn(money(a))) : T.give;
    text("giveSubmit", label);
    show("monthlyNote", monthly);
    var anon = $("anon").checked;
    $("donorName").disabled = anon;
    var n = F.MESSAGE_MAX - Array.from($("donorMsg").value).length;
    text("msgLeft", T.left(Math.max(0, n)));
  }

  var busy = false, soonShown = false;
  function say(t, cls) { var m = $("giveMsg"); m.textContent = t || ""; m.className = "msg" + (cls ? " " + cls : ""); }
  function waiting(on) {
    busy = on;
    if (on) $("giveSubmit").setAttribute("aria-disabled", "true"); else $("giveSubmit").removeAttribute("aria-disabled");
  }
  // Stripe isn't set up yet (commons-checkout answers 503 stripe_not_configured): the button says so, for good.
  function soon() {
    soonShown = true;
    waiting(true);
    text("giveSubmit", T.soon);
    say(T.soonText);
  }

  function submit() {
    if (busy || !form) return;
    var d = F.donation({ project: form.id, amount: chosen(), monthly: $("monthly").checked, name: $("donorName").value,
                         anonymous: $("anon").checked, showAmount: $("showAmount").checked, message: $("donorMsg").value });
    if (d.error === "amount") { say(T.badAmount(money(F.MIN_CENTS), money(F.MAX_CENTS)), "err"); $("otherAmount").focus(); return; }
    if (d.error === "name") { say(T.badName, "err"); $("donorName").focus(); return; }
    waiting(true);
    say(T.opening);
    WN.fetchIn(API + "/functions/v1/commons-checkout", {
      method: "POST", headers: { apikey: KEY, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(d.body), credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer"
    }, 20000)
      .then(function (r) { return r.json().catch(function () { return null; }).then(function (j) { return { status: r.status, ok: r.ok, body: j }; }); })
      .then(function (r) {
        var code = r.body && typeof r.body.code === "string" ? r.body.code : "";
        if (r.status === 503 && code === "stripe_not_configured") { soon(); return; }
        var url = r.ok ? F.checkoutUrl(r.body) : null;
        if (url) { location.assign(url); return; } // the button stays busy until Stripe's page replaces this one
        waiting(false);
        // Each of commons-checkout's answers in words (docs/18_FONTAINE_COMMUNE.md, "Payments").
        var E = T.errors;
        say(code === "bad_amount" ? T.badAmount(money(F.MIN_CENTS), money(F.MAX_CENTS)) : code === "message_too_long" ? E.message
          : code === "monthly_fund_only" ? E.monthly : code === "bad_project" || code === "project_not_open" ? E.project
          : code === "origin_not_allowed" ? E.origin : code === "bad_request" || code === "too_large" ? E.form
          : WN.isMaintenance(r.status) ? T.maintenance : T.failed, "err"); // stripe_error, server_error, offline: try again
      })
      .catch(function () { waiting(false); say(T.failed, "err"); });
  }

  if (PAGE === "project") {
    F.PRESETS.forEach(function (c) { $("amt" + c).addEventListener("change", function () { $("otherAmount").value = ""; sync(); }); });
    $("otherAmount").addEventListener("input", function () {
      if ($("otherAmount").value.trim()) F.PRESETS.forEach(function (c) { $("amt" + c).checked = false; });
      sync();
    });
    ["once", "monthly", "anon", "donorMsg"].forEach(function (id) { $(id).addEventListener(id === "donorMsg" ? "input" : "change", sync); });
    $("giveSubmit").addEventListener("click", submit);
    // No <form> (the CSP allows no form action): Enter in a one-line field does what the button does.
    ["otherAmount", "donorName"].forEach(function (id) {
      $(id).addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.isComposing) submit(); });
    });
  }

  // ---- Sharing: the phone's share sheet, else the link copied ----
  function shareButton(title, url) {
    text("share", T.share);
    $("share").onclick = function () {
      if (navigator.share) { navigator.share({ title: title, text: T.shareText, url: url }).catch(function () {}); return; }
      var done = function () { text("shareMsg", T.copied); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { text("shareMsg", url); });
      else text("shareMsg", url);
    };
  }

  // ---- Loading, the page's states ----
  function settle() { if (coverBox) coverBox.classList.remove("sk"); }
  function bad() {
    show("head", false);
    if (coverBox) coverBox.classList.add("hidden");
    show("bad", true);
    text("badTitle", T.badTitle);
    text("badText", T.badText);
    reveal();
  }
  function blank(title, line) {
    cover(null);
    text("title", title);
    text("text", line);
    show("text", true);
    if ($("status")) text("status", "");
    show("headActions", false);
    document.title = title;
  }

  // One read. While WaterNow is being updated (503) one short line says so and it tries again each minute for a while;
  // any other failure (offline, no answer within 15 s) leaves a line and a button to read again.
  function load(read, draw, tries) {
    read()
      .then(function (r) {
        settle();
        WN.leaveNote(document, $("note"), $("title"));
        show("note", !!r.maint);
        if (r.maint) {
          text("note", T.maintenance);
          if (tries < 10) setTimeout(function () { load(read, draw, tries + 1); }, 60000);
          return;
        }
        draw(r);
      })
      .catch(function () {
        settle();
        WN.offlineNote(document, $("note"), T.offline, T.retry, function () { load(read, draw, 0); });
      })
      .then(reveal);
  }
  var clean = function (b) { return F.project(b, API, location.href); };

  if (PAGE === "project") {
    var hasP = new URLSearchParams(location.search).has("p"), pid = F.projectParam(location.search);
    if (hasP && !pid) { bad(); return; }
    document.title = T.name + " · WaterNow";
    text("title", T.name);
    text("sub", T.name);
    text("text", T.lead);
    // A bare fontaine/ shows the current project: the one being funded, else the vote, else the one being built.
    var read = function () {
      if (pid) return rpc("commons_project", { p_id: pid });
      return rpc("commons_list").then(function (r) {
        if (r.maint) return r;
        var cur = F.current((Array.isArray(r.body) ? r.body : []).map(clean));
        return cur ? rpc("commons_project", { p_id: cur.id }) : { body: null, none: true };
      });
    };
    load(read, function (r) {
      var o = clean(r.body);
      if (o) projectPage(o);
      else if (r.none) blank(T.none, T.noneText);
      else blank(T.gone, T.goneText);
    }, 0);
  } else if (PAGE === "thanks") {
    var tp = F.projectParam(location.search);
    document.title = T.thanks + " · WaterNow";
    text("title", T.thanks);
    text("text", tp ? T.thanksText : T.thanksFund);
    text("back", T.back);
    if (tp) $("back").href = "../?p=" + tp;
    // A monthly gift (commons-checkout's ?m=1): how to stop it. No account on the site: write to the team (the contact
    // address is in the privacy policy), or, with an account, « Gérer mon don mensuel » in the app.
    if (new URLSearchParams(location.search).get("m") === "1") {
      text("stopMonthlyText", T.stopMonthly);
      text("writeUs", T.writeUs);
      $("writeUs").href = ROOT + "privacy/#" + lang;
      show("stopMonthly", true);
    }
    shareButton(T.name, ROOT + "fontaine/" + (tp ? "?p=" + tp : ""));
    if (!tp) reveal();
    else {
      load(function () { return rpc("commons_project", { p_id: tp }); }, function (r) {
        var o = clean(r.body);
        if (!o) return;
        text("projectName", o.title);
        show("projectName", !!o.title);
        thermo(o);
        shareButton(o.title || T.name, ROOT + "fontaine/?p=" + o.id);
      }, 0);
    }
  } else if (PAGE === "fountain") {
    var sq = null;
    try { sq = new URLSearchParams(location.search).get("s"); } catch (e) { sq = null; }
    var spot = sq && /^[1-9][0-9]{0,15}$/.test(sq) && Number.isSafeInteger(Number(sq)) ? Number(sq) : null;
    if (!spot) { bad(); return; }
    text("builtBy", T.name + " · " + T.builtBy);
    text("open", T.open);
    text("onMap", T.onMap);
    load(function () { return rpc("commons_fountain", { p_spot: spot }); }, function (r) {
      var o = clean(r.body);
      if (!o) {
        blank(T.notFountain, T.notFountainText);
        show("builtBy", false);
        return;
      }
      document.title = T.doc(o.title || T.name);
      text("title", o.title || T.name);
      cover(o);
      text("opened", o.impact && o.impact.since ? T.opened(day(o.impact.since)) : "");
      var s = o.site;
      if (s) {
        var link = { id: String(spot), lat: s.lat, lon: s.lon, name: WN.cleanName(o.title || s.name) };
        $("open").href = WN.appLink(link);
        $("onMap").href = ROOT + "s/?id=" + spot + "&lat=" + s.lat.toFixed(6) + "&lon=" + s.lon.toFixed(6) + (link.name ? "&n=" + encodeURIComponent(link.name) : "");
        place(s);
        show("where", true);
        map([s], true);
      } else show("headActions", false); // the app's point link needs the point's place
      impact(Object.assign({}, o, { status: "built" }));
      wall(o);
      sponsors(o);
      $("projectLink").href = ROOT + "fontaine/?p=" + o.id;
      text("projectLink", T.story);
      show("story", true);
    }, 0);
  }
})();
