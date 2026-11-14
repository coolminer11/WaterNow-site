// node --test site/assets/map.test.js  (the map's two style files, no browser needed)
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const vm = require("node:vm");
const { LANGS } = require("./spot-params.js");

test("MapLibre's buttons and screen-reader names speak the page's language, with keys MapLibre knows", () => {
  const js = fs.readFileSync(path.join(__dirname, "map.js"), "utf8");
  const STRINGS = vm.runInNewContext("(" + /var STRINGS = (\{[\s\S]*?\n  \});/.exec(js)[1] + ")");
  assert.match(js, /locale: locale \}/);
  assert.match(js, /var locale = label \? Object\.assign\(\{\}, STRINGS\[lang\], \{ "Map\.Title": label \}\) : STRINGS\[lang\];/);
  assert.deepEqual(Object.keys(STRINGS).sort(), [...LANGS].sort());
  const lib = fs.readFileSync(path.join(__dirname, "vendor", "maplibre-gl-5.24.0", "maplibre-gl.js"), "utf8");
  for (const key of Object.keys(STRINGS.en)) assert.ok(lib.includes('"' + key + '"'), key + " is one of MapLibre's locale ids");
  assert.equal(STRINGS.en["NavigationControl.ZoomIn"], "Zoom in");
  for (const lang of LANGS) {
    assert.deepEqual(Object.keys(STRINGS[lang]).sort(), Object.keys(STRINGS.en).sort(), lang);
    for (const v of Object.values(STRINGS[lang])) assert.ok(typeof v === "string" && v.trim(), lang);
    if (lang !== "en") assert.notEqual(STRINGS[lang]["NavigationControl.ZoomIn"], "Zoom in", lang);
  }
  assert.doesNotMatch(JSON.stringify(STRINGS.ro), /[şţŞŢ]/);
});

test("each map is named by its page through MapLibre's own region, never a role=img around its buttons", () => {
  for (const [html, js] of [["../s/index.html", "../s/app.js"], ["../live/index.html", "live.js"], ["../stats/index.html", "stats.js"]]) {
    const page = fs.readFileSync(path.join(__dirname, html), "utf8"), code = fs.readFileSync(path.join(__dirname, js), "utf8");
    const box = /<div[^>]*id="map"[^>]*>/.exec(page)[0];
    assert.doesNotMatch(box, /role=|aria-label=/, html + ": " + box);
    assert.match(code, /WN\.map\(\$\("map"\), lang, [^;]*, T\.map\);/, js + " passes its own label");
    assert.doesNotMatch(code, /\$\("map"\)\.setAttribute\("aria-label"/, js);
  }
});

const read = (scheme) => JSON.parse(fs.readFileSync(path.join(__dirname, "map", "waternow-" + scheme + ".json"), "utf8"));
const light = read("light"), dark = read("dark");
// The OpenMapTiles schema served by OpenFreeMap, unmodified.
const SOURCE_LAYERS = ["water", "waterway", "landcover", "landuse", "park", "building", "transportation", "transportation_name",
  "place", "poi", "boundary", "aeroway", "water_name", "housenumber", "mountain_peak", "aerodrome_label"];

test("light and dark have the same layers in the same order", () => {
  const ids = (s) => s.layers.map((l) => l.id);
  assert.deepEqual(ids(dark), ids(light));
  assert.equal(new Set(ids(light)).size, light.layers.length, "duplicate layer id");
});

for (const [scheme, style] of [["light", light], ["dark", dark]]) {
  test(scheme + ": only its own sources and OpenMapTiles layers", () => {
    assert.equal(style.version, 8);
    for (const layer of style.layers) {
      if (layer.type === "background") continue;
      assert.ok(Object.hasOwn(style.sources, layer.source), layer.id + " uses an undefined source");
      assert.ok(SOURCE_LAYERS.includes(layer["source-layer"]), layer.id + " uses " + layer["source-layer"]);
    }
    for (const source of Object.values(style.sources)) assert.match(source.url, /^https:\/\/tiles\.openfreemap\.org\//);
    assert.match(style.glyphs, /^https:\/\/tiles\.openfreemap\.org\//);
  });

  test(scheme + ": every name label starts with name:en, the slot assets/map.js gives the page language", () => {
    for (const layer of style.layers) {
      const field = layer.layout && layer.layout["text-field"];
      if (field && field[0] === "coalesce") assert.deepEqual(field, ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name"]], layer.id);
    }
  });
}
