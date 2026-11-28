// node --test site/assets/console-shop.test.js : the console's « Boutique » (shop.js, section 94) and « Offrir un forfait »
// (racines.js, section 95): the pure helpers, the 7 languages, the page's wiring. No DOM, no network.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const S = require("../console/shop.js");
const R = require("../console/racines.js");

const site = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(site, f), "utf8");
const LANGS = ["en", "fr", "es", "de", "pt", "ja", "ro"];
const API = "https://pkqsvlbiznrqxfckaxll.supabase.co", BASE = "https://coolminer11.github.io/WaterNow-site/console/";
const ID = "3b7f9a10-1c2d-4e3f-8a4b-5c6d7e8f9a01";

test("shop: shop_admin_list cleaned, counts only", () => {
  const list = S.partners({ partners: [
    { id: 1, name: " Gourdes ", url: "https://g.example", logo_url: null, blurb: "Inox‮", active: true, codes: { free: { left: 3, assigned: 2 }, plus: { left: -1 } } },
    { id: "2", name: "Pas d'id" }, null, { id: 4, name: "" }
  ] });
  assert.equal(list.length, 1);
  assert.deepEqual(list[0], { id: 1, name: "Gourdes", url: "https://g.example", logo_url: "", blurb: "Inox", active: true,
                              codes: { free: { left: 3, assigned: 2 }, racines: { left: 0, assigned: 0 }, plus: { left: 0, assigned: 0 } } });
  assert.deepEqual(S.partners(null), []);
});

test("shop: the partner form as shop_admin_upsert_partner's p (the server's rules said first)", () => {
  const logo = API + "/storage/v1/object/public/commons-media/logos/gourdes-k3x9.png";
  assert.deepEqual(S.partnerPayload({ name: "  Gourdes  Laurentides ", url: "https://example.org/g", logo, blurb: " Inox ", active: true }, API, BASE),
                   { p: { name: "Gourdes Laurentides", url: "https://example.org/g", logo_url: logo, blurb: "Inox", active: true } });
  assert.deepEqual(S.partnerPayload({ id: 7, name: "XY", active: false }, API, BASE), { p: { name: "XY", url: null, logo_url: null, blurb: "", active: false, id: 7 } });
  assert.deepEqual(S.partnerPayload({ name: "X" }, API, BASE), { error: "name" });
  assert.deepEqual(S.partnerPayload({ name: "XY", url: "http://example.org" }, API, BASE), { error: "url" });
  assert.deepEqual(S.partnerPayload({ name: "XY", logo: "https://cdn.example.com/l.png" }, API, BASE), { error: "logo" });
  assert.deepEqual(S.partnerPayload({ name: "XY", blurb: "x".repeat(281) }, API, BASE), { error: "blurb" });
});

test("shop: pasted codes, in their order, repeats once, the server's format", () => {
  assert.deepEqual(S.codesList(" EAU-1\nEAU-2, EAU-3;EAU-1\r\n\tEAU.4 "), { codes: ["EAU-1", "EAU-2", "EAU-3", "EAU.4"] });
  assert.deepEqual(S.codesList(" \n "), { error: "empty" });
  assert.deepEqual(S.codesList("OK-1 é-2"), { error: "bad", code: "é-2" });
  assert.deepEqual(S.codesList("AB"), { error: "bad", code: "AB" });
  assert.deepEqual(S.codesList(Array.from({ length: 5001 }, (_, i) => "C" + i + "X").join(" ")), { error: "many" });
});

test("gift a plan: the owner's member search cleaned, the form as racines_admin_gift's arguments", () => {
  const m = R.members([{ user_id: ID, display_name: "Gaby", email: "ga…@example.org", created_at: "2026-10-11T19:30:00Z",
                         gift: { plan: "plus", until: "2027-01-31T04:59:59Z", note: "Concours" }, tier: "plus" },
                       { user_id: "not-an-id", display_name: "x" }, { user_id: ID.replace("01", "02"), tier: "gold", gift: { plan: "gold" } }]);
  assert.deepEqual(m[0], { id: ID, name: "Gaby", email: "ga…@example.org", joined: "2026-10-11T19:30:00Z", tier: "plus",
                           gift: { plan: "plus", until: "2027-01-31T04:59:59Z", note: "Concours" } });
  assert.deepEqual([m.length, m[1].tier, m[1].gift], [2, "free", null], "an odd tier or gift is dropped");
  const now = new Date("2026-11-14T15:00:00");
  assert.deepEqual(R.giftArgs({ member: ID, plan: "plus", until: "", note: " Concours " }, now), { args: { p_user: ID, p_plan: "plus", p_until: null, p_note: "Concours" } });
  const a = R.giftArgs({ member: ID, plan: "racines", until: "2026-12-31", note: "" }, now).args;
  assert.deepEqual([a.p_plan, a.p_note, a.p_until], ["racines", null, new Date("2026-12-31T23:59:59").toISOString()], "through that local day");
  assert.deepEqual(R.giftArgs({ member: "", plan: "plus" }, now), { error: "member" });
  for (const d of ["2026-11-13", "31/12/2026", "2026-02-30x"]) assert.deepEqual(R.giftArgs({ member: ID, until: d }, now), { error: "until" }, d);
  assert.equal(R.giftArgs({ member: ID, plan: "gold" }, now).args.p_plan, "plus", "only plus or racines leave");
  assert.equal(R.localDay("2026-12-31T23:59:59"), "2026-12-31");
  assert.equal(R.overview({ is_owner: true }).isOwner, true);
  assert.equal(R.overview({ is_owner: "yes" }).isOwner, false, "the owner only when the server says true");
});

test("section 97: money to refund by hand cleaned; a gift over a paid card confirmed first; a failed re-read said", () => {
  const list = R.refunds([{ id: 4, kind: "gift", amount_cents: 325, livemode: false, paid_at: "2026-11-14T15:00:00Z", payment_intent: "pi_3Abc", object_id: "pi_3Abc" },
                          { id: 5, amount_cents: 1, payment_intent: "javascript:alert(1)", object_id: "cs_test_9" }, { id: "x", amount_cents: 2 }, null]);
  assert.deepEqual(list, [{ id: 4, amount: 325, live: false, at: "2026-11-14T15:00:00Z", pi: "pi_3Abc", obj: "pi_3Abc" },
                          { id: 5, amount: 1, live: false, at: null, pi: null, obj: "cs_test_9" }]);
  assert.deepEqual(R.overview({}).refunds, [], "an older server: none");
  assert.equal(R.overview({ needs_refund: [{ id: 1, amount_cents: 975, livemode: true }] }).refunds[0].live, true);
  assert.equal(R.fromCard({ plan: "plus", note: "gift card" }), true, "gift_redeem's note");
  assert.equal(R.fromCard({ plan: "plus", note: "Concours" }), false);
  assert.equal(R.fromCard(null), false);
  for (const l of LANGS) {
    const G = R.STRINGS[l].gift;
    assert.ok(G.confirmReplace("Plus", "31 déc. 2026").includes("Plus") && G.confirmReplace("Plus", "").includes("Plus"), l);
    assert.ok(G.note("Concours").includes("Concours"), l);
    for (const k of ["title", "lead", "when", "amount", "payment", "test"]) assert.ok(R.STRINGS[l].refund[k], l + " refund " + k);
  }
  const rc = read("console/racines.js");
  assert.match(rc, /if \(g0 && !sure\(G\.confirmReplace\(/, "replacing a gift in force: confirmed first");
  assert.match(rc, /if \(!sure\(G\.confirmRemove\(/, "removing it too");
  assert.match(rc, /function sure\(ask\) \{ return root\.confirm\(ask \+ \(fromCard\(g0\) \? "\\n\\n" \+ G\.cardWarn : ""\)\); \}/, "the paid-card warning in it");
  assert.match(rc, /found = null; picked = null;\s+say\(done \+ " " \+ T\.gift\.stale, "err"\);/, "a failed re-read drops the old list and says so");
});

test("every console language has every text, same shape; tu and « courriel » in French, ș ț in Romanian", () => {
  const shape = (o) => Object.keys(o).sort().map((k) => k + ":" + (typeof o[k] === "object" ? "{" + shape(o[k]) + "}" : typeof o[k])).join(",");
  const texts = (o) => Object.values(o).flatMap((v) => (typeof v === "object" ? texts(v) : typeof v === "function" ? [v("12", 12, 12)] : [v]));
  for (const [name, table] of [["shop", S.STRINGS], ["racines gift", Object.fromEntries(LANGS.map((l) => [l, R.STRINGS[l].gift]))]]) {
    assert.deepEqual(Object.keys(table).sort(), [...LANGS].sort(), name);
    for (const l of LANGS) {
      assert.equal(shape(table[l]), shape(table.en), name + " " + l);
      for (const v of texts(table[l])) assert.ok(typeof v === "string" && v.trim(), name + " " + l);
    }
    const fr = texts(table.fr).join("\n");
    assert.doesNotMatch(fr, /\b(vous|votre|vos)\b/i, name + ": tu");
    assert.doesNotMatch(fr, /\be-?mail\b/i, name + ": courriel");
    assert.doesNotMatch(texts(table.ro).join("\n"), /[şţŞŢ]/, name + ": ș ț with the comma below");
  }
  for (const l of LANGS) {
    for (const r of ["in_use", "bad_name", "bad_url", "bad_blurb", "not_found", "bad_tier", "bad_codes", "bad_code"]) assert.ok(S.STRINGS[l].reasons[r], l + " " + r);
    for (const r of ["not_found", "bad_plan", "bad_until", "bad_note"]) assert.ok(R.STRINGS[l].gift.reasons[r], l + " gift " + r);
  }
});

test("the page: the shop's section and script after racines.js; admins only; the RPCs; no HTML injection; sponsors' coupon fields", () => {
  const con = read("console/index.html");
  assert.match(con, /<section class="card hidden" id="shop"><\/section>/);
  assert.ok(con.indexOf('src="racines.js"') < con.indexOf('src="shop.js"'), "after racines.js (its logo rules)");
  const js = read("console/shop.js");
  for (const rpc of ["shop_admin_list", "shop_admin_upsert_partner", "shop_admin_add_codes", "shop_admin_drop_unused"]) assert.ok(js.includes('"' + rpc + '"'), rpc);
  assert.match(js, /if \(inited \|\| !A\.admin \|\| !A\.admin\(\)\) return;/, "admins only");
  assert.match(js, /if \(root\.WNC_PAGE && root\.WNC_PAGE\.data && root\.WNC_PAGE\.data\(\)\) start\(\);/, "catches up a render drawn before it loaded");
  const rc = read("console/racines.js");
  for (const rpc of ["racines_admin_find_member", "racines_admin_gift"]) assert.ok(rc.includes('"' + rpc + '"'), rpc);
  assert.match(rc, /concat\(ov\.isOwner \? \["gift"\] : \[\]\)/, "the gift tab only for the owner");
  for (const f of ["console/shop.js", "console/racines.js", "console/fontaine.js"]) {
    assert.doesNotMatch(read(f), /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/, f);
  }
  assert.match(read("console/fontaine.js"), /coupon_text: cText\.value\.trim\(\), coupon_code: cCode\.value\.trim\(\), coupon_url: cUrl\.value\.trim\(\), coupon_until: cUntil\.value/);
});

test("section 98: the owner's sections (Fontaine commune, Racines, Boutique) wait for the owner probe; a co-admin never sees them", () => {
  const con = read("console/console.js");
  assert.ok(con.includes('rpc("racines_admin_overview", {}).then(function (o) { return !(o && o.is_owner === false); }'), "hidden only on the server's {is_owner: false}");
  assert.ok(con.includes("owner: owner,"));
  for (const f of ["console/fontaine.js", "console/racines.js", "console/shop.js"]) {
    assert.match(read(f), /\(A\.owner \? A\.owner\(\) : Promise\.resolve\(true\)\)\.then\(function \(yes\) \{ if \(yes\) load\((null)?\); \}\);/, f);
  }
  assert.equal(R.TREES_MAX, 5000, "5 000 corporate trees at most a call");
});
