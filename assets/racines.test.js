// node --test site/assets/racines.test.js  (WaterNow Racines et Plus: the public pages run on fixture JSON in a tiny DOM,
// a server without section 90, offline and maintenance, the data cleaning, the console's admin helpers and the pages'
// rules: 7 languages, CSP, the words never used; no browser needed)
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const R = require("./racines-data.js");
const A = require("../console/racines.js");
const FIX = require("../../scripts/racines-fixture.cjs");
const { LANGS } = require("./spot-params.js");

const site = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(site, f), "utf8").replace(/\r\n/g, "\n");
const T = R.STRINGS.fr;
const fr = (c) => R.money(c, "fr");
const settle = async () => { for (let i = 0; i < 40; i++) await new Promise((r) => setImmediate(r)); };
const API = "https://pkqsvlbiznrqxfckaxll.supabase.co";

// ---- A tiny DOM: every element of the page's HTML by its id, what the script creates ----
class El {
  constructor(tag, id, doc) {
    this.tagName = tag.toUpperCase(); this.id = id || ""; this.children = []; this._text = ""; this.attrs = {}; this.on = {};
    this.cls = new Set(); this.value = ""; this.parent = null; this.doc = doc;
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
  replaceChildren(...n) { this.children = []; this._text = ""; this.append(...n); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(t, f) { (this.on[t] = this.on[t] || []).push(f); }
  fire(t) { (this.on[t] || []).forEach((f) => f({})); }
  click() { this.fire("click"); }
  focus() { this.doc.activeElement = this; }
  contains(x) { for (; x; x = x.parent) if (x === this) return true; return false; }
  querySelector(sel) { return all(this).find((e) => e !== this && sel === "button.retry" && e.tagName === "BUTTON" && e.cls.has("retry")) || null; }
  get hidden() { return this.cls.has("hidden"); }
  get kids() { return this.children.filter((c) => typeof c !== "string"); }
}
const all = (e) => [e, ...e.children.filter((c) => typeof c !== "string").flatMap(all)];

/** Runs [page] at [search] against [routes](name, body) → [status, json] | "throw". */
function open(page, search, routes, metas = {}) {
  const html = read(page);
  const doc = { activeElement: null, title: "", documentElement: { lang: "", classList: { add() {} } } };
  const els = {};
  for (const m of html.matchAll(/<(\w+)([^>]*?)\sid="([^"]+)"([^>]*)>/g)) {
    const e = new El(m[1], m[3], doc), cls = /class="([^"]*)"/.exec(m[2] + m[4]), href = /href="([^"]*)"/.exec(m[2] + m[4]);
    if (cls) e.className = cls[1];
    if (href) e.href = href[1];
    els[m[3]] = e;
  }
  const body = /<body([^>]*)>/.exec(html)[1];
  const meta = Object.assign(Object.fromEntries([...html.matchAll(/<meta name="(wn-[a-z]+)" content="([^"]*)">/g)].map((m) => [m[1], m[2]])), metas);
  Object.assign(doc, {
    body: { getAttribute: (k) => { const m = new RegExp(k + '="([^"]*)"').exec(body); return m ? m[1] : null; } },
    getElementById: (id) => els[id] || null,
    createElement: (t) => new El(t, "", doc),
    querySelector: (sel) => { const m = /meta\[name="([^"]+)"\]/.exec(sel); return m && m[1] in meta ? { getAttribute: () => meta[m[1]] } : null; },
    querySelectorAll: () => []
  });
  const calls = [], replaced = [];
  const fetch = async (url, o) => {
    const name = url.includes("/rest/v1/rpc/") ? url.split("/rest/v1/rpc/")[1] : url;
    const b = o && o.body ? JSON.parse(o.body) : undefined;
    calls.push({ name, body: b, url, headers: o && o.headers });
    const r = routes(name, b);
    if (r === "throw") throw new TypeError("Failed to fetch");
    const [status, json] = r || [404, { code: "PGRST202" }];
    return { status, ok: status >= 200 && status < 300, json: async () => json };
  };
  const location = { search, href: "https://coolminer11.github.io/WaterNow-site/" + page.replace(/index\.html$/, "") + search };
  const ctx = vm.createContext({ document: doc, fetch, location, navigator: { languages: ["fr-CA"] }, URL, URLSearchParams, Intl,
    AbortController, setTimeout: (f, ms) => (ms >= 1000 ? 0 : setTimeout(f, ms)), clearTimeout, console,
    history: { replaceState: (s, t, u) => replaced.push(u) } });
  ctx.window = ctx;
  for (const s of [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]).filter((s) => !/hold|motion/.test(s))) {
    vm.runInContext(fs.readFileSync(path.join(site, path.dirname(page), s), "utf8"), ctx, { filename: s });
  }
  return { els, $: (id) => els[id], calls, replaced, doc, text: (id) => els[id].textContent };
}
const server = (over = {}) => (name, b) => {
  if (over[name]) return over[name](b);
  if (name === "racines_public_report") return [200, FIX.publicReport(b.p_month)];
  if (name === "racines_thanks") return [200, FIX.thanks()];
  if (name === "racines_companies") return [200, FIX.publicCompanies(FIX.companies)];
  return null; // version.json: 404, the APK link stays the home page
};
const rpcCalls = (p) => p.calls.filter((c) => c.name.startsWith("racines_")).map((c) => [c.name, c.body]);

test("racines/?m=2026-10: prices, the app link and October's report from the server's JSON (fr)", async () => {
  const p = open("racines/index.html", "?m=2026-10", server(), { "wn-demo": "1" });
  await settle();
  assert.deepEqual(rpcCalls(p), [["racines_public_report", { p_month: "2026-10-01" }]]);
  assert.equal(p.doc.title, "WaterNow Racines et Plus");
  assert.equal(p.text("title"), "WaterNow Racines et Plus");
  assert.equal(p.text("racinesMonth"), fr(325)); assert.equal(p.text("racinesPer"), "/ mois");
  assert.equal(p.text("racinesYear"), "ou " + fr(3575) + " par année · 1 mois offert");
  assert.equal(p.text("plusMonth"), fr(599)); assert.equal(p.text("plusYear"), "ou " + fr(6589) + " par année · 1 mois offert");
  assert.equal(p.$("subscribe").href, "waternow://racines");
  assert.equal(p.$("commonsLink").href, "https://coolminer11.github.io/WaterNow-site/fontaine/");
  assert.match(p.text("free"), /^Tout ce qui est utile reste gratuit/);
  assert.equal(p.text("planted"), "214"); assert.equal(p.text("plantedLabel"), "arbres plantés");
  assert.equal(p.text("pending"), "0"); assert.equal(p.text("commons"), fr(8420));
  assert.ok(!p.$("planted").cls.has("sk"), "the shimmer goes with the answer");
  assert.equal(p.text("line"), "La communauté a planté 214 arbres en octobre 2026.");
  assert.equal(p.text("members"), "Environ 135 membres Racines et Plus.");
  assert.equal(p.text("total"), "Depuis le début : " + FIX.TOTAL + " arbres plantés.", "trees_total: since the start, whatever the month");
  const items = p.$("projects").kids;
  assert.equal(items.length, 3);
  assert.equal(items[0].kids[0].href, "https://example.org/tree-nation/projects/reboisement-cotier");
  assert.equal(items[0].kids[0].rel, "noopener noreferrer");
  assert.equal(items[0].textContent, "Reboisement côtierMadagascar · 96 arbres");
  assert.equal(p.$("certs").href, "https://example.org/tree-nation/profile/waternow");
  for (const id of ["projects", "projectsTitle", "certs", "members", "total", "monthBox"]) assert.ok(!p.$(id).hidden, id);
  assert.ok(p.$("soon").hidden && p.$("note").hidden);
  // The month picker: the demo's months, newest first, October chosen.
  assert.equal(p.$("month").value, "2026-10");
  assert.equal(p.$("month").kids.at(-1).value, "2026-06");
  assert.equal(p.$("month").kids.at(-1).textContent, "juin 2026");
});

test("racines/: no ?m reads the server's default (the previous month, the last lot's); the current month shows its trees waiting", async () => {
  const p = open("racines/index.html", "", server(), { "wn-demo": "1" });
  await settle();
  assert.deepEqual(rpcCalls(p), [["racines_public_report", { p_month: null }]]);
  assert.equal(p.$("month").value, "2026-10", "the picker follows the month the server answered");
  assert.equal(p.text("planted"), "214");
  const sel = p.$("month");
  sel.value = "2026-11";
  sel.fire("change");
  assert.ok(p.$("planted").cls.has("sk"), "the figures shimmer while the month is read (their place kept)");
  assert.equal(p.text("pendingLabel"), "en attente de plantation", "their words stay, in French");
  await settle();
  assert.deepEqual(rpcCalls(p).at(-1), ["racines_public_report", { p_month: "2026-11-01" }]);
  assert.deepEqual(p.replaced, ["?m=2026-11"]);
  assert.equal(p.text("planted"), "0"); assert.equal(p.text("plantedLabel"), "arbre planté");
  assert.equal(p.text("pending"), "168");
  assert.equal(p.text("line"), "En novembre 2026, 168 arbres attendent la prochaine plantation : Tree-Nation les plante ensemble, une fois par mois.");
  assert.ok(p.$("projects").hidden, "no project before the lot");
  // A month picked with nothing at all: said in words, the figures at 0.
  const q = open("racines/index.html", "?m=2026-08", server({ racines_public_report: () => [200, { month: "2026-08-01", trees_planted: 0, trees_pending: 0 }] }), { "wn-demo": "1" });
  await settle();
  assert.equal(q.text("line"), "Aucun arbre en août 2026.");
  assert.ok(!q.$("figs").hidden && q.$("soon").hidden);
  assert.ok(q.$("members").hidden, "members under 10 (null) aren't shown");
  assert.ok(q.$("total").hidden, "no trees_total (or 0): no line");
});

test("racines/ live at first: the default month has nothing (real payments only): one calm line, never empty figures", async () => {
  const empty = { month: "2026-10-01", trees_planted: 0, trees_pending: 0, members_count_rounded: null, projects: [], certificates_url: null, commons_cents: 0 };
  const p = open("racines/index.html", "", server({ racines_public_report: () => [200, empty] }));
  await settle();
  assert.ok(!p.$("soon").hidden);
  assert.equal(p.text("soonTitle"), "Les premiers arbres seront plantés le 1er du mois prochain.");
  assert.equal(p.text("soonText"), T.soonText);
  for (const id of ["figs", "line", "total", "members", "projects", "certs"]) assert.ok(p.$(id).hidden, id);
  assert.ok(p.$("note").hidden);
  // Trees were planted before (trees_total): an empty default month is said in words, never « the first trees ».
  const r = open("racines/index.html", "", server({ racines_public_report: () => [200, Object.assign({}, empty, { trees_total: 1 })] }));
  await settle();
  assert.ok(r.$("soon").hidden && !r.$("figs").hidden);
  assert.equal(r.text("line"), "Aucun arbre en octobre 2026.");
  assert.equal(r.text("total"), "Depuis le début : 1 arbre planté.");
  // With months to pick (the demo's), the picker stays: this month's trees waiting are one choice away.
  const q = open("racines/index.html", "", server({ racines_public_report: (b) => [200, b.p_month ? FIX.publicReport(b.p_month) : empty] }), { "wn-demo": "1" });
  await settle();
  assert.ok(!q.$("monthBox").hidden && !q.$("soon").hidden);
  q.$("month").value = "2026-11";
  q.$("month").fire("change");
  await settle();
  assert.ok(q.$("soon").hidden && !q.$("figs").hidden);
  assert.equal(q.text("pending"), "168");
});

test("racines/ in production: the picker starts at the launch month; a month before it or a broken ?m reads the current month", async () => {
  for (const s of ["?m=2026-10", "?m=2026-13", "?m=abc", "?m=2026-10-01"]) {
    const p = open("racines/index.html", s, server());
    await settle();
    assert.deepEqual(rpcCalls(p), [["racines_public_report", { p_month: null }]], s);
    assert.equal(p.$("month").kids.at(-1).value, R.LAUNCH);
  }
  assert.equal(R.monthParam("?m=2026-11", new Date(2026, 10, 13)), "2026-11");
  assert.equal(R.monthParam("?m=2026-12", new Date(2026, 10, 13)), null, "not a future month");
  assert.equal(R.monthParam("?m=2026-07", new Date(2026, 10, 13), "2026-06"), "2026-07");
  assert.deepEqual(R.months("2026-11", new Date(2026, 10, 13)), ["2026-11"]);
  assert.deepEqual(R.months("2026-11", new Date(2027, 1, 2)), ["2027-02", "2027-01", "2026-12", "2026-11"]);
});

test("racines/: a server without section 90 says « bientôt » (never an error); offline gives Réessayer; 503 says it's being updated", async () => {
  let p = open("racines/index.html", "", () => null); // every RPC 404 (PGRST202)
  await settle();
  assert.ok(!p.$("soon").hidden);
  assert.equal(p.text("soonTitle"), T.soon);
  assert.equal(p.text("soonText"), T.soonText);
  for (const id of ["figs", "monthBox", "line", "projects", "certs", "members", "total"]) assert.ok(p.$(id).hidden, id);
  assert.ok(p.$("note").hidden, "no error line");

  let up = false;
  p = open("racines/index.html", "", (name, b) => (name.startsWith("racines") && !up ? "throw" : server()(name, b)));
  await settle();
  assert.ok(!p.$("note").hidden);
  assert.match(p.text("note"), /^Impossible de charger le bilan\. /);
  const retry = p.$("note").querySelector("button.retry");
  assert.equal(retry.textContent, "Réessayer");
  up = true;
  retry.click();
  await settle();
  assert.equal(p.text("planted"), "214");
  assert.ok(p.$("note").hidden);

  p = open("racines/index.html", "", () => [503, null]);
  await settle();
  assert.equal(p.text("note"), T.maintenance);
  assert.ok(p.$("soon").hidden);
});

test("racines/merci/: the names, alphabetical in the reader's language, cleaned, no rank and no count; empty; « bientôt »", async () => {
  let p = open("racines/merci/index.html", "", server({ racines_thanks: () => [200, [{ name: "Zoé" }, { name: "élise" }, { name: "Arthur" }, { name: "Élise" },
    { name: "  Béa‮trice  " }, { name: "" }, { name: 42 }, null, { name: "Zoé" }, { name: "x".repeat(60), count: 12 }]] }));
  await settle();
  assert.equal(p.doc.title, "Merci à… · WaterNow Racines");
  const names = p.$("names").kids.map((li) => li.textContent);
  assert.deepEqual(names, ["Arthur", "Béatrice", "élise", "Élise", "x".repeat(40), "Zoé"]);
  assert.ok(p.$("names").kids.every((li) => !li.cls.has("sk")), "the shimmer chips are gone");
  assert.ok(p.$("empty").hidden);
  assert.equal(p.$("back").href, "https://coolminer11.github.io/WaterNow-site/racines/");
  assert.deepEqual(R.thanks(FIX.thanks(), "fr"), FIX.thanks().map((o) => o.name));

  p = open("racines/merci/index.html", "", server({ racines_thanks: () => [200, []] }));
  await settle();
  assert.ok(p.$("names").hidden);
  assert.equal(p.text("empty"), T.thanksEmpty);

  p = open("racines/merci/index.html", "", () => null);
  await settle();
  assert.ok(p.$("names").hidden && !p.$("soon").hidden);
  assert.equal(p.text("soonTitle"), "La page « Merci à… » ouvre bientôt.");
  assert.ok(p.$("note").hidden);
});

test("racines/entreprises/: the companies (logos only from WaterNow's storage), the contact line, no list without section 90", async () => {
  const list = [
    { name: "Café La Gourde", trees: 500, logo_url: API + "/storage/v1/object/public/racines-media/logos/cafe.png", url: "https://example.org/cafe", since: "2026-11-01" },
    { name: "Ailleurs", trees: 1, logo_url: "https://tracker.example.com/logo.png", url: "javascript:alert(1)", since: "nope" },
    { name: "", trees: 9 }, { name: "Sans arbres", trees: -3, logo_url: API + "/storage/v1/object/public/../secret.png" }
  ];
  let p = open("racines/entreprises/index.html", "", server({ racines_companies: () => [200, list] }));
  await settle();
  assert.equal(p.doc.title, "Les entreprises plantent avec WaterNow");
  const items = p.$("companies").kids;
  assert.equal(items.length, 3, "a company without a name is left out");
  const [a, b, c] = items.map((li) => li.kids[0]);
  assert.equal(a.tagName, "A"); assert.equal(a.href, "https://example.org/cafe");
  assert.equal(a.kids[0].kids.filter((k) => k.tagName === "IMG").length, 1);
  assert.equal(a.kids[0].kids[1].src, API + "/storage/v1/object/public/racines-media/logos/cafe.png");
  assert.equal(a.textContent, "CCafé La Gourde500 arbres · depuis novembre 2026");
  assert.equal(b.tagName, "SPAN", "an unsafe link isn't one");
  assert.equal(b.kids[0].kids.filter((k) => k.tagName === "IMG").length, 0, "a third-party logo is never loaded: its initial shows");
  assert.equal(b.textContent, "AAilleurs1 arbre");
  assert.equal(c.kids[0].kids.filter((k) => k.tagName === "IMG").length, 0);
  assert.equal(c.textContent, "SSans arbres");
  // The contact address isn't filled in yet: the line says it is coming (no link to a blank).
  assert.equal(p.text("contact"), T.contactSoon);
  assert.equal(p.$("contact").kids.length, 0);

  p = open("racines/entreprises/index.html", "", server(), { "wn-contact": "bonjour@example.org" });
  await settle();
  const mail = p.$("contact").kids[0];
  assert.equal(p.text("contact"), "Pour planter des arbres avec WaterNow, écris-nous à bonjour@example.org.");
  assert.equal(mail.href, "mailto:bonjour@example.org");
  // Production: the fixture's relative demo logos aren't WaterNow's server's: initials only.
  assert.ok(p.$("companies").kids.every((li) => li.kids[0].kids[0].kids.length === 1));
  assert.equal(p.$("companies").kids.length, 3, "the shown ones only");

  p = open("racines/entreprises/index.html", "", () => null);
  await settle();
  assert.ok(p.$("list").hidden, "no list while the server doesn't have it");
  assert.equal(p.text("step1"), T.ids.step1);
  assert.equal(p.text("coPrice"), "Par exemple : 500 arbres. Prix sur demande.");
});

test("racines/succes/?k=…: Stripe Checkout's way back thanks by what was bought, opens Ta forêt in the app, the APK beside it, reads nothing", async () => {
  let p = open("racines/succes/index.html", "?k=subscription", server());
  await settle();
  assert.equal(p.doc.title, "Merci · WaterNow Racines");
  assert.equal(p.text("okTitle"), "Merci !");
  assert.equal(p.text("okText"), T.okText.subscription);
  assert.equal(p.text("okOpen"), "Ouvre WaterNow pour voir ta forêt.");
  assert.equal(p.$("forestBtn").href, "waternow://forest");
  assert.equal(p.text("forestBtn"), "Ouvrir Ta forêt");
  assert.equal(p.$("get").href, "../../", "version.json unreadable: Obtenir WaterNow keeps the home page");
  assert.ok(!p.$("okManage").hidden, "a subscription: how to manage or cancel it");
  assert.equal(p.$("back").href, "https://coolminer11.github.io/WaterNow-site/racines/");
  assert.deepEqual(rpcCalls(p), [], "no read");
  p = open("racines/succes/index.html", "?k=pack", server());
  await settle();
  assert.equal(p.text("okText"), "Ton paquet d'arbres sera planté par Tree-Nation au début du mois prochain, certificat à l'appui.");
  assert.ok(p.$("okManage").hidden);
  for (const s of ["", "?k=evil", "?k=SUBSCRIPTION", "?k[]=pack"]) {
    p = open("racines/succes/index.html", s, server());
    await settle();
    assert.equal(p.text("okText"), T.okText.other, s);
  }
  // Its APK link from version.json, like the other pages' (an apk in this site's download/ only).
  p = open("racines/succes/index.html", "?k=trees", (name) => (/version\.json$/.test(name)
    ? [200, { apkUrl: "https://coolminer11.github.io/WaterNow-site/download/WaterNow-1500.apk" }] : null));
  await settle();
  assert.equal(p.$("get").href, "https://coolminer11.github.io/WaterNow-site/download/WaterNow-1500.apk");
  assert.equal(p.text("okText"), T.okText.trees);
});

test("data: the report, the companies and the links are cleaned again (counts, rounding, https only, no name)", () => {
  const o = R.report({ month: "2026-10-01", trees_planted: 12.5, trees_pending: -1, members_count_rounded: 47, commons_cents: "9",
    projects: [{ name: "A\u0007", country: "mg", trees: 3, url: "http://x.org" }, { name: "B", country: "Pays inventé", trees: null, url: "https://u:p@x.org" },
      { name: "", trees: 1 }, "x"], certificates_url: "javascript:alert(1)", donors: [{ name: "Jamais" }] }, "fr");
  assert.deepEqual(o, { month: "2026-10", planted: 0, pending: 0, total: 0, members: null, commons: 0, certificates: null,
    projects: [{ name: "A", country: "Madagascar", trees: 3, url: null }, { name: "B", country: "Pays inventé", trees: null, url: null }] });
  assert.equal(R.report({ members_count_rounded: 5 }, "fr").members, null, "under 10: not shown");
  assert.equal(R.report({ members_count_rounded: 135 }, "fr").members, 135);
  assert.equal(R.report({ trees_total: 1234 }, "fr").total, 1234);
  for (const t of [-1, 2.5, "9", null]) assert.equal(R.report({ trees_total: t }, "fr").total, 0, String(t));
  for (const bad of [null, [], "x", 3]) assert.equal(R.report(bad, "fr"), null);
  assert.equal(R.report(FIX.publicReport("2026-10-01"), "ja").projects[2].country, "セネガル");
  assert.equal(R.logo("/storage/v1/object/public/racines-media/logos/demo-cafe.png", "", "http://127.0.0.1:8790/WaterNow-site/racines/entreprises/"),
    "http://127.0.0.1:8790/storage/v1/object/public/racines-media/logos/demo-cafe.png", "the preview: same origin");
  assert.equal(R.logo(API + "/storage/v1/object/authenticated/x/y.png", API, "https://x.org/"), null, "public objects only");
  assert.equal(R.email(""), null); assert.equal(R.email("a@b"), null); assert.equal(R.email("a\"@b.org"), null);
  assert.equal(R.email("bonjour@example.org"), "bonjour@example.org");
  // Annual = 11 months (« 1 mois offert »), as docs/19 says.
  for (const k of ["racines", "plus"]) assert.equal(R.PRICES[k].year, 11 * R.PRICES[k].month, k);
  assert.deepEqual([R.PRICES.racines.month, R.PRICES.plus.month, R.PRICES.racines.year, R.PRICES.plus.year], [325, 599, 3575, 6589]);
});

test("every app language has every text, in the same shape; tu and « courriel » in French, ș ț in Romanian; never « carboneutre »", () => {
  const shape = (o) => Object.keys(o).sort().map((k) => k + ":" + (typeof o[k] === "object" ? "{" + shape(o[k]) + "}" : typeof o[k])).join(",");
  const texts = (o) => Object.values(o).flatMap((v) => (typeof v === "object" ? texts(v) : typeof v === "function" ? [v("12", 12, 12)] : [v]));
  for (const [name, table] of [["racines-data.js", R.STRINGS], ["console/racines.js", A.STRINGS]]) {
    assert.deepEqual(Object.keys(table).sort(), [...LANGS].sort(), name);
    for (const l of LANGS) {
      assert.equal(shape(table[l]), shape(table.en), name + " " + l);
      for (const v of texts(table[l])) assert.ok(typeof v === "string" && v.trim(), name + " " + l);
    }
    const frText = texts(table.fr).join("\n");
    assert.doesNotMatch(frText, /\b(vous|votre|vos)\b/i, name + ": tu, never vous");
    assert.doesNotMatch(frText.replace(/\{email\}/g, ""), /\be-?mail\b/i, name + ": courriel");
    assert.doesNotMatch(texts(table.ro).join("\n"), /[şţŞŢ]/, name + ": comma-below ș ț");
  }
  assert.match(R.STRINGS.fr.contactSoon, /adresse courriel/);
  // The words docs/19 forbids, in every language, in every file of this feature (and the home page's entry).
  const files = ["assets/racines-data.js", "assets/racines.js", "console/racines.js", "assets/home.js", "racines/index.html", "racines/merci/index.html",
    "racines/entreprises/index.html", "racines/succes/index.html"];
  for (const f of files) assert.doesNotMatch(read(f), /carbo|CO2|CO₂|offset|compens|klimaneutral|neutr[aeou]|カーボン|二酸化炭素|相殺/i, f);
  // Each page's fixed words are on one of its pages, by id; each page has its texts.
  const pages = ["racines/index.html", "racines/merci/index.html", "racines/entreprises/index.html"].map(read).join("\n");
  for (const id of Object.keys(R.STRINGS.en.ids)) assert.match(pages, new RegExp('id="' + id + '"'), id);
  // Romanian counts: 1 copac, 19 copaci, 20 de copaci.
  const ro = R.STRINGS.ro;
  assert.deepEqual([1, 19, 20, 101, 120].map((k) => ro.trees(String(k), k)), ["1 copac", "19 copaci", "20 de copaci", "101 copaci", "120 de copaci"]);
  assert.equal(R.STRINGS.de.line("Oktober 2026", "214", 214), "Im Oktober 2026 hat die Community 214 Bäume gepflanzt.");
  assert.equal(R.STRINGS.ja.line("2026年10月", "214", 214), "2026年10月、コミュニティは214本の木を植えました。");
});

test("the pages: strict CSP, no inline code, text only; logos' origin only on the companies page; home's entry waits and has no kicker", () => {
  for (const page of ["racines/index.html", "racines/merci/index.html", "racines/entreprises/index.html", "racines/succes/index.html"]) {
    const html = read(page), reads = !page.includes("succes"); // the thank-you page reads nothing from the server
    const csp = /Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
    const dirs = Object.fromEntries(csp.split(";").map((d) => d.trim().split(/\s+/)).map((a) => [a[0], a.slice(1)]));
    assert.deepEqual(dirs["script-src"], ["'self'"], page); assert.deepEqual(dirs["style-src"], ["'self'"], page);
    assert.deepEqual(dirs["default-src"], ["'none'"], page); assert.deepEqual(dirs["form-action"], ["'none'"], page);
    assert.deepEqual(dirs["connect-src"], reads ? ["'self'", API] : ["'self'"], page);
    assert.deepEqual(dirs["img-src"], page.includes("entreprises") ? ["'self'", API] : ["'self'"], page);
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, page + ": no inline script");
    assert.doesNotMatch(html, /\son[a-z]+=|style=|<style/i, page + ": no inline handler or style");
    assert.doesNotMatch(html, /class="eyebrow"|kicker/, page + ": no label above a title");
    if (reads) assert.match(html, /<meta name="wn-api" content="https:\/\/pkqsvlbiznrqxfckaxll\.supabase\.co">/, page + ": the preview swaps it");
    else assert.match(html, /<meta name="robots" content="noindex">/, page + ": a way back, not a page to find");
    assert.match(html, /<script src="[./]*assets\/hold\.js"><\/script>\n<\/head>/, page + ": waits for its words");
  }
  // billing-checkout's way back and its cancel (docs/19): racines/succes/?k=… and racines/.
  const checkout = fs.readFileSync(path.join(site, "..", "supabase", "functions", "billing-checkout", "index.ts"), "utf8");
  assert.match(checkout, /racines\/succes\/\?k=/);
  for (const f of ["assets/racines.js", "assets/racines-data.js", "console/racines.js"]) {
    assert.doesNotMatch(read(f), /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/, f);
  }
  const home = read("index.html");
  assert.match(home, /<a class="card commons-entry racines-entry waiting" id="racines" href="racines\/">\n\s*<span class="commons-title" id="racinesTitle">/);
  assert.ok(home.indexOf('id="commons"') < home.indexOf('id="racines"') && home.indexOf('id="racines"') < home.indexOf('id="privacyCard"'));
  assert.match(read("assets/home.js"), /done = function \(\) \{ \$\("racines"\)\.classList\.remove\("waiting"\); \$\("privacyCard"\)/);
  // The corporate contact line reads the legal pages' address: scripts/legal-fill.js writes both.
  const legal = JSON.parse(fs.readFileSync(path.join(site, "..", "app", "src", "main", "assets", "legal", "versions.json"), "utf8"));
  assert.equal(/<meta name="wn-contact" content="([^"]*)">/.exec(read("racines/entreprises/index.html"))[1], legal.email);
  assert.match(fs.readFileSync(path.join(site, "..", "scripts", "legal-fill.js"), "utf8"), /wn-contact/);
});

test("console: section 90's overview and lots, the forms' p (jsonb) as docs/19 has them (name ≥ 2, https, commons-media logos, 1 to 100 000 trees, amount)", () => {
  const o = A.overview(FIX.overview());
  assert.deepEqual(o.rows, { racines: { month: 92, year: 31 }, plus: { month: 19, year: 8 } });
  assert.equal(o.active, 150); assert.equal(o.pastDue, 3); assert.equal(o.canceling, 4); assert.equal(o.mrr, FIX.mrr(FIX.subscribers)); assert.equal(o.paid, 41275);
  assert.deepEqual(o.trees, { due: 168, scheduled: 446, planted: 1182, canceled: 4 });
  assert.deepEqual(o.test, { subscribers: 2, trees: 3 }); assert.equal(o.commons, 22330);
  assert.deepEqual(o.companies.map((c) => [c.id, c.name, c.visible, c.trees, c.since]), [[2, "Atelier Rivière Verte", true, 250, "2026-10"], [1, "Café La Gourde", true, 500, "2026-11"],
    [4, "Clinique du Plateau", false, 60, "2026-09"], [3, "Studio Nordet", true, 120, "2026-11"]], "every company with its id, hidden ones too: a later session edits them");
  assert.equal(o.companies[1].logo_url, FIX.companies[0].logo_url); assert.equal(o.companies[3].url, "");
  assert.deepEqual(A.overview({}).companies, [], "no list: no company (never a session-only list)");
  assert.equal(A.overview({ subscribers: { racines: { month: -1, year: "3" }, famille: { month: 9 } } }).active, 0);
  assert.equal(A.overview({ companies: [{ id: 2, name: "Atelier", visible: true }, { name: "no id" }] }).companies.length, 1, "if the server adds the list, it's used");
  assert.equal(A.overview([]), null);
  const lots = A.orders({ orders: FIX.orders.orders.concat([null, { id: "x" }, { id: 9, status: "lost", project: { name: "", url: "https://x.org" } }]), due: FIX.orders.due });
  assert.deepEqual(lots.due, { live: 168, test: 0 });
  assert.equal(lots.lots.length, 7);
  assert.equal(lots.lots[0].live, false, "a test lot is marked");
  assert.deepEqual(lots.lots[1].project, { name: "Reboisement côtier", country: "MG", url: "https://example.org/tree-nation/projects/reboisement-cotier" });
  assert.equal(lots.lots[3].status, "failed"); assert.equal(lots.lots[3].error, "tree_nation_error: insufficient balance"); assert.equal(lots.lots[3].plantedAt, null);
  assert.equal(lots.lots[6].status, null); assert.equal(lots.lots[6].project, null);
  assert.deepEqual(A.orders(null), { due: { live: 0, test: 0 }, lots: [] });

  const base = "https://coolminer11.github.io/WaterNow-site/console/", logo = API + "/storage/v1/object/public/commons-media/logos/studio-nordet-k3x9.png";
  assert.deepEqual(A.companyPayload({ name: "  Studio  Nordet ", url: "https://example.org/a", logo, visible: true }, API, base),
    { p: { name: "Studio Nordet", url: "https://example.org/a", logo_url: logo, visible: true } }, "a new one: no id");
  assert.deepEqual(A.companyPayload({ id: 3, name: "XY", url: "", logo: "" }, API, base), { p: { name: "XY", url: null, logo_url: null, visible: false, id: 3 } });
  for (const name of [" ", "X"]) assert.deepEqual(A.companyPayload({ name }, API, base), { error: "name" }, name);
  assert.deepEqual(A.companyPayload({ name: "XY", url: "http://example.org" }, API, base), { error: "url" });
  assert.deepEqual(A.companyPayload({ name: "XY", url: "javascript:alert(1)" }, API, base), { error: "url" });
  for (const l of ["https://cdn.example.com/l.png", API + "/storage/v1/object/public/racines-media/logos/s.png", API + "/storage/v1/object/public/commons-media/logos/../x.png",
    API + "/storage/v1/object/public/commons-media/logos/Big.png", API + "/storage/v1/object/public/commons-media/logos/s.gif", "/storage/v1/object/public/commons-media/logos/s.png"]) {
    assert.deepEqual(A.companyPayload({ name: "XY", logo: l }, API, base), { error: "logo" }, l);
  }
  assert.ok(A.companyPayload({ name: "XY", logo: "/storage/v1/object/public/commons-media/logos/demo-cafe.png" }, "", "http://127.0.0.1:8790/WaterNow-site/console/").p, "the preview");
  assert.deepEqual(A.treesPayload({ company: "3", trees: "1 000", amount: "1 250,50", note: " Facture\u0007 118 " }), { p: { company_id: 3, trees: 1000, amount_cents: 125050, note: "Facture 118" } });
  assert.deepEqual(A.treesPayload({ company: "3", trees: "5" }), { p: { company_id: 3, trees: 5, amount_cents: 0, note: "" } });
  assert.deepEqual(A.treesPayload({ company: "", trees: "5" }), { error: "company" });
  // The month (the report that counts them): optional, this one or a past one (UTC), sent as its first day.
  const nov = new Date("2026-11-13T12:00:00Z");
  assert.deepEqual(A.treesPayload({ company: "3", trees: "5", month: "2026-10" }, nov), { p: { company_id: 3, trees: 5, amount_cents: 0, note: "", month: "2026-10-01" } });
  assert.equal(A.treesPayload({ company: "3", trees: "5", month: "2026-11" }, nov).p.month, "2026-11-01");
  assert.equal("month" in A.treesPayload({ company: "3", trees: "5", month: " " }, nov).p, false, "empty: the server takes this month");
  for (const m of ["2026-12", "2027-01", "2026-13", "2026-1", "nov", "2026-10-01"]) assert.deepEqual(A.treesPayload({ company: "3", trees: "5", month: m }, nov), { error: "month" }, m);
  assert.equal(A.thisMonth(new Date("2026-11-30T23:30:00-05:00")), "2026-12", "months are UTC, as the server counts them");
  for (const t of ["0", "-4", "2.5", "100001", "", "abc"]) assert.deepEqual(A.treesPayload({ company: "1", trees: t }), { error: "trees" }, t);
  for (const a of ["-3", "abc", "12.345", "99999999"]) assert.deepEqual(A.treesPayload({ company: "1", trees: "2", amount: a }), { error: "amount" }, a);
  assert.deepEqual(A.logoPath({ type: "image/png", size: 1000 }, "Café La Gourde", "k3x9"), { path: "commons-media/logos/cafe-la-gourde-k3x9.png" });
  assert.deepEqual(A.logoPath({ type: "image/svg+xml", size: 10 }, "x", "r"), { error: "type" });
  assert.deepEqual(A.logoPath({ type: "image/jpeg", size: 3e6 }, "x", "r"), { error: "size" });
  assert.ok(A.took({ result: "ok", id: 4 }) && !A.took({ result: "in_use" }) && !A.took({ ok: true }) && !A.took(null));
  for (const l of LANGS) for (const r of ["in_use", "bad_name", "bad_url", "bad_trees", "bad_amount", "bad_note", "not_found"]) assert.ok(A.STRINGS[l].reasons[r], l + " " + r);
  // The page: its section, its stylesheet, after the helpers it uses (money, text) and fontaine.js.
  const con = read("console/index.html");
  assert.match(con, /<section class="card hidden" id="racines"><\/section>/);
  assert.match(con, /<link rel="stylesheet" href="racines\.css">/);
  const at = (s) => con.indexOf(s);
  assert.ok(at("../assets/page-data.js") < at('src="racines.js"') && at("../assets/fontaine-data.js") < at('src="racines.js"') && at('src="fontaine.js"') < at('src="racines.js"'));
  const js = read("console/racines.js");
  for (const rpc of ["racines_admin_overview", "racines_admin_orders", "racines_admin_upsert_company", "racines_admin_add_corporate_trees"]) assert.ok(js.includes('"' + rpc + '"'), rpc);
  assert.match(js, /if \(inited \|\| !A\.admin \|\| !A\.admin\(\)\) return;/, "admins only");
  assert.doesNotMatch(read("console/racines.css"), /animation|@keyframes/, "nothing the console's opening could replay");
});
