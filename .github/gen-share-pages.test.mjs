// node --test site/.github/gen-share-pages.test.mjs  (the link previews, against a fake server: no network)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { esc, page, generate, SERVER } from "./gen-share-pages.mjs";

const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const COVER = "7/cover-" + "c".repeat(32) + ".jpg";
const LOGO = "7/logo-" + "d".repeat(32) + ".png";
const DAY = 86400;

// A copy of the two pages the previews are made from, in a fresh folder.
function site() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wn-previews-"));
  for (const d of ["e", "p"]) {
    fs.mkdirSync(path.join(dir, d));
    fs.copyFileSync(path.join(SITE, d, "index.html"), path.join(dir, d, "index.html"));
  }
  return dir;
}
const read = (dir, f) => fs.readFileSync(path.join(dir, f), "utf8");
let signatures = 0;
const jwt = (exp) => "x." + Buffer.from(JSON.stringify({ exp, n: ++signatures })).toString("base64url") + ".y";

// The server: [list] for get_share_pages, a token valid [days] for each signature; every call recorded.
function server(list, { days = 7, status = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(url);
    if (url.endsWith("/rest/v1/rpc/get_share_pages")) {
      assert.equal(init.headers.apikey.startsWith("sb_publishable_"), true, "the publishable key, never a secret one");
      return { ok: status === 200, status, json: async () => list };
    }
    const name = url.split("/object/sign/partner-media/")[1];
    return { ok: true, status: 200, json: async () => ({ signedURL: "/object/sign/partner-media/" + name + "?token=" + jwt(Math.floor(Date.now() / 1000) + days * DAY) }) };
  };
  return { fetchImpl, calls };
}

const event = { slug: "marathon-58-a1b2c3", name: "Marathon <b>du</b> \"bout\" $& __X__", tagline: "Entre mer & glaciers", cover: COVER,
  starts_at: "2026-11-14T12:00:00+00:00", ends_at: "2026-11-14T18:00:00+00:00", timezone: "America/Argentina/Ushuaia" };
const partner = { slug: "cafe-bleu", name: "Café Bleu", tagline: "", logo: LOGO };

test("text is escaped for HTML, and never reads as a template token", () => {
  assert.equal(esc(`<a href="x">'&'</a> __NAME__`), "&#60;a href=&#34;x&#34;&#62;&#39;&#38;&#39;&#60;/a&#62; &#95;&#95;NAME&#95;&#95;");
});

test("a preview: one folder deeper, its own title, description, address and picture; the page still reads live", () => {
  const html = page(read(SITE, "e/index.html"), "event", event, SERVER + "/storage/v1/object/sign/partner-media/" + COVER + "?token=t_1");
  const name = "Marathon &#60;b&#62;du&#60;/b&#62; &#34;bout&#34; $&#38; &#95;&#95;X&#95;&#95;";
  assert.match(html, new RegExp("<title>" + name.replace(/\$/g, "\\$") + " · WaterNow</title>"));
  assert.ok(html.includes('<meta property="og:title" content="' + name + '">'), "the name, escaped, $& left as it is");
  assert.match(html, /<meta property="og:description" content="Entre mer &#38; glaciers · Sat, Nov 14, 2026, 9:00/);
  assert.match(html, /<meta property="og:url" content="https:\/\/coolminer11\.github\.io\/WaterNow-site\/e\/marathon-58-a1b2c3\/">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/pkqsvlbiznrqxfckaxll\.supabase\.co\/storage\/v1\/object\/sign\/partner-media\/7\/cover-c+\.jpg\?token=t&#95;1">/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(html, /<body data-kind="event" data-slug="marathon-58-a1b2c3">/);
  assert.match(html, /<script src="\.\.\/\.\.\/assets\/page\.js"><\/script>/);
  assert.match(html, /<link rel="stylesheet" href="\.\.\/\.\.\/assets\/site\.css">/);
  assert.match(html, /<a class="btn wide" id="get" href="\.\.\/\.\.\/">/);
  assert.doesNotMatch(html, / (href|src)="\.\.\/(?!\.\.\/)/, "no link left one folder short");
  assert.doesNotMatch(html, /__[A-Z_]+__|<b>/);
  const p = page(read(SITE, "p/index.html"), "partner", partner, null);
  assert.match(p, /<meta property="og:description" content="A WaterNow partner">/);
  assert.match(p, /<meta name="twitter:card" content="summary">\n<meta property="og:url" content="[^"]+\/p\/cafe-bleu\/">/);
  assert.doesNotMatch(p, /og:image/);
  assert.throws(() => page("<html></html>", "event", event, null), /template/);
});

test("the previews are written, kept as they are while nothing changes, and removed once no longer listed", async () => {
  const dir = site();
  fs.mkdirSync(path.join(dir, "e", "old-event-1"));
  fs.writeFileSync(path.join(dir, "e", "old-event-1", "index.html"), "old");
  const s = server({ events: [event, { slug: "Bad_Slug", name: "x" }, event, null], partners: [partner] });
  const r = await generate(dir, { fetchImpl: s.fetchImpl });
  assert.deepEqual(r, { written: 2, removed: 1, events: 1, partners: 1 });
  assert.equal(fs.existsSync(path.join(dir, "e", "old-event-1")), false, "a preview no longer listed goes");
  assert.equal(fs.existsSync(path.join(dir, "e", "Bad_Slug")), false);
  assert.match(read(dir, "e/marathon-58-a1b2c3/index.html"), /og:image" content="[^"]+cover-c+\.jpg\?token=/);
  assert.match(read(dir, "p/cafe-bleu/index.html"), /og:image" content="[^"]+logo-d+\.png\?token=/);
  assert.match(read(dir, "e/index.html"), /<body data-kind="event">/, "the live page itself is untouched");
  // Run again: signatures with days left are kept, so nothing changes (no commit every 30 minutes).
  const again = server({ events: [event], partners: [partner] });
  assert.deepEqual(await generate(dir, { fetchImpl: again.fetchImpl }), { written: 0, removed: 0, events: 1, partners: 1 });
  assert.equal(again.calls.length, 1, "only the list was read");
  // A signature with under 2 days left is renewed.
  const later = server({ events: [event], partners: [partner] });
  assert.equal((await generate(dir, { fetchImpl: later.fetchImpl, now: Date.now() + 6 * DAY * 1000 })).written, 2);
  assert.equal(later.calls.length, 3);
});

test("zero events or partners: nothing written, the old previews removed; an unreadable server changes nothing", async () => {
  const dir = site();
  await generate(dir, { fetchImpl: server({ events: [event], partners: [partner] }).fetchImpl });
  for (const [status, list] of [[500, null], [404, null], [200, { events: "x", partners: [] }], [200, null]]) {
    await assert.rejects(generate(dir, { fetchImpl: server(list, { status }).fetchImpl }), /get_share_pages/);
    assert.ok(fs.existsSync(path.join(dir, "e", "marathon-58-a1b2c3", "index.html")), "kept while the server can't be read");
  }
  assert.deepEqual(await generate(dir, { fetchImpl: server({ events: [], partners: [] }).fetchImpl }), { written: 0, removed: 2, events: 0, partners: 0 });
  assert.deepEqual(fs.readdirSync(path.join(dir, "e")), ["index.html"]);
  assert.deepEqual(fs.readdirSync(path.join(dir, "p")), ["index.html"]);
});

test("a picture that can't be signed: the preview without it", async () => {
  const dir = site();
  const fetchImpl = async (url) => url.endsWith("get_share_pages")
    ? { ok: true, status: 200, json: async () => ({ events: [event], partners: [] }) }
    : { ok: false, status: 400, json: async () => ({}) };
  await generate(dir, { fetchImpl });
  assert.doesNotMatch(read(dir, "e/marathon-58-a1b2c3/index.html"), /og:image/);
});
