// node --test site/assets/console-securite.test.js : the console's « Sécurité » (securite.js, sections 101-102): the pure
// helpers, the 7 languages, the page's wiring. No DOM, no network.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const S = require("../console/securite.js");

const site = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(site, f), "utf8");
const U = "11111111-1111-4111-8111-111111111111";

test("securite: sec_admin_status cleaned; anything malformed dropped", () => {
  const s = S.status({
    level: 2, level_until: "2026-11-24T15:00:00+00:00", enforce_signatures: "log", enforce_setting: "log", signed_share: 0.834,
    zone_levels: { z123456: { level: 3, until: "2026-11-24T16:00:00Z" }, "bad zone": { level: 3 }, z1: { level: 9 } },
    active_actions: [
      { id: 7, entity_type: "user", entity_id: U, action: "shadow", reason: { why: "risk", score: 84.6, top: [{ k: "write_burst", w: 20 }] },
        created_at: "2026-11-24T14:00:00Z", expires_at: "2026-11-27T14:00:00Z", created_by: "shield" },
      { id: 8, entity_type: "ip", entity_id: "d:abc", action: "block", reason: {}, created_by: U },
      { id: "9", entity_type: "user", action: "pause" }, { id: 10, entity_type: "planet", action: "pause" }, { id: 11, entity_type: "user", action: "nuke" }, null
    ],
    pending: [
      { kind: "spot", hold: "pending", id: 3, user_id: U, created_at: "2026-11-24T14:00:00Z", summary: "Fontaine du parc" },
      { kind: "review", hold: "shadow", id: 4, user_id: "not-a-uuid", summary: 5 },
      { kind: "bomb", hold: "pending", id: 5 }, { kind: "spot", hold: "forever", id: 6 }
    ],
    campaigns: [
      { id: 1, kind: "scraper", size: 0, status: "open", first_at: "2026-11-23T01:00:00Z", last_at: "2026-11-23T05:00:00Z", evidence: { events: 42 } },
      { id: 2, kind: "unknown", status: "open" }, { id: 3, kind: "shared_device", status: "maybe" }
    ],
    risk_top: [{ type: "user", id: U, score: 91, reasons: [{ k: "teleport" }] }, { type: "user", id: U, score: 300 }, { type: "planet", id: "x", score: 10 }],
    history: [{ id: 12, entity_type: "global", entity_id: "*", action: "level", reason: { level: 2, by: "admin" }, created_by: U }]
  });
  assert.equal(s.level, 2);
  assert.equal(s.until, "2026-11-24T15:00:00+00:00");
  assert.deepEqual(s.zones, [{ zone: "z123456", level: 3, until: "2026-11-24T16:00:00Z" }]);
  assert.equal(s.share, 83);
  assert.deepEqual(s.actions.map((a) => a.id), [7, 8]);
  assert.deepEqual(s.actions[0], { id: 7, entity: "user", entityId: U, action: "shadow", reason: "risk · 85 · write_burst",
                                   created_at: "2026-11-24T14:00:00Z", expires_at: "2026-11-27T14:00:00Z", by: "shield", undone: false });
  assert.equal(s.actions[1].by, "admin");
  assert.deepEqual(s.pending.map((p) => p.id), [3, 4]);
  assert.equal(s.pending[1].user, null, "a malformed member id is never shown");
  assert.equal(s.pending[1].summary, "");
  assert.deepEqual(s.campaigns, [{ id: 1, kind: "scraper", status: "open", size: 0, first_at: "2026-11-23T01:00:00Z", last_at: "2026-11-23T05:00:00Z", events: 42 }]);
  assert.deepEqual(s.risk, [{ type: "user", id: U, score: 91, why: "teleport" }]);
  assert.equal(s.history[0].reason, "L2");
  const empty = S.status(null);
  assert.deepEqual([empty.level, empty.enforce, empty.setting, empty.share, empty.actions.length, empty.pending.length], [0, "log", "log", null, 0, 0]);
  assert.equal(S.status({ level: 7 }).level, 0, "an impossible level reads as calm");
  assert.equal(S.status({ enforce_signatures: "writes" }).setting, "writes", "the setting falls back to what is in force");
});

test("securite: the fields' checks, the tone, what can be undone", () => {
  assert.equal(S.intIn("60", 0, 43200), 60);
  assert.equal(S.intIn(" 0 ", 0, 43200), 0);
  assert.equal(S.intIn("-5", 0, 43200), null);
  assert.equal(S.intIn("4.5", 0, 4), null);
  assert.equal(S.intIn("99999", 1, 720), null);
  assert.equal(S.intIn("", 0, 4), null);
  assert.equal(S.uuid(" " + U.toUpperCase() + " "), U);
  assert.equal(S.uuid("1111"), null);
  assert.equal(S.uuid("'; drop table x; --"), null);
  assert.equal(S.pointId("6999999998001"), 6999999998001);
  assert.equal(S.pointId("12a"), null);
  assert.equal(S.pointId("99999999999999999"), null);
  assert.deepEqual([0, 1, 2, 3, 4].map(S.tone), ["ok", "watch", "warn", "bad", "bad"]);
  assert.equal(S.undoable({ action: "pause", undone: false }), true);
  assert.equal(S.undoable({ action: "pause", undone: true }), false);
  assert.equal(S.undoable({ action: "approve", undone: false }), false);
  assert.equal(S.reasonText(null), "");
  assert.equal(S.reasonText({ why: "campaign", campaign: 4 }), "campaign · #4");
});

test("securite: every string in the 7 languages, French with tu, Romanian with ș ț, Japanese without あなた", () => {
  const keys = (o) => Object.keys(o).sort();
  const nested = ["levels", "levelHelp", "modes", "by", "entities", "names", "kinds", "holds", "ckinds", "cstatus"];
  for (const lang of ["fr", "es", "de", "pt", "ja", "ro"]) {
    assert.deepEqual(keys(S.STRINGS[lang]), keys(S.STRINGS.en), lang);
    for (const k of nested) assert.deepEqual(keys(S.STRINGS[lang][k]), keys(S.STRINGS.en[k]), lang + "." + k);
    for (const k of Object.keys(S.STRINGS.en)) assert.equal(typeof S.STRINGS[lang][k], typeof S.STRINGS.en[k], lang + "." + k);
  }
  assert.deepEqual(keys(S.STRINGS.en.kinds), S.KINDS.slice().sort());
  assert.deepEqual(keys(S.STRINGS.en.holds), S.HOLDS.slice().sort());
  assert.deepEqual(keys(S.STRINGS.en.modes), S.MODES.slice().sort());
  assert.deepEqual(keys(S.STRINGS.en.ckinds), S.CAMPAIGNS.slice().sort());
  assert.deepEqual(keys(S.STRINGS.en.cstatus), S.CSTATUS.slice().sort());
  assert.deepEqual(keys(S.STRINGS.en.entities), S.ENTITIES.slice().sort());
  assert.deepEqual(keys(S.STRINGS.en.names), S.ACTIONS.slice().sort());
  const words = (o) => Object.values(o).map((v) => (v && typeof v === "object" ? words(v) : typeof v === "function" ? String(v("1", "2")) : String(v))).join(" ");
  const all = (lang) => words(S.STRINGS[lang]);  // the words only (keys such as "spot" are code)
  assert.doesNotMatch(all("fr"), /\b(vous|votre|vos)\b/i);
  assert.match(all("fr"), / ;| :| \?/, "French spaces before ; : ?");
  assert.doesNotMatch(all("fr"), /\S[;?!](\s|")/, "no French ; ? ! glued to the word");
  assert.doesNotMatch(all("ro"), /[şţŞŢ]/);
  assert.doesNotMatch(all("ja"), /あなた/);
  assert.doesNotMatch(all("en"), /\bspots?\b/i);
  assert.doesNotMatch(all("pt"), /\b(num|numa)\b/i);
  for (const lang of Object.keys(S.STRINGS)) {
    const T = S.STRINGS[lang];
    assert.equal(typeof T.rolled(3, 1), "string");
    assert.ok(T.share(83).includes("83"), lang);
    assert.ok(T.size(5).includes("5"), lang);
  }
});

test("securite: on the console page, after console.js, its card and its stylesheet; text never as HTML", () => {
  const html = read("console/index.html");
  assert.ok(html.includes('<section class="card hidden" id="securite"></section>'));
  assert.ok(html.indexOf('src="securite.js"') > html.indexOf('src="console.js"'));
  assert.ok(html.includes('<link rel="stylesheet" href="securite.css">'));
  const js = read("console/securite.js");
  for (const rpc of ["sec_admin_status", "sec_admin_undo", "sec_admin_set_level", "sec_admin_set_enforcement", "sec_admin_pending_decide",
                     "sec_admin_rollback", "sec_admin_rollback_point", "sec_admin_campaign_decide", "sec_admin_chain_check"]) {
    assert.match(js, new RegExp('A\\.rpc\\("' + rpc + '"|act\\("' + rpc + '"'), rpc);
  }
  assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML|document\.write/);
  assert.match(js, /confirm\(T\.confirmSiege\)/, "siege asks first");
  assert.match(js, /confirm\(T\.confirmRollback\)/, "a rollback asks first");
});

test("securite: the RPCs the card calls exist in sections 101-102 with these argument names", () => {
  const sql = fs.readFileSync(path.join(site, "..", "docs", "migrations", "2026-11-24_bouclier_core.sql"), "utf8")
            + fs.readFileSync(path.join(site, "..", "docs", "migrations", "2026-11-24_bouclier_content.sql"), "utf8");
  const sig = {
    sec_admin_undo: ["p_action_id"], sec_admin_set_level: ["p_level", "p_minutes"], sec_admin_set_enforcement: ["p_mode"],
    sec_admin_pending_decide: ["p_id", "p_approve"], sec_admin_rollback: ["p_user_id", "p_hours"], sec_admin_rollback_point: ["p_spot_id", "p_hours"],
    sec_admin_campaign_decide: ["p_id", "p_neutralize"]
  };
  const js = read("console/securite.js");
  for (const [fn, args] of Object.entries(sig)) {
    const m = sql.match(new RegExp("FUNCTION public\\." + fn + "\\(([^)]*)\\)"));
    assert.ok(m, fn + " is defined");
    for (const a of args) {
      assert.ok(m[1].includes(a), fn + " takes " + a);
      assert.ok(js.includes(a + ":"), "the card sends " + a);
    }
  }
});

test("securite, section 105: fresh code re-asked, forbidden countries, identity reveal, break-glass; arguments as the SQL names them", () => {
  const js = read("console/securite.js");
  const sql = fs.readFileSync(path.join(site, "..", "docs", "migrations", "2026-11-24_bouclier_privacy_geo.sql"), "utf8");
  assert.match(js, /e\.code === "WNTOTP"/, "a WNTOTP refusal asks for a fresh code");
  assert.match(js, /A\.freshCode\(d\)/, "verified through the console's authenticator flow");
  assert.match(read("console/console.js"), /freshCode: async function \(code\)/);
  const sig = { sec_admin_set_geo: ["p_countries"], sec_admin_reveal_identity: ["p_kind", "p_ref", "p_reason"], sec_break_glass: [] };
  for (const [fn, args] of Object.entries(sig)) {
    const m = sql.match(new RegExp("FUNCTION public\\." + fn + "\\(([^)]*)\\)"));
    assert.ok(m, fn + " is defined in section 105");
    assert.match(js, new RegExp('(A\\.rpc|act)\\("' + fn + '"'), "the card calls " + fn);
    for (const a of args) { assert.ok(m[1].includes(a), fn + " takes " + a); assert.ok(js.includes(a + ":"), "the card sends " + a); }
  }
  for (const lang of Object.keys(S.STRINGS)) {
    assert.deepEqual(Object.keys(S.STRINGS[lang].revealKinds).sort(), S.REVEAL.slice().sort(), lang);
    assert.ok(S.STRINGS[lang].breakDone(2).includes("2"), lang);
    assert.ok(/HK/.test(S.STRINGS[lang].geoLead) && /TW/.test(S.STRINGS[lang].geoLead), lang + ": Hong Kong and Taiwan said to be outside the default");
  }
  assert.doesNotMatch(S.STRINGS.en.lead, /never affected/, "admins are no longer exempt");
  assert.deepEqual(S.status({ level: 0, options: { geo_block: ["KP", "RU", "CN", "bad", 7] } }).geo, ["KP", "RU", "CN"]);
});
