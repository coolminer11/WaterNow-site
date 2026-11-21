// node --test site/assets/console-intro.test.js  (the console's opening: it can never hold the console, no browser needed)
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const I = require("../console/intro.js");
const dir = path.join(__dirname, "..", "console");
const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
const js = fs.readFileSync(path.join(dir, "intro.js"), "utf8");
const css = fs.readFileSync(path.join(dir, "intro.css"), "utf8");
const cssBody = css.replace(/\/\*[\s\S]*?\*\//g, "");

test("the page: the intro is two files in <head>, the CSP as strict as before, nothing inline", () => {
  const head = html.slice(0, html.indexOf("</head>"));
  assert.match(head, /<link rel="stylesheet" href="intro\.css">/);
  assert.match(head, /<script src="intro\.js"><\/script>/, "in <head>, before the first paint, without defer or async");
  const csp = /Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /script-src 'self';/);
  assert.match(csp, /style-src 'self';/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
  assert.ok(!/font-src/.test(csp) || /font-src 'self'(;|$)/.test(csp), "no font from anywhere else");
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, "no inline script");
  assert.doesNotMatch(html, /<style[\s>]/, "no inline style sheet");
  assert.doesNotMatch(html, /\sstyle=/, "no style attribute");
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function|setAttribute\("style"/);
  assert.doesNotMatch(css, /@import|@font-face|url\(/, "no font, no image, nothing fetched by the sheet");
});

test("the same length on every load; reduced motion is a short cross-fade; a background tab plays nothing", () => {
  const full = I.plan({ hidden: false, reduced: false });
  assert.equal(full.mode, "full");
  assert.equal(full.total, 12000, "12 s, every load (10 s of v3 + the 3D dive and the 1 km grid)");
  assert.deepEqual(I.plan({ hidden: false, reduced: false }), full);
  assert.equal(full.total, I.TOTAL);
  const reduced = I.plan({ hidden: false, reduced: true });
  assert.equal(reduced.mode, "reduced");
  assert.ok(reduced.total <= 800, "reduced: " + reduced.total);
  assert.equal(I.plan({ hidden: true, reduced: false }).mode, "none");
  // Nothing remembers a first run: no shorter repeat.
  assert.doesNotMatch(js, /setItem|localStorage/);
  assert.match(js, /prefers-reduced-motion: reduce/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("Esc is the only way to skip (keyboards); touch screens play it in full: no button, no tap, no click", () => {
  assert.doesNotMatch(js, /addEventListener\("(click|pointerdown|pointerup|mousedown|mouseup|touchstart|touchend)"/);
  assert.doesNotMatch(js + css, /skipBtn|skipbtn|"button"/, "no Skip button (owner, 2026-11-13)");
  assert.match(css, /@media \(hover: none\) and \(pointer: coarse\) \{ \.wn-intro-esc \{ display: none; \} \}/, "the Esc hint hides on touch screens");
  assert.match(js, /function onKey\(e\) \{ if \(e\.key === "Escape" \|\| e\.key === "Esc"\) skip\(\); \}/);
  assert.doesNotMatch(js.slice(js.indexOf("function onKey"), js.indexOf("function onResize")), /preventDefault|stopPropagation/);
  assert.ok(I.SKIP <= 500, "Esc fades out quickly");
});

test("the timeline: the story in order, every step inside the intro, the page revealed before it ends", () => {
  for (const [k, v] of Object.entries(I.TL)) {
    const [a, b] = Array.isArray(v) ? v : [v, v];
    assert.ok(a >= 0 && b <= I.TOTAL && a <= b, k);
  }
  const order = ["splash", "exit", "pins", "fly", "cells", "rise", "sink", "card", "back", "select", "toast", "sheet", "loading", "fill", "out", "logo", "dock"].map((k) => I.TL[k][0]);
  assert.ok(order.every((x, i) => i === 0 || x > order[i - 1]), "splash, map, flight, cells, columns, settle, card, pins back, selection, toast, sheet, loading, filled, logo, dock");
  assert.ok(I.TL.select[0] >= I.TL.fly[1], "the pin is selected once the camera has arrived");
  assert.ok(I.TL.select[0] >= I.TL.card[1], "the card has left before the pin is selected");
  assert.ok(I.TL.rise[1] <= I.TL.sink[0] - 150, "the columns stand a moment before they settle");
  assert.ok(I.TL.card[0] >= I.TL.sink[1] - 50, "the card comes with the target's cell, once its column has settled");
  // The card's figures settle (EmphasizedDecelerate, 800 ms after a 145 ms stagger) well before it leaves.
  assert.ok(I.TL.card[1] - 150 - (I.TL.card[0] + 70 + 35 + 40 + 800) >= 300, "the figures stay readable");
  assert.ok(I.TL.fill[0] >= I.TL.loading[1] - 1 && I.TL.out[0] - I.TL.fill[1] >= 600, "the filled sheet stays readable");
  assert.ok(I.TL.dock[0] - I.TL.logo[1] >= 800, "the logo holds before it docks");
  assert.ok(I.TL.reveal >= I.TL.dock[0] && I.TL.reveal < I.TOTAL);
  assert.ok(I.TL.dock[1] <= I.TL.fade[1] && I.TL.fade[1] <= I.TOTAL);
  assert.equal(I.LIFT, 0.22, "the selected point where the app puts it (WnCamera SELECTED_LIFT)");
  // The page's rise (intro.css) ends before its class is taken away (REVEAL_KEEP), so nothing jumps.
  for (const m of css.matchAll(/animation(?:-delay)?:\s*([^;]+);/g)) {
    const times = [...m[1].matchAll(/(\d*\.?\d+)(ms|s)\b/g)].map((x) => Number(x[1]) * (x[2] === "s" ? 1000 : 1));
    if (/wn-intro-(rise|fade)/.test(m[1])) assert.ok(times.reduce((s, x) => s + x, 0) + 300 <= I.REVEAL_KEEP, m[0]);
  }
});

test("the map never waits: no tiles, no request, no second WebGL map; the CSP needs nothing new", () => {
  assert.doesNotMatch(js, /fetch\(|XMLHttpRequest|maplibregl|WebSocket|getContext\("webgl|new Image|import\(/);
  assert.match(js, /getContext\("2d"\)/);
  // The only image is the page's own icon.
  assert.deepEqual([...js.matchAll(/\.src = (\w+)/g)].map((m) => m[1]), ["iconSrc", "iconSrc"]);
});

test("if the script dies midway the field hides itself, and every rule is scoped to the intro", () => {
  assert.match(css, /html\.wn-intro-boot body::after \{[^}]*animation: wn-intro-gone [^;]*forwards/);
  assert.match(css, /\.wn-intro \{[^}]*animation: wn-intro-gone [^;]*forwards/);
  assert.match(css, /@keyframes wn-intro-gone \{ to \{[^}]*visibility: hidden;[^}]*pointer-events: none;/);
  assert.match(js, /function mountSafe\(\) \{ try \{ mount\(\); \} catch \(e\) \{ teardown\(\); \} \}/);
  const body = cssBody.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^}]*\})*\s*\}/g, "");
  for (const m of body.matchAll(/([^{}]+)\{/g)) {
    const sel = m[1].trim();
    if (sel.startsWith("@")) continue;
    for (const s of sel.split(",")) assert.match(s.trim(), /^(\.wn-intro|html\.wn-intro-)/, s.trim());
  }
  // Every class intro.js puts on its elements is its own: the console's ".primary", ".ok"… can't reach them.
  for (const m of js.matchAll(/(?:el|icon|badgeEl|slot|skel)\([^)]*?"((?:wn-intro[\w-]*)(?: [\w-]+)*)"/g)) {
    for (const c of m[1].split(" ")) assert.match(c, /^wn-intro/, c);
  }
});

test("the page's rise only touches elements the console never animates (nothing replays when its class goes)", () => {
  const sheets = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1])
    .filter((h) => !/vendor|intro\.css/.test(h)).map((h) => fs.readFileSync(path.join(dir, h), "utf8"));
  const targets = [".top", ".top .mark", "#brand", "#gate", "#app > .toolbar", "#app > .kpis", "#app > .main", "#app > .duo", "#app > .foot"];
  for (const t of targets) assert.ok(css.includes("html.wn-intro-reveal " + t), t);
  const names = ["top", "mark", "brand", "gate", "app", "toolbar", "kpis", "main", "duo", "foot"];
  for (const s of sheets) {
    for (const m of s.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/(^|;|\s)animation(-name)?\s*:/.test(m[2])) continue;
      for (const sel of m[1].split(",")) {
        const last = sel.trim().split(/\s+|>/).pop();
        assert.ok(!names.some((n) => last === "." + n || last === "#" + n), "console CSS animates " + sel.trim());
      }
    }
  }
});

test("debug ?introAt only on loopback hosts", () => {
  assert.equal(I.debugAt("https://example.github.io/WaterNow-site/console/?introAt=1200"), null);
  assert.equal(I.debugAt("https://waternow.app/console/?introAt=1200"), null);
  assert.equal(I.debugAt("http://127.0.0.1:8792/WaterNow-site/console/?introAt=1200"), 1200);
  assert.equal(I.debugAt("http://localhost:8792/console/?introAt=99999"), I.TOTAL);
  assert.equal(I.debugAt("http://127.0.0.1:8792/console/?introAt=abc"), null);
  assert.equal(I.debugAt("http://127.0.0.1:8792/console/"), null);
});

test("the words: 7 languages, the same keys, the app's own where it has them; fr tu-friendly, ro ș ț", () => {
  const { LANGS } = require("./spot-params.js");
  assert.deepEqual(Object.keys(I.WORDS).sort(), LANGS.slice().sort());
  for (const l of LANGS) {
    assert.deepEqual(Object.keys(I.WORDS[l]).sort(), Object.keys(I.WORDS.en).sort(), l);
    for (const [k, v] of Object.entries(I.WORDS[l])) assert.ok(typeof v === "string" && v.trim(), l + "." + k);
  }
  assert.equal(I.WORDS.fr.detected, "Point d'eau détecté");
  assert.equal(I.WORDS.fr.accessing, "Accès aux informations…");
  assert.equal(I.WORDS.en.detected, "Water point detected");
  // The app's strings (MapStrings "search", SocialStrings "vs_working").
  assert.equal(I.WORDS.fr.search, "Chercher de l'eau, un lieu ou une adresse");
  assert.equal(I.WORDS.de.works, "Funktioniert");
  const all = (l) => JSON.stringify(I.WORDS[l]);
  assert.doesNotMatch(all("fr"), /\b(vous|votre|vos)\b/i);
  assert.doesNotMatch(all("ro"), /[ŞşŢţ]/);
  assert.match(all("ro"), /[șț]/);
  // The cell's card speaks the console's own words (i18n.js cellTitle / lRefills, sim-i18n.js simRes10).
  const CI = require("../console/i18n.js").STRINGS, SI = require("../console/sim-i18n.js").STRINGS;
  for (const l of LANGS) {
    assert.equal(I.WORDS[l].cell, CI[l].cellTitle, l + " cell");
    assert.equal(I.WORDS[l].refills, CI[l].lRefills, l + " refills");
    assert.equal(I.WORDS[l].res10, SI[l].simRes10, l + " res10");
  }
  assert.equal(I.pickLang(["it-IT", "fr-CA"]), "fr");
  assert.equal(I.pickLang(["zz"]), "en");
});

test("the app's look: its tokens, its map style's colours, its motion; the official logo, never redrawn", () => {
  // Theme.kt / Color.kt: background, primary (on primary), muted, border, muted text, in both themes.
  const [light, dark] = cssBody.split("@media (prefers-color-scheme: dark)");
  for (const [k, v] of [["bg", "#ffffff"], ["accent", "#0066cc"], ["on-accent", "#ffffff"], ["muted", "#f4f4f5"], ["border", "#e4e4e7"], ["muted-fg", "#6b6b73"]]) {
    assert.match(light, new RegExp("--wn-" + k + ": " + v + ";", "i"), "light " + k);
  }
  for (const [k, v] of [["bg", "#09090b"], ["accent", "#3395ff"], ["on-accent", "#09090b"], ["muted", "#27272a"], ["border", "#27272a"], ["muted-fg", "#a1a1aa"]]) {
    assert.match(dark, new RegExp("--wn-" + k + ": " + v + ";", "i"), "dark " + k);
  }
  // The map: the very colours of the style the app and the site share.
  for (const [theme, part] of [["light", light], ["dark", dark]]) {
    const style = JSON.parse(fs.readFileSync(path.join(__dirname, "map", "waternow-" + theme + ".json"), "utf8"));
    const paint = (id) => { const l = style.layers.find((x) => x.id === id).paint; return l["background-color"] || l["fill-color"] || l["line-color"]; };
    for (const [tok, id] of [["bg", "background"], ["park", "park"], ["wood", "landcover_wood"], ["water", "water"], ["bld", "building"], ["path", "path"]]) {
      assert.match(part, new RegExp("--wn-m-" + tok + ": " + paint(id) + ";", "i"), theme + " " + tok);
    }
  }
  // WnMotion's curves and its bouncy() spring: a pop with a little life, no wobble, settled in about 300 ms.
  assert.match(js, /bez\(0\.2, 0, 0, 1\)/);
  assert.match(js, /bez\(0\.05, 0\.7, 0\.1, 1\)/);
  assert.match(js, /bez\(0\.3, 0, 0\.8, 0\.15\)/);
  assert.equal(I.spring(0, 0.75, 0.55, 700), 0.75);
  let peak = 0;
  for (let ms = 0; ms <= 600; ms += 5) peak = Math.max(peak, I.spring(ms, 0.75, 0.55, 700));
  assert.ok(peak > 1 && peak < 1.05, "overshoot " + peak);
  assert.ok(Math.abs(I.spring(400, 0.75, 0.55, 700) - 1) < 0.005);
  const e = I.bez(0.16, 1, 0.3, 1);
  assert.equal(e(0), 0);
  assert.equal(e(1), 1);
  // Clusters: each point in exactly one group; groups break up as the radius shrinks.
  const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 100, y: 0 }, { x: 105, y: 4 }, { x: 400, y: 0 }];
  const big = I.cluster(pts, 50), small = I.cluster(pts, 7);
  assert.deepEqual(big.map((c) => c.m.length), [2, 2, 1]);
  assert.deepEqual(big.flatMap((c) => c.m).sort(), [0, 1, 2, 3, 4]);
  assert.equal(small.length, 4);
  assert.deepEqual(big[0], { m: [0, 1], x: 5, y: 0 });
  // The official logo: the page's own icon file, as an image; nothing draws a drop of its own (the pins' glyph is the
  // app's Material WaterDrop icon, not the logo).
  assert.match(html, /<link rel="icon" href="\.\.\/assets\/icon\.svg"/);
  assert.match(js, /querySelector\('link\[rel="icon"\]'\)/);
  assert.doesNotMatch(js, /M54,24|47\.5, ?33\.5|Path2D/, "no drawn logo");
  const ccss = fs.readFileSync(path.join(dir, "console.css"), "utf8");
  assert.match(ccss, /\.mark, \.auth-mark \{[^}]*background: url\(\.\.\/assets\/icon\.svg\)/, "the header's logo is the official icon too");
});

test("none of the HUD tells: no flash, no scramble, no glow, no pulse, no marquee, no crushed tracking, no side stripes", () => {
  assert.doesNotMatch(js + css, /flash|scramble|glitch|scanline|reticle|crosshair|classified|0123456789ABCDEF/i);
  assert.doesNotMatch(cssBody, /infinite/, "nothing loops (no pulsing dot)");
  assert.doesNotMatch(cssBody, /text-shadow|filter:\s*blur|mix-blend|backdrop-filter/, "no glow, no CRT");
  for (const m of cssBody.matchAll(/letter-spacing:\s*(-?[\d.]+)em/g)) assert.ok(Number(m[1]) >= -0.02 && Number(m[1]) <= 0.02, m[0]);
  assert.doesNotMatch(cssBody, /border-(left|right|top|bottom):\s*[2-9]px/, "no one-sided coloured border");
  assert.doesNotMatch(cssBody, /monospace/, "the app's type, not a terminal's");
});

test("honest status: the session badge says verified only after the dashboard's own wnc:render", () => {
  assert.match(js, /doc\.addEventListener\("wnc:render", onReady\)/);
  assert.match(js, /function onReady\(\) \{ ready = true;/);
  assert.match(js, /var st = ready \? "ok" : hasSession \? "wait" : "req";/);
  assert.equal((js.match(/w\.tfaOk/g) || []).length, 1, "one place shows it");
  assert.match(js, /st === "ok" \? w\.tfaOk/);
  // The session key: only its presence is read, never its content; nothing is written.
  assert.match(js, /hasSession = !!root\.sessionStorage\.getItem\(SESSION_KEY\)/);
  assert.doesNotMatch(js, /sessionStorage\.(setItem|removeItem|clear)/);
});

test("the 3D dive: MapLibre's camera, smooth, the same on every load; the point lands where the app puts it", () => {
  const W = 1440, H = 900, deg = (r) => r * 180 / Math.PI, p = [0, 0];
  // MapLibre's field of view (36.87°): the focal length is 1.5 × the height.
  const c0 = I.cam(0, W, H);
  assert.ok(Math.abs(deg(2 * Math.atan(H / 2 / c0.f)) - 36.87) < 0.01);
  // Before the flight: v3's flat map exactly (no tilt, the scale of the city view, the point left of the middle).
  assert.equal(c0.ph, 0);
  assert.equal(c0.z, 0);
  I.project(c0, 100, 50, 0, p);
  assert.ok(Math.abs(p[0] - (0.32 * W + 100 * c0.s)) < 1e-6 && Math.abs(p[1] - (0.46 * H + 50 * c0.s)) < 1e-6);
  // The end: tilted 56° (MapLibre's 3D, 45 to 60), 3 zoom levels in, the point 22 % above the middle (SELECTED_LIFT).
  const cE = I.cam(I.TL.fly[1], W, H);
  assert.equal(I.PITCH, 56);
  assert.ok(Math.abs(deg(cE.ph) - 56) < 1e-9 && cE.z === I.ZOOM);
  I.project(cE, 0, 0, 0, p);
  assert.ok(Math.abs(p[0] - W / 2) < 1e-9 && Math.abs(p[1] - H * (0.5 - I.LIFT)) < 1e-9);
  // Buttery: no jump anywhere (4 ms steps), never faster than 6 zoom levels or 75° a second; the same at every call.
  let prev = I.cam(0, W, H), zMin = 0;
  for (let t = 4; t <= I.TOTAL; t += 4) {
    const c = I.cam(t, W, H);
    assert.ok(Math.abs(c.z - prev.z) < 0.024 && Math.abs(deg(c.ph - prev.ph)) < 0.3 && Math.abs(c.b - prev.b) < 0.002, "t " + t);
    assert.ok(Math.abs(c.ox - prev.ox) < 2 && Math.abs(c.oy - prev.oy) < 2, "lens shift at " + t);
    zMin = Math.min(zMin, c.z);
    prev = c;
  }
  assert.deepEqual(I.cam(4321, W, H), I.cam(4321, W, H));
  // It pulls back over the whole grid while the cells come up, tilted well into 3D before the columns stand, then dives.
  assert.ok(zMin <= -1.1 && I.cam(I.TL.rise[1], W, H).z <= -1.1, "the grid seen whole");
  assert.ok(deg(I.cam(I.TL.rise[1], W, H).ph) >= 40, "tilted before the columns stand");
  assert.ok(I.cam(I.TL.sink[1], W, H).z < I.cam(I.TL.card[1], W, H).z, "diving while the card shows");
  // A tall phone sizes the city by its height: it pulls back further so the grid fits its width.
  assert.ok(I.cam(I.TL.rise[1], 390, 844).z < I.cam(I.TL.rise[1], W, H).z - 0.5);
  // The camera stays above everything it draws (the tallest column, from its distance and tilt).
  for (let t = 0; t <= I.TOTAL; t += 50) { const c = I.cam(t, W, H); assert.ok(c.D * c.cp > I.HMAX || t > I.TL.sink[1], "above the columns at " + t); }
});

test("the 1 km grid: the console's cells, illustrative and seeded; columns as high as their refills; the target last down", () => {
  const cells = I.cellsOf(I.points());
  assert.deepEqual(I.cellsOf(I.points()), cells, "the same for everyone, every load");
  assert.ok(cells.length >= 20 && cells.length <= 80, cells.length + " cells");
  const tg = cells.filter((c) => c.target);
  assert.equal(tg.length, 1);
  const t = tg[0];
  assert.equal(t.refills, I.REFILLS);
  assert.ok(t.cls >= 4, "the target's cell is a busy one");
  // 1 km cells on one grid (EASE-Grid 2.0 style), upright: corners a whole number of km apart.
  for (const c of cells) assert.ok(Math.abs(((c.u0 - t.u0) / I.CELL) % 1) < 1e-9 && Math.abs(((c.v0 - t.v0) / I.CELL) % 1) < 1e-9);
  // The console's own classes (core.js: quantile breaks, 6 classes) and a height proportional to the refills.
  const core = require("../console/core.js"), br = core.breaks(cells.map((c) => c.refills), 6), max = Math.max(...cells.map((c) => c.refills));
  for (const c of cells) {
    assert.equal(c.cls, core.classOf(c.refills, br), "class of " + c.refills);
    assert.ok(Math.abs(c.k - c.refills / max) < 1e-12);
    assert.ok(c.in >= I.TL.cells[0] && c.in + 300 <= I.TL.cells[1], "fades in inside its step");
    assert.ok(c.up >= I.TL.rise[0] && c.up + 520 <= I.TL.rise[1], "rises inside its step");
    assert.ok(c.down >= I.TL.sink[0] && c.down + 420 <= I.TL.sink[1], "sinks inside its step");
  }
  assert.equal(Math.min(...cells.map((c) => c.up)), t.up, "the target's column rises first");
  assert.equal(t.down + 420, I.TL.sink[1], "and settles last");
  assert.ok(cells.filter((c) => !c.target).every((c) => c.down < t.down));
  // Its card: the two figures count up with the app's EmphasizedDecelerate, in the language's own digits.
  assert.match(js, /Math\.round\(\(i \? RES10 : REFILLS\) \* DEC\(prog\(t, a \+ 40, a \+ 840\)\)\)/);
  assert.match(js, /NF = new root\.Intl\.NumberFormat\(lang\)/);
  assert.match(css, /\.wn-intro-num \{[^}]*font-variant-numeric: tabular-nums/, "digits that never jiggle");
  assert.equal(I.WORDS.fr.example, "Exemple");
});

test("3D buildings and columns: the style's fill-extrusion colours and light, the app's tilt, the console's ramp and lines", () => {
  const [light, dark] = cssBody.split("@media (prefers-color-scheme: dark)");
  for (const [theme, part] of [["light", light], ["dark", dark]]) {
    const style = JSON.parse(fs.readFileSync(path.join(__dirname, "map", "waternow-" + theme + ".json"), "utf8"));
    const ext = style.layers.find((x) => x.id === "building-3d").paint["fill-extrusion-color"];
    assert.match(part, new RegExp("--wn-m-ext: " + ext[4] + ";", "i"), theme + " extrusion at 0 m");
    assert.match(part, new RegExp("--wn-m-ext2: " + ext[6] + ";", "i"), theme + " extrusion at 40 m");
    // The light, as MapLibre turns the style's [r, azimuth, polar] into a vector (sphericalToCartesian).
    assert.equal(style.light.intensity, 0.3);
    const [r, az, po] = style.light.position, a = (az + 90) * Math.PI / 180, pp = po * Math.PI / 180;
    [r * Math.cos(a) * Math.sin(pp), r * Math.sin(a) * Math.sin(pp), r * Math.cos(pp)].forEach((v, i) => assert.ok(Math.abs(v - I.LIGHT[i]) < 1e-12));
  }
  // fill-extrusion's shading: the tops keep their colour, every wall is darker, the wall facing the light the least.
  const top = I.shade(0, 0, 1, 0.9, false), walls = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([x, y]) => I.shade(x, y, 0, 0.9, true));
  assert.ok(top > 0.99 && walls.every((w) => w < top && w >= 0.7 * 0.896 - 1e-9));
  assert.ok(walls[0] > walls[2] && walls[1] > walls[3], "lit from the screen's top right, as the style's 210° viewport light");
  // The buildings rise as the app's map tilts (WnBuildings: from 6° to 40°).
  const kt = fs.readFileSync(path.join(__dirname, "..", "..", "shared-ui", "src", "androidMain", "kotlin", "com", "example", "ui", "screens", "map", "wn", "WnStyle.kt"), "utf8");
  assert.match(kt, /const val FROM = 6\.0/);
  assert.match(kt, /const val TO = 40\.0/);
  assert.match(js, /\(C\.ph \* 180 \/ Math\.PI - 6\) \/ 34/);
  // The console's grid: its blue ramp (reversed on a dark map), its cell lines and its selected cell's line.
  const cjs = fs.readFileSync(path.join(dir, "console.js"), "utf8");
  const blue = /blue: \[([^\]]+)\]/.exec(cjs)[1].match(/#[0-9a-f]{6}/gi);
  blue.forEach((h, i) => {
    assert.match(light, new RegExp("--wn-m-r" + i + ": " + h + ";", "i"), "light r" + i);
    assert.match(dark, new RegExp("--wn-m-r" + (5 - i) + ": " + h + ";", "i"), "dark r" + (5 - i));
  });
  assert.match(cjs, /"line-color": dark\.matches \? "rgba\(255,255,255,0\.18\)" : "rgba\(15,23,42,0\.14\)"/);
  assert.match(light, /--wn-m-cline: rgba\(15, 23, 42, \.14\);/);
  assert.match(dark, /--wn-m-cline: rgba\(255, 255, 255, \.18\);/);
  assert.match(cjs, /"line-color": dark\.matches \? "#ffffff" : "#0f172a", "line-width": 2\.5/);
  assert.match(light, /--wn-m-csel: #0f172a;/);
  assert.match(dark, /--wn-m-csel: #ffffff;/);
});

test("60 fps: no allocation in the drawing loops, devicePixelRatio capped at 2, drawn only while it moves, paused when hidden", () => {
  const body = (name) => {
    const i = js.indexOf("function " + name + "(");
    assert.ok(i > 0, name);
    let d = 0, j = js.indexOf("{", i);
    for (let k = j; k < js.length; k++) { if (js[k] === "{") d++; else if (js[k] === "}" && --d === 0) return js.slice(j, k + 1); }
    return "";
  };
  for (const f of ["drawMap", "streets", "road", "gpoly", "gseg", "grect", "gring", "bounds", "range", "footprints", "drawBox", "boxes",
                   "cellState", "cellQuad", "outline", "flatCells", "columns", "pins", "pj", "vw"]) {
    assert.doesNotMatch(body(f), /new |forEach|\.map\(|\.filter\(|function \(|= \[|= \{|\[\]|\{\}/, f + " allocates");
  }
  assert.match(js, /L\.dpr = Math\.min\(root\.devicePixelRatio \|\| 1, 2\)/);
  assert.match(js, /var key = t < TL\.fly\[0\] \? 0 : t < STILL_MAP \? t : -1;/, "the map drawn again only while something on it moves");
  assert.match(js, /if \(doc\.hidden\) \{\s*if \(pausedAt < 0\) \{ pausedAt = now; root\.cancelAnimationFrame\(raf\); raf = 0;/);
  assert.match(js, /L\.minPx = L\.W \* L\.H < 600000 \? 2\.4 : 1\.6;/, "fewer, larger buildings on a phone");
  assert.match(js, /if \(t < TL\.fly\[0\] && at == null\) warm\(\);/, "blocks made while the map stands still, not in the dive");
});
