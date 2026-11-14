// node --test site/assets/builders.test.js  (the console's « Constructeurs », section 92: fontaine.js and builders.js run
// in a tiny DOM on the preview's fixtures (scripts/commons-fixture.cjs): the cards and their filters, a card's form, the
// RBQ check, claims, an edit's diff, a project's participants and bids (choose, decline, the signed PDF), the errors;
// then the pure helpers, the 7 languages and the page's rules; no browser needed)
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const B = require("../console/builders.js");
const FC = require("../console/fontaine.js");
const FIX = require("../../scripts/commons-fixture.cjs");
const { LANGS } = require("./spot-params.js");

const site = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(site, f), "utf8").replace(/\r\n/g, "\n");
const clone = (o) => JSON.parse(JSON.stringify(o));
const settle = async () => { for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r)); };
const T = B.STRINGS.fr, FT = FC.STRINGS.fr;
const iso = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

// ---- A tiny DOM: what fontaine.js and builders.js create, by tag, classes, text, attributes and listeners ----
class El {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase(); this.doc = doc; this.children = []; this.parentNode = null; this._text = ""; this.attrs = {};
    this.on = {}; this.cls = new Set(); this.style = {}; this.id = ""; this._value = null; this.clicks = 0;
  }
  get firstChild() { return this.children[0] || null; }
  appendChild(n) { if (n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; this.children.push(n); return n; }
  removeChild(n) { this.children.splice(this.children.indexOf(n), 1); n.parentNode = null; return n; }
  replaceChild(a, b) { this.children[this.children.indexOf(b)] = a; a.parentNode = this; b.parentNode = null; return b; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(""); }
  set className(v) { this.cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get className() { return [...this.cls].join(" "); }
  get classList() { const s = this.cls; return { add: (...c) => c.forEach((x) => s.add(x)), remove: (...c) => c.forEach((x) => s.delete(x)), contains: (c) => s.has(c) }; }
  // A select left alone reads its first option, as in a browser.
  get value() { if (this.tagName === "SELECT" && this._value == null) { const o = this.children.find((c) => c.tagName === "OPTION"); return o ? o.value : ""; } return this._value == null ? "" : this._value; }
  set value(v) { this._value = String(v); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(t, f) { (this.on[t] = this.on[t] || []).push(f); }
  removeEventListener() {}
  fire(t) { return Promise.all((this.on[t] || []).map((f) => f({ target: this }))); }
  click() { this.clicks++; return this.fire("click"); }
  focus() { this.doc.activeElement = this; }
}
const all = (e) => [e, ...e.children.flatMap(all)];

function fail(status, code) { const e = new Error(code || "failed"); e.status = status; e.code = code; return e; }

/**
 * The console's Fontaine commune card as an admin sees it, on the fixtures: [over] replaces an RPC's answer (a function
 * of its args; an Error is thrown), [confirm] answers window.confirm. Returns the card, the calls and what was asked.
 */
async function open({ over = {}, confirm = true, lang = "fr", signed, remove } = {}) {
  const doc = { activeElement: null, body: null, documentElement: null };
  const els = { fontaine: new El("section", doc), plaque: new El("section", doc) };
  els.fontaine.className = "card hidden";
  const on = {};
  Object.assign(doc, {
    body: new El("body", doc), documentElement: new El("html", doc),
    getElementById: (id) => els[id] || null, createElement: (t) => new El(t, doc), createElementNS: (ns, t) => new El(t, doc),
    addEventListener: (t, f) => { (on[t] = on[t] || []).push(f); }, removeEventListener() {},
    dispatchEvent: (e) => (on[e.type] || []).forEach((f) => f(e))
  });
  // The builders' dates relative to today: Plomberie Laurentides, Aqua-Mobilier and Fontainerie stay insured for a year.
  const data = { builders: clone(FIX.builders), claims: clone(FIX.claims), edits: clone(FIX.edits) };
  data.builders.forEach((b) => { if (b.rbq_verified_at && b.insurance_until > "2026-12-31") b.insurance_until = iso(365); });
  const calls = [], asked = [], seen = { lost: 0, mfa: 0, signed: [], removed: [] };
  const rpc = async (name, args) => {
    calls.push({ name, args });
    if (over[name]) { const r = over[name](args, data); if (r instanceof Error) throw r; return r; }
    if (name === "commons_admin_list") return { projects: FIX.projects.map((p) => Object.assign(clone(p), { participants: FIX.participantsOf(p.id) })), fund: { balance_cents: 0, donations: [] }, ledger: [] };
    if (name === "commons_admin_builders") return data;
    if (name === "commons_admin_bids") return { result: "ok", bids: FIX.bids.filter((x) => x.project_id === args.p_project) };
    return { result: "ok" };
  };
  const A = { T: { demo: "Données de démonstration" }, lang, demo: false, rpc, admin: () => true,
    upload: async () => "https://pkqsvlbiznrqxfckaxll.supabase.co/storage/v1/object/public/commons-media/logos/x-1.png",
    signed: signed || (async (p, s) => { seen.signed.push([p, s]); return "https://pkqsvlbiznrqxfckaxll.supabase.co/storage/v1/object/sign/" + p + "?token=t"; }),
    remove: remove || (async (bucket, paths) => { seen.removed.push([bucket, paths]); return []; }),
    lost: () => { seen.lost++; }, showMfa: () => { seen.mfa++; } };
  const ctx = vm.createContext({ document: doc, WNCAPP: A, WNC_PAGE: { map: () => null, claim: null }, Intl, URL, console, setTimeout, clearTimeout,
    confirm: (m) => { asked.push(m); return typeof confirm === "function" ? confirm(m) : confirm; } });
  for (const f of ["assets/page-data.js", "assets/fontaine-data.js", "console/builders.js", "console/fontaine.js"]) vm.runInContext(read(f), ctx, { filename: f });
  doc.dispatchEvent({ type: "wnc:render" });
  await settle();
  const box = els.fontaine;
  const find = (pred) => all(box).filter(pred);
  const ui = {
    box, calls, asked, seen, data,
    writes: () => clone(calls.filter((c) => !/^commons_admin_(list|builders|bids)$/.test(c.name))), // plain objects (the page runs in another realm)
    msg: () => find((e) => e.cls.has("msg"))[0].textContent,
    button: (t, within) => all(within || box).find((e) => e.tagName === "BUTTON" && e.textContent.trim().startsWith(t)) || null,
    buttons: (t) => find((e) => e.tagName === "BUTTON" && e.textContent.trim() === t),
    fields: (label) => find((e) => e.tagName === "LABEL" && e.textContent === label).map((l) => find((e) => e.id === l.htmlFor)[0]),
    field: (label) => { const l = find((e) => e.tagName === "LABEL" && e.textContent === label)[0]; return l ? find((e) => e.id === l.htmlFor)[0] : null; },
    rows: () => find((e) => e.cls.has("bc-row")).map((r) => r.children[0].children[0].textContent),
    text: () => box.textContent,
    async click(t, within) { const b = ui.button(t, within); assert.ok(b, "no button « " + t + " »"); await b.click(); await settle(); },
    async set(label, v, ev = "change") { const i = ui.field(label); assert.ok(i, "no field « " + label + " »"); i.value = v; await i.fire(ev); await i.fire("input"); await settle(); },
    async project(title, tab) { await ui.click(title, find((e) => e.cls.has("fc-list"))[0]); if (tab) await ui.click(tab, find((e) => e.cls.has("fc-tabs"))[0]); }
  };
  return ui;
}

// ---- The console ----
test("« Constructeurs »: the list's last entry, every card (all statuses) by region then name, filters that keep the search", async () => {
  const ui = await open();
  assert.ok(!ui.box.cls.has("hidden"));
  const entry = ui.button("Constructeurs");
  assert.equal(entry.textContent, "Constructeurs" + "3 demandes à approuver", "2 claims and 1 edit");
  await entry.click(); await settle();
  assert.equal(ui.button("Constructeurs").getAttribute("aria-pressed"), "true", "drawn again, pressed");
  assert.deepEqual(ui.rows(), ["Eau Vive Québec", "Plomberie Laurentides", "Ville de Québec", "Entrepreneur retiré", "Installations Riverain", "Plomberie Rive-Sud",
    "Aqua-Mobilier urbain", "Arrondissement de Villeray–Saint-Michel–Parc-Extension", "Entrepreneur de démonstration", "Fontainerie Mont-Royal", "Plomberie Saint-Michel"],
    "Capitale-Nationale, Laval, Montérégie, Montréal; alphabetical in each; hidden, draft and pending too");
  const row = ui.box.textContent;
  for (const t of ["Publiée", "Masquée", "Brouillon", "En attente", "Vérifié", "1re fontaine", "Partenaire de la ville", "Entrepreneur · Capitale-Nationale · 1 fontaine construite"]) assert.ok(row.includes(t), t);
  assert.match(ui.button("Fiches").getAttribute("aria-pressed"), /true/);
  assert.equal(ui.button("Réclamations").textContent, "Réclamations (2)");
  await ui.set("Statut", "pending");
  assert.deepEqual(ui.rows(), ["Plomberie Saint-Michel"]);
  await ui.set("Statut", "");
  await ui.set("Région", "Montréal");
  await ui.set("Type", "city");
  assert.deepEqual(ui.rows(), ["Arrondissement de Villeray–Saint-Michel–Parc-Extension"]);
  await ui.set("Région", ""); await ui.set("Type", "");
  const search = ui.field("Chercher un nom");
  search.focus();
  await ui.set("Chercher un nom", "QUEBEC", "input");
  assert.deepEqual(ui.rows(), ["Eau Vive Québec", "Ville de Québec"], "accents and case don't matter");
  assert.equal(ui.box.doc.activeElement, search, "only the list redraws: the search keeps its focus");
  await ui.set("Chercher un nom", "zzz", "input");
  assert.ok(ui.text().includes(T.noCards));
  assert.equal(ui.writes().length, 0, "reading never writes");
});

test("a card's form: commons_admin_upsert_builder's p; a name, an https site and a real year first; a new card opens once saved", async () => {
  const ui = await open({ over: { commons_admin_upsert_builder: (a, d) => {
    if (a.p.id == null) d.builders.push(Object.assign({}, a.p, { id: 12, status: "draft", managers: [], badges: [], fountains_count: 0 }));
    return { result: "ok", id: a.p.id || 12 };
  } } });
  await ui.click("Constructeurs");
  await ui.click("Nouvelle fiche");
  assert.equal(ui.button("Marquer vérifiée"), null, "a new card is saved before it is checked");
  await ui.click("Enregistrer");
  assert.equal(ui.msg(), "Vérifie : Nom.");
  await ui.set("Nom", " Plomberie   Charlesbourg ", "input");
  await ui.set("Site web", "http://example.org", "input");
  await ui.click("Enregistrer");
  assert.equal(ui.msg(), "Vérifie : Site web.");
  await ui.set("Site web", "https://example.org/charlesbourg", "input");
  await ui.set("Fondée en (année)", "1700", "input");
  await ui.click("Enregistrer");
  assert.equal(ui.msg(), "Vérifie : Fondée en (année).");
  assert.equal(ui.writes().length, 0, "nothing sent until it checks out");
  await ui.set("Fondée en (année)", "2009", "input");
  await ui.set("Région desservie", "Capitale-Nationale", "input");
  await ui.set("Type", "obnl");
  await ui.click("Enregistrer");
  assert.deepEqual(ui.writes()[0], { name: "commons_admin_upsert_builder", args: { p: { id: null, name: "Plomberie Charlesbourg", kind: "obnl", region: "Capitale-Nationale",
    founded: 2009, website: "https://example.org/charlesbourg", about: null, logo_url: null } } });
  assert.equal(ui.msg(), FT.saved);
  assert.equal(ui.field("Nom").value, "Plomberie Charlesbourg", "the new card stays open, now with its check and status");
  assert.ok(ui.button("Marquer vérifiée aujourd'hui") && ui.button("Publier la fiche"));
  // An existing card: its id, its logo from commons-media (« Choisir une image », the Fontaine commune's own field).
  await ui.click("Toutes les fiches");
  await ui.click("Plomberie Laurentides");
  assert.equal(ui.field("Logo").value, "/storage/v1/object/public/commons-media/logos/demo-plomberie.png");
  assert.ok(ui.button("Choisir une image"));
  await ui.set("Présentation", "Plombiers depuis 1998.", "input");
  await ui.click("Enregistrer");
  const p = ui.writes()[1].args.p;
  assert.equal(p.id, 1);
  assert.equal(p.about, "Plombiers depuis 1998.");
  assert.equal(p.logo_url, "/storage/v1/object/public/commons-media/logos/demo-plomberie.png");
});

test("RBQ and insurance: the badge previewed as the card will show it, 10 digits and a date to come before it is marked, and removed", async () => {
  const ui = await open();
  await ui.click("Constructeurs");
  await ui.click("Plomberie Laurentides");
  assert.ok(ui.text().includes("Vérifiée par l'équipe le 2 novembre 2026."));
  assert.ok(ui.text().includes(T.preview + T.badges.verified));
  await ui.click("Toutes les fiches");
  await ui.click("Plomberie Rive-Sud");
  assert.ok(ui.text().includes("L'assurance a pris fin le 31 octobre 2026 : pas de badge tant qu'elle n'est pas renouvelée."));
  assert.ok(ui.text().includes(T.preview + T.noBadge), "an insurance already over: no badge");
  await ui.set("Assurance valide jusqu'au", iso(200));
  assert.ok(ui.text().includes(T.preview + T.badges.verified), "a new date: the preview shows « Vérifié »");
  await ui.set("Numéro de licence RBQ", "3456-78", "input");
  assert.ok(ui.text().includes(T.preview + T.noBadge), "a short number: no badge");
  await ui.click("Marquer vérifiée aujourd'hui");
  assert.equal(ui.msg(), T.badRbq);
  await ui.set("Numéro de licence RBQ", "3456 7890 01", "input");
  await ui.set("Assurance valide jusqu'au", iso(-3));
  await ui.click("Marquer vérifiée aujourd'hui");
  assert.equal(ui.msg(), "Vérifie : Assurance valide jusqu'au.");
  assert.equal(ui.writes().length, 0);
  await ui.set("Assurance valide jusqu'au", iso(200));
  await ui.click("Marquer vérifiée aujourd'hui");
  assert.deepEqual(ui.writes()[0], { name: "commons_admin_upsert_builder", args: { p: { id: 6, rbq_number: "3456-7890-01", insurance_until: iso(200), rbq_verified: true } } },
    "section 92: the check is the upsert's rbq_verified");
  await ui.click("Retirer la vérification");
  assert.deepEqual(ui.writes()[1].args, { p: { id: 6, rbq_verified: false } });
  // A card never checked has no « Retirer ».
  await ui.click("Toutes les fiches");
  await ui.click("Installations Riverain");
  assert.ok(ui.text().includes(T.notVerified));
  assert.equal(ui.button("Retirer la vérification"), null);
});

test("publish, hide, show again: each after a confirmation that says what members see; a cancelled one sends nothing", async () => {
  let answer = false;
  const ui = await open({ confirm: () => answer });
  await ui.click("Constructeurs");
  await ui.click("Installations Riverain");
  assert.ok(ui.text().includes(T.noManager));
  await ui.click("Publier la fiche");
  assert.equal(ui.asked[0], "Publier « Installations Riverain » ? Elle apparaît tout de suite dans l'annuaire de l'app.");
  assert.equal(ui.writes().length, 0, "cancelled");
  answer = true;
  await ui.click("Publier la fiche");
  assert.deepEqual(ui.writes()[0].args, { p: { id: 8, status: "approved" } });
  await ui.click("Toutes les fiches");
  await ui.click("Plomberie Laurentides");
  assert.ok(ui.text().includes("Gérée depuis l'app par Marc-André Tremblay."));
  await ui.click("Masquer la fiche");
  assert.match(ui.asked[2], /^Masquer « Plomberie Laurentides » \? Elle quitte tout de suite l'annuaire/);
  assert.deepEqual(ui.writes()[1].args, { p: { id: 1, status: "hidden" } });
  await ui.click("Retirer l'accès : Marc-André Tremblay");
  assert.equal(ui.asked[3], "Retirer l'accès à « Plomberie Laurentides » pour Marc-André Tremblay ? Cette personne ne pourra plus la modifier ; la fiche reste.");
  assert.deepEqual(ui.writes()[2], { name: "commons_admin_builder_decide", args: { p_kind: "claim", p_id: 31, p_approve: false, p_note: null } },
    "refusing an approved claim revokes it");
  await ui.click("Toutes les fiches");
  await ui.click("Fontainerie Mont-Royal");
  assert.ok(ui.text().includes("Gérée depuis l'app par Ana Ribeiro."), "a refused claim isn't a manager");
  assert.equal(ui.button("Retirer l'accès : Paul Ricard"), null);
  await ui.click("Toutes les fiches");
  await ui.click("Entrepreneur retiré");
  await ui.click("Afficher la fiche de nouveau");
  assert.deepEqual(ui.writes()[3].args, { p: { id: 10, status: "approved" } });
});

test("claims: who asks and when, a proposed card apart; approve after a confirmation naming both, refuse with a note, open the card", async () => {
  const ui = await open();
  await ui.click("Constructeurs");
  await ui.click("Réclamations");
  const t = ui.text();
  assert.ok(t.includes("Réclame « Aqua-Mobilier urbain »"));
  assert.ok(t.includes("Sylvie Gagnon · 12 novembre 2026"));
  assert.ok(t.includes("Propose une nouvelle fiche : « Plomberie Saint-Michel »"), "builder_status « pending »: a proposed card");
  assert.ok(t.includes("Entrepreneur · Montréal · https://example.org/plomberie-saint-michel · RBQ 6789-0123-01"), "what the proposed card says");
  await ui.click("Approuver");
  assert.equal(ui.asked[0], "Laisser Sylvie Gagnon gérer « Aqua-Mobilier urbain » ? Ses modifications attendront quand même ton approbation.");
  assert.deepEqual(ui.writes()[0], { name: "commons_admin_builder_decide", args: { p_kind: "claim", p_id: 41, p_approve: true, p_note: null } });
  const note = ui.fields("Note pour le membre (facultatif)")[1];
  note.value = "  Écris-nous depuis le courriel de l'entreprise.  ";
  await ui.buttons("Refuser")[1].click(); await settle();
  assert.deepEqual(ui.writes()[1].args, { p_kind: "claim", p_id: 42, p_approve: false, p_note: "Écris-nous depuis le courriel de l'entreprise." });
  assert.equal(note.getAttribute("maxlength"), "300");
  assert.equal(ui.asked.length, 1, "refusing gives nobody access: no confirmation");
  await ui.buttons("Ouvrir la fiche")[1].click(); await settle();
  assert.equal(ui.field("Nom").value, "Plomberie Saint-Michel");
});

test("an edit's diff: only the fields it changes, now struck out and proposed beside; approve publishes after a confirmation", async () => {
  const ui = await open();
  await ui.click("Constructeurs");
  await ui.click("Modifications");
  const table = all(ui.box).find((e) => e.tagName === "TABLE" && e.cls.has("bc-diff"));
  const head = all(table).filter((e) => e.tagName === "TH" && e.getAttribute("scope") === null && e.scope === "col").map((e) => e.textContent);
  assert.deepEqual(head, ["Champ", "Maintenant", "Proposé"]);
  const rows = all(table).filter((e) => e.tagName === "TR").slice(1).map((tr) => tr.children.map((c) => c.textContent));
  assert.deepEqual(rows.map((r) => r[0]), ["Fondée en (année)", "Site web", "Présentation", "Assurance valide jusqu'au"], "only what changes");
  assert.equal(rows[3][2], "31 décembre 2027", "a date reads as a date");
  assert.deepEqual(rows[0].slice(1), ["1998", "1997"]);
  assert.deepEqual(rows[1].slice(1), ["https://example.org/plomberie-laurentides", "https://example.org/plomberie-laurentides-qc"]);
  assert.ok(all(table).some((e) => e.tagName === "DEL") && all(table).some((e) => e.tagName === "INS"));
  assert.ok(ui.text().includes("Marc-André Tremblay · 13 novembre 2026"));
  await ui.click("Approuver");
  assert.equal(ui.asked[0], "Publier ces changements sur « Plomberie Laurentides » ? Les membres les voient tout de suite.");
  assert.deepEqual(ui.writes()[0], { name: "commons_admin_builder_decide", args: { p_kind: "edit", p_id: 61, p_approve: true, p_note: null } });
  await ui.click("Refuser");
  assert.deepEqual(ui.writes()[1].args, { p_kind: "edit", p_id: 61, p_approve: false, p_note: null });
  assert.ok(ui.text().includes("Un nouveau numéro RBQ efface la vérification"), "the lead says what approving does");
});

test("a project's participants: carrier, builder, host in that order; removed, and added with a role from the cards (never a hidden one)", async () => {
  const ui = await open();
  await ui.project("Bibliothèque du Faubourg", "Intervenants");
  const items = all(ui.box).filter((e) => e.tagName === "LI").map((li) => li.children.slice(0, 2).map((c) => c.textContent).join(" "));
  assert.deepEqual(items, ["Porteur Eau Vive Québec", "Constructeur Plomberie Laurentides", "Hôte Ville de Québec"]);
  await ui.buttons("Retirer")[2].click(); await settle();
  assert.deepEqual(ui.writes()[0], { name: "commons_admin_set_participant", args: { p_project: 1, p_builder: 3, p_role: "host", p_remove: true } });
  assert.ok(ui.calls.filter((c) => c.name === "commons_admin_list").length >= 2, "the project is read again");
  await ui.project("Bibliothèque du Faubourg", "Intervenants");
  const pick = ui.field("Fiche");
  const options = pick.children.map((o) => o.textContent);
  assert.ok(!options.some((o) => o.startsWith("Entrepreneur retiré")), "a hidden card isn't offered");
  assert.ok(options.includes("Installations Riverain · Entrepreneur · Brouillon"), "a draft says so");
  assert.equal(ui.field("Rôle").value, "builder");
  await ui.set("Fiche", "2");
  await ui.set("Rôle", "carrier");
  await ui.click("Ajouter l'intervenant");
  assert.deepEqual(ui.writes()[1].args, { p_project: 1, p_builder: 2, p_role: "carrier", p_remove: false });
  const taken = await open({ over: { commons_admin_set_participant: () => ({ result: "builder_taken" }) } });
  await taken.project("Bibliothèque du Faubourg", "Intervenants");
  await taken.click("Ajouter l'intervenant");
  assert.equal(taken.msg(), "Ce projet a déjà un constructeur : retire-le d'abord.");
});

test("bids: read when the tab opens; « Choisir » explains the public builder and the budget line; cancelled sends nothing; « Décliner »", async () => {
  let answer = false;
  const ui = await open({ confirm: () => answer });
  await ui.project("Une fontaine pour Saint-Michel-Nord", "Soumissions");
  assert.deepEqual(clone(ui.calls.filter((c) => c.name === "commons_admin_bids").map((c) => c.args)), [{ p_project: 2 }]);
  const t = ui.text();
  for (const s of ["Aqua-Mobilier urbain", "7 800 $", "45 jours", "Déposée", "11 novembre 2026", "Fontainerie Mont-Royal", "8 450 $", "Retirée"]) assert.ok(t.replace(/\u202f|\u00a0/g, " ").includes(s), s);
  assert.equal(ui.buttons("Choisir").length, 2, "the withdrawn bid can't be chosen");
  await ui.click("Choisir");
  assert.equal(ui.asked[0].replace(/\u202f|\u00a0/g, " "), "Choisir la soumission de « Aqua-Mobilier urbain » (7 800 $) ? Aqua-Mobilier urbain devient le constructeur public du projet ; une ligne « Soumission retenue » (7 800 $) remplace les lignes équipement et installation du budget, et les autres soumissions du projet sont déclinées. Les membres le voient tout de suite.");
  assert.ok(t.includes("Aqua-Mobilier urbainMontréal"), "the bidder's region, shown (never enforced)");
  assert.equal(ui.writes().length, 0);
  answer = true;
  await ui.click("Choisir");
  assert.deepEqual(ui.writes()[0], { name: "commons_admin_choose_bid", args: { p_bid: 71 } });
  assert.ok(ui.calls.filter((c) => c.name === "commons_admin_list").length >= 2, "the project (builder, budget) is read again");
  assert.equal(ui.calls.filter((c) => c.name === "commons_admin_bids").length, 2, "and its bids");
  await ui.buttons("Décliner")[1].click(); await settle();
  assert.equal(ui.asked[2], "Décliner la soumission de « Fontainerie Mont-Royal » ? Le constructeur le voit dans l'app.");
  assert.deepEqual(ui.writes()[1], { name: "commons_admin_decline_bid", args: { p_bid: 72 } });
  // A project whose bid is chosen: no « Choisir » left.
  await ui.project("Bibliothèque du Faubourg", "Soumissions");
  assert.equal(ui.buttons("Choisir").length, 0);
  assert.ok(ui.text().includes("Retenue") && ui.text().includes("Déclinée"));
  // A path outside commons-bids' names is never signed.
  const odd = await open({ over: { commons_admin_bids: () => ({ result: "ok", bids: [Object.assign(clone(FIX.bids[0]), { pdf_path: "../2/x.pdf" })] }) } });
  await odd.project("Une fontaine pour Saint-Michel-Nord", "Soumissions");
  assert.ok(odd.text().includes(T.noPdf) && !odd.button("Ouvrir le PDF"));
  // A bid's cells carry their column's name (a phone stacks them).
  const cell = all(ui.box).find((e) => e.tagName === "TD" && e.cls.has("n"));
  assert.equal(cell.getAttribute("data-label"), "Montant");
});

test("a bid's PDF: signed for 5 minutes from the private commons-bids, opened in a new tab without the opener; a failure says so", async () => {
  const ui = await open();
  await ui.project("Une fontaine pour Saint-Michel-Nord", "Soumissions");
  const btn = ui.buttons("Ouvrir le PDF")[0], cell = btn.parentNode;
  await btn.click(); await settle();
  assert.deepEqual(ui.seen.signed, [["commons-bids/2/2-soumission-saint-michel.pdf", 300]]);
  const a = cell.children[0];
  assert.equal(a.tagName, "A");
  assert.equal(a.href, "https://pkqsvlbiznrqxfckaxll.supabase.co/storage/v1/object/sign/commons-bids/2/2-soumission-saint-michel.pdf?token=t");
  assert.equal(a.target, "_blank");
  assert.equal(a.rel, "noopener noreferrer");
  assert.equal(a.clicks, 1, "opened at once; the link stays for 5 minutes if a blocker stopped it");
  assert.equal(a.textContent, T.pdfLink);
  const bad = await open({ signed: async () => { throw fail(400, "not_found"); } });
  await bad.project("Une fontaine pour Saint-Michel-Nord", "Soumissions");
  await bad.buttons("Ouvrir le PDF")[0].click(); await settle();
  assert.equal(bad.msg(), T.pdfFailed);
  assert.ok(bad.buttons("Ouvrir le PDF")[0], "the button stays to try again");
  const gone = await open({ signed: async () => { throw fail(401, "signed_out"); } });
  await gone.project("Une fontaine pour Saint-Michel-Nord", "Soumissions");
  await gone.buttons("Ouvrir le PDF")[0].click(); await settle();
  assert.equal(gone.seen.lost, 1);
});

test("errors: a refusal's reason in words, an unknown one with its code; 42501, the second factor, an ended session; no section 92 yet", async () => {
  const ui = await open({ over: { commons_admin_choose_bid: () => ({ result: "closed" }),
    commons_admin_decline_bid: () => ({ result: "weird_reason" }), commons_admin_set_participant: () => fail(403, "42501"),
    commons_admin_builder_decide: (a) => (a.p_kind === "claim" ? fail(403, "WNMFA") : fail(401, "signed_out")),
    commons_admin_upsert_builder: (a) => ({ result: a.p.rbq_verified === false ? "not_found" : "bad_url" }) } });
  await ui.project("Une fontaine pour Saint-Michel-Nord", "Soumissions");
  await ui.click("Choisir");
  assert.equal(ui.msg(), T.reasons.closed);
  await ui.click("Décliner");
  assert.equal(ui.msg(), FT.refused + " (weird_reason)");
  await ui.click("Intervenants");
  await ui.click("Retirer");
  assert.equal(ui.msg(), FT.forbidden);
  await ui.click("Constructeurs");
  await ui.click("Plomberie Laurentides");
  await ui.click("Enregistrer");
  assert.equal(ui.msg(), FT.badUrl, "the Fontaine commune's own words for a logo from outside");
  await ui.click("Retirer la vérification");
  assert.equal(ui.msg(), T.reasons.not_found);
  await ui.click("Toutes les fiches");
  await ui.click("Réclamations");
  await ui.click("Refuser");
  assert.equal(ui.seen.mfa, 1);
  await ui.click("Modifications");
  await ui.click("Refuser");
  assert.equal(ui.seen.lost, 1);
  // A server without section 92: the entry says so, the tabs too; the Fontaine commune works as before.
  const off = await open({ over: { commons_admin_builders: () => fail(404, "PGRST202"), commons_admin_bids: () => fail(404, "PGRST202") } });
  await off.click("Constructeurs");
  assert.ok(off.text().includes(T.unavailable));
  await off.project("Une fontaine pour Saint-Michel-Nord", "Intervenants");
  assert.ok(off.text().includes(T.unavailable));
  await off.click("Soumissions");
  assert.ok(off.text().includes(T.unavailable));
  await off.click("Budget");
  assert.ok(all(off.box).some((e) => e.value === "Station extérieure saisonnière"), "its budget lines as before");
  const no = await open({ over: { commons_admin_builders: () => fail(403, "42501") } });
  await no.click("Constructeurs");
  assert.ok(no.text().includes(FT.forbidden));
  const mfa = await open({ over: { commons_admin_bids: () => fail(403, "WNMFA") } });
  await mfa.project("Une fontaine pour Saint-Michel-Nord", "Soumissions");
  assert.equal(mfa.seen.mfa, 1);
});

test("the demo delete (section 89 as section 92 redefines it): the bids' PDFs removed from commons-bids after it; a refusal says so", async () => {
  const del = () => ({ result: "ok", id: 5, donations: 6, ledger: 0, bids: 2, bid_files: ["11/5-demonstration.pdf", "../5-x.pdf"] });
  const ui = await open({ over: { commons_admin_delete_project: del } });
  await ui.project("Démonstration — Fontaine commune de la bibliothèque", "Statut");
  await ui.click("Supprimer");
  assert.deepEqual(clone(ui.seen.removed), [["commons-bids", ["11/5-demonstration.pdf"]]], "only commons-bids' names, after the server deleted the project");
  assert.equal(ui.msg(), FC.STRINGS.fr.deleted);
  const none = await open({ over: { commons_admin_delete_project: () => ({ result: "ok", id: 5, donations: 6, ledger: 0 }) } });
  await none.project("Démonstration — Fontaine commune de la bibliothèque", "Statut");
  await none.click("Supprimer");
  assert.equal(none.seen.removed.length, 0, "no bids, nothing to remove");
  const kept = await open({ over: { commons_admin_delete_project: del }, remove: async () => { throw fail(400, "Unauthorized"); } });
  await kept.project("Démonstration — Fontaine commune de la bibliothèque", "Statut");
  await kept.click("Supprimer");
  assert.equal(kept.msg(), T.filesLeft);
  const refused = await open({ over: { commons_admin_delete_project: () => ({ result: "real_donations" }) } });
  await refused.project("Démonstration — Fontaine commune de la bibliothèque", "Statut");
  await refused.click("Supprimer");
  assert.equal(refused.seen.removed.length, 0, "a refused delete removes nothing");
});

test("in English and Romanian too: the entry, the tabs, a bid's delay and status", async () => {
  const en = await open({ lang: "en" });
  assert.equal(en.button("Builders").textContent, "Builders" + "3 requests to approve");
  await en.project("Une fontaine pour Saint-Michel-Nord", "Bids");
  assert.ok(en.text().includes("45 days") && en.text().includes("Submitted"));
  const ro = await open({ lang: "ro" });
  await ro.project("Une fontaine pour Saint-Michel-Nord", "Oferte");
  assert.ok(ro.text().includes("45 de zile") && ro.text().includes("Trimisă"));
});

// ---- The pure helpers ----
test("helpers: an RBQ number, « Vérifié », a card's p, an edit's diff, a bid's PDF path, the directory's order", () => {
  assert.equal(B.rbqOf("5678123401"), "5678-1234-01");
  assert.equal(B.rbqOf(" 5678 1234 01 "), "5678-1234-01");
  for (const bad of ["5678-1234-0", "56781234011", "abcd-efgh-ij", null, 5678123401.5]) assert.equal(B.rbqOf(bad), null, String(bad));
  const ok = { rbq_number: "5678-1234-01", rbq_verified_at: "2026-11-02T15:00:00Z", insurance_until: "2027-06-30" };
  assert.equal(B.verified(ok, "2026-11-13"), true);
  assert.equal(B.verified(ok, "2027-06-30"), true, "the last day still counts");
  assert.equal(B.verified(ok, "2027-07-01"), false);
  assert.equal(B.verified({ ...ok, rbq_verified_at: null }, "2026-11-13"), false, "never checked by the team");
  assert.equal(B.verified({ ...ok, rbq_number: "12" }, "2026-11-13"), false);
  assert.equal(B.verified({ ...ok, insurance_until: null }, "2026-11-13"), false);
  const f = { id: 3, name: "  Eau   Vive ", kind: "obnl", region: "", founded: "", website: "", about: "  Un OBNL.\n\nDeux lignes. ", logo_url: "" };
  assert.deepEqual(B.builderPayload(f, 2026), { p: { id: 3, name: "Eau Vive", kind: "obnl", region: null, founded: null, website: null, about: "Un OBNL.\n\nDeux lignes.", logo_url: null } });
  assert.deepEqual(B.builderPayload({ ...f, name: "E" }, 2026), { error: "name" });
  assert.deepEqual(B.builderPayload({ ...f, kind: "partner" }, 2026), { error: "kind" }, "a WaterNow partner isn't a builder's kind");
  assert.deepEqual(B.builderPayload({ ...f, founded: "2027" }, 2026), { error: "founded" });
  assert.deepEqual(B.builderPayload({ ...f, founded: "19.5" }, 2026), { error: "founded" });
  for (const w of ["http://x.org", "javascript:alert(1)", "https://user:pw@x.org", "x.org"]) assert.deepEqual(B.builderPayload({ ...f, website: w }, 2026), { error: "website" }, w);
  assert.equal(B.builderPayload({ ...f, id: undefined }, 2026).p.id, null);
  const cur = FIX.builders[0], d = B.diff(cur, FIX.edits[0].changes);
  assert.deepEqual(d.map((x) => x.key), ["founded", "website", "about", "insurance_until"]);
  assert.deepEqual(d[0], { key: "founded", from: 1998, to: 1997 });
  assert.deepEqual(B.diff(cur, { name: " Plomberie Laurentides ", status: "hidden" }), [], "the same value, and a key an edit can't touch");
  assert.deepEqual(B.diff(cur, { rbq_number: "0000-0000-00" }).map((x) => x.key), ["rbq_number"], "a new RBQ number shows");
  assert.deepEqual(B.diff({ about: null }, { about: "Texte" }), [{ key: "about", from: null, to: "Texte" }]);
  assert.deepEqual(B.diff(null, { name: "X" }), [{ key: "name", from: null, to: "X" }]);
  assert.equal(B.pdfPath("commons-bids/2/soumission.pdf"), "commons-bids/2/soumission.pdf");
  assert.equal(B.pdfPath("2/soumission_v2.pdf"), "commons-bids/2/soumission_v2.pdf");
  for (const bad of ["../2/x.pdf", "2/../x.pdf", "2//x.pdf", "/2/x.pdf", "2/x.PDF.exe", "2/x.html", "commons-media/x.pdf/..", "", null, "2/x y.pdf", "https://evil.example/x.pdf"]) {
    assert.equal(B.pdfPath(bad), null, String(bad));
  }
  const list = [{ name: "b", region: "Montréal", status: "approved", kind: "city" }, { name: "A", region: null, status: "draft", kind: "contractor" },
    { name: "É", region: "Montréal", status: "approved", kind: "obnl" }, { name: "z", region: "Capitale-Nationale", status: "hidden", kind: "contractor" }];
  assert.deepEqual(B.filterBuilders(list, { q: "", status: "", kind: "", region: "" }, "fr").map((x) => x.name), ["z", "b", "É", "A"], "no region last");
  assert.deepEqual(B.filterBuilders(list, { q: "e", status: "approved", kind: "", region: "Montréal" }, "fr").map((x) => x.name), ["É"]);
});

test("every language has every text, in the same shape; French says tu and « courriel », Romanian writes ș ț; every text read exists", () => {
  const shape = (o) => Object.keys(o).sort().map((k) => k + ":" + (typeof o[k] === "object" ? "{" + shape(o[k]) + "}" : typeof o[k])).join(",");
  const texts = (o) => Object.values(o).flatMap((v) => (typeof v === "object" ? texts(v) : typeof v === "function" ? [v("1", 1), v("21", 21)] : [v]));
  assert.deepEqual(Object.keys(B.STRINGS).sort(), [...LANGS].sort());
  for (const l of LANGS) {
    assert.equal(shape(B.STRINGS[l]), shape(B.STRINGS.en), l);
    for (const v of texts(B.STRINGS[l])) assert.ok(typeof v === "string" && v.trim() && !/undefined|NaN/.test(v), l + ": " + v);
    if (l !== "en") assert.notEqual(B.STRINGS[l].choose, B.STRINGS.en.choose, l);
    assert.deepEqual(Object.keys(B.STRINGS[l].reasons).sort(), ["bad_date", "bad_note", "bad_rbq", "builder_taken", "chosen_bid", "closed", "not_approved", "not_found", "not_pending", "not_submitted", "not_verified"]);
  }
  const fr = texts(B.STRINGS.fr).join(" ");
  assert.doesNotMatch(fr, /\b(vous|votre|vos|e-mail)\b/i);
  assert.match(fr, /courriel/);
  assert.doesNotMatch(texts(B.STRINGS.ro).join(" "), /[şţŞŢ]/);
  assert.match(texts(B.STRINGS.ro).join(" "), /[șț]/);
  assert.equal(B.STRINGS.ro.days("21", 21), "21 de zile");
  assert.equal(B.STRINGS.fr.fountains("1", 1), "1 fontaine construite");
  assert.equal(T.badges.verified, "Vérifié");
  assert.deepEqual([T.roles.carrier, T.roles.builder, T.roles.host], ["Porteur", "Constructeur", "Hôte"]);
  assert.deepEqual([FT.tabs.participants, FT.tabs.bids], ["Intervenants", "Soumissions"]);
  for (const l of LANGS) assert.ok(FC.STRINGS[l].tabs.participants && FC.STRINGS[l].tabs.bids, l);
  // Every text builders.js reads: its own (T.x), the Fontaine commune's (FT.x), the kinds (KT[x]: fontaine-data's).
  const js = read("console/builders.js");
  for (const [, k] of js.matchAll(/\bT\.(\w+)/g)) assert.ok(Object.hasOwn(B.STRINGS.en, k), "T." + k);
  for (const [, k] of js.matchAll(/\bFT\.(\w+)/g)) assert.ok(Object.hasOwn(FC.STRINGS.en, k), "FT." + k);
  for (const [, k] of js.matchAll(/T\.badges\.(\w+)/g)) assert.ok(B.BADGES.includes(k), k);
});

test("the page: builders.js and builders.css load with the Fontaine commune, the CSP stays strict, text only, nothing opened but the signed PDF", () => {
  const html = read("console/index.html"), csp = /Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  assert.equal(csp, "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self' https://pkqsvlbiznrqxfckaxll.supabase.co " +
    "https://tiles.openfreemap.org https://overpass.openstreetmap.fr https://overpass.kumi.systems https://overpass.private.coffee; worker-src blob:; base-uri 'none'; form-action 'none'",
    "the signing call is the API's origin (connect-src); no new origin, no picture from elsewhere");
  assert.ok(html.indexOf("../assets/fontaine-data.js") < html.indexOf('src="builders.js"') && html.indexOf('src="builders.js"') < html.indexOf('src="fontaine.js"'),
    "builders.js after the kinds' names, before fontaine.js which hands it its kit");
  assert.ok(html.indexOf('href="fontaine.css"') < html.indexOf('href="builders.css"'));
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/);
  const js = read("console/builders.js"), css = read("console/builders.css");
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function|\.open\(|location\s*=|location\.(assign|replace|href)/);
  assert.match(js, /a\.href = await A\.signed\(path, 300\);/);
  assert.match(js, /a\.rel = "noopener noreferrer";/);
  assert.match(js, /commons_admin_choose_bid", \{ p_bid: x\.id \}/);
  assert.match(js, /if \(!root\.confirm\(T\.chooseConfirm\(nm, K\.money\(Number\(x\.amount_cents\) \|\| 0\)\)\)\) return;/);
  // console.js signs only the file asked for: Storage's answer must be /object/sign/<that path>?token=…, on the API's origin.
  const con = read("console/console.js");
  assert.match(con, /var r = await authed\("\/storage\/v1\/object\/sign\/" \+ path, "POST", \{ expiresIn: seconds \}\);/);
  assert.match(con, /if \(u\.indexOf\("\/object\/sign\/" \+ path \+ "\?token="\) !== 0\) throw fail/);
  assert.match(con, /return API \+ "\/storage\/v1" \+ u;/);
  assert.match(con, /rpc: rpc, upload: upload, signed: signed, remove: remove,/);
  assert.match(con, /var r = await authed\("\/storage\/v1\/object\/" \+ bucket, "DELETE", \{ prefixes: paths \}\);/);
  // The design rules: no small capitals or letter-spaced kickers, no side stripe, nothing that loops.
  assert.doesNotMatch(css, /text-transform|letter-spacing|border-left|border-right|infinite|@keyframes/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,6}\b/i, "colours from the console's tokens only");
  // fontaine.js: the entry and the two tabs only when builders.js is there; its refusals take builders' words first.
  const fc = read("console/fontaine.js");
  assert.match(fc, /var B = root\.WNC_BUILDERS \? root\.WNC_BUILDERS\(\{/);
  assert.match(fc, /\["project", "sites", "budget", "sponsors"\]\.concat\(B \? \["participants", "bids"\] : \[\]/);
  assert.match(fc, /\(reasons \|\| \{\}\)\[r\.result\] \|\|/);
});

test("the preview's demo data keeps section 92's shape: kinds, statuses, roles, bids, PDFs in commons-bids", () => {
  const ids = new Set(FIX.builders.map((b) => b.id));
  for (const b of FIX.builders) {
    assert.ok(B.KINDS.includes(b.kind) && B.STATUSES.includes(b.status), b.name);
    assert.ok(b.badges.every((k) => B.BADGES.includes(k)), b.name);
    assert.ok(b.website == null || /^https:\/\//.test(b.website), b.name);
    assert.ok(b.logo_url == null || /^\/storage\/v1\/object\/public\/commons-media\/logos\/[a-z0-9-]+\.png$/.test(b.logo_url), b.name);
    assert.ok(b.rbq_number == null || B.rbqOf(b.rbq_number) === b.rbq_number, b.name);
  }
  for (const s of B.STATUSES) assert.ok(FIX.builders.some((b) => b.status === s), "a card " + s);
  for (const c of FIX.claims) {
    const b = FIX.builders.find((x) => x.id === c.builder_id);
    assert.ok(b && b.managers.some((m) => m.claim_id === c.claim_id && m.status === "pending") && c.builder_status === b.status, "claim " + c.claim_id);
  }
  for (const e of FIX.edits) { assert.ok(ids.has(e.builder_id) && typeof e.edit_id === "number"); assert.ok(Object.keys(e.changes).every((k) => B.FIELDS.includes(k))); }
  for (const b of FIX.builders) assert.equal(b.verified, !!(b.rbq_verified_at && b.insurance_until >= "2026-11-13"), b.name);
  for (const [pid, list] of Object.entries(FIX.participants)) {
    assert.ok(FIX.projects.some((p) => p.id === Number(pid)));
    for (const x of list) assert.ok(ids.has(x.builder_id) && B.ROLES.includes(x.role));
  }
  assert.deepEqual(FIX.participantsOf(1)[0], { builder_id: 4, role: "carrier", name: "Eau Vive Québec", kind: "obnl", logo_url: null, badges: ["city_partner"], status: "approved" });
  for (const x of FIX.bids) {
    assert.ok(B.BID_STATUSES.includes(x.status) && ids.has(x.builder_id) && FIX.projects.some((p) => p.id === x.project_id));
    assert.match(x.pdf_path, new RegExp("^" + x.builder_id + "/" + x.project_id + "-[a-z0-9-]{1,80}\\.pdf$"), "section 92's CHECK");
    assert.equal(B.pdfPath(x.pdf_path), "commons-bids/" + x.pdf_path);
  }
  for (const pid of new Set(FIX.bids.map((x) => x.project_id))) assert.ok(FIX.bids.filter((x) => x.project_id === pid && x.status === "chosen").length <= 1);
  // The preview mocks every RPC the console calls (and the Storage signing).
  const prev = fs.readFileSync(path.join(__dirname, "../../scripts/console-preview.mjs"), "utf8");
  for (const [, name] of read("console/builders.js").matchAll(/"(commons_admin_\w+)"/g)) assert.match(prev, new RegExp(name.replace("commons_admin_", "")), name);
  assert.match(prev, /\/storage\\\/v1\\\/object\\\/sign\\\/\(commons-bids/);
});
