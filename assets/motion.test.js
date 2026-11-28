// node --test site/assets/motion.test.js  (the pages' scroll motion, with a fake window: no browser needed)
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { motion } = require("./motion.js");

function world({ reduce = false, io = true, tops = [] } = {}) {
  const observers = [];
  const els = tops.map((top) => ({ top, cls: new Set(), classList: null, getBoundingClientRect: () => ({ top }) }));
  els.forEach((e) => { e.classList = { add: (c) => e.cls.add(c), contains: (c) => e.cls.has(c) }; });
  const win = {
    innerHeight: 800,
    matchMedia: (q) => ({ matches: reduce && /reduce/.test(q) }),
    IntersectionObserver: io ? function (cb, opts) { const o = { cb, opts, seen: new Set(), observe: (el) => o.seen.add(el), unobserve: (el) => o.seen.delete(el) }; observers.push(o); return o; } : undefined
  };
  const doc = { querySelectorAll: () => els };
  const scroll = (el) => observers.forEach((o) => { if (o.seen.has(el)) o.cb([{ target: el, isIntersecting: true }]); });
  return { win, doc, els, scroll, observers };
}

test("with reduced motion nothing waits and nothing hides", () => {
  const w = world({ reduce: true, tops: [100, 2000] });
  const m = motion(w.win, w.doc);
  assert.equal(m.still, true);
  let ran = false;
  m.inView(w.els[1], () => { ran = true; });
  assert.equal(ran, true, "runs at once: numbers are shown at once");
  assert.equal(w.els[1].cls.size, 0, "no card is hidden");
  assert.equal(w.observers.length, 0);
});

test("without IntersectionObserver, the same", () => {
  const w = world({ io: false, tops: [2000] });
  const m = motion(w.win, w.doc);
  assert.equal(m.still, true);
  assert.equal(w.els[0].cls.size, 0);
});

test("a card below the screen waits, then rises when it comes into view; inView runs once on screen", () => {
  const w = world({ tops: [100, 790, 1200] });
  const m = motion(w.win, w.doc);
  assert.equal(m.still, false);
  assert.deepEqual(w.els.map((e) => e.cls.has("later")), [false, false, true], "only the one below the screen");
  let n = 0;
  m.inView(w.els[2], () => n++);
  assert.equal(n, 0, "not before it is seen");
  w.scroll(w.els[2]);
  assert.ok(w.els[2].cls.has("in"));
  assert.equal(n, 1);
  w.scroll(w.els[2]);
  assert.equal(n, 1, "once");
  // The whole screen: a bottom margin left the last card of a long page (s/'s footer) unseen even scrolled to the end.
  const opts = w.observers[0].opts || {};
  assert.ok(!opts.rootMargin || /^0(px)?( 0(px)?)*$/.test(opts.rootMargin.trim()), "no margin: " + opts.rootMargin);
});

test("printing shows everything still waiting as it ends, and nothing waits afterwards", () => {
  const w = world({ tops: [100, 1500, 2400] });
  const on = {};
  w.win.addEventListener = (type, fn) => { on[type] = fn; };
  const m = motion(w.win, w.doc);
  w.observers[0].disconnect = () => { w.observers[0].seen.clear(); };
  let counted = 0;
  m.inView(w.els[2], () => counted++);
  on.beforeprint();
  assert.ok(w.els[1].cls.has("in") && w.els[2].cls.has("in"), "the cards below the screen are printed");
  assert.equal(counted, 1, "the counter ran (it lands on its number at once: still)");
  assert.equal(m.still, true);
  let later = 0;
  m.inView(w.els[2], () => later++);
  assert.equal(later, 1, "after printing, inView runs at once");
  w.scroll(w.els[2]);
  assert.equal(counted, 1, "nothing runs twice");
});

test("every page with motion loads it before the map's library, and site.css keeps all motion behind no-preference", () => {
  for (const page of ["../index.html", "../s/index.html", "../e/index.html", "../p/index.html", "../stats/index.html"]) {
    const html = fs.readFileSync(path.join(__dirname, page), "utf8");
    const at = html.indexOf("assets/motion.js");
    assert.ok(at > 0, page);
    const lib = html.indexOf("maplibre-gl.js\"");
    if (lib > 0) assert.ok(at < lib, page + ": motion before MapLibre");
  }
  const css = ["site.css", "stats.css", "live.css"].map((f) => fs.readFileSync(path.join(__dirname, f), "utf8")).join("\n");
  // Outside the no-preference blocks, no animation runs (the marker's pulse is map.css's, with its own reduce rule).
  // The one exception, wn-hold, is no motion: a held page shows (0 s) after 3 s when its script never ran.
  const outside = css.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/g, "")
    .replace(/animation: wn-hold 0s 3s forwards;/g, "");
  assert.doesNotMatch(outside, /animation:\s*wn-/, "an animation outside prefers-reduced-motion: no-preference");
  assert.match(css, /@keyframes wn-hold \{ to \{ visibility: visible; \} \}/);
});

test("a page with its own script waits unseen until it has run, so a slow network never paints a jump", () => {
  const pages = { "index.html": "home.js", "s/index.html": "../s/app.js", "e/index.html": "page.js", "p/index.html": "page.js",
    "stats/index.html": "stats.js", "404.html": "notfound.js", "auth/index.html": "../auth/auth.js" };
  for (const [page, script] of Object.entries(pages)) {
    const html = fs.readFileSync(path.join(__dirname, "..", page), "utf8");
    assert.match(html, /<main class="page\b[^"]*\bhold\b/, page + ": main.hold");
    assert.match(html, /<html lang="en" dir="ltr">/, page);
    const js = fs.readFileSync(path.join(__dirname, script), "utf8");
    assert.match(js, /document\.documentElement\.classList\.add\("wn-ready"\)/, script + " reveals its page");
  }
  // The 404 reveals only what stays: a share on its way to its page is never painted as "doesn't exist".
  const nf = fs.readFileSync(path.join(__dirname, "notfound.js"), "utf8");
  assert.ok(nf.indexOf("location.replace") < nf.indexOf('add("wn-ready")'));
  // Pages without a script never wait.
  for (const page of ["privacy/index.html", "terms/index.html"]) {
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, "..", page), "utf8"), /\bhold\b/, page);
  }
});

test("only a page whose scripts run waits: scripts off or blocked show it at once, a script that fails shows it too", () => {
  // The hold needs html.wn-hold, set by assets/hold.js in the <head>: with scripts off nothing waited 3 s blank.
  const css = fs.readFileSync(path.join(__dirname, "site.css"), "utf8").replace(/\r\n/g, "\n");
  assert.match(css, /\nhtml\.wn-hold:not\(\.wn-ready\) \.page\.hold \{ visibility: hidden;/);
  assert.doesNotMatch(css, /\nhtml:not\(\.wn-ready\)/, "a hold that doesn't need the script");
  for (const page of ["index.html", "404.html", "auth/index.html", "e/index.html", "p/index.html", "s/index.html", "stats/index.html"]) {
    const html = fs.readFileSync(path.join(__dirname, "..", page), "utf8");
    const at = html.search(/<script src="[^"]*assets\/hold\.js"><\/script>/);
    assert.ok(at > 0 && at < html.indexOf("</head>"), page + ": hold.js in the <head>");
  }
  const { hold } = require("./hold.js");
  const cls = new Set(), on = {};
  class ErrorEvent {}
  const win = { ErrorEvent, addEventListener: (type, fn, capture) => { on[type] = { fn, capture }; } };
  hold(win, { classList: { add: (c) => cls.add(c) } });
  assert.deepEqual([...cls], ["wn-hold"]);
  assert.equal(on.error.capture, true, "a script's failed load doesn't bubble: captured");
  on.error.fn({ target: { tagName: "IMG" } });
  assert.ok(!cls.has("wn-ready"), "a picture that fails changes nothing");
  on.error.fn({ target: { tagName: "SCRIPT" } });
  assert.ok(cls.has("wn-ready"), "a script that fails to load shows the page");
  cls.delete("wn-ready");
  on.error.fn(new ErrorEvent());
  assert.ok(cls.has("wn-ready"), "a script that throws shows the page");
});
