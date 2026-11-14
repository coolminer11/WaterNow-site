// node --test site/assets/contrast.test.js  (site.css's text colours against their backgrounds, light and dark)
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "site.css"), "utf8").replace(/\r\n/g, "\n");
const tokens = (block) => Object.fromEntries([...block.matchAll(/--([\w-]+): (#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));
const light = tokens(/:root \{([^}]*)\}/.exec(css)[1]);
const dark = { ...light, ...tokens(/prefers-color-scheme: dark\) \{\n {2}:root \{([^}]*)\}/.exec(css)[1]) };
const lum = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test("every text colour of the shared pages reads at AA (4.5:1) on what it sits on, light and dark, busy buttons included", () => {
  // [text, background]: words, captions, the note and its Try again, a link, the facts, a primary button, an error.
  const pairs = [["fg", "bg"], ["fg", "card"], ["muted", "bg"], ["muted", "card"], ["muted", "soft"], ["accent", "card"], ["accent", "soft"],
    ["accent", "bg"], ["ok", "card"], ["warn", "card"], ["err", "card"], ["on-accent", "accent"]];
  for (const [name, t] of [["light", light], ["dark", dark]]) {
    for (const [fg, bg] of pairs) assert.ok(ratio(t[fg], t[bg]) >= 4.5, `${name}: --${fg} on --${bg} is ${ratio(t[fg], t[bg]).toFixed(2)}:1`);
  }
  // A busy control keeps the keyboard's focus (aria-disabled, never disabled): it stays readable in the tokens (muted
  // on soft), never faded with opacity (.6 gave 2.6:1 for s/'s Try again, 2.4:1 for a primary button).
  const busy = [...css.matchAll(/[^}]*\[aria-disabled="true"\][^{]*\{([^}]*)\}/g)];
  assert.ok(busy.length >= 2, "the note's Try again and the buttons");
  for (const m of busy) assert.doesNotMatch(m[1], /opacity/, m[0].trim().split("{")[0]);
  assert.match(css, /\.note \.retry\[aria-disabled="true"\] \{ color: var\(--muted\);/);
  assert.match(css, /\.btn\[aria-disabled="true"\], \.btn\[aria-disabled="true"\]:hover \{\n {2}background: var\(--soft\); color: var\(--muted\);/);
});

test("« Fontaine commune » (fontaine.css, home's entry, the demo pill): every text colour is a measured token pair, light and dark", () => {
  const fc = fs.readFileSync(path.join(__dirname, "fontaine.css"), "utf8");
  for (const [name, t] of [["light", light], ["dark", dark]]) {
    // The soft-blue surfaces (status chip, matching banner, vote box, a chosen amount, the demo pill), the soft tiles (the
    // wall, the candidates, the rollover line, the impact figures) and the form's lines on the card.
    for (const [fg, bg] of [["on-accent-soft", "accent-soft"], ["fg", "soft"], ["muted", "soft"], ["accent", "soft"], ["ok", "card"], ["err", "card"]]) {
      assert.ok(ratio(t[fg], t[bg]) >= 4.5, `${name}: --${fg} on --${bg} is ${ratio(t[fg], t[bg]).toFixed(2)}:1`);
    }
  }
  // Only those tokens (and white on the cover's blue, measured above): no colour picked by eye.
  const colours = [...fc.matchAll(/(?:^|[;{\s])color: ([^;}]+)[;}]/g)].map((m) => m[1].trim());
  assert.ok(colours.length >= 10);
  for (const c of colours) assert.match(c, /^var\(--(fg|muted|accent|on-accent|on-accent-soft|ok|err)\)$|^#fff$|^inherit$/, c);
  assert.match(css, /\.demo-pill \{\n {2}[^}]*color: var\(--on-accent-soft\); background: var\(--accent-soft\);/);
  assert.match(css, /\.commons-entry \{\n[^}]*color: var\(--fg\);/);
  assert.doesNotMatch(fc, /infinite|opacity: \.[0-9]+;[^}]*color/, "nothing loops; no faded text");
});

test("home, s/, e/, p/, stats/, live/ and the legal pages: what a design check flagged, measured (texts at AA, a pulse only on a live share)", () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8").replace(/\r\n/g, "\n");
  // live/ has its own copy of the tokens: its badge (ok, retrying, muted) and its captions on the card, light and dark.
  const live = read("live.css");
  const lt = tokens(/:root \{([^}]*)\}/.exec(live)[1]), dt = { ...lt, ...tokens(/prefers-color-scheme: dark\) \{\n {2}:root \{([^}]*)\}/.exec(live)[1]) };
  for (const [name, t] of [["light", lt], ["dark", dt]]) {
    for (const fg of ["fg", "muted", "ok", "warn"]) assert.ok(ratio(t[fg], t.card) >= 4.5, `live ${name}: --${fg} on --card ${ratio(t[fg], t.card).toFixed(2)}:1`);
  }
  // e/: a cover without its picture shows the start day and month in white on the cover's blue (#0066cc at its lighter
  // end, both themes). The month is 16 px (not large text): at opacity .85 it read 4.46:1.
  assert.ok(ratio("#ffffff", "#0066cc") >= 4.5);
  assert.match(css, /\.cover \{[^}]*linear-gradient\(135deg, #0066cc, #0a3ccb\)/, "the cover's blue is the one measured");
  const date = css.match(/\.cover-date[^{]*\{[^}]*\}/g);
  assert.ok(date.length >= 3);
  for (const rule of date) assert.doesNotMatch(rule, /opacity/, rule);
  // aria-disabled is a busy control's state (set by the scripts, the busy look in site.css); in a page's own markup it gave
  // stats/'s "App Store: coming soon" a progress cursor on hover and a background that changed under the mouse.
  for (const page of ["../index.html", "../s/index.html", "../e/index.html", "../p/index.html", "../stats/index.html", "../live/index.html", "../auth/index.html", "../404.html"]) {
    assert.doesNotMatch(read(page), /aria-disabled/, page);
  }
  // A pulsing dot says "live": only live/ while a share moves (its badge green). stats/ totals are minutes old: a still
  // dot by "Updated N min ago"; e/ and p/ have no status dot. live/'s marker stops pulsing with the badge (live.js).
  assert.doesNotMatch(read("stats.css"), /infinite/, "nothing on stats/ pulses");
  // s/ scanned on its sticker: the drop sat in rings that spread forever; a still circle by "You scanned a WaterNow point".
  assert.doesNotMatch(css, /wn-ring|\.ripple span/, "nothing on s/ pulses");
  assert.match(read("../s/index.html"), /<div class="ripple" aria-hidden="true"><img /);
  assert.match(live, /\.badge\.ok::before \{ animation: wn-breathe/, "live/'s badge breathes while green");
  assert.match(read("map.css"), /\.stale \.wn-marker\.live \{ animation: none; box-shadow: 0 1px 4px rgba\(0, 0, 0, \.35\); \}/);
  // What still loops in site.css: only the loading shimmer (it goes with the answer). Home's drop moves once, under 5 s.
  assert.deepEqual([...css.matchAll(/([^{}\n]+)\{[^}]*\binfinite\b/g)].map((m) => m[1].trim()), [".sk, .sk-line"]);
  assert.match(css, /\.drop \.wave \{ animation: wn-wave 3\.4s linear forwards; \}\n {2}\.drop \.wave\.slow \{ animation-duration: 4\.8s;/);
  // The legal pages (scripts/legal-build.js): site.css alone, no inline style, words fg or muted and links accent, on the
  // card or the page: all pairs measured above (the lowest, the language links on the page in light, 5.33:1). A blank
  // still to fill is italic, never faded.
  for (const page of ["../terms/index.html", "../privacy/index.html"]) {
    const html = read(page);
    assert.deepEqual([...html.matchAll(/rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]), ["../assets/site.css"], page);
    assert.doesNotMatch(html, /style=|<style/, page);
    const classes = new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(" ")));
    assert.deepEqual([...classes].sort(), ["bar", "brand", "card", "fill", "langs", "legal", "list", "logo", "muted", "page"], page);
  }
  assert.match(css, /\n\.fill \{ font-style: italic; \}\n/);
});

test("fontaine/, fontaine/merci/ and f/ (the design check): no label above a title, the primary button's hover at AA, no letter on a logo's tile", () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8").replace(/\r\n/g, "\n");
  const fc = read("fontaine.css");
  // An uppercase label as its own block above a heading (a kicker): gone; the feature's name is the line under the title.
  for (const page of ["../fontaine/index.html", "../fontaine/merci/index.html", "../f/index.html"]) {
    const html = read(page);
    assert.doesNotMatch(html, /class="eyebrow"|id="eyebrow"/, page);
    assert.doesNotMatch(html, /<img[^>]*\sid="cover"/, page + ": no empty <img> waiting for a cover (made only for a real picture)");
  }
  assert.doesNotMatch(read("../index.html"), /id="commonsKicker"/, "home's Fontaine commune entry: its name is in its line");
  assert.match(read("../fontaine/index.html"), /<h1 id="title">[^<]*<\/h1>\n\s*<p class="muted subline" id="sub">/);
  assert.doesNotMatch(fc, /text-transform: uppercase/, "no small uppercase labels (the sponsors' tiers are plain headings)");
  // The primary button under the mouse: --hover-filter (darker in light, lighter in dark) on the gradient's top stop
  // (accent 90 % + white) keeps its words at AA. brightness(1.06) gave 4.20:1 in light.
  const filt = (block) => Number(/--hover-filter: brightness\(([\d.]+)\)/.exec(block)[1]);
  const lightBlock = /:root \{([^}]*)\}/.exec(css)[1], darkBlock = /prefers-color-scheme: dark\) \{\n {2}:root \{([^}]*)\}/.exec(css)[1];
  const hex = (rgb) => "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
  const top = (accent, k) => hex([1, 3, 5].map((i) => (parseInt(accent.slice(i, i + 2), 16) * 0.9 + 25.5) * k));
  for (const [name, t, block] of [["light", light, lightBlock], ["dark", dark, darkBlock]]) {
    for (const k of [1, filt(block)]) {
      const r = ratio(t["on-accent"], top(t.accent, k));
      assert.ok(r >= 4.5, `${name}: the primary button's words at brightness ${k}: ${r.toFixed(2)}:1`);
    }
  }
  assert.ok(ratio("#ffffff", top(light.accent, 1.06)) < 4.5, "the old hover really was under AA (the check measures something)");
  assert.match(css, /\.btn\.primary:hover \{ background-color: var\(--accent\); filter: var\(--hover-filter\);/);
  // A sponsor's logo sits on the white tile (--logo-tile) in both themes; its initial goes once the logo is drawn: through a
  // transparent logo, the dark theme's accent read 3.05:1 on white.
  assert.ok(ratio(dark.accent, light["logo-tile"]) < 4.5);
  assert.match(fc, /\.plogo\.has-logo \{ background: var\(--logo-tile\); \}\n[^\n]*\n\.plogo\.has-logo > span \{ visibility: hidden; \}/);
  // Nothing pulses or loops on these pages; no side border stripe.
  assert.doesNotMatch(fc, /infinite|border-left:|border-right:/);
});

test("Racines et Plus (racines.css, home's entry): every text colour is a measured token pair, light and dark; nothing loops, no side stripe, no small capitals", () => {
  const rc = fs.readFileSync(path.join(__dirname, "racines.css"), "utf8").replace(/\r\n/g, "\n");
  for (const [name, t] of [["light", light], ["dark", dark]]) {
    // The soft tiles (the figures, the names, the companies, the free line, the projects without a link), the soft-blue
    // « bientôt » box, the plans' prices and their « / mois » on the card.
    for (const [fg, bg] of [["fg", "soft"], ["muted", "soft"], ["accent", "soft"], ["on-accent-soft", "accent-soft"], ["fg", "card"], ["muted", "card"], ["accent", "card"]]) {
      assert.ok(ratio(t[fg], t[bg]) >= 4.5, `${name}: --${fg} on --${bg} is ${ratio(t[fg], t[bg]).toFixed(2)}:1`);
    }
  }
  const colours = [...rc.matchAll(/(?:^|[;{\s])color: ([^;}]+)[;}]/g)].map((m) => m[1].trim());
  assert.ok(colours.length >= 6);
  for (const c of colours) assert.match(c, /^var\(--(fg|muted|accent|on-accent-soft)\)$|^inherit$/, c);
  assert.doesNotMatch(rc, /infinite|border-left:|border-right:|text-transform: uppercase/, "nothing loops; no side stripe; no small uppercase label");
  assert.doesNotMatch(rc, /opacity: \.[0-9]+;[^}]*color/, "no faded text");
  // A company's logo on the white tile: its initial goes once the logo is drawn (the dark accent read 3.05:1 on white).
  assert.match(rc, /\.companies \.plogo\.has-logo > span \{ visibility: hidden; \}/);
  // The sprout grows and the figures fade in only with motion allowed.
  assert.match(rc, /@media \(prefers-reduced-motion: no-preference\) \{\n {2}\.sprout \.stem/);
  // Home's entry: a drawn leaf in --ok before its name, no text on it.
  assert.match(css, /\.racines-entry \.commons-title::before \{[^}]*background: var\(--ok\); \}/);
});
