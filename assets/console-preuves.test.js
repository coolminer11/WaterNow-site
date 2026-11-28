// node --test site/assets/console-preuves.test.js : the console's « Preuves » (preuves.js, section 104): the dossier for
// the authorities, the exports, the abuse report draft, the key opened in the browser, the chain links. No DOM, no network.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash, generateKeyPairSync, publicEncrypt, constants } = require("node:crypto");
const P = require("../console/preuves.js");

const site = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(site, f), "utf8");
const U = "11111111-1111-4111-8111-111111111111";
const DEV = "22222222-2222-4222-8222-222222222222";
const sha = (s) => createHash("sha256").update(s).digest("hex");
const KEYS = generateKeyPairSync("rsa", { modulusLength: 2048 }); // the owner's key is 4096 bits; the format is the same
const PEM = KEYS.privateKey.export({ format: "pem", type: "pkcs8" });
const KEY_ID = sha(KEYS.publicKey.export({ format: "der", type: "spki" })).slice(0, 16);
const enc = (ip) => publicEncrypt({ key: KEYS.publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(ip)).toString("base64");

// A chain as the database makes it: hash = SHA-256("<seq>|<prev>|<item_sha256>").
function chain(rows, start = 40, prev = "f".repeat(64)) {
  return rows.map((r, i) => {
    const seq = start + i, item = sha("item " + seq);
    const e = { seq, incident_id: 7, item_sha256: item, prev_hash: prev, hash: sha(seq + "|" + prev + "|" + item), ...r };
    prev = e.hash;
    return e;
  });
}
const IP1 = "203.0.113.7", IP2 = "2001:db8::42";
const C1 = enc(IP1), C2 = enc(IP2);
const RAW = chain([
  { source: "edge", at: "2026-11-24T13:05:22.123456+00:00", ip_hash: "a".repeat(32), ip_enc: C1, key_id: KEY_ID, asn: 64500, as_org: "Test Net", country: "CA",
    colo: "YUL", http_protocol: "HTTP/2", tls_version: "TLSv1.3", method: "POST", path: "/rest/v1/rpc/add_spot", query: "?apikey=[removed]", status: 200,
    ua: "python-requests/2.31 <script>alert(1)</script>", headers: { accept: "*/*" }, body_sha256: "b".repeat(64), body: "{\"p_name\":\"=HYPERLINK(1)\",\"password\":\"[removed]\"}",
    verdict: "unsigned", detail: {} },
  { source: "edge", at: "2026-11-24T13:06:00+00:00", ip_hash: "a".repeat(32), ip_enc: C1, key_id: KEY_ID, asn: 64500, as_org: "Test Net", country: "CA",
    method: "GET", path: "/rest/v1/rpc/get_spots_in_area", status: 200, ua: "python-requests/2.31", verdict: "unsigned", detail: { canary: 3 } },
  { source: "edge", at: "2026-11-24T13:07:00+00:00", ip_hash: "c".repeat(32), ip_enc: C2, key_id: KEY_ID, asn: 64511, as_org: "Other Cloud", country: "US",
    method: "GET", path: "/rest/v1/rpc/get_spots_in_area", status: 200, ua: "curl/8", verdict: "unsigned", detail: {} },
  { source: "beacon", at: "2026-11-24T14:00:00+00:00", ip_hash: "a".repeat(32), ip_enc: C1, key_id: KEY_ID, asn: 64500, as_org: "Test Net", method: "GET",
    path: "/b/tok", detail: { recipient: "i:" + "a".repeat(32), decoy: "static", canary_id: 5725706070987, referer: "https://copy.example/map" } },
  { source: "db_event", at: "2026-11-24T12:00:00+00:00", user_id: U, detail: { kind: "write_burst" } },
  { source: "account", at: "2026-11-24T13:10:00+00:00", user_id: U, entity_type: "user", entity_id: U,
    detail: { email: "attacker@example.test", created_at: "2026-11-22T10:00:00+00:00", devices: [{ device_id: DEV, attest_level: "software" }] } }
]);
const ITEMS = RAW.map(P.item);
const INC = P.incidents([{ id: 7, kind: "campaign", ref: "ip:aaa:edge", title: "Campagne 3 : scraper, 1 comptes", opened_at: "2026-11-24T13:00:00Z",
                           opened_by: "shield", until: "2026-11-24T15:00:00Z", items: 6, sources: { edge: 3, beacon: 1, db_event: 1, account: 1 },
                           targets: [{ type: "ip", id: "a".repeat(32), why: "campaign scraper", until: "2026-11-24T15:00:00Z" }],
                           campaign: { id: 3, kind: "scraper", size: 1, status: "neutralized" } }])[0];
const VERIFY = { ok: true, rows: 120, roots_checked: 4, head: "e".repeat(64), checked_at: "2026-11-24T16:00:00Z" };

test("preuves: incidents and items cleaned; anything malformed dropped", () => {
  const list = P.incidents([
    { id: 1, kind: "admin", ref: "ip:x", title: "T", opened_by: "1234", opened_at: "2026-11-24T13:00:00Z", closed_at: "2026-11-24T14:00:00Z",
      items: 4, sources: { edge: 3, planet: 9 }, targets: [{ type: "ip", id: "x" }, { type: "planet", id: "y" }, null] },
    { id: 2, kind: "redacted", ref: "x" }, { id: "3", kind: "admin" }, null
  ]);
  assert.equal(list.length, 1);
  assert.equal(list[0].by, "shield", "anything but « owner » reads as the shield");
  assert.deepEqual(list[0].sources, { edge: 3 });
  assert.deepEqual(list[0].targets.map((t) => t.type), ["ip"]);
  assert.equal(P.state(list[0]), "closed");
  assert.equal(P.state(INC), "open");
  assert.equal(P.state({ closed_at: "x", redacted_at: "2026-11-24T14:00:00Z" }), "redacted");
  assert.equal(INC.campaign.id, 3);
  assert.equal(P.item({ seq: 1, source: "edge", item_sha256: "x", hash: "e".repeat(64) }), null, "a malformed hash drops the row");
  assert.equal(P.item({ seq: 1, source: "mail", item_sha256: "e".repeat(64), hash: "e".repeat(64) }), null);
  assert.equal(P.item({ ...RAW[0], ip_enc: "not base64!" }).ip_enc, null);
  assert.equal(ITEMS.length, 6);
  assert.equal(ITEMS[0].asn, 64500);
});

test("preuves: the private key file opens the addresses in the browser; a wrong key or file opens nothing", async () => {
  assert.equal(P.pemDer("hello"), null);
  assert.equal(P.pemDer("-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----"), null, "not the PKCS#8 file the script writes");
  assert.equal(await P.importKey("-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----"), null);
  const key = await P.importKey(PEM);
  assert.ok(key, "the owner's file imports");
  assert.equal(key.extractable, false, "the key never leaves the tab");
  assert.deepEqual(key.usages, ["decrypt"]);
  const ips = {};
  assert.deepEqual(await P.decryptIps(key, ITEMS, ips), { opened: 2, failed: 0 });
  assert.equal(ips[C1], IP1);
  assert.equal(ips[C2], IP2);
  assert.deepEqual(await P.decryptIps(key, ITEMS, ips), { opened: 0, failed: 0 }, "each address opened once");
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ format: "pem", type: "pkcs8" });
  assert.deepEqual(await P.decryptIps(await P.importKey(other), ITEMS, {}), { opened: 0, failed: 2 });
});

test("preuves: the chain links recomputed here catch an edited, re-linked or forged item", async () => {
  assert.deepEqual(await P.verifyLinks(ITEMS), { checked: 6, ok: 6, bad: [] });
  const edited = ITEMS.map((e) => ({ ...e }));
  edited[2].item_sha256 = sha("forged");
  assert.deepEqual((await P.verifyLinks(edited)).bad, [42]);
  const relinked = ITEMS.map((e) => ({ ...e }));
  relinked[3].prev_hash = "0".repeat(64);
  relinked[3].hash = sha(relinked[3].seq + "|" + relinked[3].prev_hash + "|" + relinked[3].item_sha256);
  assert.deepEqual((await P.verifyLinks(relinked)).bad, [43, 44], "a link that no longer follows the item before it, and the one after it");
  const gap = [ITEMS[0], ITEMS[2]];
  assert.deepEqual((await P.verifyLinks(gap)).bad, [], "items of other incidents in between: each link still checks");
});

test("preuves: the dossier (French and English): summary, timeline, accounts, custody, legal basis, contacts; every value escaped", async () => {
  const key = await P.importKey(PEM), ips = {};
  await P.decryptIps(key, ITEMS, ips);
  const links = await P.verifyLinks(ITEMS);
  const fr = P.dossierHtml({ incident: INC, items: ITEMS, ips, verify: VERIFY, links, lang: "fr", generated: Date.parse("2026-11-24T16:00:00Z") });
  assert.match(fr, /^<!doctype html><html lang="fr">/);
  assert.match(fr, /Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"/, "the file runs no script");
  assert.doesNotMatch(fr, /<script/i, "a client's user agent never becomes markup");
  assert.match(fr, /python-requests\/2\.31 &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  for (const s of ["Dossier de preuves — incident n° 7", "2026-11-24 13:05:22.123 UTC", IP1, IP2, "AS64500 Test Net", "POST /rest/v1/rpc/add_spot", "attacker@example.test",
                   DEV + " (software)", "Chaîne de possession", "la chaîne entière est intacte (120 éléments, 4 racines", "6 sur 6 concordent", "e".repeat(64),
                   ITEMS[0].hash, ITEMS[5].item_sha256, "1 lieux pièges servis", "1 chargements de balises", "Loi sur la protection des renseignements personnels dans le secteur privé",
                   "LPRPDE", "7(3)d)", "342.1", "430(1.1)", "Centre antifraude du Canada : 1-888-495-8501", "Sûreté du Québec", "310-4141", "GNC3",
                   "Jamais recueilli : mots de passe", "90 jours", "pas un avis juridique"]) {
    assert.ok(fr.includes(s), "fr: " + s);
  }
  assert.ok(!fr.includes("hunter2") && !fr.includes("Bearer"), "nothing secret ever reached it");
  const en = P.dossierHtml({ incident: INC, items: ITEMS, ips: {}, verify: { ok: false, why: "content", first_bad: 41 }, links: { checked: 6, ok: 5, bad: [41] },
                             lang: "en", generated: Date.now() });
  for (const s of ["Evidence file — incident #7", "encrypted (key " + KEY_ID + ")", "Server check FAILED (content, item 41)", "MISMATCH at items 41",
                   "Canadian Anti-Fraud Centre", "PIPEDA", "7(3)(d)", "National Cybercrime Coordination Centre (NC3)", "not legal advice"]) {
    assert.ok(en.includes(s), "en: " + s);
  }
  assert.ok(!en.includes(IP1), "no key loaded: no address in clear");
});

test("preuves: the exports hold every item with its hashes; CSV never runs what a client sent", async () => {
  const key = await P.importKey(PEM), ips = {};
  await P.decryptIps(key, ITEMS, ips);
  const out = P.csv(ITEMS, ips).split("\r\n");
  assert.equal(out[0].split(",")[0], "seq");
  assert.equal(out.length, ITEMS.length + 2, "a header, one line per item, the last line break");
  assert.ok(out[1].startsWith("40,2026-11-24T13:05:22.123Z,edge," + IP1 + ","));
  assert.ok(out[1].includes(ITEMS[0].item_sha256) && out[1].includes(ITEMS[0].hash));
  assert.ok(out[1].includes('"{""p_name"":""=HYPERLINK(1)""'), "quotes doubled inside a quoted cell");
  const lead = P.csv([{ ...ITEMS[0], ua: "=cmd|' /C calc'!A0", path: "+1", body: "" }], {}).split("\r\n")[1];
  assert.ok(lead.includes(",'=cmd|' /C calc'!A0,") && lead.includes(",'+1,"), "a formula is neutralized");
  const j = JSON.parse(P.exportJson({ incident: INC, items: ITEMS, ips, verify: VERIFY, links: { checked: 6, ok: 6, bad: [] }, generated: Date.parse("2026-11-24T16:00:00Z") }));
  assert.equal(j.format, "waternow-evidence-1");
  assert.equal(j.items.length, 6);
  assert.equal(j.items[0].ip, IP1);
  assert.equal(j.items[0].hash, ITEMS[0].hash);
  assert.equal(j.verification.ok, true);
  assert.equal(j.generated_at, "2026-11-24T16:00:00.000Z");
});

test("preuves: RDAP: the abuse contact of a network (nested entities), never anything else", () => {
  const ip = {
    objectClassName: "ip network", handle: "NET-203-0-113-0-1", name: "TEST-NET-3", startAddress: "203.0.113.0", endAddress: "203.0.113.255", country: "US",
    entities: [
      { roles: ["registrant"], vcardArray: ["vcard", [["version", {}, "text", "4.0"], ["fn", {}, "text", "Test Net Inc."]]],
        entities: [{ roles: ["abuse"], vcardArray: ["vcard", [["fn", {}, "text", "Abuse"], ["email", {}, "text", "Abuse@Test.example"]]] },
                   { roles: ["technical"], vcardArray: ["vcard", [["email", {}, "text", "noc@test.example"]]] }] },
      { roles: ["abuse"], vcardArray: ["vcard", [["email", {}, "text", "not an address"], ["email", {}, "text", "abuse@test.example"]]] }
    ]
  };
  assert.deepEqual(P.rdapAbuse(ip), { emails: ["abuse@test.example"], network: "TEST-NET-3", handle: "NET-203-0-113-0-1", org: "Test Net Inc.",
                                      country: "US", range: "203.0.113.0 - 203.0.113.255" });
  assert.deepEqual(P.rdapAbuse(null).emails, []);
  assert.deepEqual(P.rdapAbuse({ entities: "x" }).emails, []);
  assert.equal(P.rdapUrl({ asn: 64500, ips: [IP2] }), "https://rdap.org/ip/2001%3Adb8%3A%3A42", "the decrypted address: its exact network");
  assert.equal(P.rdapUrl({ asn: 64500, ips: [] }), "https://rdap.org/autnum/64500", "no key: the AS, no address leaves anywhere");
});

test("preuves: the abuse draft: provider, abuse address, UTC times, the addresses, a summary, the hashes; mailto only, never sent", async () => {
  const key = await P.importKey(PEM), ips = {};
  await P.decryptIps(key, ITEMS, ips);
  const nets = P.networks(ITEMS, ips);
  assert.deepEqual(nets.map((n) => [n.asn, n.count]), [[64500, 3], [64511, 1]], "busiest network first, from requests and beacon loads");
  assert.deepEqual(nets[0].ips, [IP1]);
  const rdap = { emails: ["abuse@test.example"], network: "TEST-NET-3", handle: "NET-1", org: "Test Net Inc.", country: "US", range: "203.0.113.0 - 203.0.113.255" };
  const d = P.abuseDraft({ items: ITEMS, ips, net: nets[0], rdap, lang: "en", dossierSha: "d".repeat(64), head: "e".repeat(64) });
  assert.equal(d.to, "abuse@test.example");
  assert.equal(d.subject, "Abuse report: automated attack on our service from AS64500 (" + IP1 + ") Test Net");
  for (const s of ["Network: AS64500 Test Net (RDAP TEST-NET-3, NET-1, 203.0.113.0 - 203.0.113.255)", "IP addresses: " + IP1, "Period (UTC): 2026-11-24 13:05:22.123 UTC → 2026-11-24 14:00:00.000 UTC",
                   "2026-11-24 13:05:22.123 UTC  " + IP1 + "  POST /rest/v1/rpc/add_spot", "Evidence file SHA-256: " + "d".repeat(64), ITEMS[0].item_sha256, "e".repeat(64),
                   "keep your logs", "[your name]"]) {
    assert.ok(d.body.includes(s), "en: " + s);
  }
  assert.ok(!d.body.includes(IP2), "another network's address stays out of this provider's report");
  assert.ok(!d.body.includes("attacker@example.test"), "no member's e-mail goes to a provider");
  const fr = P.abuseDraft({ items: ITEMS, ips: {}, net: P.networks(ITEMS, {})[0], rdap: null, lang: "fr" });
  assert.equal(fr.to, "");
  for (const s of ["Bonjour,", "Réseau : AS64500", "[charge la clé privée", "Dossier de preuves : disponible sur demande.", "[ton nom]"]) assert.ok(fr.body.includes(s), "fr: " + s);
  const m = P.mailto({ to: "abuse@test.example, evil\"@x", subject: d.subject, body: d.body + "x".repeat(3000) });
  assert.ok(m.startsWith("mailto:abuse%40test.example?subject=Abuse%20report"), m.slice(0, 80));
  assert.ok(m.length < 7000 && decodeURIComponent(m).includes("[…]"), "the body is cut for mail apps; the card keeps the full text");
});

test("preuves: the strings, French and English, French with tu and its spaces", () => {
  const keys = (o) => Object.keys(o).sort();
  assert.deepEqual(keys(P.STRINGS.fr), keys(P.STRINGS.en));
  assert.deepEqual(keys(P.STRINGS.fr.doc), keys(P.STRINGS.en.doc));
  for (const k of ["types", "kinds", "states", "what"]) assert.deepEqual(keys(P.STRINGS.fr[k]), keys(P.STRINGS.en[k]), k);
  for (const k of ["kinds", "sources"]) assert.deepEqual(keys(P.STRINGS.fr.doc[k]), keys(P.STRINGS.en.doc[k]), "doc." + k);
  for (const k of Object.keys(P.STRINGS.en)) assert.equal(typeof P.STRINGS.fr[k], typeof P.STRINGS.en[k], k);
  for (const k of Object.keys(P.STRINGS.en.doc)) assert.equal(typeof P.STRINGS.fr.doc[k], typeof P.STRINGS.en.doc[k], "doc." + k);
  const words = (o) => Object.values(o).map((v) => (Array.isArray(v) ? v.join(" ") : v && typeof v === "object" ? words(v) : typeof v === "function" ? String(v("1", "2", "3", "4", "5", "6", "7")) : String(v))).join(" ");
  const fr = words(P.STRINGS.fr), en = words(P.STRINGS.en);
  assert.doesNotMatch(fr.replace(/votre réseau|vos conditions|vos journaux|Merci d'enquêter/g, ""), /\b(vous|votre|vos)\b/i, "tu, except to a provider");
  assert.doesNotMatch(fr, /\S[;?!](\s|"|$)/, "no French ; ? ! glued to the word");
  assert.doesNotMatch(fr, /\be-?mail\b/i, "courriel");
  assert.doesNotMatch(en, /\bspots?\b/i);
});

test("preuves: on the console page, after console.js, owner only; the RPCs exist in section 104 with these argument names", () => {
  const html = read("console/index.html");
  assert.ok(html.includes('<section class="card hidden" id="preuves"></section>'));
  assert.ok(html.indexOf('src="preuves.js"') > html.indexOf('src="console.js"'));
  for (const host of ["https://rdap.org", "https://rdap.arin.net", "https://rdap.db.ripe.net", "https://rdap.apnic.net", "https://rdap.lacnic.net", "https://rdap.afrinic.net"]) {
    assert.ok(/connect-src [^;]*/.exec(html)[0].includes(host), "connect-src allows " + host);
  }
  const js = read("console/preuves.js");
  assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML|document\.write|outerHTML/);
  assert.match(js, /A\.owner\(\)/, "the owner only");
  assert.match(js, /confirm\(T\.confirmErase\)/, "erasing asks first");
  assert.match(js, /confirm\(T\.confirmAsn\)/, "a whole network asks first");
  assert.doesNotMatch(js, /fetch\((?!rdapUrl)/, "the only request it makes itself is the public RDAP lookup");
  assert.doesNotMatch(js, /A\.upload|FormData/, "the key file is never uploaded");
  const sql = fs.readFileSync(path.join(site, "..", "docs", "migrations", "2026-11-24_bouclier_evidence.sql"), "utf8");
  const sig = {
    sec_evidence_incidents: [], sec_evidence_items: ["p_incident", "p_after_seq", "p_limit"], sec_evidence_verify: [],
    sec_evidence_start: ["p_type", "p_id", "p_hours", "p_note"], sec_evidence_close: ["p_incident", "p_redact"],
    sec_evidence_custody: ["p_incident", "p_what", "p_sha256"]
  };
  for (const [fn, args] of Object.entries(sig)) {
    const m = sql.match(new RegExp("FUNCTION public\\." + fn + "\\(([^)]*)\\)"));
    assert.ok(m, fn + " is defined");
    assert.match(js, new RegExp('(A\\.rpc|act)\\("' + fn + '"'), "the card calls " + fn);
    for (const a of args) {
      assert.ok(m[1].includes(a), fn + " takes " + a);
      assert.ok(js.includes(a + ":"), "the card sends " + a);
    }
  }
  assert.match(sql, /p_what NOT IN \('dossier', 'abuse_draft', 'export'\)/);
  assert.match(js, /custody\(inc, "abuse_draft"/);
});

test("preuves: one in the singular; neither the owner's default note nor « 1 comptes » shows (visual sweep 2026-11-25)", () => {
  assert.equal(P.STRINGS.fr.count(37, 1), "37 éléments · 1 cible");
  assert.equal(P.STRINGS.fr.count(1, 0), "1 élément · 0 cible");
  assert.equal(P.STRINGS.en.count(1, 2), "1 item · 2 targets");
  assert.equal(P.STRINGS.en.count(16, 1), "16 items · 1 target");
  const [camp, own, mine, big] = P.incidents([
    { id: 1, kind: "campaign", title: "Campagne 3 : scraper, 1 comptes", targets: [] },
    { id: 2, kind: "admin", title: "Démarré par le propriétaire", targets: [] },
    { id: 3, kind: "admin", title: "Suivi du réseau 64500", targets: [] },
    { id: 4, kind: "campaign", title: "Campagne 12 : scraper, 11 comptes", targets: [] }
  ]);
  assert.equal(camp.title, "Campagne 3 : scraper, 1 compte");
  assert.equal(own.title, "");
  assert.equal(mine.title, "Suivi du réseau 64500");
  assert.equal(big.title, "Campagne 12 : scraper, 11 comptes");
});
