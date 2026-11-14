// node --test site/assets/auth.test.js  (the account page's texts, no browser needed)
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { LANGS } = require("./spot-params.js");

const html = fs.readFileSync(path.join(__dirname, "..", "auth", "index.html"), "utf8");
const js = fs.readFileSync(path.join(__dirname, "..", "auth", "auth.js"), "utf8");
const STRINGS = vm.runInNewContext("(" + /const STRINGS = (\{[\s\S]*?\n  \});/.exec(js)[1] + ")");

test("every app language has every text of the account page", () => {
  assert.deepEqual(Object.keys(STRINGS).sort(), [...LANGS].sort());
  for (const lang of LANGS) {
    assert.deepEqual(Object.keys(STRINGS[lang]).sort(), Object.keys(STRINGS.en).sort(), lang);
    for (const v of Object.values(STRINGS[lang])) assert.ok(typeof v === "string" && v.trim(), lang);
  }
  // Every text the script shows exists (T.same, T.weak… on a refused password).
  for (const [, key] of js.matchAll(/\bT\.(\w+)/g)) assert.ok(Object.hasOwn(STRINGS.en, key), key);
  assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML|document\.write/);
});

// The page run in node: a tiny DOM, and a fake Auth server ([routes](path, method, body, bearer) -> [status, json]).
const SERVER = "https://pkqsvlbiznrqxfckaxll.supabase.co/auth/v1/";
const jwt = (aal) => "h." + Buffer.from(JSON.stringify({ aal, sub: "u" })).toString("base64url") + ".s";
const settle = async () => { for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r)); };
// routes may answer "hang": no answer until the page aborts the call. [clock] replaces setTimeout (a hung call's deadline).
function open(hash, routes, clock) {
  class El {
    constructor(tag) { this.tagName = tag; this.children = []; this.on = {}; this.hidden = false; this.disabled = false; this.value = ""; this.textContent = ""; }
    append(...c) { this.children.push(...c); }
    setAttribute(k, v) { this[k] = v; }
    getAttribute(k) { return k in this ? String(this[k]) : null; }
    removeAttribute(k) { delete this[k]; }
    addEventListener(t, f) { (this.on[t] = this.on[t] || []).push(f); }
    click() { (this.on.click || []).forEach((f) => f({})); }
    focus() { focused = this.id; }
  }
  const els = { title: new El("h1"), text: new El("p"), app: new El("main") };
  const all = (e) => [e, ...e.children.flatMap(all)];
  const calls = [];
  let focused = null;
  const fetch = async (url, o) => {
    const path = url.slice(SERVER.length), body = o.body ? JSON.parse(o.body) : undefined, bearer = o.headers.Authorization.slice(7);
    calls.push({ path, method: o.method, bearer, body });
    const answer = routes(path, o.method, body, bearer);
    if (answer === "hang") return new Promise((_, no) => o.signal.addEventListener("abort", () => no(new DOMException("aborted", "AbortError"))));
    const [status, json] = answer;
    return { status, ok: status >= 200 && status < 300, json: async () => json };
  };
  vm.runInNewContext(js, { document: { documentElement: { classList: { add() {} } }, getElementById: (id) => els[id], createElement: (t) => new El(t) }, fetch, atob, URLSearchParams,
    AbortController, setTimeout: clock || setTimeout, clearTimeout,
    navigator: { languages: ["fr-CA"] }, location: { hash, search: "", pathname: "/WaterNow-site/auth/" }, history: { replaceState() {} } });
  const box = (id) => all(els.app).find((e) => e.tagName === "div" && e.children.some((c) => c.id === id));
  const $ = (id) => all(els.app).find((e) => e.id === id);
  const button = (label) => all(els.app).find((e) => e.tagName === "button" && e.textContent === label);
  const msg = () => all(els.app).find((e) => e.role === "status").textContent;
  return { els, calls, $, box, button, msg, focused: () => focused };
}
const FACTOR = "6f9a3c52-0000-4000-8000-000000000001";
const mfaServer = (readable = () => true) => (path, method, body, bearer) => {
  if (path === "user" && method === "GET") return readable() ? [200, { id: "u", factors: [{ id: FACTOR, factor_type: "totp", status: "verified" }] }] : [500, {}];
  if (path === "factors/" + FACTOR + "/challenge") return [200, { id: "c1", type: "totp" }];
  if (path === "factors/" + FACTOR + "/verify") return body.code === "123456" ? [200, { access_token: jwt("aal2") }] : [422, { error_code: "mfa_verification_failed" }];
  if (path === "user" && method === "PUT") return bearer === jwt("aal2") ? [200, {}] : [401, { error_code: "insufficient_aal" }];
  return [404, {}];
};
const F = STRINGS.fr;

test("a two-factor account's reset link asks for the authenticator code first, then saves at aal2", async () => {
  const p = open("#access_token=" + jwt("aal1") + "&type=recovery", mfaServer());
  await settle();
  assert.equal(p.els.title.textContent, F.codeTitle, "the code first, not the password");
  assert.equal(p.box("pw").hidden, true);
  assert.equal(p.box("code").hidden, false);
  p.$("code").value = "12345";
  p.button(F.next).click(); await settle();
  assert.equal(p.msg(), F.codeRule, "6 digits");
  p.$("code").value = "000000";
  p.button(F.next).click(); await settle();
  assert.equal(p.msg(), F.codeWrong, "a wrong code says so, never \"link expired\"");
  p.$("code").value = "123 456";
  p.button(F.next).click(); await settle();
  assert.equal(p.els.title.textContent, F.resetTitle, "then the new password");
  assert.equal(p.box("pw").hidden, false);
  assert.equal(p.focused(), "pw", "the keyboard lands on the new password, not on the gone Continue button");
  p.$("pw").value = p.$("pw2").value = "nouveau123";
  p.button(F.save).click(); await settle();
  assert.equal(p.msg(), F.saved);
  assert.equal(p.box("pw").hidden, true, "the form goes once the password is saved: the message stands alone");
  const put = p.calls.find((c) => c.method === "PUT");
  assert.equal(put.bearer, jwt("aal2"), "saved with the aal2 session");
  assert.deepEqual(put.body, { password: "nouveau123" });
  assert.deepEqual(p.calls.filter((c) => c.path.endsWith("/verify")).map((c) => c.body.challenge_id), ["c1", "c1"]);
});

test("an account without two-factor goes straight to the password, as before", async () => {
  const p = open("#access_token=" + jwt("aal1") + "&type=recovery", (path, method) => (method === "GET" ? [200, { id: "u", factors: [] }] : [200, {}]));
  await settle();
  assert.equal(p.els.title.textContent, F.resetTitle);
  assert.equal(p.box("code").hidden, true);
  p.$("pw").value = p.$("pw2").value = "nouveau123";
  p.button(F.save).click(); await settle();
  assert.equal(p.msg(), F.saved);
  assert.ok(!p.calls.some((c) => c.path.startsWith("factors/")), "no challenge");
});

test("when the first look fails, insufficient_aal on save asks for the code and saves the same password", async () => {
  let reads = 0;
  const p = open("#access_token=" + jwt("aal1") + "&type=recovery", mfaServer(() => reads++ > 0));
  await settle();
  assert.equal(p.els.title.textContent, F.resetTitle, "the account couldn't be read: password first");
  p.$("pw").value = p.$("pw2").value = "nouveau123";
  p.button(F.save).click(); await settle();
  assert.equal(p.els.title.textContent, F.codeTitle, "the code, not \"link expired\"");
  assert.notEqual(p.msg(), F.expired);
  p.$("code").value = "123456";
  p.button(F.next).click(); await settle();
  assert.equal(p.msg(), F.saved, "the same password saved right after the code");
});

test("a spent link still says so", async () => {
  const p = open("#access_token=" + jwt("aal1") + "&type=recovery", () => [401, { error_code: "bad_jwt" }]);
  await settle();
  assert.equal(p.els.text.textContent, F.expired);
});

test("a call that never answers gives up after its deadline: the password form, then \"try again\" with Save back", async () => {
  const deadlines = [];
  const clock = (fn, ms) => { deadlines.push({ fn, ms }); return deadlines.length; };
  let hang = true;
  const p = open("#access_token=" + jwt("aal1") + "&type=recovery",
    (path, method) => (hang ? "hang" : method === "GET" ? [200, { id: "u", factors: [] }] : [200, {}]), clock);
  await settle();
  assert.ok(deadlines.length === 1 && deadlines[0].ms === 15000, "the account read has a 15 s deadline");
  assert.notEqual(p.els.title.textContent, F.resetTitle, "still reading");
  deadlines.shift().fn(); await settle();
  assert.equal(p.els.title.textContent, F.resetTitle, "no answer: the password first, as when the account can't be read");
  p.$("pw").value = p.$("pw2").value = "nouveau123";
  p.button(F.save).click(); await settle();
  assert.equal(p.button(F.save).getAttribute("aria-disabled"), "true", "Save waits for its answer");
  assert.equal(p.button(F.save).disabled, false, "busy, never disabled: the keyboard's focus stays on it");
  p.button(F.save).click(); await settle();
  assert.equal(p.calls.filter((c) => c.method === "PUT").length, 1, "a second press while it waits sends nothing");
  deadlines.shift().fn(); await settle();
  assert.equal(p.msg(), F.failed, "no answer: try again in a moment");
  assert.equal(p.button(F.save).getAttribute("aria-disabled"), null, "and Save works again");
  assert.doesNotMatch(js, /\.disabled = /, "Continue too: busy, never disabled");
  hang = false;
  p.button(F.save).click(); await settle();
  assert.equal(p.msg(), F.saved);
});

test("the page holding a sign-in token runs no inline script: only its own file, posting only to WaterNow's server", () => {
  const csp = /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)[1];
  assert.match(csp, /(^|; )script-src 'self'(;|$)/);
  assert.match(csp, /(^|; )connect-src https:\/\/pkqsvlbiznrqxfckaxll\.supabase\.co(;|$)/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
  // Its own file, and the site's hold (assets/hold.js: two classes on <html>, it reads nothing).
  assert.deepEqual([...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]), ['<script src="../assets/hold.js">', '<script src="auth.js">']);
  assert.match(html, /<meta name="referrer" content="no-referrer">/);
  // The site's own look: the shared stylesheet and its tokens, no style of its own (so no 'unsafe-inline' either).
  assert.match(csp, /(^|; )style-src 'self'(;|$)/);
  assert.match(html, /<link rel="stylesheet" href="\.\.\/assets\/site\.css">/);
  assert.doesNotMatch(html, /<style|style="/);
});
