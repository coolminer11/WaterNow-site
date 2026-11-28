// node --test site/assets/city.test.js  (the city landing pages, villes/, written by scripts/gen-city-pages.mjs)
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SITE_DIR = path.join(__dirname, "..");
const gen = () => import("../../scripts/gen-city-pages.mjs");
const visible = (html) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ")
  .replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ");
const flat = (o) => (typeof o === "string" ? [o] : Object.values(o).flatMap(flat));

test("the pages on disk are what the generator writes (run node scripts/gen-city-pages.mjs), twice the same", async () => {
  const { build } = await gen();
  const a = build(), b = build();
  assert.deepEqual(a, b, "deterministic");
  for (const { file, html } of a) {
    assert.ok(fs.existsSync(file), path.relative(SITE_DIR, file) + " is missing");
    assert.equal(fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n"), html, path.relative(SITE_DIR, file));
  }
});

test("every city has its 7 languages, each page's hreflang lists all 7 and x-default, and the canonical is itself", async () => {
  const { CITIES, LANGS, SITE, pagePath } = await gen();
  assert.deepEqual(CITIES.map((c) => c.slug).sort(), ["montreal", "quebec"]);
  for (const city of CITIES) {
    assert.equal(city.default, "fr", "Québec cities open in French");
    assert.deepEqual(Object.keys(city.names).sort(), [...LANGS].sort(), city.slug);
    for (const lang of LANGS) {
      const rel = pagePath(city, lang);
      assert.equal(rel, "villes/" + city.slug + "/" + (lang === "fr" ? "" : lang + "/"));
      const html = fs.readFileSync(path.join(SITE_DIR, rel, "index.html"), "utf8");
      assert.match(html, new RegExp(`<link rel="canonical" href="${SITE + rel}">`), rel);
      assert.match(html, new RegExp(`<meta property="og:url" content="${SITE + rel}">`), rel);
      const alts = Object.fromEntries([...html.matchAll(/<link rel="alternate" hreflang="([\w-]+)" href="([^"]+)">/g)].map((m) => [m[1], m[2]]));
      assert.deepEqual(Object.keys(alts).sort(), [...LANGS, "x-default"].sort(), rel);
      for (const l of LANGS) assert.equal(alts[l], SITE + pagePath(city, l), rel + " → " + l);
      assert.equal(alts["x-default"], SITE + pagePath(city, "fr"), rel);
      assert.match(html, new RegExp(`<html lang="${lang === "fr" ? "fr-CA" : lang === "pt" ? "pt-BR" : lang}"`), rel);
      assert.match(html, /<meta name="description" content="[^"]{60,170}">/, rel + ": a description");
      assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
      const og = /<meta property="og:image" content="([^"]+)">/.exec(html)[1];
      assert.ok(fs.existsSync(path.join(SITE_DIR, og.slice(SITE.length))), og);
      const title = /<title>([^<]+)<\/title>/.exec(html)[1];
      assert.ok(Array.from(title).length <= 60, rel + ": title " + title);
    }
  }
});

test("no water point or toilet data on the pages: no coordinates, no counts, no map, no list of places", async () => {
  const { build } = await gen();
  for (const { file, html } of build().filter((p) => p.file.endsWith("index.html"))) {
    const rel = path.relative(SITE_DIR, file);
    assert.doesNotMatch(html, /-?\d{1,3}\.\d{3,}/, rel + ": a decimal that could be a coordinate");
    assert.doesNotMatch(html, /latitude|longitude|GeoCoordinates|"geo"|maplibre|leaflet|\btiles?\b|<iframe|<canvas/i, rel);
    // Words carry no count of points ("7 languages" is the only number, under 10).
    assert.doesNotMatch(visible(html), /\d{2,}|\d[\s  ]?\d{3}/, rel + ": a number that could be a count");
    assert.doesNotMatch(html, /\/rest\/v1|supabase|wn-api/i, rel + ": nothing reads WaterNow's server");
  }
});

test("no external script, no tracker: only the site's own files, under a CSP", async () => {
  const { build } = await gen();
  for (const { file, html } of build().filter((p) => p.file.endsWith("index.html"))) {
    const rel = path.relative(SITE_DIR, file);
    assert.match(html, /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self';/, rel);
    const srcs = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(srcs.map((s) => s.replace(/^(\.\.\/)+/, "")), ["assets/motion.js", "assets/spot-params.js", "assets/city.js"], rel);
    for (const s of srcs) assert.doesNotMatch(s, /^(https?:)?\/\//, rel);
    // Inline scripts: only the JSON-LD data block (a browser never runs it).
    for (const m of html.matchAll(/<script\b([^>]*)>/g)) if (!/\bsrc=/.test(m[1])) assert.equal(m[1], ' type="application/ld+json"', rel);
    for (const m of html.matchAll(/<link\b[^>]*\bhref="([^"]+)"/g)) {
      if (/rel="(canonical|alternate)"/.test(m[0])) continue;
      assert.doesNotMatch(m[1], /^(https?:)?\/\//, rel + ": " + m[1]);
    }
    assert.doesNotMatch(html, /google-analytics|googletagmanager|gtag\(|fbq\(|plausible|matomo|adsbygoogle/i, rel);
  }
});

test("every page: one h1, no heading skipped, images with alt and size that exist, JSON-LD MobileApplication and FAQPage like the page", async () => {
  const { build } = await gen();
  for (const { file, html } of build().filter((p) => p.file.endsWith("index.html"))) {
    const rel = path.relative(SITE_DIR, file);
    const levels = [...html.matchAll(/<h([1-6])[ >]/g)].map((m) => Number(m[1]));
    assert.equal(levels.filter((l) => l === 1).length, 1, rel + ": one h1");
    levels.forEach((l, i) => assert.ok(i === 0 ? l === 1 : l <= levels[i - 1] + 1, rel + ": heading level skipped at " + i));
    for (const m of html.matchAll(/<img\b[^>]*>/g)) {
      const src = /src="([^"]+)"/.exec(m[0])[1];
      assert.match(m[0], /width="\d+" height="\d+"/, rel + ": " + src);
      assert.match(m[0], /alt="/, rel + ": " + src);
      assert.ok(fs.existsSync(path.join(path.dirname(file), src)), rel + ": " + src);
      if (!/icon\.svg$/.test(src)) assert.match(m[0], /alt="[^"]{20,}"/, rel + ": a screen says what it shows");
    }
    const data = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);
    const app = data["@graph"].find((n) => n["@type"] === "MobileApplication");
    const faq = data["@graph"].find((n) => n["@type"] === "FAQPage");
    assert.equal(app.operatingSystem, "Android");
    assert.equal(app.offers.price, "0");
    assert.ok(!("aggregateRating" in app), "no rating we don't have");
    const shown = [...html.matchAll(/<details><summary>([^<]+)<\/summary>/g)].map((m) => m[1].replace(/&#39;|&quot;|&amp;/g, (e) => ({ "&#39;": "'", "&quot;": '"', "&amp;": "&" })[e]));
    assert.ok(faq.mainEntity.length >= 3, rel);
    assert.deepEqual(faq.mainEntity.map((q) => q.name), shown, rel + ": the FAQ in the data is the one on the page");
    assert.equal((html.match(/data-get href=/g) || []).length, 2, rel + ": two download buttons");
  }
});

test("the copy follows WaterNow's glossary in every language", async () => {
  const { CITIES, LANGS, copy } = await gen();
  // French « tu », « courriel », a no-break space before ; : ! ?; Romanian ș ț, « cișmea »; Brazilian « você », never
  // num/numa, « bebedouro »; Japanese never あなた; English never "spot".
  const rules = {
    fr: [[/\b(vous|votre|vos)\b/i, "tu"], [/\b(e-?mails?|mails?)\b/i, "courriel"], [/[^  ][;:!?](?=\s|$)/, "no-break space before ; : ! ?"],
      [/ [;:!?]/, "a plain space before ; : ! ?"], [/«[^  ]|[^  ]»/, "spaces inside « »"]],
    ro: [[/[şţŞŢ]/, "comma-below ș ț"], [/[Ff]ântân/, "cișmea"]],
    pt: [[/\b(num|numa|te|teu|tua|contigo|lhe|tu)\b/i, "você, em um"], [/\bfontes?\b/i, "bebedouro"]],
    ja: [[/あなた/, "no あなた"]],
    en: [[/\bspots?\b/i, "never spot"]],
    es: [[/\busted(es)?\b/i, "tú"], [/\breport(ar|e)\b/i, "reportar"]],
    de: [[/auffüll|Auffüll/, "nachfüllen"]]
  };
  const problems = [];
  for (const city of CITIES) {
    for (const lang of LANGS) {
      for (const s of flat(copy(city, lang))) {
        for (const [re, why] of [...(rules[lang] || []), [/\.\.\./, "ellipsis …"]]) if (re.test(s)) problems.push(`${city.slug} [${lang}] ${why}: ${s}`);
      }
    }
  }
  assert.deepEqual(problems, []);
  // The glossary words are there, not only the bans.
  const all = (lang) => CITIES.flatMap((c) => flat(copy(c, lang))).join(" ");
  assert.match(all("fr"), /point d'eau/);
  assert.match(all("fr"), /toilettes/);
  assert.match(all("ro"), /cișmele/);
  assert.match(all("pt"), /bebedouros/);
  assert.match(all("pt"), /você/);
});

test("the sitemap lists every city page with its alternates, and robots.txt doesn't block them", async () => {
  const { CITIES, LANGS, SITE, pagePath } = await gen();
  const xml = fs.readFileSync(path.join(SITE_DIR, "sitemap.xml"), "utf8");
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const city of CITIES) for (const l of LANGS) assert.ok(locs.includes(SITE + pagePath(city, l)), pagePath(city, l));
  for (const loc of locs) assert.ok(loc.startsWith(SITE), "a sitemap only lists its own folder: " + loc);
  assert.equal((xml.match(/hreflang="x-default"/g) || []).length, CITIES.length * LANGS.length);
  const robots = fs.readFileSync(path.join(SITE_DIR, "robots.txt"), "utf8");
  const blocked = [...robots.matchAll(/^Disallow:\s*(\S*)/gm)].map((m) => m[1]).filter(Boolean);
  for (const p of ["/villes/montreal/", "/WaterNow-site/villes/quebec/en/"]) assert.ok(!blocked.some((d) => p.startsWith(d)), p);
  assert.match(robots, new RegExp("^Sitemap: " + SITE + "sitemap.xml$", "m"));
});
