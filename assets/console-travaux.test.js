// node --test site/assets/console-travaux.test.js : the console's « Travaux » (travaux.js, section 100): the pure helpers,
// the 7 languages, the page's wiring. No DOM, no network.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const W = require("../console/travaux.js");

const site = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(site, f), "utf8");
const API = "https://pkqsvlbiznrqxfckaxll.supabase.co";
const PHOTO = API + "/storage/v1/object/public/spot-photos/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg";

test("travaux: closure_reports_admin_list cleaned; a photo only from WaterNow's public bucket", () => {
  const list = W.reports({ reports: [
    { id: 7, kind: "sidewalk", lat: 45.52, lon: -73.58, created_at: "2026-11-21T14:00:00Z", until: "2026-11-28T14:00:00Z", status: "pending",
      here: 0, gone: 1, reporter_recent: 3, photo: PHOTO, reporter: "should never be read" },
    { id: 8, kind: "street", lat: 45.5, lon: -73.6, status: "live", photo: "https://evil.example/x.jpg", here: -2 },
    { id: 9, kind: "road", lat: 45, lon: -73, status: "live" }, { id: 10, kind: "bike", lat: 95, lon: 0, status: "live" },
    { id: "11", kind: "bike", lat: 1, lon: 1, status: "live" }, { id: 12, kind: "bike", lat: 1, lon: 1, status: "unknown" }, null
  ] }, API);
  assert.deepEqual(list.map((r) => r.id), [7, 8]);
  assert.deepEqual(list[0], { id: 7, kind: "sidewalk", lat: 45.52, lon: -73.58, created_at: "2026-11-21T14:00:00Z", until: "2026-11-28T14:00:00Z",
                              status: "pending", here: 0, gone: 1, recent: 3, photo: PHOTO });
  assert.equal(list[1].photo, null, "a link elsewhere is never shown");
  assert.equal(list[1].here, 0);
  assert.deepEqual(W.reports(null, API), []);
});

test("travaux: the map link and the actions", () => {
  assert.equal(W.mapLink(45.52, -73.58), "https://www.openstreetmap.org/?mlat=45.52000&mlon=-73.58000#map=18/45.52000/-73.58000");
  assert.deepEqual(W.actions({ status: "live" }), ["hide", "delete"]);
  assert.deepEqual(W.actions({ status: "hidden" }), ["show", "delete"]);
});

test("travaux: every string in the 7 languages, French with tu, Romanian with ș ț, Japanese without あなた", () => {
  const keys = (o) => Object.keys(o).sort();
  for (const lang of ["fr", "es", "de", "pt", "ja", "ro"]) {
    assert.deepEqual(keys(W.STRINGS[lang]), keys(W.STRINGS.en), lang);
    assert.deepEqual(keys(W.STRINGS[lang].kinds), W.KINDS.slice().sort(), lang);
    assert.deepEqual(keys(W.STRINGS[lang].statuses), W.STATUSES.slice().sort(), lang);
  }
  const all = (lang) => JSON.stringify(W.STRINGS[lang]);
  assert.doesNotMatch(all("fr"), /\b(vous|votre|vos)\b/i);
  assert.doesNotMatch(all("ro"), /[şţŞŢ]/);
  assert.doesNotMatch(all("ja"), /あなた/);
  assert.doesNotMatch(all("en"), /\bspots?\b/i);
});

test("travaux: on the console page, loaded after console.js, its card in the page", () => {
  const html = read("console/index.html");
  assert.ok(html.includes('<section class="card hidden" id="travaux"></section>'));
  assert.ok(html.indexOf('src="travaux.js"') > html.indexOf('src="console.js"'));
  const js = read("console/travaux.js");
  assert.match(js, /A\.rpc\("closure_reports_admin_list"/);
  assert.match(js, /A\.rpc\("closure_reports_admin_set"/);
  assert.doesNotMatch(js, /innerHTML/);
});
