// node --test site/assets/fontaine.test.js  (« Fontaine commune »: the public pages run on fixture JSON in a tiny DOM, the
// « Donner » form, the home entry, the console's admin helpers and the pages' rules; no browser needed)
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const F = require("./fontaine-data.js");
const A = require("../console/fontaine.js");
const S = require("../console/sim-core.js");
const C = require("../console/core.js");
const { LANGS } = require("./spot-params.js");
const { QrCode } = require("./vendor/qrcodegen/qrcodegen.js");
const FIX = require("../../scripts/commons-fixture.cjs");

const site = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(site, f), "utf8").replace(/\r\n/g, "\n");
const T = F.STRINGS.fr;
const fr = (c) => F.money(c, "fr");
const settle = async () => { for (let i = 0; i < 40; i++) await new Promise((r) => setImmediate(r)); };
const byId = (list, id) => list.find((p) => p.id === id);

// ---- A tiny DOM: every element of the page's HTML by its id (tag, classes, checked), what the script creates ----
class El {
  constructor(tag, id) {
    this.tagName = tag.toUpperCase(); this.id = id || ""; this.children = []; this._text = ""; this.attrs = {}; this.on = {};
    this.cls = new Set(); this.style = { props: {}, setProperty(k, v) { this.props[k] = v; } }; this.value = ""; this.checked = false;
    this.disabled = false; this.parent = null; this.placeholder = "";
  }
  get classList() {
    const s = this.cls;
    return { add: (...c) => c.forEach((x) => s.add(x)), remove: (...c) => c.forEach((x) => s.delete(x)), contains: (c) => s.has(c),
             toggle: (c, on) => { if (on === undefined) on = !s.has(c); if (on) s.add(c); else s.delete(c); return on; } };
  }
  set className(v) { this.cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get className() { return [...this.cls].join(" "); }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => (typeof c === "string" ? c : c.textContent)).join(""); }
  append(...n) { n.forEach((x) => { if (typeof x !== "string") x.parent = this; this.children.push(x); }); }
  appendChild(n) { this.append(n); return n; }
  replaceChildren() { this.children = []; this._text = ""; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(t, f) { (this.on[t] = this.on[t] || []).push(f); }
  fire(t, e) { (this.on[t] || []).forEach((f) => f(e || {})); }
  click() { this.fire("click"); if (this.onclick) this.onclick({}); }
  focus() { this.doc.activeElement = this; }
  contains(n) { for (; n; n = n.parent) if (n === this) return true; return false; }
  querySelector(sel) { return all(this).find((e) => e !== this && sel === "button.retry" && e.tagName === "BUTTON" && e.cls.has("retry")) || null; }
  get hidden() { return this.cls.has("hidden"); }
}
const all = (e) => [e, ...e.children.filter((c) => typeof c !== "string").flatMap(all)];

/**
 * Runs a page (its HTML's elements, its scripts) at [search] against [routes](name, body) → [status, json] for the RPCs
 * and the checkout. Returns the elements, the calls, where location.assign went.
 */
function open(page, search, routes, extra = {}) {
  const html = read(page);
  const doc = { activeElement: null, title: "", readyState: "complete", documentElement: { lang: "", classList: { add() {} } } };
  const els = {};
  for (const m of html.matchAll(/<(\w+)([^>]*?)\sid="([^"]+)"([^>]*)>/g)) {
    const e = new El(m[1], m[3]), attrs = m[2] + m[4], cls = /class="([^"]*)"/.exec(attrs);
    if (cls) e.className = cls[1];
    if (/\schecked\b/.test(attrs)) e.checked = true;
    const href = /href="([^"]*)"/.exec(attrs);
    if (href) e.href = href[1];
    e.doc = doc;
    els[m[3]] = e;
  }
  const body = /<body([^>]*)>/.exec(html)[1];
  const metas = Object.fromEntries([...html.matchAll(/<meta name="(wn-[a-z]+)" content="([^"]*)">/g)].map((m) => [m[1], m[2]]));
  Object.assign(doc, {
    body: { getAttribute: (k) => { const m = new RegExp(k + '="([^"]*)"').exec(body); return m ? m[1] : null; } },
    getElementById: (id) => els[id] || null,
    createElement: (t) => { const e = new El(t); e.doc = doc; return e; },
    querySelector: (sel) => { const m = /meta\[name="([^"]+)"\]/.exec(sel); return m && m[1] in metas ? { getAttribute: () => metas[m[1]] } : null; },
    querySelectorAll: () => [],
    addEventListener() {}
  });
  const calls = [], assigned = [];
  const fetch = async (url, o) => {
    const name = url.includes("/rest/v1/rpc/") ? url.split("/rest/v1/rpc/")[1] : url.includes("/functions/v1/") ? url.split("/functions/v1/")[1] : url;
    const b = o && o.body ? JSON.parse(o.body) : undefined;
    calls.push({ name, body: b, headers: o && o.headers });
    const [status, json] = routes(name, b) || [404, { code: "PGRST202" }];
    return { status, ok: status >= 200 && status < 300, json: async () => json };
  };
  const location = { search, href: "https://coolminer11.github.io/WaterNow-site/" + page.replace(/index\.html$/, "") + search, assign: (u) => assigned.push(u) };
  const ctx = vm.createContext({ document: doc, fetch, location, navigator: extra.navigator || { languages: ["fr-CA"] }, URL, URLSearchParams,
    AbortController, setTimeout: (f, ms) => (ms >= 1000 ? 0 : setTimeout(f, ms)), clearTimeout, Blob, console });
  ctx.window = ctx;
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]).filter((s) => !/hold|motion|map\.js|maplibre|vendor/.test(s));
  for (const s of scripts) vm.runInContext(fs.readFileSync(path.join(site, path.dirname(page), s), "utf8"), ctx, { filename: s });
  return { els, $: (id) => els[id], calls, assigned, doc, text: (id) => els[id].textContent };
}
const pub = (id) => FIX.publicProject(byId(FIX.projects, id));
const server = (over = {}) => (name, b) => {
  if (over[name]) return over[name](b);
  if (name === "commons_list") return [200, FIX.projects.filter((p) => p.status !== "draft").map(FIX.listEntry)];
  if (name === "commons_project") return [200, pub(b.p_id)];
  if (name === "commons_fountain") return [200, FIX.publicProject(FIX.projects.find((p) => p.spot_id === b.p_spot)) || null];
  if (name === "version.json" || /version\.json$/.test(name)) return [404, null];
  return null;
};

test("fontaine/?p=1 (funding): thermometer, matching, where, who, budget, the wall and the sponsors from the server's JSON", async () => {
  const p = open("fontaine/index.html", "?p=1", server());
  await settle();
  assert.deepEqual(p.calls.filter((c) => c.name.startsWith("commons")).map((c) => [c.name, c.body]), [["commons_project", { p_id: 1 }]]);
  assert.equal(p.text("title"), "Bibliothèque du Faubourg");
  assert.equal(p.doc.title, "Bibliothèque du Faubourg · La Fontaine commune");
  assert.equal(p.text("status"), "Collecte en cours");
  // Raised and matched both count toward the goal.
  assert.equal(p.text("raised"), fr(244000));
  assert.equal(p.text("goal"), "sur " + fr(320000));
  assert.equal(p.text("thermoLine"), T.matchedPart(fr(60000)) + " · " + T.donorsCount("63", 63));
  assert.equal(p.$("fill").style.props["--w"], "57.5%");
  assert.equal(p.$("fillMatched").style.props["--w"], "18.8%");
  assert.ok(!p.$("thermo").hidden && !p.$("give").hidden && !p.$("giveLink").hidden && !p.$("match").hidden);
  assert.match(p.text("matchText"), /^Café La Gourde double chaque don, jusqu'à 1\s500\s\$/);
  assert.equal(p.text("matchLeft"), T.matchingLeft(fr(90000)));
  // The rollover rule, written before anyone gives: under the thermometer and by the button.
  assert.equal(p.text("rollover"), T.rollover);
  assert.equal(p.text("rollover2"), T.rollover);
  assert.ok(!p.$("rollover").hidden);
  // Where: the chosen site, and the vote's result with the winner marked.
  assert.equal(p.text("placeName"), "Bibliothèque du Faubourg");
  const sites = p.$("sites").children;
  assert.equal(sites.length, 3);
  assert.ok(sites[0].cls.has("won") && !sites[1].cls.has("won"));
  assert.match(sites[0].textContent, /412 votes/);
  assert.ok(p.$("voteBox").hidden, "no vote box once the vote is over");
  // Who builds it: builder, its quote and its document, the host.
  assert.match(p.text("whoList"), /Plomberie Laurentides.*Entrepreneur.*Soumission : 2\s550\s\$ · Voir la soumission/);
  assert.match(p.text("whoList"), /Hôte.*Bibliothèque du Faubourg/);
  // The budget: every line, bars against the whole, the total.
  assert.equal(p.$("bars").children.length, 5);
  assert.equal(p.$("bars").children[0].children[1].children[0].style.props["--w"], "57.8%");
  assert.equal(p.text("total"), fr(320000));
  // The wall: names or « Anonyme », amounts only when shown, no hidden message, the server's order (no ranking).
  const wall = p.$("wall").children;
  assert.equal(wall.length, 12);
  assert.equal(wall[0].children[0].textContent, "Marie-Ève" + fr(5000));
  assert.equal(wall[1].children[0].textContent, "Anonyme", "anonymous, amount not shown");
  assert.equal(wall[3].children[0].textContent, "Julien T.", "named, amount not shown");
  assert.ok(!wall[7].textContent.includes("retiré"), "a hidden message never reaches the wall");
  // Sponsors by tier, gold first; a logo only from WaterNow's storage, else the initial.
  const tiers = p.$("tiers").children;
  assert.deepEqual(tiers.map((t) => t.children[0].textContent), ["Or", "Argent", "Bronze"]);
  const bronze = tiers[2].children[1].children;
  assert.equal(bronze[0].textContent, "VVélo Cartier");
  const imgs = all(p.$("tiers")).filter((e) => e.tagName === "IMG");
  assert.equal(imgs.length, 0, "the fixture's logos are on the preview's origin, not WaterNow's storage: initials here");
  assert.equal(p.text("giveSubmit"), T.giveBtn(fr(2500)));
});

test("fontaine/?p=2 (vote): the 3 candidates with their figures, counts hidden, « Vote dans l'app », no donation", async () => {
  const p = open("fontaine/index.html", "?p=2", server());
  await settle();
  assert.equal(p.text("status"), "Vote en cours");
  assert.ok(p.$("thermo").hidden && p.$("give").hidden && p.$("giveLink").hidden && p.$("match").hidden);
  assert.ok(!p.$("voteBox").hidden && !p.$("votesHidden").hidden && !p.$("sitesTitle").hidden);
  assert.equal(p.text("voteTitle"), "Vote dans l'app");
  // The project in the app, the app itself beside it (the APK when version.json checks out, else the home page).
  assert.equal(p.text("voteOpen"), "Ouvrir dans WaterNow");
  assert.equal(p.$("voteOpen").href, "waternow://commons/2");
  assert.equal(p.text("voteGet"), T.get);
  assert.equal(p.text("sub"), "La Fontaine commune · Montréal", "the feature and the city under the title, no label above it");
  assert.equal(p.text("sitesTitle"), T.candidates);
  const sites = p.$("sites").children;
  assert.equal(sites.length, 3);
  assert.deepEqual(sites.map((s) => s.children[0].textContent), ["A", "B", "C"]);
  assert.match(sites[0].textContent, /3\s840 résidents de plus à moins de 5 minutes à pied/);
  assert.match(sites[0].textContent, /14\s600 résidents à moins de 10 minutes à pied/);
  assert.match(sites[0].textContent, /86 recherches d'eau sans résultat/);
  assert.doesNotMatch(p.text("sites"), /votes?\b/, "no count before the vote closes");
  assert.ok(!p.$("closed").hidden);
  assert.equal(p.text("closedText"), T.closed.vote);
  assert.ok(p.$("donors").hidden, "no wall without gifts outside a fundraiser");
});

test("fontaine/?p=3 (built): the impact since opening, « jusqu'à » bottles, the fountain's page", async () => {
  const p = open("fontaine/index.html", "?p=3", server());
  await settle();
  assert.ok(!p.$("impact").hidden);
  assert.equal(p.text("refills"), T.refills(new Intl.NumberFormat("fr").format(2480), 2480));
  assert.match(p.text("bottles"), /^jusqu'à 1.240 bouteilles évitées$/);
  assert.equal(p.text("bottleNote"), T.bottleNote);
  assert.equal(p.$("fountainLink").href, "https://coolminer11.github.io/WaterNow-site/f/?s=5000000100042");
  assert.equal(p.text("closedText"), T.closed.built);
});

test("a bare fontaine/ shows the current project (funding first); none, a bad ?p= and a missing read each say so", async () => {
  let p = open("fontaine/index.html", "", server());
  await settle();
  assert.deepEqual(p.calls.filter((c) => c.name.startsWith("commons")).map((c) => c.name), ["commons_list", "commons_project"]);
  assert.equal(p.calls[p.calls.length - 1].body.p_id, 1);
  p = open("fontaine/index.html", "", server({ commons_list: () => [200, []] }));
  await settle();
  assert.equal(p.text("title"), T.none);
  assert.ok(p.$("headActions").hidden);
  p = open("fontaine/index.html", "?p=abc", server());
  await settle();
  assert.ok(!p.$("bad").hidden && p.$("head").hidden);
  assert.equal(p.calls.filter((c) => c.name.startsWith("commons")).length, 0);
  p = open("fontaine/index.html", "?p=4", server()); // a draft: the public read answers null
  await settle();
  assert.equal(p.text("title"), T.gone);
  p = open("fontaine/index.html", "?p=1", () => [404, { code: "PGRST202" }]); // section 85 not applied yet
  await settle();
  assert.ok(!p.$("note").hidden);
  assert.match(p.text("note"), /^Impossible de charger le projet\. Réessayer$/);
});

// ---- The « Donner » form ----
async function funding(over) {
  const p = open("fontaine/index.html", "?p=1", server(over));
  await settle();
  return p;
}
const checkouts = (p) => p.calls.filter((c) => c.name === "commons-checkout");

test("the form: an amount from 2 $ to 10 000 $, a name or anonymous; nothing is sent until it checks out", async () => {
  const p = await funding({ "commons-checkout": () => [503, { code: "stripe_not_configured" }] });
  p.$("otherAmount").value = "1"; p.$("otherAmount").fire("input");
  assert.equal(p.text("giveSubmit"), T.give, "no amount on the button while it's off");
  p.$("giveSubmit").click(); await settle();
  assert.equal(p.text("giveMsg"), T.badAmount(fr(200), fr(1000000)));
  assert.ok(p.$("giveMsg").cls.has("err"));
  for (const v of ["abc", "10000.01", "-5", "1e3"]) { p.$("otherAmount").value = v; p.$("giveSubmit").click(); await settle(); }
  assert.equal(checkouts(p).length, 0);
  p.$("otherAmount").value = "12,50"; p.$("otherAmount").fire("input");
  assert.equal(p.text("giveSubmit"), T.giveBtn(fr(1250)));
  p.$("giveSubmit").click(); await settle();
  assert.equal(p.text("giveMsg"), T.badName, "a name, or anonymous");
  assert.equal(checkouts(p).length, 0);
});

test("the body is the contract's: one-time to the project, monthly to the fund, anonymous without a name, a message cut to 140", async () => {
  const p = await funding({ "commons-checkout": () => [503, { code: "stripe_not_configured" }] });
  p.$("donorName").value = "  Marie-Ève  "; p.$("showAmount").checked = true;
  p.$("donorMsg").value = "Merci ! " + "é".repeat(200) + "​";
  p.$("giveSubmit").click(); await settle();
  const b = checkouts(p)[0].body;
  assert.deepEqual(Object.keys(b).sort(), ["amount_cents", "anonymous", "message", "monthly", "name", "project_id", "show_amount"]);
  assert.equal(b.project_id, 1); assert.equal(b.amount_cents, 2500); assert.equal(b.monthly, false);
  assert.equal(b.name, "Marie-Ève"); assert.equal(b.anonymous, false); assert.equal(b.show_amount, true);
  assert.equal([...b.message].length, 140);
  assert.ok(checkouts(p)[0].headers.apikey.startsWith("sb_publishable_"), "the publishable key only: no account on the website");
  assert.equal(checkouts(p)[0].headers.Authorization, undefined);
  // Monthly, anonymous: the fund, no name.
  const q = await funding({ "commons-checkout": () => [503, { code: "stripe_not_configured" }] });
  q.$("amt2500").checked = false; q.$("amt10000").checked = true; q.$("amt10000").fire("change");
  q.$("monthly").checked = true; q.$("once").checked = false; q.$("monthly").fire("change");
  assert.equal(q.text("giveSubmit"), T.giveMonthlyBtn(fr(10000)));
  assert.ok(!q.$("monthlyNote").hidden);
  q.$("donorName").value = "Visible?"; q.$("anon").checked = true; q.$("anon").fire("change");
  assert.equal(q.$("donorName").disabled, true);
  q.$("giveSubmit").click(); await settle();
  assert.deepEqual(checkouts(q)[0].body, { project_id: null, amount_cents: 10000, monthly: true, name: null, anonymous: true, show_amount: false, message: null });
});

test("503 stripe_not_configured: « Les dons ouvrent bientôt », for good; a Stripe URL opens; anything else is refused", async () => {
  const p = await funding({ "commons-checkout": () => [503, { code: "stripe_not_configured" }] });
  p.$("anon").checked = true;
  p.$("giveSubmit").click(); await settle();
  assert.equal(p.text("giveSubmit"), "Les dons ouvrent bientôt");
  assert.equal(p.text("giveMsg"), T.soonText);
  assert.equal(p.$("giveSubmit").getAttribute("aria-disabled"), "true", "busy look, still focusable");
  p.$("giveSubmit").click(); await settle();
  assert.equal(checkouts(p).length, 1, "pressed again: nothing sent");
  const ok = await funding({ "commons-checkout": () => [200, { url: "https://checkout.stripe.com/c/pay/cs_test_a1#fid" }] });
  ok.$("anon").checked = true;
  ok.$("giveSubmit").click(); await settle();
  assert.deepEqual(ok.assigned, ["https://checkout.stripe.com/c/pay/cs_test_a1#fid"]);
  for (const url of ["https://evil.example/pay", "http://checkout.stripe.com/x", "javascript:alert(1)", "https://checkout.stripe.com.evil.example/"]) {
    const no = await funding({ "commons-checkout": () => [200, { url }] });
    no.$("anon").checked = true;
    no.$("giveSubmit").click(); await settle();
    assert.deepEqual(no.assigned, [], url);
    assert.equal(no.text("giveMsg"), T.failed);
    assert.equal(no.$("giveSubmit").getAttribute("aria-disabled"), null, "it can be pressed again");
  }
  const maint = await funding({ "commons-checkout": () => [503, { code: "maintenance" }] });
  maint.$("anon").checked = true;
  maint.$("giveSubmit").click(); await settle();
  assert.equal(maint.text("giveMsg"), T.maintenance, "a 503 that isn't Stripe's is WaterNow being updated");
});

test("every commons-checkout refusal says what to do; the no-tax line sits by the button, before anyone gives", async () => {
  const E = T.errors;
  for (const [status, code, want] of [[400, "bad_amount", T.badAmount(fr(200), fr(1000000))], [400, "message_too_long", E.message],
    [400, "monthly_fund_only", E.monthly], [400, "bad_project", E.project], [409, "project_not_open", E.project], [403, "origin_not_allowed", E.origin],
    [400, "bad_request", E.form], [413, "too_large", E.form], [502, "stripe_error", T.failed], [502, "server_error", T.failed], [500, "server_misconfigured", T.failed]]) {
    const p = await funding({ "commons-checkout": () => [status, { code }] });
    p.$("anon").checked = true;
    p.$("giveSubmit").click(); await settle();
    assert.equal(p.text("giveMsg"), want, code);
    assert.ok(p.$("giveMsg").cls.has("err"), code);
    assert.equal(p.$("giveSubmit").getAttribute("aria-disabled"), null, code + ": it can be pressed again");
  }
  const p = await funding();
  assert.equal(p.text("noTax"), "Ce don n'est pas déductible d'impôt.");
  const html = read("fontaine/index.html");
  assert.ok(html.indexOf('id="giveSubmit"') < html.indexOf('id="noTax"') && html.indexOf('id="noTax"') < html.indexOf('id="giveMsg"'), "right under the button");
  for (const l of LANGS) assert.ok(F.STRINGS[l].noTax.length > 10, l);
  assert.equal(F.NAME_MAX, 40, "the checkout keeps 40 characters of a name");
  assert.match(html, /id="donorName" autocomplete="name" maxlength="40"/);
});

test("f/?s=<spot> (the plaque's QR): the built fountain, its point in the app and on the map; a bad or unknown point says so", async () => {
  let p = open("f/index.html", "?s=5000000100042", server());
  await settle();
  assert.deepEqual(p.calls.filter((c) => c.name.startsWith("commons")).map((c) => [c.name, c.body]), [["commons_fountain", { p_spot: 5000000100042 }]]);
  assert.equal(p.text("title"), "Centre communautaire Limoilou");
  assert.equal(p.text("builtBy"), "La Fontaine commune · Construite par la communauté", "the feature's name on the line under the title");
  assert.match(p.text("opened"), /^Ouverte depuis le 14 juin 2026$/);
  assert.equal(p.$("open").href, "waternow://spot/5000000100042?lat=46.829050&lon=-71.224100&n=Centre%20communautaire%20Limoilou");
  assert.equal(p.$("onMap").href, "https://coolminer11.github.io/WaterNow-site/s/?id=5000000100042&lat=46.829050&lon=-71.224100&n=Centre%20communautaire%20Limoilou");
  assert.match(p.text("bottles"), /^jusqu'à /);
  assert.equal(p.$("wall").children.length, 5);
  assert.equal(p.$("projectLink").href, "https://coolminer11.github.io/WaterNow-site/fontaine/?p=3");
  p = open("f/index.html", "?s=12x", server());
  await settle();
  assert.ok(!p.$("bad").hidden);
  p = open("f/index.html", "?s=5000000100099", server());
  await settle();
  assert.equal(p.text("title"), T.notFountain);
  assert.ok(p.$("headActions").hidden && p.$("impact").hidden);
});

test("fontaine/merci/?p=1: thanks, the project's thermometer, back and share; without ?p= the fund is thanked", async () => {
  let p = open("fontaine/merci/index.html", "?p=1", server());
  await settle();
  assert.equal(p.text("title"), "Merci !");
  assert.equal(p.text("text"), T.thanksText);
  assert.equal(p.text("projectName"), "Bibliothèque du Faubourg");
  assert.equal(p.$("back").href, "../?p=1");
  assert.ok(!p.$("thermo").hidden);
  p.$("share").click(); await settle();
  assert.equal(p.text("shareMsg"), "https://coolminer11.github.io/WaterNow-site/fontaine/?p=1", "no share sheet, no clipboard: the link shown");
  assert.ok(p.$("stopMonthly").hidden, "a one-time gift: nothing about stopping");
  p = open("fontaine/merci/index.html", "", server());
  await settle();
  assert.equal(p.text("text"), T.thanksFund);
  assert.equal(p.calls.filter((c) => c.name.startsWith("commons")).length, 0);
  // A monthly gift (commons-checkout's ?m=1): how to stop it; no account on the site, so write to the team.
  p = open("fontaine/merci/index.html", "?m=1", server());
  await settle();
  assert.ok(!p.$("stopMonthly").hidden);
  assert.equal(p.text("stopMonthlyText"), T.stopMonthly);
  assert.match(T.stopMonthly, /écris-nous.*« Gérer mon don mensuel »/);
  assert.equal(p.text("writeUs"), "Nous écrire");
  assert.equal(p.$("writeUs").href, "https://coolminer11.github.io/WaterNow-site/privacy/#fr", "the privacy policy carries the contact address");
});

test("home: the current project's entry only when there is one; a missing read (404) or none leaves no trace", async () => {
  const home = (routes) => open("index.html", "", routes);
  let p = home(server());
  await settle();
  assert.ok(!p.$("commons").hidden);
  assert.equal(p.$("commons").href, "fontaine/?p=1");
  assert.equal(p.text("commonsTitle"), "Bibliothèque du Faubourg");
  assert.equal(p.text("commonsLine"), "La Fontaine commune · " + T.raisedOf(fr(244000), fr(320000)) + " · Collecte en cours");
  assert.ok(p.$("commonsApp").hidden, "the app link only during a vote");
  assert.ok(!p.$("privacyCard").cls.has("waiting"), "the card under it shows once the read answered");
  for (const routes of [() => [404, { code: "PGRST202" }], server({ commons_list: () => [200, []] }), server({ commons_list: () => [200, "nope"] })]) {
    p = home(routes);
    await settle();
    assert.ok(p.$("commons").hidden);
    assert.ok(!p.$("privacyCard").cls.has("waiting"));
  }
  p = home(server({ commons_list: () => [200, FIX.projects.filter((x) => x.status === "vote").map(FIX.listEntry)] }));
  await settle();
  assert.equal(p.text("commonsLine"), "La Fontaine commune · Vote en cours");
  assert.ok(p.$("commonsTrack").hidden, "no thermometer before the fundraiser");
  // Voting is in the app: the project there (waternow://commons/<id>); the home page's download button gets the app.
  assert.ok(!p.$("commonsApp").hidden);
  assert.equal(p.text("commonsVote"), "Vote dans l'app");
  assert.equal(p.$("commonsVote").href, "waternow://commons/2");
});

// ---- The plain parts ----
test("what the server sends is checked again: drafts, bad statuses, outside images, unsafe links and odd numbers", () => {
  const api = "https://pkqsvlbiznrqxfckaxll.supabase.co", base = "https://coolminer11.github.io/WaterNow-site/fontaine/";
  assert.equal(F.project({ id: 4, status: "draft" }, api, base), null);
  assert.equal(F.project({ id: 0, status: "funding" }, api, base), null);
  assert.equal(F.project([], api, base), null);
  const o = F.project({ id: 9, status: "funding", title: "A‮B", goal_cents: -5, raised_cents: "100", donors: [{ name: null, amount_cents: 2.5, message: "x".repeat(300) }],
    sponsors: [{ name: "S", tier: "platinum" }, { name: "G", tier: "gold", logo_url: api + "/storage/v1/object/public/commons-media/logos/g.png", url: "javascript:alert(1)" }],
    builder: { name: "B", kind: "evil", url: "http://example.org", quote_doc_url: "https://user:pw@example.org/q.pdf" }, sites: [{ id: 1, lat: 91, lon: 0 }] }, api, base);
  assert.equal(o.title, "AB");
  assert.deepEqual([o.goal, o.raised], [0, 0]);
  assert.deepEqual(o.donors[0], { name: "", amount: null, message: "x".repeat(140), at: null });
  assert.deepEqual(o.sponsors, [{ name: "G", tier: "gold", logo: api + "/storage/v1/object/public/commons-media/logos/g.png", url: null }]);
  assert.deepEqual(o.builder, { name: "B", kind: null, url: null, quote: null, quoteDoc: null });
  assert.deepEqual(o.sites, []);
  for (const bad of ["https://tracker.example/logo.png", api + "/rest/v1/x.png", api + "/storage/v1/object/authenticated/x.png",
    "http://pkqsvlbiznrqxfckaxll.supabase.co/storage/v1/object/public/commons-media/a.png", api + "/storage/v1/object/public/commons-media/../../x",
    api + "/storage/v1/object/public/spot-photos/a.jpg", "data:image/png;base64,AA"]) {
    assert.equal(F.image(bad, api, base), null, bad);
  }
  assert.equal(F.image("/storage/v1/object/public/commons-media/logos/demo-cafe.png", "", "http://127.0.0.1:8874/WaterNow-site/fontaine/"),
    "http://127.0.0.1:8874/storage/v1/object/public/commons-media/logos/demo-cafe.png", "the preview's same origin");
  // waternow://commons/<id> (the app checks it again): only for a real project id.
  assert.equal(F.appLink(12), "waternow://commons/12");
  for (const bad of [0, -1, 1.5, "12", null, Number.MAX_SAFE_INTEGER + 1]) assert.equal(F.appLink(bad), null, String(bad));
  assert.equal(F.current(["building", "vote", "funding"].map((s, i) => ({ id: i + 1, status: s }))).status, "funding");
  assert.equal(F.current([{ id: 1, status: "built" }, { id: 2, status: "archived" }]), null);
  assert.deepEqual(["25", "25.5", "25,50", "1 000", "1 000 $", "0.1"].map(F.amountCents), [2500, 2550, 2550, 100000, 100000, 10]);
  assert.deepEqual(["", "abc", "1.234", "-1", "1e3", "99999999", null].map(F.amountCents), [null, null, null, null, null, null, null]);
  assert.deepEqual([F.projectParam("?p=12"), F.projectParam("?p=012"), F.projectParam("?p=1.5"), F.projectParam("")], [12, null, null, null]);
  assert.equal(F.donation({ amount: 199, anonymous: true }).error, "amount");
  assert.equal(F.donation({ amount: 1000001, anonymous: true }).error, "amount");
  assert.equal(F.donation({ amount: 200, anonymous: true }).body.amount_cents, 200);
  assert.equal(F.donation({ amount: 500, name: " ​ " }).error, "name");
});

test("every app language has every text, in the same shape; French says tu, Romanian writes ș ț", () => {
  const shape = (o) => Object.keys(o).sort().map((k) => k + ":" + (typeof o[k] === "object" ? "{" + shape(o[k]) + "}" : typeof o[k])).join(",");
  const texts = (o) => Object.values(o).flatMap((v) => (typeof v === "object" ? texts(v) : typeof v === "function" ? [v("1", 1, "3", "4")] : [v]));
  for (const [file, table] of [["fontaine-data.js", F.STRINGS], ["console/fontaine.js", A.STRINGS]]) {
    assert.deepEqual(Object.keys(table).sort(), [...LANGS].sort(), file);
    for (const l of LANGS) {
      assert.equal(shape(table[l]), shape(table.en), file + " " + l);
      for (const v of texts(table[l])) assert.ok(typeof v === "string" && v.trim(), file + " " + l);
    }
    const frAll = texts(table.fr).join(" ");
    assert.doesNotMatch(frAll, /\b(vous|votre|vos|e-mail)\b/i, file);
    assert.doesNotMatch(texts(table.ro).join(" "), /[şţŞŢ]/, file);
    for (const l of LANGS.filter((x) => x !== "en")) assert.notEqual(table[l].give || table[l].save, table.en.give || table.en.save, file + " " + l);
  }
  assert.equal(F.STRINGS.fr.soon, "Les dons ouvrent bientôt");
  assert.equal(F.STRINGS.fr.voteTitle, "Vote dans l'app");
  assert.equal(A.STRINGS.fr.builtBy, "Construite par la communauté");
  assert.equal(F.STRINGS.ro.donorsCount("20", 20), "20 de persoane au donat");
  // Every text the page script reads exists.
  const js = read("assets/fontaine.js");
  for (const [, key] of js.matchAll(/\bT\.(\w+)/g)) assert.ok(Object.hasOwn(F.STRINGS.en, key), key);
});

test("the pages: strict CSP (the server for its reads and the checkout), no inline code, text only through textContent", () => {
  for (const page of ["fontaine/index.html", "fontaine/merci/index.html", "f/index.html", "index.html"]) {
    const html = read(page), csp = /Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
    assert.match(csp, /default-src 'none'; script-src 'self'; style-src 'self';/, page);
    assert.match(csp, /connect-src 'self' https:\/\/pkqsvlbiznrqxfckaxll\.supabase\.co/, page);
    assert.match(csp, /form-action 'none'/, page);
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|\*/, page);
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, page + ": inline script");
    assert.doesNotMatch(html, /\son[a-z]+=|\sstyle=|<style/i, page + ": inline handler or style");
    assert.doesNotMatch(html, /<form/, page);
    assert.match(html, /<meta name="wn-api" content="https:\/\/pkqsvlbiznrqxfckaxll\.supabase\.co">/, page);
  }
  // Images (logos, covers) from WaterNow's storage only: one more origin in img-src, never a third party.
  for (const page of ["fontaine/index.html", "f/index.html"]) assert.match(read(page), /img-src 'self' data: blob: https:\/\/pkqsvlbiznrqxfckaxll\.supabase\.co;/);
  for (const f of ["assets/fontaine.js", "assets/fontaine-data.js", "console/fontaine.js", "assets/home.js"]) {
    assert.doesNotMatch(read(f), /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/, f);
  }
  // The checkout's URL is built like the site's other server calls; nothing but Stripe Checkout is ever opened.
  assert.match(read("assets/fontaine.js"), /API \+ "\/functions\/v1\/commons-checkout"/);
  assert.match(read("assets/fontaine.js"), /var url = r\.ok \? F\.checkoutUrl\(r\.body\) : null;\n\s+if \(url\) \{ location\.assign\(url\)/);
  // The console's section and its plaque sheet; the helpers it reuses load first.
  const con = read("console/index.html");
  assert.match(con, /<section class="card hidden" id="fontaine"><\/section>/);
  assert.match(con, /<section class="report hidden" id="plaque" aria-modal="true" role="dialog"><\/section>/);
  assert.ok(con.indexOf("../assets/fontaine-data.js") < con.indexOf('src="fontaine.js"') && con.indexOf("simulator.js") < con.indexOf('src="fontaine.js"'));
  assert.match(read("console/console.js"), /admin: function \(\) \{ return !!\(me && me\.admin\); \}/);
});

// ---- The console's admin helpers ----
test("the plaque's QR code opens the public site's f/?s=<spot>, small enough to print sharp at 90 mm", () => {
  assert.equal(A.plaqueUrl(5000000100042), "https://coolminer11.github.io/WaterNow-site/f/?s=5000000100042");
  for (const bad of [0, -1, 1.5, "12", null, 2 ** 60]) assert.equal(A.plaqueUrl(bad), null, String(bad));
  const qr = QrCode.encodeText(A.plaqueUrl(9007199254740991), QrCode.Ecc.QUARTILE);
  assert.ok(qr.size <= 41, "version 6 or less: " + qr.size); // 90 mm / (41 + 8) modules ≈ 1.8 mm a module
  assert.match(read("console/fontaine.js"), /QrCode\.encodeText\(text, root\.qrcodegen\.QrCode\.Ecc\.QUARTILE\)/);
});

test("the status steps are section 85's, forward only; a slug from the title", () => {
  assert.deepEqual(A.nextSteps("draft"), ["vote", "funding"]);
  assert.deepEqual(A.nextSteps("vote"), ["funding", "archived"]);
  assert.deepEqual(A.nextSteps("funding"), ["building", "archived"]);
  assert.deepEqual(A.nextSteps("building"), ["built"]);
  assert.deepEqual(A.nextSteps("built"), []);
  assert.deepEqual(A.nextSteps("archived"), []);
  assert.deepEqual(A.nextSteps("nope"), []);
  assert.equal(A.slugOf("  Bibliothèque du Faubourg !"), "bibliotheque-du-faubourg");
  assert.equal(A.slugOf("Ça coûte 3 200 $"), "ca-coute-3-200");
  assert.ok(A.slugOf("x".repeat(80)).length <= 48);
  // The console reads section 85's answers: {projects, fund, ledger}, writes {result}; 42501 and WNMFA as the console does.
  const js = read("console/fontaine.js");
  assert.match(js, /r && Array\.isArray\(r\.projects\) \? r\.projects : \[\]/);
  assert.match(js, /if \(!r \|\| r\.result !== "ok"\)/);
  assert.match(js, /if \(e\.code === "WNMFA"\) \{ A\.showMfa\(\); return false; \}/);
  assert.match(js, /e\.code === "42501" \|\| e\.status === 403 \? T\.forbidden/);
  assert.match(js, /vote_opens_at: fromLocal\(vo\.value\), vote_closes_at: fromLocal\(vc\.value\)/);
  assert.doesNotMatch(js, /rolled_to:/, "archiving rolls the money over on the server");
});

test("a site's figures are the simulator's own sums: newly served within 5 min, residents within 10, searches within 10", () => {
  // A small area: 3 x 3 populated cells around a point, one water point 300 m east, searches in the centre cell.
  const lat = 45.55, lon = -73.6, c0 = C.cellOf(lat, lon), cells = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cells.push({ ix: c0.ix + dx, iy: c0.iy + dy, pop: 4000 });
  const P = S.proj(lat, lon), SS = S.sample(cells, P, 10), water = [{ x: 300, y: 0 }], demand = new Float64Array(SS.N);
  for (let k = 4 * 100; k < 5 * 100; k++) demand[k] = 0.5; // the centre cell's 100 samples: 50 searches
  const area = { P, S: SS, demand, dist: () => S.distances(SS, water) };
  const f = A.siteFigures(S, area, lat, lon);
  const at = [{ x: P.x(lon), y: P.y(lat) }];
  assert.deepEqual(f, { newly_served: Math.round(S.newly(SS, S.distances(SS, water), at, S.R[0]).pop), residents_10min: Math.round(S.within(SS, at, S.R[1])),
                        demand_searches: Math.round(S.within(SS, at, S.R[1], demand)) });
  assert.ok(f.newly_served > 0 && f.newly_served < f.residents_10min && f.residents_10min < 36000);
  assert.ok(f.demand_searches > 0 && f.demand_searches < 50, "the part of the centre cell within 10 minutes: " + f.demand_searches);
});

test("a picture goes to commons-media under section 85's names: JPEG, PNG or WebP, 2 MB at most", () => {
  const file = (type, size) => ({ type, size });
  assert.deepEqual(A.mediaPath("covers", file("image/png", 1000), "Bibliothèque du Faubourg", "lz3k2a9x"), { path: "commons-media/covers/bibliotheque-du-faubourg-lz3k2a9x.png" });
  assert.deepEqual(A.mediaPath("logos", file("image/jpeg", 2097152), "Café La Gourde !", "a1"), { path: "commons-media/logos/cafe-la-gourde-a1.jpg" });
  assert.deepEqual(A.mediaPath("logos", file("image/webp", 5), "", "b2"), { path: "commons-media/logos/image-b2.webp" });
  assert.deepEqual(A.mediaPath("covers", file("image/svg+xml", 10), "x", "c"), { error: "type" }, "no SVG (a script inside would run)");
  assert.deepEqual(A.mediaPath("covers", file("image/gif", 10), "x", "c"), { error: "type" });
  assert.deepEqual(A.mediaPath("covers", file("image/png", 2097153), "x", "c"), { error: "size" });
  assert.deepEqual(A.mediaPath("covers", file("image/png", 0), "x", "c"), { error: "size" });
  // The same names commons_media_url_ok accepts (a-z0-9-, the type's extension), even from a long title.
  const long = A.mediaPath("covers", file("image/png", 9), "é".repeat(30) + " ".repeat(5) + "x".repeat(80), "lz3k2a9xq1").path;
  assert.match(long, /^commons-media\/(covers|logos)\/[a-z0-9-]{1,80}\.(jpg|png|webp)$/);
});

test("the console edits and removes sponsors and every campaign by their ids, and uploads pictures", () => {
  const js = read("console/fontaine.js");
  assert.match(js, /call\("commons_admin_upsert_sponsor", \{ p: \{ id: s\.id, delete: true \} \}/);
  assert.match(js, /if \(editing\) body\.id = editing\.id; else \{ body\.id = null; body\.project_id = sel\.id; \}/);
  assert.match(js, /var ms = Array\.isArray\(sel\.matchings\) \? sel\.matchings/);
  assert.match(js, /call\("commons_admin_upsert_matching", \{ p: \{ id: c\.id, delete: true \} \}/);
  assert.match(js, /if \(mEditing\) body\.id = mEditing\.id; else body\.project_id = sel\.id;/);
  assert.match(js, /picture\(g1, T\.fCover, p\.cover_url, "covers"/);
  assert.match(js, /picture\(g, T\.logo, s0\.logo_url, "logos"/);
  assert.match(js, /pick\.accept = "image\/jpeg,image\/png,image\/webp"/);
  const con = read("console/console.js");
  assert.match(con, /fetch\(API \+ "\/storage\/v1\/object\/" \+ path/);
  assert.match(con, /return API \+ "\/storage\/v1\/object\/public\/" \+ path;/);
  // The preview's demo admin list sends what section 85 sends: sponsor ids and every campaign with its id.
  const p1 = byId(FIX.projects, 1);
  assert.ok(p1.sponsors.every((s) => typeof s.id === "number"));
  assert.deepEqual(p1.matchings.map((m) => m.id), [8, 7, 5], "to come, running, ended: newest start first");
});

test("section 89: « Supprimer » only for a demo or test project (every Stripe id demo_), after a confirmation", () => {
  const don = (id, extra) => Object.assign({ stripe_object_id: id, status: "succeeded" }, extra);
  assert.equal(A.deletable({ id: 21, donations: [don("demo_cs_bibliotheque_1"), don("demo_cs_bibliotheque_2", { status: "refunded" })] }), true);
  assert.equal(A.deletable({ id: 4, donations: [] }), true, "a project with no gift at all");
  assert.equal(A.deletable({ id: 1, donations: [don("demo_cs_1"), don("cs_a1B2")] }), false, "a real Stripe payment");
  assert.equal(A.deletable({ id: 1, donations: [don("in_a1B2", { status: "refunded" })] }), false, "a refunded real payment too");
  assert.equal(A.deletable({ id: 1, donations: [don("cs_demo_1")] }), false, "demo_ must come first");
  assert.equal(A.deletable({ id: 1, donations: [{}] }), false);
  assert.equal(A.deletable({ id: null, status: "draft", donations: [] }), false, "a project not saved yet");
  assert.equal(A.deletable({ id: null, fund: true, donations: [] }), false, "never the fund");
  const js = read("console/fontaine.js");
  assert.match(js, /if \(deletable\(sel\)\) \{/);
  assert.match(js, /if \(!root\.confirm\(T\.delConfirm\(sel\.title \|\| "—"\)\)\) return;\n\s+var r = await call\("commons_admin_delete_project", \{ p_id: sel\.id \}, del\);\n\s+if \(!r\) return;/);
  assert.match(js, /real_donations: T\.realGifts, linked: T\.linked/);
  assert.equal(A.STRINGS.fr.del, "Supprimer");
  assert.equal(A.STRINGS.fr.delConfirm("Démo"), "Supprimer « Démo » pour de bon ? C'est impossible à annuler.");
  // The preview's « Démonstration » project offers it (demo_ ids), its real-looking projects don't.
  const sql = fs.readFileSync(path.join(__dirname, "../../docs/migrations/2026-11-13_commons_demo_delete.sql"), "utf8");
  assert.match(sql, /left\(d\.stripe_event_id, 5\) <> 'demo_' OR left\(d\.stripe_object_id, 5\) <> 'demo_'/);
  assert.ok(byId(FIX.projects, 5).donations.every((d) => d.stripe_object_id.startsWith("demo_")));
  assert.ok(FIX.publicProject(byId(FIX.projects, 5)).donors.every((d) => !("stripe_object_id" in d)), "no Stripe id in the public reads");
});

test("the admin's rows become the RPCs' JSON, or say which row to fix", () => {
  const row = (o) => Object.assign({ id: null, name: "", address: "", lat: "", lon: "", newly: "", res10: "", demand: "" }, o);
  assert.deepEqual(A.sitesPayload([row({ name: " Parc ", lat: "45.5485123", lon: "-73,601", newly: "2330.4", res10: "", demand: "21" }), row({})]).sites,
    [{ name: "Parc", address: "", lat: 45.548512, lon: -73.601, newly_served: 2330, residents_10min: null, demand_searches: 21 }]);
  assert.deepEqual(A.sitesPayload([row({ name: "A", lat: "1", lon: "2" }), row({ name: "B", lat: "91", lon: "0" })]), { error: 2 });
  assert.deepEqual(A.sitesPayload([row({ lat: "1", lon: "2" })]), { error: 1 }, "a site needs its name");
  assert.deepEqual(A.budgetPayload([{ kind: "equipment", label: "Station", amount: "1 850" }, { kind: "fees", label: "", amount: "" }]).lines,
    [{ kind: "equipment", label: "Station", amount_cents: 185000 }]);
  assert.deepEqual(A.budgetPayload([{ kind: "bribes", label: "x", amount: "1" }]), { error: 1 });
  assert.deepEqual(A.budgetPayload([{ kind: "other", label: "x", amount: "abc" }]), { error: 1 });
  assert.equal(A.fromLocal(A.toLocal("2026-11-30T04:59:00Z")), "2026-11-30T04:59:00.000Z");
  assert.equal(A.toLocal(null), "");
  assert.equal(A.fromLocal(""), null);
});

test("the preview's demo data stays the contract's shape", () => {
  const keys = ["id", "slug", "title", "status", "city", "goal_cents", "raised_cents", "matched_cents", "donors_count", "currency", "cover_url", "chosen_site", "ends_at", "matching", "spot_id"];
  for (const p of FIX.projects.filter((x) => x.status !== "draft")) {
    assert.deepEqual(Object.keys(FIX.listEntry(p)), keys);
    const o = FIX.publicProject(p);
    for (const k of ["description", "builder", "host", "budget", "sites", "vote", "donors", "sponsors", "spot_id", "impact", "rolled_to"]) assert.ok(k in o, k);
    assert.ok(!("donations" in o) && o.donors.every((d) => !("id" in d)), "no donation id leaves the public reads");
    assert.ok(!("matchings" in o) && o.sponsors.every((s) => !("id" in s)), "no campaign or sponsor id either (admins only)");
    assert.equal(FIX.listEntry(p).spot_id, p.status === "built" ? p.spot_id : null, "the list gives a built fountain's point");
    assert.ok(F.project(o, "", "http://127.0.0.1/"), p.slug);
  }
  assert.equal(FIX.publicProject(byId(FIX.projects, 4)), null);
});
