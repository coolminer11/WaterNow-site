// node --test site/assets/gift.test.js : the gift card page (cadeau/) and the referral page (r/), docs/20: the codes read
// from the address, the app's links, gift_preview cleaned, the 7 languages, the pages' wiring and the ticket's contrast.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const G = require("./gift.js");

const site = path.join(__dirname, "..");
// LF whatever the checkout's line endings (Windows checkouts get CRLF).
const read = (f) => fs.readFileSync(path.join(site, f), "utf8").replace(/\r\n/g, "\n");
const LANGS = ["en", "fr", "es", "de", "pt", "ja", "ro"];

test("codes: 12 characters for a gift, 8 for a referral, without 0, O, 1 or I; the app's links", () => {
  assert.equal(G.code("?c=pluscadeau23", "gift"), "PLUSCADEAU23", "typed in lower case");
  assert.equal(G.code("?c=%20PLUSCADEAU23%20", "gift"), "PLUSCADEAU23");
  for (const s of ["?c=PLUSCADEAU2", "?c=PLUSCADEAU230", "?c=PLUSCADEAU2O", "?c=PLUSCADEAU21", "", "?x=PLUSCADEAU23", "?c=PLUS<CADEAU2"]) assert.equal(G.code(s, "gift"), null, s);
  assert.equal(G.code("?c=ab2cd3ef", "ref"), "AB2CD3EF");
  assert.equal(G.code("?c=AB2CD3EF", "gift"), null, "a referral code isn't a gift card");
  assert.equal(G.code("?c=" + "A".repeat(600), "ref"), null);
  assert.equal(G.appLink("gift", "PLUSCADEAU23"), "waternow://gift/PLUSCADEAU23");
  assert.equal(G.appLink("ref", "AB2CD3EF"), "waternow://r/AB2CD3EF");
  // A road trip invitation: t/#c=<8>, read from the fragment (location.hash without its #), the app's join link.
  assert.equal(G.code("c=k7qm3pxa", "trip"), "K7QM3PXA");
  assert.equal(G.code("c=K7QO3PXA", "trip"), null, "no O in a code");
  assert.equal(G.appLink("trip", "K7QM3PXA"), "waternow://trip/K7QM3PXA");
});

test("gift_preview cleaned: a paid or activated card only, its words trimmed", () => {
  assert.deepEqual(G.preview({ result: "ok", plan: "plus", months: 3, from_name: " Gabrielle‮ ", message: "Bonne soif", status: "paid" }),
                   { plan: "plus", months: 3, from: "Gabrielle", message: "Bonne soif", redeemed: false });
  assert.deepEqual(G.preview({ result: "ok", plan: "racines", months: 12, from_name: null, message: null, status: "redeemed" }),
                   { plan: "racines", months: 12, from: null, message: null, redeemed: true });
  for (const o of [{ result: "not_found" }, null, { result: "ok", plan: "gold", months: 1, status: "paid" }, { result: "ok", plan: "plus", months: 2, status: "paid" },
                   { result: "ok", plan: "plus", months: 1, status: "pending" }]) assert.equal(G.preview(o), null, JSON.stringify(o));
});

test("section 97: only PostgREST's missing function (PGRST202) means « coming soon »; a live region always there; « Try again » guarded", () => {
  assert.equal(G.missingRpc(404, { code: "PGRST202", message: "Could not find the function" }), true);
  for (const [s, b] of [[404, { code: "PGRST116" }], [404, null], [404, "Not Found"], [500, { code: "PGRST202" }], [200, { code: "PGRST202" }]]) {
    assert.equal(G.missingRpc(s, b), false, s + " " + JSON.stringify(b));
  }
  const html = read("cadeau/index.html");
  const live = /<div id="live" aria-live="polite">([\s\S]*?)\n  <\/div>/.exec(html);
  assert.ok(live, "one live region, never hidden");
  for (const id of ["card", "bad", "note"]) assert.match(live[1], new RegExp('id="' + id + '"'), id + " inside it");
  assert.equal((html.match(/aria-live|role="status"/g) || []).length, 1, "no live region nested in it");
  assert.match(html, /<h1 id="title" tabindex="-1">/, "the card's heading takes the focus");
  assert.match(html, /<p class="gift-again hidden" id="againBox"><button class="btn" id="again" type="button">/, "the wrapper is what hides");
  const js = read("assets/gift.js");
  assert.match(js, /var mine = \+\+seq/, "each read numbered");
  assert.match(js, /if \(j === null \|\| stale\(\)\) return;/, "an older answer never draws");
  assert.doesNotMatch(js, /show\("again"/, "the button itself is never toggled");
});

test("every language has every text, same shape; tu and « courriel » in French, ș ț in Romanian", () => {
  const shape = (o) => Object.keys(o).sort().map((k) => k + ":" + typeof o[k]).join(",");
  const texts = (o) => Object.values(o).map((v) => (typeof v === "function" ? v("12", 12) : v));
  assert.deepEqual(Object.keys(G.STRINGS).sort(), [...LANGS].sort());
  for (const l of LANGS) {
    assert.equal(shape(G.STRINGS[l]), shape(G.STRINGS.en), l);
    for (const v of texts(G.STRINGS[l])) assert.ok(typeof v === "string" && v.trim(), l);
  }
  assert.doesNotMatch(texts(G.STRINGS.fr).join("\n"), /\b(vous|votre|vos)\b|\be-?mail\b/i);
  assert.doesNotMatch(texts(G.STRINGS.ro).join("\n"), /[şţŞŢ]/);
  assert.equal(G.STRINGS.fr.months("1", 1), "1 mois");
  assert.equal(G.STRINGS.ro.months("3", 3), "3 luni");
});

test("the pages: their CSP, waiting for their words, the ids the script fills, nothing injected", () => {
  for (const [page, reads] of [["cadeau/index.html", true], ["r/index.html", false], ["t/index.html", false]]) {
    const html = read(page);
    assert.match(html, /<script src="\.\.\/assets\/hold\.js"><\/script>\n<\/head>/, page);
    assert.match(html, /<meta name="robots" content="noindex">/, page + ": a link to share, not a page to find");
    assert.match(html, reads ? /connect-src 'self' https:\/\/pkqsvlbiznrqxfckaxll\.supabase\.co;/ : /connect-src 'self';/, page + ": the server only where it reads");
    assert.match(html, /<script src="\.\.\/assets\/spot-params\.js"><\/script>\n<script src="\.\.\/assets\/page-data\.js"><\/script>\n<script src="\.\.\/assets\/gift\.js"><\/script>/, page);
    for (const id of ["card", "title", "lead", "open", "codeLine", "bad", "badTitle", "badText", "get", "getTitle", "getText", "foot"]) assert.match(html, new RegExp('id="' + id + '"'), page + " " + id);
    assert.doesNotMatch(html, /\son[a-z]+=|style=|<style/i, page);
  }
  for (const id of ["months", "from", "message", "perks", "how", "note", "again"]) assert.match(read("cadeau/index.html"), new RegExp('id="' + id + '"'), id);
  for (const id of ["perk", "when"]) assert.match(read("r/index.html"), new RegExp('id="' + id + '"'), id);
  assert.match(read("t/index.html"), /data-page="trip"/);
  assert.ok(read("assets/gift.js").includes('code(location.hash.slice(1), "trip")'), "a trip's code is read after #, never from the query");
  assert.doesNotMatch(read("assets/gift.js"), /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/);
  // billing-checkout's gift card comes back to racines/succes/?k=gift, which thanks for it.
  assert.match(fs.readFileSync(path.join(site, "..", "supabase", "functions", "billing-checkout", "index.ts"), "utf8"), /racines\/succes\/\?k=gift/);
  const R = require("./racines-data.js");
  assert.equal(R.checkoutKind("?k=gift"), "gift");
  for (const l of LANGS) assert.ok(R.STRINGS[l].okText.gift, l);
});

test("the ticket: white text at AA (4.5:1) on each solid colour and gradient stop, light and dark alike", () => {
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const onWhite = (hex) => 1.05 / (lum(hex) + 0.05);
  const blend = (hex, a) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - a) + 255 * a).toString(16).padStart(2, "0")).join("");
  const css = read("assets/gift.css");
  const colours = [...new Set([...css.matchAll(/#[0-9a-f]{6}\b/gi)].map((m) => m[0].toLowerCase()).filter((c) => c !== "#ffffff"))];
  assert.ok(colours.length >= 5, colours.join(","));
  const overlay = Number(/rgba\(255, 255, 255, (\.\d+)\)/.exec(css)[1]);
  for (const c of colours) {
    assert.ok(onWhite(c) >= 4.5, c + " " + onWhite(c).toFixed(2));
    assert.ok(onWhite(blend(c, overlay)) >= 4.5, c + " under the circle " + onWhite(blend(c, overlay)).toFixed(2));
  }
  assert.match(css, /\.gift-ticket \{[^}]*background-color: #0058b0;/, "a solid colour under the gradient (its computed background)");
  assert.doesNotMatch(css, /animation|@keyframes|transition/, "nothing moves");
});
