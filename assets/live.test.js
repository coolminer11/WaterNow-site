// node --test site/assets/live.test.js  (the live page's link check, no browser needed)
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseLiveParams, headline, clock, SERVER, STRINGS } = require("./live.js");
const { LANGS } = require("./spot-params.js");

const key = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.abc_DEF-123";
const token = "AbCdEfGhIjKlMnOpQrStUv_-12";
// The link builds up to 1.51 made: server and key next to the token.
const link = (u) => "#u=" + encodeURIComponent(u) + "&k=" + key + "&t=" + token;
const endpoint = SERVER + "/rest/v1/rpc/get_live_share";

test("a link the app builds goes to WaterNow's server", () => {
  // LiveShare.webLink: the token only.
  assert.deepEqual(parseLiveParams("#t=" + token), { endpoint, token });
  // Older links still open; their key is never used.
  assert.deepEqual(parseLiveParams(link(SERVER)), { endpoint, token });
  assert.equal(parseLiveParams(link(SERVER + "/")).endpoint, endpoint);
});

test("any other server is refused, however it is dressed up", () => {
  for (const u of [
    "https://evil.example", "http://pkqsvlbiznrqxfckaxll.supabase.co", "https://pkqsvlbiznrqxfckaxll.supabase.co.evil.example",
    "https://evil.supabase.co", "https://pkqsvlbiznrqxfckaxll.supabase.co:8443", "https://user@pkqsvlbiznrqxfckaxll.supabase.co",
    "https://pkqsvlbiznrqxfckaxll.supabase.co/rest", "https://pkqsvlbiznrqxfckaxll.supabase.co?x=1", "//evil.example", "javascript:alert(1)"
  ]) {
    assert.deepEqual(parseLiveParams(link(u)), { error: "server" }, u);
  }
});

test("an incomplete link is refused before anything is loaded", () => {
  assert.deepEqual(parseLiveParams(""), { error: "incomplete" });
  assert.deepEqual(parseLiveParams("#u=" + SERVER + "&k=" + key), { error: "incomplete" });
  assert.deepEqual(parseLiveParams("#t=short"), { error: "incomplete" });
  assert.deepEqual(parseLiveParams("#u=" + SERVER + "&k=" + key + "&t=bad%20token%20value%20here!!"), { error: "incomplete" });
});

test("every app language has every text, in the same shape as English", () => {
  const shape = (o) => Object.keys(o).sort().map((k) => k + ":" + (typeof o[k] === "object" ? "{" + shape(o[k]) + "}" : typeof o[k])).join(",");
  assert.deepEqual(Object.keys(STRINGS).sort(), [...LANGS].sort());
  for (const lang of LANGS) {
    const T = STRINGS[lang];
    assert.equal(shape(T), shape(STRINGS.en), lang);
    for (const f of ["live", "onTheWay", "frozen", "to", "updated", "retrying"]) assert.match(T[f]("«x»"), /«x»/, lang + " " + f);
    for (const v of [...Object.values(T), ...Object.values(T.text)]) if (typeof v === "string") assert.ok(v.trim(), lang);
  }
});

test("a share whose position stopped coming is no longer shown as live", () => {
  const T = STRINGS.en;
  // Live: a position, "· live", "is on the way".
  assert.deepEqual(headline({ display_name: "Ana", lat: 45.5, lon: -73.6 }, T, "14:05"),
    { frozen: false, title: "Ana · live", who: "Ana is on the way" });
  // Silent for 10 minutes: the server sends no lat/lon (section 77), so no marker and when it last moved.
  assert.deepEqual(headline({ display_name: "Ana", lat: null, lon: null }, T, "14:05"),
    { frozen: true, title: "Ana", who: "Position not updated since 14:05" });
  assert.equal(headline({ display_name: "  ", lat: null }, T, "14:05").title, T.someone);
  assert.equal(headline({ display_name: "Ana", lat: 0, lon: 0 }, T, "x").frozen, false); // 0,0 is a position
});

test("times read in the page's language, whatever the browser's own locale", () => {
  const iso = "2026-11-12T19:05:00Z";
  // The browser (and node here) may default to en-US: a French page must still write 14:05, never 02:05 PM.
  for (const lang of LANGS.filter((l) => l !== "en")) assert.doesNotMatch(clock(iso, lang), /AM|PM/i, lang);
  assert.match(clock(iso, "en"), /AM|PM/);
  assert.equal(clock(null, "fr"), "–");
  assert.equal(clock("soon", "fr"), "–", "a bad time never prints Invalid Date");
});

test("the badge says what the last read found until the next one: retrying stays, a failure after a 503 isn't 'being updated'; '· live' and the marker's pulse only with the green badge", async () => {
  // The page run in node: a tiny DOM, a fake network (each read takes the next answer: [status, rows] or "offline"), and
  // the page's timers kept (a poll runs when the test says).
  const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
  const els = {};
  const el = (id) => els[id] || (els[id] = (() => { const c = new Set();
    return { textContent: "", className: "", classList: { add: (x) => c.add(x), remove: (x) => c.delete(x), contains: (x) => c.has(x), toggle: (x, on) => (on ? c.add(x) : c.delete(x)) } }; })());
  const live = () => el("title").textContent === "Ana · en direct" && !el("map").classList.contains("stale");
  const answers = [], polls = [];
  let tick = null;
  const ctx = vm.createContext({ document: { getElementById: el, addEventListener() {}, documentElement: {} },
    location: { hash: "#t=" + token }, navigator: { languages: ["fr"] }, Intl, URLSearchParams, AbortController, Date, clearTimeout() {},
    setTimeout: (fn) => { if (fn.name === "poll") polls.push(fn); }, setInterval: (fn) => { tick = fn; },
    fetch: async () => { const a = answers.shift(); if (a === "offline") throw new TypeError("Failed to fetch"); return { status: a[0], ok: a[0] === 200, json: async () => a[1] }; } });
  const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };
  const next = async (answer) => { answers.push(answer); polls.pop()(); await settle(); };
  const row = { display_name: "Ana", lat: 45.5, lon: -73.6, updated_at: new Date().toISOString() };
  answers.push([200, [row]]);
  for (const f of ["spot-params.js", "live.js"]) vm.runInContext(fs.readFileSync(path.join(__dirname, f), "utf8"), ctx);
  await settle();
  assert.match(els.status.textContent, /^Mis à jour/);
  assert.ok(live(), "a fresh position: '· live', the marker pulses");
  await next("offline");
  assert.match(els.status.textContent, /^Nouvel essai/);
  tick();
  assert.match(els.status.textContent, /^Nouvel essai/, "the 5 s refresh keeps it: the server is still unreachable");
  assert.match(els.status.className, /warn/, "never the green live badge");
  assert.equal(els.title.textContent, "Ana", "unreachable: no '· live' over a retrying badge");
  assert.ok(el("map").classList.contains("stale"), "and the marker stops pulsing");
  await next([503, {}]);
  assert.equal(els.status.textContent, STRINGS.fr.maintenance);
  assert.ok(!live(), "being updated: not live either");
  await next("offline");
  tick();
  assert.match(els.status.textContent, /^Nouvel essai/, "unreachable now, not being updated");
  await next([200, [row]]);
  tick();
  assert.match(els.status.textContent, /^Mis à jour/, "and live again with the next answer");
  assert.match(els.status.className, /ok/);
  assert.ok(live(), "'· live' and the pulse come back with it");
});
