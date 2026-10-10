// node --test site/assets/live.test.js  (the live page's link check, no browser needed)
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseLiveParams, SERVER, STRINGS } = require("./live.js");
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
    for (const f of ["live", "onTheWay", "to", "updated", "retrying"]) assert.match(T[f]("«x»"), /«x»/, lang + " " + f);
    for (const v of [...Object.values(T), ...Object.values(T.text)]) if (typeof v === "string") assert.ok(v.trim(), lang);
  }
});
