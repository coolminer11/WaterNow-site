// node --test site/assets/map.test.js  (the map's two style files, no browser needed)
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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
